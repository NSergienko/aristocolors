from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class HealthResponse:
    status: str
    runtime: str
    stateless: bool
    consumes_bullmq: bool
    architecture_boundary: str
    gpu_available: bool
    gpu_device: str
    version: str
    weights_cached: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "runtime": self.runtime,
            "stateless": self.stateless,
            "consumesBullmq": self.consumes_bullmq,
            "architectureBoundary": self.architecture_boundary,
            "gpuAvailable": self.gpu_available,
            "gpuDevice": self.gpu_device,
            "version": self.version,
            "weightsCached": self.weights_cached,
        }


@dataclass
class ExtractProfileImagePayload:
    data_base64: str
    mime_type: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ExtractProfileImagePayload":
        data_base64 = data.get("dataBase64") or data.get("data_base64")
        mime_type = data.get("mimeType") or data.get("mime_type")

        if not data_base64 or not isinstance(data_base64, str):
            raise ValueError("Missing required extract_profile image field: dataBase64 / data_base64")

        return cls(
            data_base64=data_base64,
            mime_type=str(mime_type) if mime_type is not None else None,
        )

    def decode_bytes(self) -> bytes:
        try:
            return base64.b64decode(self.data_base64, validate=True)
        except Exception as exc:
            raise ValueError("Invalid base64 image payload for extract_profile") from exc


@dataclass
class ExtractProfilePayload:
    source_asset_id: str
    image: ExtractProfileImagePayload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ExtractProfilePayload":
        source_asset_id = data.get("sourceAssetId") or data.get("source_asset_id")
        image_payload = data.get("image")

        if not source_asset_id or not isinstance(source_asset_id, str):
            raise ValueError("Missing required extract_profile field: sourceAssetId / source_asset_id")

        if not isinstance(image_payload, dict):
            raise ValueError("Missing required extract_profile field: image")

        return cls(
            source_asset_id=source_asset_id,
            image=ExtractProfileImagePayload.from_dict(image_payload),
        )


@dataclass
class RpcTaskRequest:
    task_id: str
    idempotency_key: str
    task_type: str
    payload: dict[str, Any]
    timeout_ms: int = 30000

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RpcTaskRequest":
        task_id = data.get("taskId") or data.get("task_id")
        idempotency_key = data.get("idempotencyKey") or data.get("idempotency_key")
        task_type = data.get("taskType") or data.get("task_type")
        payload = data.get("payload") or {}
        timeout_ms = data.get("timeoutMs") or data.get("timeout_ms", 30000)

        if not task_id:
            raise ValueError("Missing required field: taskId / task_id")
        if not idempotency_key:
            raise ValueError("Missing required field: idempotencyKey / idempotency_key")
        if not task_type:
            raise ValueError("Missing required field: taskType / task_type")
        if not isinstance(payload, dict):
            raise ValueError("Field payload must be an object")

        task_type_str = str(task_type)

        if task_type_str == "extract_profile":
            ExtractProfilePayload.from_dict(payload)

        return cls(
            task_id=str(task_id),
            idempotency_key=str(idempotency_key),
            task_type=task_type_str,
            payload=payload,
            timeout_ms=int(timeout_ms),
        )


@dataclass
class RpcTaskResponse:
    task_id: str
    status: str
    result: Optional[dict[str, Any]]
    error: Optional[str]
    execution_time_ms: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "taskId": self.task_id,
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "executionTimeMs": round(self.execution_time_ms, 3),
        }
