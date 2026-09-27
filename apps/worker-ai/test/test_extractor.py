from __future__ import annotations

import base64
import io
import math
import sys
from pathlib import Path
from typing import Any


TEST_FILE = Path(__file__).resolve()
WORKER_AI_ROOT = TEST_FILE.parents[1]
if str(WORKER_AI_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKER_AI_ROOT))

import numpy as np
from PIL import Image

from src.aristocolors.adapters.depth import MockDepthAdapter
from src.aristocolors.adapters.dinov2 import MockDinoAdapter
from src.aristocolors.adapters.matting import MockMattingAdapter
from src.aristocolors.extractor import AristoColorsExtractor
from src.aristocolors.inferred import eval_sh_basis_9, extract_inferred_features
from src.aristocolors.types import ImageBuffer
from src.protocol import RpcTaskRequest
import service_main


def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def assert_close(value: float, expected: float, tolerance: float, message: str):
    if abs(value - expected) > tolerance:
        raise AssertionError(f"{message}: expected {expected}, got {value}, tolerance {tolerance}")


def make_test_image(width: int = 32, height: int = 24) -> Image.Image:
    y = np.linspace(0, 255, height, dtype=np.uint8)[:, None]
    x = np.linspace(0, 255, width, dtype=np.uint8)[None, :]

    r = np.broadcast_to(x, (height, width))
    g = np.broadcast_to(y, (height, width))
    b = ((r.astype(np.uint16) + g.astype(np.uint16)) // 2).astype(np.uint8)

    rgb = np.stack([r, g, b], axis=-1)
    return Image.fromarray(rgb, mode="RGB")


def image_to_buffer(image: Image.Image) -> ImageBuffer:
    image_rgb = image.convert("RGB")
    width, height = image_rgb.size
    rgb_bytes = image_rgb.tobytes()
    return ImageBuffer(width=width, height=height, rgb_bytes=rgb_bytes)


def make_png_base64(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def strip_nondeterministic_metadata(result: dict[str, Any]) -> dict[str, Any]:
    cleaned = {
        "profile": result["profile"],
        "canonicalEmbedding": result["canonicalEmbedding"],
        "metadata": dict(result.get("metadata", {})),
    }
    cleaned["metadata"].pop("extractedAt", None)
    return cleaned


def test_imagebuffer_validation():
    image = make_test_image()
    image_buffer = image_to_buffer(image)

    extractor = AristoColorsExtractor(
        dino_adapter=MockDinoAdapter(),
        depth_adapter=MockDepthAdapter(),
        matting_adapter=MockMattingAdapter(),
    )

    result = extractor.extract(image_buffer, source_asset_id="asset:test:valid")
    assert_true(result.profile.schemaVersion == "1.2.0", "Valid ImageBuffer should be accepted")

    malformed = ImageBuffer(
        width=image_buffer.width,
        height=image_buffer.height,
        rgb_bytes=image_buffer.rgb_bytes[:-3],
    )

    try:
        extractor.extract(malformed, source_asset_id="asset:test:invalid")
        raise AssertionError("Malformed ImageBuffer must be rejected")
    except ValueError as exc:
        assert_true("rgb_bytes length mismatch" in str(exc), "Malformed buffer should fail length validation")


def test_sh_basis_and_real_sh_lighting_path():
    basis = eval_sh_basis_9(0.0, 0.0, 1.0)
    assert_true(len(basis) == 9, "eval_sh_basis_9 must return exactly 9 values")
    assert_true(all(math.isfinite(value) for value in basis), "All SH basis values must be finite")

    image = make_test_image()
    image_buffer = image_to_buffer(image)

    depth = MockDepthAdapter().estimate_depth(image).depth_map
    alpha = MockMattingAdapter().estimate_alpha(image).alpha_mask
    inferred = extract_inferred_features(image_buffer, depth_values=depth, alpha_mask=alpha)
    lighting = inferred.lighting

    assert_true(lighting is not None, "Lighting inference must be present")
    assert_true(isinstance(lighting.ambientFillRatio, float), "ambientFillRatio must be numeric")
    assert_true(math.isfinite(lighting.ambientFillRatio), "ambientFillRatio must be finite")
    assert_true(0.0 <= lighting.ambientFillRatio <= 1.0, "ambientFillRatio must be in [0,1]")
    assert_true(isinstance(lighting.contrastRatio, str), "contrastRatio must be a string")
    assert_true(":" in lighting.contrastRatio, "contrastRatio must have ratio formatting from SH path")


def test_full_extractor_pipeline_with_mocks():
    image = make_test_image()
    image_buffer = image_to_buffer(image)

    extractor = AristoColorsExtractor(
        dino_adapter=MockDinoAdapter(),
        depth_adapter=MockDepthAdapter(),
        matting_adapter=MockMattingAdapter(),
    )

    extracted = extractor.extract(image_buffer, source_asset_id="asset:test:full")
    data = extracted.to_dict()

    assert_true("profile" in data, "Serialized output must contain profile")
    assert_true("canonicalEmbedding" in data, "Serialized output must contain canonicalEmbedding")
    assert_true("metadata" in data, "Serialized output must contain metadata")

    profile = data["profile"]
    embedding = data["canonicalEmbedding"]

    assert_true(profile["schemaVersion"] == "1.2.0", "schemaVersion must match Step 3 contract")
    assert_true(profile["extractorVersion"] == "extractor_v1.2", "extractorVersion must match Step 3 contract")

    vector = embedding["vector"]
    assert_true(embedding["dimension"] == 1024, "Canonical embedding must be 1024-dimensional")
    assert_true(len(vector) == 1024, "Canonical embedding vector length must be 1024")

    norm = math.sqrt(sum(float(v) * float(v) for v in vector))
    assert_close(norm, 1.0, 1e-5, "Canonical embedding must be L2-normalized")

    lighting = profile["inferredFeatures"]["lighting"]
    assert_true(isinstance(lighting["ambientFillRatio"], float), "ambientFillRatio must serialize as numeric float")

    texture = profile["deterministicFeatures"]["textureAnalysis"]
    assert_true(isinstance(texture["contrastRatio"], str), "contrastRatio must remain a string")


def test_repeatability_with_deterministic_mock_adapters():
    image = make_test_image()
    image_buffer = image_to_buffer(image)

    extractor = AristoColorsExtractor(
        dino_adapter=MockDinoAdapter(),
        depth_adapter=MockDepthAdapter(),
        matting_adapter=MockMattingAdapter(),
    )

    first = extractor.extract(image_buffer, source_asset_id="asset:test:repeat").to_dict()
    second = extractor.extract(image_buffer, source_asset_id="asset:test:repeat").to_dict()

    first_clean = strip_nondeterministic_metadata(first)
    second_clean = strip_nondeterministic_metadata(second)

    assert_true(
        first_clean == second_clean,
        "Identical input with deterministic mock adapters must produce identical image-derived output and embedding",
    )


def test_outputs_are_finite_and_in_range():
    image = make_test_image()
    image_buffer = image_to_buffer(image)

    extractor = AristoColorsExtractor(
        dino_adapter=MockDinoAdapter(),
        depth_adapter=MockDepthAdapter(),
        matting_adapter=MockMattingAdapter(),
    )

    extracted = extractor.extract(image_buffer, source_asset_id="asset:test:ranges").to_dict()
    profile = extracted["profile"]

    deterministic = profile["deterministicFeatures"]
    inferred = profile["inferredFeatures"]

    luminance = deterministic["luminanceStats"]
    assert_true(math.isfinite(luminance["mean"]), "Luminance mean must be finite")
    assert_true(math.isfinite(luminance["stdDev"]), "Luminance stdDev must be finite")
    assert_true(0.0 <= luminance["min"] <= 1.0, "Luminance min must be in [0,1]")
    assert_true(0.0 <= luminance["max"] <= 1.0, "Luminance max must be in [0,1]")

    texture = deterministic["textureAnalysis"]
    assert_true(math.isfinite(texture["edgeDensity"]), "edgeDensity must be finite")
    assert_true(math.isfinite(texture["entropy"]), "entropy must be finite")

    lighting = inferred["lighting"]
    assert_true(math.isfinite(lighting["ambientFillRatio"]), "ambientFillRatio must be finite")
    assert_true(0.0 <= lighting["ambientFillRatio"] <= 1.0, "ambientFillRatio must be in [0,1]")
    assert_true(math.isfinite(lighting["uniformity"]), "uniformity must be finite")
    assert_true(0.0 <= lighting["uniformity"] <= 1.0, "uniformity must be in [0,1]")

    surface_normals = inferred["surfaceNormals"]
    assert_true(surface_normals is not None, "surfaceNormals must be present when depth is available")
    assert_true(surface_normals["dominantFacing"] in {"left", "right", "up", "down", "front"}, "dominantFacing must be valid")
    assert_true(math.isfinite(surface_normals["confidence"]), "surfaceNormals confidence must be finite")
    assert_true(0.0 <= surface_normals["confidence"] <= 1.0, "surfaceNormals confidence must be in [0,1]")


def test_rpc_extract_profile_with_mock_adapter_injection():
    original_build_extractor = service_main._build_extractor

    def build_mock_extractor():
        return AristoColorsExtractor(
            dino_adapter=MockDinoAdapter(),
            depth_adapter=MockDepthAdapter(),
            matting_adapter=MockMattingAdapter(),
        )

    service_main._build_extractor = build_mock_extractor
    try:
        image = make_test_image()
        payload = {
            "taskId": "rpc-test-1",
            "idempotencyKey": "rpc-test-key-1",
            "taskType": "extract_profile",
            "payload": {
                "sourceAssetId": "asset:test:rpc",
                "image": {
                    "dataBase64": make_png_base64(image),
                    "mimeType": "image/png",
                },
            },
        }

        task = RpcTaskRequest.from_dict(payload)
        result = service_main.handle_rpc_task(task)

        assert_true("profile" in result, "RPC extract_profile must return profile")
        assert_true("canonicalEmbedding" in result, "RPC extract_profile must return canonicalEmbedding")
        assert_true("metadata" in result, "RPC extract_profile must return metadata")

        profile = result["profile"]
        assert_true("profileId" in profile, "RPC response must use camelCase profileId")
        assert_true("sourceAssetId" in profile, "RPC response must use camelCase sourceAssetId")
        assert_true("schemaVersion" in profile, "RPC response must use camelCase schemaVersion")
        assert_true("extractorVersion" in profile, "RPC response must use camelCase extractorVersion")
        assert_true("canonicalModelName" in profile, "RPC response must use camelCase canonicalModelName")
        assert_true("deterministicFeatures" in profile, "RPC response must use camelCase deterministicFeatures")
        assert_true("inferredFeatures" in profile, "RPC response must use camelCase inferredFeatures")

        embedding = result["canonicalEmbedding"]
        assert_true("profileId" in embedding, "Embedding serialization must use camelCase profileId")
        assert_true("modelName" in embedding, "Embedding serialization must use camelCase modelName")
        assert_true("modelVersion" in embedding, "Embedding serialization must use camelCase modelVersion")
        assert_true("dimension" in embedding, "Embedding serialization must include dimension")
        assert_true("vector" in embedding, "Embedding serialization must include vector")
    finally:
        service_main._build_extractor = original_build_extractor


def test_architecture_boundary_remains_stateless():
    image = make_test_image()
    image_buffer = image_to_buffer(image)

    extractor = AristoColorsExtractor(
        dino_adapter=MockDinoAdapter(),
        depth_adapter=MockDepthAdapter(),
        matting_adapter=MockMattingAdapter(),
    )

    result = extractor.extract(image_buffer, source_asset_id="asset:test:boundary").to_dict()
    metadata = result["metadata"]

    assert_true(metadata["embeddingDeterministicForIdenticalInput"] is True, "Deterministic metadata flag must be preserved")
    assert_true(
        metadata["imageDerivedFeaturesDeterministicForIdenticalInput"] is True,
        "Image-derived determinism flag must be preserved",
    )
    assert_true(
        metadata["serializedProfileByteDeterministic"] is False,
        "Serialized profile determinism flag must explicitly remain false",
    )

    imported_names = set(dir(service_main))
    assert_true("redis" not in imported_names, "Python extraction path must not introduce Redis dependency")
    assert_true("bullmq" not in imported_names, "Python extraction path must not introduce BullMQ dependency")


def _run_all_tests():
    test_functions = [
        obj
        for name, obj in sorted(globals().items())
        if name.startswith("test_") and callable(obj)
    ]

    failures: list[tuple[str, Exception]] = []

    for test_func in test_functions:
        try:
            test_func()
            print(f"[PASS] {test_func.__name__}")
        except Exception as exc:
            failures.append((test_func.__name__, exc))
            print(f"[FAIL] {test_func.__name__}: {exc}")

    if failures:
        print(f"\n{len(failures)} test(s) failed.")
        raise SystemExit(1)

    print(f"\nAll {len(test_functions)} test(s) passed.")


if __name__ == "__main__":
    _run_all_tests()
