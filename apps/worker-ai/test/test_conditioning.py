import copy
import importlib.util
import os
import sys
import types
from dataclasses import dataclass
from pathlib import Path

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from src.conditioning.compiler import COMPILER_VERSION, ConditioningCompiler


def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(f"Test failed: {message}")


@dataclass(frozen=True)
class MockColor:
    hex: str


@dataclass(frozen=True)
class MockTextureAnalysis:
    edgeDensity: float
    entropy: float
    contrastRatio: str
    edgeBleedRadiusPx: float


@dataclass(frozen=True)
class MockDeterministicFeatures:
    dominantColors: list[MockColor]
    textureAnalysis: MockTextureAnalysis | None


@dataclass(frozen=True)
class MockLighting:
    brightness: dict
    temperature: str
    uniformity: float
    ambientFillRatio: float
    contrastRatio: str


@dataclass(frozen=True)
class MockSurfaceNormals:
    dominantFacing: str


@dataclass(frozen=True)
class MockInferredFeatures:
    lighting: MockLighting | None
    surfaceNormals: MockSurfaceNormals | None


@dataclass(frozen=True)
class MockProfile:
    profileId: str
    deterministicFeatures: MockDeterministicFeatures
    inferredFeatures: MockInferredFeatures


class RpcTaskRequestStub:
    def __init__(self, task_id: str, task_type: str, payload: dict, idempotency_key: str | None = None):
        self.task_id = task_id
        self.task_type = task_type
        self.payload = payload
        self.idempotency_key = idempotency_key

    @classmethod
    def from_dict(cls, data: dict):
        return cls(
            task_id=data.get("taskId", data.get("task_id", "unknown")),
            task_type=data.get("taskType", data.get("task_type", "")),
            payload=data.get("payload", {}),
            idempotency_key=data.get("idempotencyKey", data.get("idempotency_key")),
        )


def build_profile() -> MockProfile:
    return MockProfile(
        profileId="123e4567-e89b-12d3-a456-426614174000",
        deterministicFeatures=MockDeterministicFeatures(
            dominantColors=[
                MockColor("#AABBCC"),
                MockColor("#DDEEFF"),
                MockColor("#112233"),
            ],
            textureAnalysis=MockTextureAnalysis(
                edgeDensity=0.14,
                entropy=5.25,
                contrastRatio="medium",
                edgeBleedRadiusPx=10.0,
            ),
        ),
        inferredFeatures=MockInferredFeatures(
            lighting=MockLighting(
                brightness={
                    "mean": 0.58,
                    "azimuthDeg": 32.0,
                    "elevationDeg": 18.0,
                },
                temperature="Warm",
                uniformity=0.72,
                ambientFillRatio=0.61,
                contrastRatio="medium",
            ),
            surfaceNormals=MockSurfaceNormals(
                dominantFacing="Front",
            ),
        ),
    )


def build_options() -> dict:
    return {
        "basePrompt": "AristoColors editorial interior scene",
        "steps": 24,
        "aspectRatio": "16:9",
        "guidanceScale": 7.5,
        "ipAdapterScale": 0.66,
        "harmonizationIntensity": 0.91,
    }


def verify_common_compiled_fields(result: dict, expected_target: str):
    assert_true(result["compilerVersion"] == COMPILER_VERSION, "compilerVersion must match compiler constant")
    assert_true(result["schemaVersion"] == "1.0", "schemaVersion must match current compiler schema version")
    assert_true(result["targetProvider"] == expected_target, "targetProvider must match requested provider")
    assert_true(isinstance(result["metadata"], dict), "metadata must be a dictionary")
    assert_true(isinstance(result["compiledAt"], str) and result["compiledAt"], "compiledAt must be a non-empty string")
    assert_true(result["compiledAt"].endswith("Z"), "compiledAt must be UTC ISO-8601 with Z suffix")
    assert_true(result.get("profileId") == "123e4567-e89b-12d3-a456-426614174000", "profileId must be preserved when available")


