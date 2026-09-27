from __future__ import annotations

import base64
import io
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from PIL import Image

from src.aristocolors.adapters.base import ModelWeightNotCachedError
from src.aristocolors.adapters.depth import DepthAnythingV2Adapter
from src.aristocolors.adapters.dinov2 import DinoV2Adapter
from src.aristocolors.adapters.matting import BiRefNetAdapter
from src.aristocolors.extractor import AristoColorsExtractor
from src.aristocolors.types import ImageBuffer
from src.config import config
from src.protocol import (
    ExtractProfilePayload,
    HealthResponse,
    RpcTaskRequest,
    RpcTaskResponse,
)
from src.weights import check_cached_weights, list_supported_models

config.assert_architectural_boundary_invariants()


def _compute_weights_cached() -> bool:
    try:
        model_keys = list_supported_models()
        return all(check_cached_weights(model_key)["isCached"] for model_key in model_keys)
    except Exception:
        return False


def _build_health_response() -> HealthResponse:
    gpu_available, gpu_device = config.detect_gpu_device()
    return HealthResponse(
        status="ok",
        runtime=f"python-{sys.version_info.major}.{sys.version_info.minor}",
        stateless=True,
        consumes_bullmq=False,
        architecture_boundary="Node.js 22 Dispatcher -> Python 3.11 ML Runtime (RPC HTTP/gRPC)",
        gpu_available=gpu_available,
        gpu_device=gpu_device,
        version=config.version,
        weights_cached=_compute_weights_cached(),
    )


def _decode_image_buffer_from_extract_profile_payload(payload: ExtractProfilePayload) -> ImageBuffer:
    raw_bytes = payload.image.decode_bytes()

    try:
        with Image.open(io.BytesIO(raw_bytes)) as pil_image:
            image_rgb = pil_image.convert("RGB")
            width, height = image_rgb.size
            rgb_bytes = image_rgb.tobytes()
    except Exception as exc:
        raise ValueError("Failed to decode extract_profile image payload into RGB image") from exc

    expected_len = width * height * 3
    if len(rgb_bytes) != expected_len:
        raise ValueError(
            f"Decoded RGB image size mismatch: expected {expected_len} bytes, got {len(rgb_bytes)}"
        )

    return ImageBuffer(
        width=width,
        height=height,
        rgb_bytes=rgb_bytes,
    )


def _build_extractor() -> AristoColorsExtractor:
    return AristoColorsExtractor(
        dino_adapter=DinoV2Adapter(),
        depth_adapter=DepthAnythingV2Adapter(),
        matting_adapter=BiRefNetAdapter(),
    )


def handle_rpc_task(task: RpcTaskRequest) -> dict[str, Any]:
    """
    Stateless GPU/ML task execution router.
    Executes tasks dispatched by the Node.js 22 BullMQ Worker/Dispatcher.
    """
    if task.task_type == "ping":
        return {
            "pong": True,
            "timestamp": time.time(),
            "stateless": True,
        }

    elif task.task_type == "extract_profile":
        payload = ExtractProfilePayload.from_dict(task.payload)
        image_buffer = _decode_image_buffer_from_extract_profile_payload(payload)

        extractor = _build_extractor()
        extracted = extractor.extract(
            image=image_buffer,
            source_asset_id=payload.source_asset_id,
        )

        return extracted.to_dict()

    elif task.task_type == "compile_conditioning":
        return {
            "targetProvider": task.payload.get("targetProvider", "diffusion_sdxl"),
            "status": "ready_for_compilation",
            "stateless": True,
            "idempotencyKey": task.idempotency_key,
        }

    elif task.task_type == "render_photobash":
        return {
            "jobId": task.payload.get("jobId"),
            "status": "acknowledged",
            "stateless": True,
            "idempotencyKey": task.idempotency_key,
        }

    else:
        raise ValueError(f"Unsupported taskType: '{task.task_type}'")


