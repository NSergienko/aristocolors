import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from src.weights import WEIGHT_REGISTRY, check_cached_weights


def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(f"Test failed: {message}")


def write_sparse_file(path: Path, size_bytes: int):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as handle:
        if size_bytes > 0:
            handle.seek(size_bytes - 1)
            handle.write(b"\0")


print("=== Starting Phase 1 / Step 2: GPU Weight Cache Tests ===")

project_root = Path(parent_dir)
dockerfile_gpu = project_root / "Dockerfile.gpu"
requirements_gpu = project_root / "requirements-gpu.txt"
entrypoint = project_root / "scripts" / "docker-entrypoint.sh"
warmup_script = project_root / "scripts" / "warmup_weights.py"

print("1. Verifying CUDA / Python / GPU dependency configuration files...")
dockerfile_text = dockerfile_gpu.read_text(encoding="utf-8")
requirements_text = requirements_gpu.read_text(encoding="utf-8")
entrypoint_text = entrypoint.read_text(encoding="utf-8")

assert_true("FROM nvidia/cuda:12.2.2-runtime-ubuntu22.04" in dockerfile_text, "Dockerfile must use CUDA 12.2 runtime")
assert_true("python3.11" in dockerfile_text, "Dockerfile must install Python 3.11")
assert_true("MODEL_CACHE_DIR=/weights" in dockerfile_text, "Dockerfile must set MODEL_CACHE_DIR=/weights")
assert_true("TORCH_HOME=/weights/torch" in dockerfile_text, "Dockerfile must set TORCH_HOME=/weights/torch")
assert_true("HF_HOME=/weights/huggingface" in dockerfile_text, "Dockerfile must set HF_HOME=/weights/huggingface")
assert_true("WARMUP_ON_STARTUP=true" in dockerfile_text, "Dockerfile must set WARMUP_ON_STARTUP=true")
assert_true("ARG PREBAKE_WEIGHTS=false" in dockerfile_text, "Dockerfile must support PREBAKE_WEIGHTS build arg")
assert_true("--extra-index-url https://download.pytorch.org/whl/cu121" in requirements_text, "requirements-gpu.txt must use cu121 index")
assert_true("torch==2.3.1+cu121" in requirements_text, "requirements-gpu.txt must pin torch cu121")
assert_true("torchvision==0.18.1+cu121" in requirements_text, "requirements-gpu.txt must pin torchvision cu121")
assert_true("torchaudio==2.3.1+cu121" in requirements_text, "requirements-gpu.txt must pin torchaudio cu121")
assert_true("python /app/scripts/warmup_weights.py --download" in entrypoint_text, "Entrypoint must download weights on startup")
assert_true("python /app/scripts/warmup_weights.py --check-only --strict" in entrypoint_text, "Entrypoint must strictly verify weights on startup")
assert_true("|| true" not in entrypoint_text, "Entrypoint must fail fast and must not swallow errors")
print("   [PASS] GPU Docker and startup configuration verified.")

print("2. Verifying canonical 4-model weight registry...")
expected_registry = {
    "canonical_embedding": {
        "capability": "DINOv2 ViT-L/14",
        "source_type": "huggingface",
    },
    "geometry_depth": {
        "capability": "Depth-Anything v2 Large",
        "source_type": "huggingface",
    },
    "alpha_matting": {
        "capability": "BiRefNet",
        "source_type": "huggingface",
    },
    "commercial_4k_upscale": {
        "capability": "Real-ESRGAN x4plus",
        "source_type": "url",
    },
}
assert_true(set(WEIGHT_REGISTRY.keys()) == set(expected_registry.keys()), "Registry must contain exactly 4 canonical model entries")
for model_key, expected in expected_registry.items():
    spec = WEIGHT_REGISTRY[model_key]
    assert_true(spec.capability == expected["capability"], f"{model_key} capability must match canonical value")
    assert_true(spec.source_type == expected["source_type"], f"{model_key} source_type must match canonical value")
    assert_true(len(spec.expected_files) >= 1, f"{model_key} must define expected files")
    assert_true(spec.min_expected_size_mb > 0, f"{model_key} must define a positive min_expected_size_mb")
print("   [PASS] Canonical model registry verified.")

print("3. Verifying empty cache is rejected...")
with tempfile.TemporaryDirectory() as temp_cache_dir:
    for model_key in WEIGHT_REGISTRY.keys():
        status = check_cached_weights(model_key, temp_cache_dir)
        assert_true(status["isCached"] is False, f"{model_key} must not be cached in an empty directory")
        assert_true(len(status["missingFiles"]) >= 1, f"{model_key} must report missing files in an empty cache")
