from __future__ import annotations

import base64
import io
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

from PIL import Image

CURRENT_DIR = Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent
SRC_DIR = ROOT_DIR / "src"

if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def assert_equal(left: Any, right: Any, message: str):
    if left != right:
        raise AssertionError(f"{message}: expected {right!r}, got {left!r}")


def assert_raises(expected_exception: type[BaseException], fn, message: str):
    try:
        fn()
    except expected_exception:
        return
    except Exception as exc:
        raise AssertionError(
            f"{message}: expected {expected_exception.__name__}, got {type(exc).__name__}: {exc}"
        ) from exc
    raise AssertionError(f"{message}: expected {expected_exception.__name__} to be raised")


def load_service_main_module():
    service_main_path = ROOT_DIR / "service_main.py"
    source = service_main_path.read_text(encoding="utf-8")

    module = ModuleType("worker_ai_service_main_for_refinement_tests")
    module.__file__ = str(service_main_path)
    module.__package__ = ""

    exec(compile(source, str(service_main_path), "exec"), module.__dict__)
    return module


from src.aristocolors.adapters.base import ModelWeightNotCachedError
from src.aristocolors.types import ImageBuffer
from src.pipeline import (
    CpuMockLatentBlendModelLoader,
    EdgeRefinementStage,
    LatentBlendInput,
    LatentBlendOptions,
    MockRealESRGANUpscaler,
    MultiModelLatentBlendPipeline,
    ProductionRealESRGANUpscaler,
    get_default_upscaler,
)
from src.weights import WeightSpec, WEIGHT_REGISTRY


def _make_rgb_image(width: int, height: int) -> Image.Image:
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            pixels[x, y] = (
                (x * 17 + y * 3) % 256,
                (x * 5 + y * 11) % 256,
                (x * 13 + y * 7) % 256,
            )
    return image


def _make_mask_image(width: int, height: int) -> Image.Image:
    image = Image.new("L", (width, height))
    pixels = image.load()
    cx = width / 2.0
    cy = height / 2.0
    max_dist = max(1.0, (cx * cx + cy * cy) ** 0.5)
    for y in range(height):
        for x in range(width):
            dx = x - cx
            dy = y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            value = max(0, min(255, int(255 * (1.0 - dist / max_dist))))
            pixels[x, y] = value
    return image