def verify_diffusion_directives(result: dict):
    section = result["diffusion"]
    assert_true(section["provider"] == "diffusion_sdxl", "diffusion provider must be diffusion_sdxl")
    assert_true(section["cfgScale"] == 6.5, "diffusion cfgScale must be canonical")
    assert_true(section["clipSkip"] == 2, "diffusion clipSkip must be canonical")
    assert_true(section["steps"] == 24, "diffusion steps must respect options.steps")
    assert_true(section["controlnetInpaintWeight"] == 0.91, "diffusion ControlNet inpaint weight must follow harmonizationIntensity")
    assert_true(section["samplerName"] == "DPM++ 2M Karras", "diffusion samplerName must be canonical")
    assert_true(section["paletteKeywords"] == ["#aabbcc", "#ddeeff", "#112233"], "diffusion paletteKeywords must be deterministic")
    assert_true("AristoColors editorial interior scene" in section["positivePrompt"], "diffusion positivePrompt must include basePrompt")
    assert_true(isinstance(section["negativePrompt"], str) and section["negativePrompt"], "diffusion negativePrompt must be present")
    assert_true(isinstance(section["lightingPrompt"], str) and section["lightingPrompt"], "diffusion lightingPrompt must be present")
    assert_true(isinstance(section["texturePrompt"], str) and section["texturePrompt"], "diffusion texturePrompt must be present")


def verify_imagen_directives(result: dict):
    section = result["imagen"]
    assert_true(section["provider"] == "imagen_3", "imagen provider must be imagen_3")
    assert_true(section["aspectRatio"] == "16:9", "imagen aspectRatio must respect options.aspectRatio")
    assert_true(section["guidanceScale"] == 7.5, "imagen guidanceScale must respect options.guidanceScale")
    assert_true(isinstance(section["naturalLanguageAtmosphere"], str) and section["naturalLanguageAtmosphere"], "imagen naturalLanguageAtmosphere must be present")
    assert_true(isinstance(section["lightingDirective"], str) and section["lightingDirective"], "imagen lightingDirective must be present")
    assert_true(isinstance(section["colorPaletteDirective"], str) and section["colorPaletteDirective"], "imagen colorPaletteDirective must be present")
    assert_true(isinstance(section["textureDirective"], str) and section["textureDirective"], "imagen textureDirective must be present")
    assert_true(isinstance(section["combinedPrompt"], str) and section["combinedPrompt"], "imagen combinedPrompt must be present")
    assert_true("AristoColors editorial interior scene" in section["naturalLanguageAtmosphere"], "imagen atmosphere must include basePrompt")


def verify_controlnet_directives(result: dict):
    section = result["controlnet"]
    assert_true(section["provider"] == "controlnet_inpaint", "controlnet provider must be controlnet_inpaint")
    assert_true(section["preprocessor"] == "inpaint_only+lama", "controlnet preprocessor must be canonical")
    assert_true(section["controlnetWeight"] == 0.91, "controlnet weight must follow harmonizationIntensity")
    assert_true(section["ipAdapterScale"] == 0.66, "controlnet ipAdapterScale must respect options.ipAdapterScale")
    assert_true(section["startingControlStep"] == 0.0, "controlnet startingControlStep must be canonical")
    assert_true(section["endingControlStep"] == 1.0, "controlnet endingControlStep must be canonical")
    assert_true(section["controlMode"] == "balanced", "controlnet controlMode must be canonical")
    assert_true(section["maskBlur"] == 10.0, "controlnet maskBlur must derive from edgeBleedRadiusPx")