class StatelessRpcHandler(BaseHTTPRequestHandler):
    """
    Lightweight, zero-dependency HTTP server handler for the Python ML Runtime.
    Exposes /health and /rpc/v1/compute.
    """

    def _send_json(self, status_code: int, data: dict[str, Any]):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Stateless-Runtime", "true")
        self.send_header("X-Boundary", "Node.js-Dispatcher-to-Python-ML-Runtime")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/health", "/healthz", "/"):
            self._send_json(200, _build_health_response().to_dict())
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        if self.path == "/rpc/v1/compute":
            t0 = time.perf_counter()
            data: dict[str, Any] = {}

            try:
                content_length = int(self.headers.get("Content-Length", 0))
                raw_body = self.rfile.read(content_length)
                data = json.loads(raw_body.decode("utf-8"))

                task = RpcTaskRequest.from_dict(data)
                result = handle_rpc_task(task)
                duration_ms = (time.perf_counter() - t0) * 1000.0

                resp = RpcTaskResponse(
                    task_id=task.task_id,
                    status="completed",
                    result=result,
                    error=None,
                    execution_time_ms=duration_ms,
                )
                self._send_json(200, resp.to_dict())

            except ModelWeightNotCachedError as exc:
                duration_ms = (time.perf_counter() - t0) * 1000.0
                task_id = data.get("taskId") or data.get("task_id", "unknown")
                resp = RpcTaskResponse(
                    task_id=str(task_id),
                    status="failed",
                    result=None,
                    error=f"Model weights not cached: {exc}",
                    execution_time_ms=duration_ms,
                )
                self._send_json(503, resp.to_dict())

            except Exception as exc:
                duration_ms = (time.perf_counter() - t0) * 1000.0
                task_id = data.get("taskId") or data.get("task_id", "unknown")

                resp = RpcTaskResponse(
                    task_id=str(task_id),
                    status="failed",
                    result=None,
                    error=str(exc),
                    execution_time_ms=duration_ms,
                )
                self._send_json(400, resp.to_dict())
        else:
            self._send_json(404, {"error": "Endpoint Not Found"})

    def log_message(self, format: str, *args: Any):
        pass


def run_service(host: str = config.host, port: int = config.port):
    server = HTTPServer((host, port), StatelessRpcHandler)
    print(f"[Python ML Runtime] Stateless RPC Service listening on http://{host}:{port}")
    print("[Python ML Runtime] Architecture Boundary: Node.js 22 Dispatcher -> Python 3.11 ML Runtime (RPC)")
    print(f"[Python ML Runtime] consumes_bullmq = {config.consumes_bullmq}, stateless = {config.stateless}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[Python ML Runtime] Shutting down cleanly...")
        server.server_close()


try:
    from fastapi import FastAPI, HTTPException

    app = FastAPI(
        title="AristoColors Python ML Runtime",
        description="Stateless GPU Microservice for Style DNA Extraction & Conditioning Compilation",
        version="0.1.0",
    )

    @app.get("/health")
    def health_check():
        return _build_health_response().to_dict()

    @app.post("/rpc/v1/compute")
    def compute_rpc(request: dict[str, Any]):
        t0 = time.perf_counter()
        try:
            task = RpcTaskRequest.from_dict(request)
            result = handle_rpc_task(task)
            duration_ms = (time.perf_counter() - t0) * 1000.0
            return RpcTaskResponse(
                task_id=task.task_id,
                status="completed",
                result=result,
                error=None,
                execution_time_ms=duration_ms,
            ).to_dict()
        except ModelWeightNotCachedError as exc:
            duration_ms = (time.perf_counter() - t0) * 1000.0
            raise HTTPException(
                status_code=503,
                detail=RpcTaskResponse(
                    task_id=request.get("taskId", request.get("task_id", "unknown")),
                    status="failed",
                    result=None,
                    error=f"Model weights not cached: {exc}",
                    execution_time_ms=duration_ms,
                ).to_dict(),
            )
        except Exception as exc:
            duration_ms = (time.perf_counter() - t0) * 1000.0
            raise HTTPException(
                status_code=400,
                detail=RpcTaskResponse(
                    task_id=request.get("taskId", "unknown"),
                    status="failed",
                    result=None,
                    error=str(exc),
                    execution_time_ms=duration_ms,
                ).to_dict(),
            )
except ImportError:
    app = None


if __name__ == "__main__":
    run_service()