def _encode_png_base64(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _image_to_buffer(image: Image.Image) -> ImageBuffer:
    rgb = image.convert("RGB")
    width, height = rgb.size
    return ImageBuffer(width=width, height=height, rgb_bytes=rgb.tobytes())


def test_01_weight_registry_role_mappings():
    alpha_spec: WeightSpec = WEIGHT_REGISTRY["alpha_matting"]
    upscale_spec: WeightSpec = WEIGHT_REGISTRY["commercial_4k_upscale"]

    assert_equal(alpha_spec.key, "alpha_matting", "alpha_matting key matches")
    assert_equal(alpha_spec.capability, "BiRefNet", "alpha_matting capability is BiRefNet")
    assert_equal(upscale_spec.key, "commercial_4k_upscale", "commercial_4k_upscale key matches")
    assert_equal(
        upscale_spec.capability,
        "Real-ESRGAN x4plus",
        "commercial_4k_upscale capability is Real-ESRGAN x4plus",
    )


def test_02_edge_refinement_mock_execution():
    stage = EdgeRefinementStage(use_mocks=True)
    source = _make_rgb_image(64, 64)
    result = stage.refine(_image_to_buffer(source))

    assert_true(isinstance(result, dict), "edge refinement must return a result object")
    assert_true("alphaMask" in result, "edge refinement result must contain alphaMask")
    assert_equal(result["width"], 64, "edge refinement width must be preserved")
    assert_equal(result["height"], 64, "edge refinement height must be preserved")

    alpha_mask = result["alphaMask"]
    assert_equal(int(alpha_mask.shape[0]), 64, "alpha mask height must match")
    assert_equal(int(alpha_mask.shape[1]), 64, "alpha mask width must match")

    center_value = float(alpha_mask[32, 32])
    corner_value = float(alpha_mask[0, 0])
    near_edge_value = float(alpha_mask[4, 4])

    assert_true(0.0 <= corner_value <= 1.0, "corner alpha must be normalized")
    assert_true(0.0 <= center_value <= 1.0, "center alpha must be normalized")
    assert_true(center_value >= near_edge_value, "alpha should be stronger near the subject center")
    assert_true(near_edge_value >= corner_value, "alpha should fall off toward the outer edge")


def test_03_production_adapters_fail_fast_on_missing_weights():
    def build_edge_refiner():
        EdgeRefinementStage(
            use_mocks=False,
            cache_dir=str(ROOT_DIR / ".missing-edge-refiner-cache"),
        )

    def build_upscaler():
        ProductionRealESRGANUpscaler(
            cache_dir=str(ROOT_DIR / ".missing-upscaler-cache"),
        )

    assert_raises(
        ModelWeightNotCachedError,
        build_edge_refiner,
        "production edge refiner must fail fast when weights are missing",
    )
    assert_raises(
        ModelWeightNotCachedError,
        build_upscaler,
        "production upscaler must fail fast when weights are missing",
    )


def test_04_realesrgan_mock_upscaling_to_4k():
    upscaler = MockRealESRGANUpscaler()
    source = _make_rgb_image(128, 72)
    output = upscaler.upscale(
        _image_to_buffer(source),
        target_width=3840,
        target_height=2160,
    )

    assert_equal(output.width, 3840, "mock upscaler must output exact 4K width")
    assert_equal(output.height, 2160, "mock upscaler must output exact 4K height")


def test_05_realesrgan_bypass_when_not_requested():
    pipeline = MultiModelLatentBlendPipeline(
        model_loader=CpuMockLatentBlendModelLoader(),
    )

    base_image = _make_rgb_image(128, 128)
    mask_image = _make_mask_image(128, 128)

    result = pipeline.run(
        LatentBlendInput(
            profile={"style": "test"},
            target_provider="diffusion_sdxl",
            base_image=base_image,
            mask_image=mask_image,
            options=LatentBlendOptions(
                refine_edges=True,
                enable_upscale=False,
                upscale_target=None,
            ),
            seed=123,
        )
    )

    assert_equal(result.image_rgba.size[0], 128, "width must remain unchanged when upscale is not requested")
    assert_equal(result.image_rgba.size[1], 128, "height must remain unchanged when upscale is not requested")
    assert_true(
        result.metadata["postprocess"]["appliedUpscale"] is False,
        "upscaler must be bypassed for standard resolutions",
    )


def test_06_chained_pipeline_with_4k_resolution():
    pipeline = MultiModelLatentBlendPipeline(
        model_loader=CpuMockLatentBlendModelLoader(),
    )

    base_image = _make_rgb_image(160, 90)
    mask_image = _make_mask_image(160, 90)

    result = pipeline.run(
        LatentBlendInput(
            profile={"style": "photobash"},
            target_provider="diffusion_sdxl",
            base_image=base_image,
            mask_image=mask_image,
            options=LatentBlendOptions(
                refine_edges=True,
                enable_upscale=False,
                upscale_target="4k",
            ),
            seed=456,
        )
    )

    assert_equal(result.image_rgba.size[0], 3840, "chained pipeline must produce exact 4K width")
    assert_equal(result.image_rgba.size[1], 2160, "chained pipeline must produce exact 4K height")
    assert_true(
        result.metadata["postprocess"]["appliedEdgeRefinement"] is True,
        "edge refinement must run before 4K upscale",
    )
    assert_true(
        result.metadata["postprocess"]["appliedUpscale"] is True,
        "upscale must run when 4K target is requested",
    )


def test_07_deterministic_seed_with_refinement_and_upscale():
    pipeline = MultiModelLatentBlendPipeline(
        model_loader=CpuMockLatentBlendModelLoader(),
    )

    base_image = _make_rgb_image(96, 96)
    mask_image = _make_mask_image(96, 96)
    request = LatentBlendInput(
        profile={"style": "deterministic"},
        target_provider="diffusion_sdxl",
        base_image=base_image,
        mask_image=mask_image,
        options=LatentBlendOptions(
            refine_edges=True,
            enable_upscale=True,
            upscale_target="4k",
        ),
        seed=999,
    )

    result_a = pipeline.run(request)
    result_b = pipeline.run(request)

    assert_equal(result_a.seed, result_b.seed, "seed must be identical")
    assert_equal(
        result_a.provenance_sha256,
        result_b.provenance_sha256,
        "provenance hash must be deterministic with refinement and upscale",
    )
    assert_equal(
        result_a.image_rgba.tobytes(),
        result_b.image_rgba.tobytes(),
        "output image bytes must be bit-for-bit reproducible",
    )


def test_08_service_rpc_render_photobash_with_4k():
    service_main = load_service_main_module()

    base_image = _make_rgb_image(128, 72)
    mask_image = _make_mask_image(128, 72)

    response = service_main.handle_rpc_task(
        service_main.RpcTaskRequest(
            task_id="task-render-4k",
            task_type="render_photobash",
            payload={
                "jobId": "job-4k",
                "profile": {"style": "rpc"},
                "targetProvider": "diffusion_sdxl",
                "baseImage": _encode_png_base64(base_image),
                "maskImage": _encode_png_base64(mask_image),
                "options": {
                    "refine_edges": True,
                    "enable_upscale": False,
                    "upscale_target": "4k",
                },
                "seed": 321,
            },
            idempotency_key="idem-render-4k",
        )
    )

    assert_equal(response["status"], "completed", "render_photobash RPC must complete successfully")
    assert_true(response["stateless"] is True, "render_photobash RPC must remain stateless")
    assert_equal(response["image"]["width"], 3840, "render_photobash RPC must return exact 4K width")
    assert_equal(response["image"]["height"], 2160, "render_photobash RPC must return exact 4K height")


def main():
    tests = [
        test_01_weight_registry_role_mappings,
        test_02_edge_refinement_mock_execution,
        test_03_production_adapters_fail_fast_on_missing_weights,
        test_04_realesrgan_mock_upscaling_to_4k,
        test_05_realesrgan_bypass_when_not_requested,
        test_06_chained_pipeline_with_4k_resolution,
        test_07_deterministic_seed_with_refinement_and_upscale,
        test_08_service_rpc_render_photobash_with_4k,
    ]

    for test in tests:
        test()

    print("ok - 8/8 refinement/upscale tests passed")


if __name__ == "__main__":
    main()