def load_service_main_module():
    service_main_path = Path(parent_dir) / "service_main.py"

    src_config = types.ModuleType("src.config")

    class DummyConfig:
        host = "127.0.0.1"
        port = 0
        version = "test"
        consumes_bullmq = False
        stateless = True

        def assert_architectural_boundary_invariants(self):
            return None

        def detect_gpu_device(self):
            return (False, None)

    src_config.config = DummyConfig()

    src_weights = types.ModuleType("src.weights")
    src_weights.check_cached_weights = lambda model_key: {"isCached": False}
    src_weights.list_supported_models = lambda: []

    src_protocol = types.ModuleType("src.protocol")

    class ExtractProfilePayload:
        @classmethod
        def from_dict(cls, data):
            return cls()

    class HealthResponse:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def to_dict(self):
            return dict(self.kwargs)

    class RpcTaskResponse:
        def __init__(self, task_id, status, result, error, execution_time_ms):
            self.task_id = task_id
            self.status = status
            self.result = result
            self.error = error
            self.execution_time_ms = execution_time_ms

        def to_dict(self):
            return {
                "taskId": self.task_id,
                "status": self.status,
                "result": self.result,
                "error": self.error,
                "executionTimeMs": self.execution_time_ms,
            }

    src_protocol.ExtractProfilePayload = ExtractProfilePayload
    src_protocol.HealthResponse = HealthResponse
    src_protocol.RpcTaskRequest = RpcTaskRequestStub
    src_protocol.RpcTaskResponse = RpcTaskResponse

    src_aristo_base = types.ModuleType("src.aristocolors.adapters.base")

    class ModelWeightNotCachedError(RuntimeError):
        pass

    src_aristo_base.ModelWeightNotCachedError = ModelWeightNotCachedError

    src_depth = types.ModuleType("src.aristocolors.adapters.depth")

    class DepthAnythingV2Adapter:
        pass

    src_depth.DepthAnythingV2Adapter = DepthAnythingV2Adapter

    src_dino = types.ModuleType("src.aristocolors.adapters.dinov2")

    class DinoV2Adapter:
        pass

    src_dino.DinoV2Adapter = DinoV2Adapter

    src_matting = types.ModuleType("src.aristocolors.adapters.matting")

    class BiRefNetAdapter:
        pass

    src_matting.BiRefNetAdapter = BiRefNetAdapter

    src_extractor = types.ModuleType("src.aristocolors.extractor")

    class AristoColorsExtractor:
        def __init__(self, *args, **kwargs):
            pass

        def extract(self, image, source_asset_id):
            raise AssertionError("extract_profile path must not be exercised in test_conditioning")

    src_extractor.AristoColorsExtractor = AristoColorsExtractor

    src_types = types.ModuleType("src.aristocolors.types")

    class ImageBuffer:
        def __init__(self, width, height, rgb_bytes):
            self.width = width
            self.height = height
            self.rgb_bytes = rgb_bytes

    src_types.ImageBuffer = ImageBuffer

    pil_module = types.ModuleType("PIL")
    pil_image_module = types.ModuleType("PIL.Image")

    class DummyImageModule:
        @staticmethod
        def open(_buffer):
            raise AssertionError("PIL.Image.open must not be called in conditioning tests")

    pil_image_module.open = DummyImageModule.open
    pil_module.Image = pil_image_module

    previous_modules = {
        name: sys.modules.get(name)
        for name in [
            "src.config",
            "src.weights",
            "src.protocol",
            "src.aristocolors.adapters.base",
            "src.aristocolors.adapters.depth",
            "src.aristocolors.adapters.dinov2",
            "src.aristocolors.adapters.matting",
            "src.aristocolors.extractor",
            "src.aristocolors.types",
            "PIL",
            "PIL.Image",
        ]
    }

    try:
        sys.modules["src.config"] = src_config
        sys.modules["src.weights"] = src_weights
        sys.modules["src.protocol"] = src_protocol
        sys.modules["src.aristocolors.adapters.base"] = src_aristo_base
        sys.modules["src.aristocolors.adapters.depth"] = src_depth
        sys.modules["src.aristocolors.adapters.dinov2"] = src_dino
        sys.modules["src.aristocolors.adapters.matting"] = src_matting
        sys.modules["src.aristocolors.extractor"] = src_extractor
        sys.modules["src.aristocolors.types"] = src_types
        sys.modules["PIL"] = pil_module
        sys.modules["PIL.Image"] = pil_image_module

        module_name = "_test_service_main_conditioning"
        spec = importlib.util.spec_from_file_location(module_name, service_main_path)
        assert_true(spec is not None and spec.loader is not None, "service_main module spec must load")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for name, previous in previous_modules.items():
            if previous is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = previous


print("=== Starting Phase 1 / Step 4: Conditioning Compiler Tests ===")

compiler = ConditioningCompiler()
profile = build_profile()
options = build_options()

print("1. Verifying diffusion_sdxl compilation...")
diffusion_result = compiler.compile(profile, "diffusion_sdxl", options)
verify_common_compiled_fields(diffusion_result, "diffusion_sdxl")
assert_true("diffusion" in diffusion_result, "diffusion result must contain diffusion directives")
assert_true("imagen" not in diffusion_result, "diffusion-only result must not contain imagen directives")
assert_true("controlnet" not in diffusion_result, "diffusion-only result must not contain controlnet directives")
verify_diffusion_directives(diffusion_result)
print("   [PASS] diffusion_sdxl compilation verified.")

print("2. Verifying imagen_3 compilation...")
imagen_result = compiler.compile(profile, "imagen_3", options)
verify_common_compiled_fields(imagen_result, "imagen_3")
assert_true("imagen" in imagen_result, "imagen result must contain imagen directives")
assert_true("diffusion" not in imagen_result, "imagen-only result must not contain diffusion directives")
assert_true("controlnet" not in imagen_result, "imagen-only result must not contain controlnet directives")
verify_imagen_directives(imagen_result)
print("   [PASS] imagen_3 compilation verified.")

