from __future__ import annotations

import base64
import hashlib
import io
import importlib.util
import sys
import types
from pathlib import Path
from typing import Any

from PIL import Image


def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def assert_equal(left: Any, right: Any, message: str):
    if left != right:
        raise AssertionError(f"{message}: left={left!r}, right={right!r}")


def assert_not_equal(left: Any, right: Any, message: str):
    if left == right:
        raise AssertionError(f"{message}: both={left!r}")


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def make_base_image(width: int = 8, height: int = 6) -> Image.Image:
    image = Image.new("RGBA", (width, height))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            pixels[x, y] = ((x * 31) % 256, (y * 47) % 256, ((x + y) * 19) % 256, 255)
    return image


def make_mask_image(width: int = 8, height: int = 6) -> Image.Image:
    image = Image.new("L", (width, height))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            pixels[x, y] = 255 if x < width // 2 else 0
    return image


class RecordingConditioningCompiler:
    def __init__(self):
        self.calls: list[dict[str, Any]] = []

    def compile(self, *, profile: Any, target_provider: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
        result = {
            "prompt": f"provider={target_provider};style={profile.get('style', 'unknown')}",
            "directives": {
                "guidanceScale": (options or {}).get("guidanceScale", 7.5),
                "negativePrompt": (options or {}).get("negativePrompt", ""),
            },
            "profileEcho": profile,
            "optionsEcho": options or {},
        }
        self.calls.append(
            {
                "profile": profile,
                "target_provider": target_provider,
                "options": options,
                "result": result,
            }
        )
        return result


def load_pipeline_module():
    root_dir = Path(__file__).resolve().parents[1]
    pipeline_path = root_dir / "src" / "pipeline" / "latent_blend.py"
    spec = importlib.util.spec_from_file_location("test_pipeline_latent_blend_module", pipeline_path)
    module = importlib.util.module_from_spec(spec)
    assert_true(spec is not None and spec.loader is not None, "Failed to load latent_blend module spec")
    sys.modules[spec.name] = module`r`n    spec.loader.exec_module(module)
    return module


def load_service_main_module_with_stubs():
    root_dir = Path(__file__).resolve().parents[1]
    service_main_path = root_dir / "service_main.py"

    previous_modules: dict[str, types.ModuleType | None] = {}

    def install(name: str, module: types.ModuleType):
        previous_modules[name] = sys.modules.get(name)
        sys.modules[name] = module

    src_pkg = types.ModuleType("src")
    src_pkg.__path__ = []  # type: ignore[attr-defined]
    install("src", src_pkg)

    aristocolors_pkg = types.ModuleType("src.aristocolors")
    aristocolors_pkg.__path__ = []  # type: ignore[attr-defined]
    install("src.aristocolors", aristocolors_pkg)

    adapters_pkg = types.ModuleType("src.aristocolors.adapters")
    adapters_pkg.__path__ = []  # type: ignore[attr-defined]
    install("src.aristocolors.adapters", adapters_pkg)

    adapters_base = types.ModuleType("src.aristocolors.adapters.base")

    class ModelWeightNotCachedError(RuntimeError):
        pass

    adapters_base.ModelWeightNotCachedError = ModelWeightNotCachedError
    install("src.aristocolors.adapters.base", adapters_base)

    depth_module = types.ModuleType("src.aristocolors.adapters.depth")

    class DepthAnythingV2Adapter:
        pass

    depth_module.DepthAnythingV2Adapter = DepthAnythingV2Adapter
    install("src.aristocolors.adapters.depth", depth_module)

    dino_module = types.ModuleType("src.aristocolors.adapters.dinov2")

    class DinoV2Adapter:
        pass

    dino_module.DinoV2Adapter = DinoV2Adapter
    install("src.aristocolors.adapters.dinov2", dino_module)

    matting_module = types.ModuleType("src.aristocolors.adapters.matting")

    class BiRefNetAdapter:
        pass

    matting_module.BiRefNetAdapter = BiRefNetAdapter
    install("src.aristocolors.adapters.matting", matting_module)

    extractor_module = types.ModuleType("src.aristocolors.extractor")

    class AristoColorsExtractor:
        def __init__(self, *args: Any, **kwargs: Any):
            self.args = args
            self.kwargs = kwargs

        def extract(self, *, image: Any, source_asset_id: str | None = None):
            class _Result:
                def to_dict(self) -> dict[str, Any]:
                    return {
                        "sourceAssetId": source_asset_id,
                        "width": getattr(image, "width", None),
                        "height": getattr(image, "height", None),
                    }

            return _Result()

    extractor_module.AristoColorsExtractor = AristoColorsExtractor
    install("src.aristocolors.extractor", extractor_module)

    types_module = types.ModuleType("src.aristocolors.types")

    class ImageBuffer:
        def __init__(self, width: int, height: int, rgb_bytes: bytes):
            self.width = width
            self.height = height
            self.rgb_bytes = rgb_bytes

    types_module.ImageBuffer = ImageBuffer
    install("src.aristocolors.types", types_module)

    conditioning_module = types.ModuleType("src.conditioning")

    class ConditioningCompiler:
        def compile(self, *, profile: Any, target_provider: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
            return {
                "prompt": "stub-prompt",
                "directives": {
                    "provider": target_provider,
                    "options": options or {},
                },
                "profile": profile,
            }

    conditioning_module.ConditioningCompiler = ConditioningCompiler
    install("src.conditioning", conditioning_module)

    config_module = types.ModuleType("src.config")

    class _Config:
        host = "127.0.0.1"
        port = 8000
        version = "test"
        consumes_bullmq = False
        stateless = True

        def assert_architectural_boundary_invariants(self):
            return None

        def detect_gpu_device(self):
            return False, None

    config_module.config = _Config()
    install("src.config", config_module)

    pipeline_module = types.ModuleType("src.pipeline")

    class MultiModelLatentBlendPipeline:
        def __init__(self, *args: Any, **kwargs: Any):
            self.calls: list[dict[str, Any]] = []

        def run_from_images(
            self,
            *,
            profile: Any,
            target_provider: str,
            base_image: Image.Image,
            mask_image: Image.Image,
            options: dict[str, Any] | None = None,
            seed: int | None = None,
            style_lora_name: str | None = None,
            style_lora_scale: float | None = None,
            detail_lora_name: str | None = None,
            detail_lora_scale: float | None = None,
        ):
            self.calls.append(
                {
                    "profile": profile,
                    "target_provider": target_provider,
                    "base_image_size": base_image.size,
                    "mask_image_size": mask_image.size,
                    "options": options,
                    "seed": seed,
                    "style_lora_name": style_lora_name,
                    "style_lora_scale": style_lora_scale,
                    "detail_lora_name": detail_lora_name,
                    "detail_lora_scale": detail_lora_scale,
                }
            )

            class _Rendered:
                def __init__(self):
                    self.image_rgba = Image.new("RGBA", base_image.size, (12, 34, 56, 255))
                    self.seed = seed if seed is not None else 0
                    self.provenance_sha256 = "abc123"
                    self.compiled_conditioning = {
                        "prompt": "wired-through-pipeline",
                        "directives": {"provider": target_provider},
                    }
                    self.metadata = {
                        "targetProvider": target_provider,
                        "seed": self.seed,
                    }

            return _Rendered()

    pipeline_module.MultiModelLatentBlendPipeline = MultiModelLatentBlendPipeline
    install("src.pipeline", pipeline_module)

    protocol_module = types.ModuleType("src.protocol")

    class _EncodedImage:
        def __init__(self, data: str):
            self.data = data

        def decode_bytes(self) -> bytes:
            return base64.b64decode(self.data.encode("ascii"))

    class ExtractProfilePayload:
        def __init__(self, image: _EncodedImage, source_asset_id: str | None = None):
            self.image = image
            self.source_asset_id = source_asset_id

        @classmethod
        def from_dict(cls, data: dict[str, Any]):
            image_value = data.get("image", {})
            if isinstance(image_value, dict):
                encoded = image_value.get("data", "")
            else:
                encoded = ""
            return cls(_EncodedImage(encoded), data.get("sourceAssetId"))

    class HealthResponse:
        def __init__(self, **kwargs: Any):
            self._data = dict(kwargs)

        def to_dict(self) -> dict[str, Any]:
            return dict(self._data)

    class RpcTaskRequest:
        def __init__(self, task_id: str, task_type: str, payload: dict[str, Any], idempotency_key: str | None = None):
            self.task_id = task_id
            self.task_type = task_type
            self.payload = payload
            self.idempotency_key = idempotency_key

        @classmethod
        def from_dict(cls, data: dict[str, Any]):
            return cls(
                task_id=str(data.get("taskId", data.get("task_id", "unknown"))),
                task_type=str(data.get("taskType", data.get("task_type", ""))),
                payload=data.get("payload", {}),
                idempotency_key=data.get("idempotencyKey", data.get("idempotency_key")),
            )

    class RpcTaskResponse:
        def __init__(
            self,
            *,
            task_id: str,
            status: str,
            result: dict[str, Any] | None,
            error: str | None,
            execution_time_ms: float,
        ):
            self.task_id = task_id
            self.status = status
            self.result = result
            self.error = error
            self.execution_time_ms = execution_time_ms

        def to_dict(self) -> dict[str, Any]:
            return {
                "taskId": self.task_id,
                "status": self.status,
                "result": self.result,
                "error": self.error,
                "executionTimeMs": self.execution_time_ms,
            }

    protocol_module.ExtractProfilePayload = ExtractProfilePayload
    protocol_module.HealthResponse = HealthResponse
    protocol_module.RpcTaskRequest = RpcTaskRequest
    protocol_module.RpcTaskResponse = RpcTaskResponse
    install("src.protocol", protocol_module)

    weights_module = types.ModuleType("src.weights")

    def check_cached_weights(model_key: str) -> dict[str, Any]:
        return {"isCached": True, "modelKey": model_key}

    def list_supported_models() -> list[str]:
        return ["mock-model"]

    weights_module.check_cached_weights = check_cached_weights
    weights_module.list_supported_models = list_supported_models
    install("src.weights", weights_module)

    spec = importlib.util.spec_from_file_location("test_service_main_module", service_main_path)
    module = importlib.util.module_from_spec(spec)
    assert_true(spec is not None and spec.loader is not None, "Failed to load service_main module spec")
    sys.modules[spec.name] = module`r`n    spec.loader.exec_module(module)

    def cleanup():
        for name, previous in previous_modules.items():
            if previous is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = previous

    module.__test_cleanup__ = cleanup
    return module


def test_multimodel_latent_blend_pipeline_same_seed_is_deterministic():
    latent_blend = load_pipeline_module()
    compiler = RecordingConditioningCompiler()
    pipeline = latent_blend.MultiModelLatentBlendPipeline(conditioning_compiler=compiler)

    base_image = make_base_image()
    mask_image = make_mask_image()

    request = latent_blend.LatentBlendInput(
        profile={"style": "editorial"},
        target_provider="mock-provider",
        base_image=base_image,
        mask_image=mask_image,
        options={"guidanceScale": 5.5, "negativePrompt": "blurry"},
        seed=123456,
        style_lora=latent_blend.LatentBlendLoRAConfig(name="style-a", scale=0.75),
        detail_lora=latent_blend.LatentBlendLoRAConfig(name="detail-b", scale=1.25),
    )

    first = pipeline.run(request)
    second = pipeline.run(request)

    assert_equal(first.seed, 123456, "Seed should be preserved deterministically")
    assert_equal(second.seed, 123456, "Seed should be preserved deterministically on repeat")
    assert_equal(
        sha256_bytes(png_bytes(first.image_rgba)),
        sha256_bytes(png_bytes(second.image_rgba)),
        "Same seed and same inputs must produce identical PNG output",
    )
    assert_equal(
        first.provenance_sha256,
        second.provenance_sha256,
        "Same seed and same inputs must produce identical provenance hash",
    )


def test_multimodel_latent_blend_pipeline_returns_rgba_and_expected_dimensions():
    latent_blend = load_pipeline_module()
    compiler = RecordingConditioningCompiler()
    pipeline = latent_blend.MultiModelLatentBlendPipeline(conditioning_compiler=compiler)

    base_image = make_base_image(width=11, height=9)
    mask_image = make_mask_image(width=11, height=9)

    result = pipeline.run_from_images(
        profile={"style": "portrait"},
        target_provider="mock-provider",
        base_image=base_image,
        mask_image=mask_image,
        seed=7,
    )

    assert_equal(result.image_rgba.mode, "RGBA", "Pipeline must return RGBA image")
    assert_equal(result.image_rgba.size, (11, 9), "Pipeline must preserve base image dimensions")


def test_multimodel_latent_blend_pipeline_propagates_conditioning_to_loader():
    latent_blend = load_pipeline_module()

    class InspectingLoader(latent_blend.CpuMockLatentBlendModelLoader):
        def __init__(self):
            super().__init__()
            self.render_calls: list[dict[str, Any]] = []

        def render(
            self,
            pipeline: Any,
            *,
            base_image: Image.Image,
            mask_image: Image.Image,
            compiled_conditioning: dict[str, Any],
            seed: int,
        ) -> Image.Image:
            self.render_calls.append(
                {
                    "compiled_conditioning": compiled_conditioning,
                    "seed": seed,
                    "applied_loras": list(pipeline.applied_loras),
                }
            )
            return super().render(
                pipeline,
                base_image=base_image,
                mask_image=mask_image,
                compiled_conditioning=compiled_conditioning,
                seed=seed,
            )

    compiler = RecordingConditioningCompiler()
    loader = InspectingLoader()
    pipeline = latent_blend.MultiModelLatentBlendPipeline(
        conditioning_compiler=compiler,
        model_loader=loader,
    )

    result = pipeline.run_from_images(
        profile={"style": "cinematic"},
        target_provider="mock-provider",
        base_image=make_base_image(),
        mask_image=make_mask_image(),
        options={"guidanceScale": 9.0, "negativePrompt": "low quality"},
        seed=42,
    )

    assert_equal(len(compiler.calls), 1, "Conditioning compiler must be invoked once")
    assert_equal(len(loader.render_calls), 1, "Loader render must be invoked once")
    compiled = loader.render_calls[0]["compiled_conditioning"]
    assert_equal(compiled["prompt"], "provider=mock-provider;style=cinematic", "Prompt must propagate into render")
    assert_equal(
        compiled["directives"]["guidanceScale"],
        9.0,
        "Compiled directives must propagate into render",
    )
    assert_equal(
        result.compiled_conditioning["directives"]["negativePrompt"],
        "low quality",
        "Result must expose compiled conditioning",
    )


def test_style_and_detail_lora_are_applied_independently_with_configured_scales():
    latent_blend = load_pipeline_module()

    class RecordingLoader(latent_blend.CpuMockLatentBlendModelLoader):
        def __init__(self):
            super().__init__()
            self.apply_calls: list[dict[str, Any]] = []

        def apply_lora(self, pipeline: Any, lora: Any, slot: str) -> None:
            self.apply_calls.append(
                {
                    "slot": slot,
                    "name": lora.name,
                    "scale": lora.scale,
                }
            )
            super().apply_lora(pipeline, lora, slot)

    loader = RecordingLoader()
    pipeline = latent_blend.MultiModelLatentBlendPipeline(
        conditioning_compiler=RecordingConditioningCompiler(),
        model_loader=loader,
    )

    pipeline.run_from_images(
        profile={"style": "fashion"},
        target_provider="mock-provider",
        base_image=make_base_image(),
        mask_image=make_mask_image(),
        seed=99,
        style_lora_name="style-lora",
        style_lora_scale=0.4,
        detail_lora_name="detail-lora",
        detail_lora_scale=1.6,
    )

    assert_equal(len(loader.apply_calls), 2, "Both Style LoRA and Detail LoRA must be applied")
    assert_equal(loader.apply_calls[0]["slot"], "style", "Style LoRA must use style slot")
    assert_equal(loader.apply_calls[0]["name"], "style-lora", "Style LoRA name must propagate")
    assert_equal(loader.apply_calls[0]["scale"], 0.4, "Style LoRA scale must propagate independently")
    assert_equal(loader.apply_calls[1]["slot"], "detail", "Detail LoRA must use detail slot")
    assert_equal(loader.apply_calls[1]["name"], "detail-lora", "Detail LoRA name must propagate")
    assert_equal(loader.apply_calls[1]["scale"], 1.6, "Detail LoRA scale must propagate independently")


def test_lora_cleanup_occurs_after_successful_generation():
    latent_blend = load_pipeline_module()

    class CleanupRecordingLoader(latent_blend.CpuMockLatentBlendModelLoader):
        def __init__(self):
            super().__init__()
            self.pipeline_ref = None
            self.clear_calls = 0

        def require_pipeline(self, target_provider: str) -> Any:
            pipeline = super().require_pipeline(target_provider)
            self.pipeline_ref = pipeline
            return pipeline

        def clear_loras(self, pipeline: Any) -> None:
            self.clear_calls += 1
            super().clear_loras(pipeline)

    loader = CleanupRecordingLoader()
    pipeline = latent_blend.MultiModelLatentBlendPipeline(
        conditioning_compiler=RecordingConditioningCompiler(),
        model_loader=loader,
    )

    pipeline.run_from_images(
        profile={"style": "beauty"},
        target_provider="mock-provider",
        base_image=make_base_image(),
        mask_image=make_mask_image(),
        seed=5,
        style_lora_name="style-cleanup",
        style_lora_scale=0.8,
    )

    assert_equal(loader.clear_calls, 1, "LoRA cleanup must occur exactly once on success")
    assert_true(loader.pipeline_ref is not None, "Pipeline reference should be captured")
    assert_equal(loader.pipeline_ref.applied_loras, [], "LoRA state must be empty after success cleanup")


def test_lora_cleanup_occurs_when_generation_fails():
    latent_blend = load_pipeline_module()

    class FailingLoader(latent_blend.CpuMockLatentBlendModelLoader):
        def __init__(self):
            super().__init__()
            self.pipeline_ref = None
            self.clear_calls = 0

        def require_pipeline(self, target_provider: str) -> Any:
            pipeline = super().require_pipeline(target_provider)
            self.pipeline_ref = pipeline
            return pipeline

        def render(
            self,
            pipeline: Any,
            *,
            base_image: Image.Image,
            mask_image: Image.Image,
            compiled_conditioning: dict[str, Any],
            seed: int,
        ) -> Image.Image:
            raise RuntimeError("forced render failure")

        def clear_loras(self, pipeline: Any) -> None:
            self.clear_calls += 1
            super().clear_loras(pipeline)

    loader = FailingLoader()
    pipeline = latent_blend.MultiModelLatentBlendPipeline(
        conditioning_compiler=RecordingConditioningCompiler(),
        model_loader=loader,
    )

    failed = False
    try:
        pipeline.run_from_images(
            profile={"style": "beauty"},
            target_provider="mock-provider",
            base_image=make_base_image(),
            mask_image=make_mask_image(),
            seed=5,
            style_lora_name="style-cleanup",
            style_lora_scale=0.8,
            detail_lora_name="detail-cleanup",
            detail_lora_scale=1.1,
        )
    except RuntimeError as exc:
        failed = True
        assert_equal(str(exc), "forced render failure", "Failure reason should propagate")

    assert_true(failed, "Generation must fail in this test")
    assert_equal(loader.clear_calls, 1, "LoRA cleanup must occur exactly once on failure")
    assert_true(loader.pipeline_ref is not None, "Pipeline reference should be captured on failure")
    assert_equal(loader.pipeline_ref.applied_loras, [], "LoRA state must be empty after failure cleanup")


def test_no_lora_model_state_leakage_between_requests():
    latent_blend = load_pipeline_module()

    class LeakageInspectingLoader(latent_blend.CpuMockLatentBlendModelLoader):
        def __init__(self):
            super().__init__()
            self.render_call_loras: list[list[dict[str, Any]]] = []

        def render(
            self,
            pipeline: Any,
            *,
            base_image: Image.Image,
            mask_image: Image.Image,
            compiled_conditioning: dict[str, Any],
            seed: int,
        ) -> Image.Image:
            self.render_call_loras.append(list(pipeline.applied_loras))
            return super().render(
                pipeline,
                base_image=base_image,
                mask_image=mask_image,
                compiled_conditioning=compiled_conditioning,
                seed=seed,
            )

    loader = LeakageInspectingLoader()
    pipeline = latent_blend.MultiModelLatentBlendPipeline(
        conditioning_compiler=RecordingConditioningCompiler(),
        model_loader=loader,
    )

    pipeline.run_from_images(
        profile={"style": "first"},
        target_provider="mock-provider",
        base_image=make_base_image(),
        mask_image=make_mask_image(),
        seed=1,
        style_lora_name="style-one",
        style_lora_scale=0.5,
    )

    pipeline.run_from_images(
        profile={"style": "second"},
        target_provider="mock-provider",
        base_image=make_base_image(),
        mask_image=make_mask_image(),
        seed=2,
    )

    assert_equal(len(loader.render_call_loras), 2, "There must be two render calls recorded")
    assert_equal(len(loader.render_call_loras[0]), 1, "First request should have one applied LoRA")
    assert_equal(loader.render_call_loras[0][0]["name"], "style-one", "First request LoRA should match input")
    assert_equal(loader.render_call_loras[1], [], "Second request must start with no leaked LoRA state")


def test_render_photobash_rpc_dispatches_through_new_pipeline():
    service_main = load_service_main_module_with_stubs()
    try:
        base_image = make_base_image(width=10, height=4)
        mask_image = make_mask_image(width=10, height=4)

        request_payload = {
            "taskId": "task-1",
            "taskType": "render_photobash",
            "idempotencyKey": "idem-123",
            "payload": {
                "jobId": "job-123",
                "profile": {"style": "editorial"},
                "targetProvider": "mock-provider",
                "options": {"guidanceScale": 6.0},
                "seed": 314,
                "baseImage": base64.b64encode(png_bytes(base_image)).decode("ascii"),
                "maskImage": base64.b64encode(png_bytes(mask_image)).decode("ascii"),
                "styleLora": {"name": "style-rpc", "scale": 0.7},
                "detailLora": {"name": "detail-rpc", "scale": 1.3},
            },
        }

        task = service_main.RpcTaskRequest.from_dict(request_payload)
        result = service_main.handle_rpc_task(task)

        pipeline = service_main._default_latent_blend_pipeline
        assert_equal(len(pipeline.calls), 1, "RPC render_photobash must dispatch through pipeline once")

        call = pipeline.calls[0]
        assert_equal(call["profile"], {"style": "editorial"}, "RPC must pass profile into pipeline")
        assert_equal(call["target_provider"], "mock-provider", "RPC must pass provider into pipeline")
        assert_equal(call["base_image_size"], (10, 4), "RPC must decode and pass base image")
        assert_equal(call["mask_image_size"], (10, 4), "RPC must decode and pass mask image")
        assert_equal(call["seed"], 314, "RPC must pass deterministic seed")
        assert_equal(call["style_lora_name"], "style-rpc", "RPC must pass Style LoRA name")
        assert_equal(call["style_lora_scale"], 0.7, "RPC must pass Style LoRA scale")
        assert_equal(call["detail_lora_name"], "detail-rpc", "RPC must pass Detail LoRA name")
        assert_equal(call["detail_lora_scale"], 1.3, "RPC must pass Detail LoRA scale")

        assert_equal(result["status"], "completed", "RPC result status must remain completed")
        assert_equal(result["idempotencyKey"], "idem-123", "RPC result must preserve idempotency key")
        assert_equal(result["seed"], 314, "RPC result must expose seed from pipeline")
        assert_equal(result["provenanceSha256"], "abc123", "RPC result must expose provenance hash from pipeline")
        assert_equal(
            result["compiledConditioning"]["prompt"],
            "wired-through-pipeline",
            "RPC result must expose compiled conditioning from pipeline",
        )
        assert_equal(result["image"]["mimeType"], "image/png", "RPC result must encode PNG image")
        assert_equal(result["image"]["encoding"], "base64", "RPC result must expose base64-encoded image")
        assert_equal(result["image"]["mode"], "RGBA", "RPC result image mode must be RGBA")
        assert_equal(result["image"]["width"], 10, "RPC result width must match rendered image")
        assert_equal(result["image"]["height"], 4, "RPC result height must match rendered image")
        assert_true(isinstance(result["image"]["data"], str) and len(result["image"]["data"]) > 0, "RPC must return image data")
    finally:
        service_main.__test_cleanup__()