print("   [PASS] Empty cache rejection verified.")

print("4. Verifying partial Hugging Face cache is rejected when only one expected file exists...")
with tempfile.TemporaryDirectory() as temp_cache_dir:
    model_key = "canonical_embedding"
    spec = WEIGHT_REGISTRY[model_key]
    model_dir = Path(temp_cache_dir) / spec.target_subdir
    model_dir.mkdir(parents=True, exist_ok=True)
    (model_dir / spec.expected_files[0]).write_text("partial", encoding="utf-8")

    status = check_cached_weights(model_key, temp_cache_dir)
    assert_true(status["isCached"] is False, "Partial Hugging Face cache must not be accepted")
    assert_true(len(status["foundFiles"]) == 1, "Exactly one expected file should be found")
    assert_true(len(status["missingFiles"]) == len(spec.expected_files) - 1, "Remaining expected files must be missing")
print("   [PASS] Partial Hugging Face cache rejection verified.")

print("5. Verifying tiny 1 KB mock weights are rejected by minimum size validation...")
with tempfile.TemporaryDirectory() as temp_cache_dir:
    for model_key, spec in WEIGHT_REGISTRY.items():
        model_dir = Path(temp_cache_dir) / spec.target_subdir
        for expected_file in spec.expected_files:
            write_sparse_file(model_dir / expected_file, 1024)

        status = check_cached_weights(model_key, temp_cache_dir)
        assert_true(status["isCached"] is False, f"{model_key} tiny files must not satisfy cache validation")
        assert_true(status["totalSizeBytes"] == 1024 * len(spec.expected_files), f"{model_key} totalSizeBytes must reflect tiny files")
        assert_true(status["totalSizeMb"] < spec.min_expected_size_mb, f"{model_key} totalSizeMb must be below configured minimum")
print("   [PASS] Tiny-file rejection verified.")

print("6. Verifying minimum-sized sparse files can satisfy cache validation...")
with tempfile.TemporaryDirectory() as temp_cache_dir:
    model_key = "commercial_4k_upscale"
    spec = WEIGHT_REGISTRY[model_key]
    model_dir = Path(temp_cache_dir) / spec.target_subdir
    required_size_bytes = spec.min_expected_size_mb * 1024 * 1024
    write_sparse_file(model_dir / spec.expected_files[0], required_size_bytes)

    status = check_cached_weights(model_key, temp_cache_dir)
    assert_true(status["isCached"] is True, "A file meeting the configured minimum size must be accepted")
    assert_true(status["missingFiles"] == [], "No files should be missing when the expected file exists")
    assert_true(status["totalSizeBytes"] >= required_size_bytes, "totalSizeBytes must reflect the sparse file size")
    assert_true(status["minExpectedSizeMb"] == spec.min_expected_size_mb, "minExpectedSizeMb must be reported")
print("   [PASS] Minimum-sized sparse file acceptance verified.")

print("7. Verifying warmup_weights.py --check-only --strict fails with exit code 1 when weights are missing...")
with tempfile.TemporaryDirectory() as temp_cache_dir:
    env = dict(os.environ)
    env["MODEL_CACHE_DIR"] = temp_cache_dir
    result = subprocess.run(
        [
            sys.executable,
            str(warmup_script),
            "--check-only",
            "--strict",
            "--json",
        ],
        cwd=str(project_root),
        env=env,
        capture_output=True,
        text=True,
    )
    assert_true(result.returncode == 1, "Strict check-only mode must exit with code 1 when required weights are missing")
    parsed = json.loads(result.stdout)
    assert_true(isinstance(parsed, dict), "JSON output must be a model status map")
    assert_true(any(not item["isCached"] for item in parsed.values()), "At least one model must be reported as not cached")
print("   [PASS] Strict CLI failure behavior verified.")

print("8. Verifying architectural boundary guards remain intact...")
service_main_text = (project_root / "service_main.py").read_text(encoding="utf-8")
assert_true("render_photobash" in service_main_text, "RPC render_photobash route must remain present")
assert_true("extract_profile" in service_main_text, "extract_profile stub must remain present")
assert_true("compile_conditioning" in service_main_text, "compile_conditioning stub must remain present")
assert_true("BullMQ" in service_main_text or "bullmq" in service_main_text, "Boundary documentation must remain present")
assert_true("Redis" not in service_main_text or "consume Redis queues" not in service_main_text, "No Redis queue consumer implementation should be introduced")
print("   [PASS] Architectural boundary guards verified.")

print("\n=== All Phase 1 / Step 2 Tests Passed Successfully! ===")