print("3. Verifying controlnet_inpaint compilation...")
controlnet_result = compiler.compile(profile, "controlnet_inpaint", options)
verify_common_compiled_fields(controlnet_result, "controlnet_inpaint")
assert_true("controlnet" in controlnet_result, "controlnet result must contain controlnet directives")
assert_true("diffusion" not in controlnet_result, "controlnet-only result must not contain diffusion directives")
assert_true("imagen" not in controlnet_result, "controlnet-only result must not contain imagen directives")
verify_controlnet_directives(controlnet_result)
print("   [PASS] controlnet_inpaint compilation verified.")

print("4. Verifying flux_1_dev routing through diffusion adapter...")
flux_result = compiler.compile(profile, "flux_1_dev", options)
verify_common_compiled_fields(flux_result, "flux_1_dev")
assert_true("diffusion" in flux_result, "flux_1_dev result must currently contain diffusion directives")
assert_true("imagen" not in flux_result, "flux_1_dev result must not contain imagen directives")
assert_true("controlnet" not in flux_result, "flux_1_dev result must not contain controlnet directives")
verify_diffusion_directives(flux_result)
assert_true(
    flux_result["metadata"].get("providerRouting") == "flux_1_dev_via_diffusion_sdxl",
    "flux_1_dev metadata must document diffusion routing",
)
print("   [PASS] flux_1_dev routing verified.")

print("5. Verifying all-provider compilation...")
all_result = compiler.compile(profile, "all", options)
verify_common_compiled_fields(all_result, "all")
assert_true("diffusion" in all_result, "all result must contain diffusion directives")
assert_true("imagen" in all_result, "all result must contain imagen directives")
assert_true("controlnet" in all_result, "all result must contain controlnet directives")
verify_diffusion_directives(all_result)
verify_imagen_directives(all_result)
verify_controlnet_directives(all_result)
print("   [PASS] all-provider compilation verified.")

print("6. Verifying unsupported provider raises ValueError...")
try:
    compiler.compile(profile, "unknown_provider", options)
    raise AssertionError("Unsupported provider must raise ValueError")
except ValueError as exc:
    assert_true("Unsupported target_provider" in str(exc), "Unsupported provider error must be clear")
print("   [PASS] Unsupported provider handling verified.")

print("7. Verifying compiler does not mutate input profile or options...")
profile_before = copy.deepcopy(profile)
options_before = copy.deepcopy(options)
_ = compiler.compile(profile, "all", options)
assert_true(profile == profile_before, "Compiler must not mutate profile")
assert_true(options == options_before, "Compiler must not mutate options")
print("   [PASS] Input immutability verified.")

print("8. Verifying deterministic provider directives across repeated compilation...")
first_diffusion = compiler.compile(profile, "diffusion_sdxl", options)["diffusion"]
second_diffusion = compiler.compile(profile, "diffusion_sdxl", options)["diffusion"]
assert_true(first_diffusion == second_diffusion, "Diffusion directives must be deterministic")

first_imagen = compiler.compile(profile, "imagen_3", options)["imagen"]
second_imagen = compiler.compile(profile, "imagen_3", options)["imagen"]
assert_true(first_imagen == second_imagen, "Imagen directives must be deterministic")

first_controlnet = compiler.compile(profile, "controlnet_inpaint", options)["controlnet"]
second_controlnet = compiler.compile(profile, "controlnet_inpaint", options)["controlnet"]
assert_true(first_controlnet == second_controlnet, "ControlNet directives must be deterministic")
print("   [PASS] Deterministic provider directives verified.")

print("9. Verifying compile_conditioning RPC integration via actual service_main dispatch...")
service_main = load_service_main_module()
rpc_task = RpcTaskRequestStub(
    task_id="task-conditioning-1",
    task_type="compile_conditioning",
    payload={
        "profile": profile,
        "targetProvider": "all",
        "options": options,
    },
    idempotency_key="idem-conditioning-1",
)
rpc_result = service_main.handle_rpc_task(rpc_task)
verify_common_compiled_fields(rpc_result, "all")
assert_true("diffusion" in rpc_result, "RPC compile_conditioning must return diffusion directives")
assert_true("imagen" in rpc_result, "RPC compile_conditioning must return imagen directives")
assert_true("controlnet" in rpc_result, "RPC compile_conditioning must return controlnet directives")
verify_diffusion_directives(rpc_result)
verify_imagen_directives(rpc_result)
verify_controlnet_directives(rpc_result)
print("   [PASS] compile_conditioning RPC integration verified.")

print("\n=== All Phase 1 / Step 4 Conditioning Tests Passed Successfully! ===")
