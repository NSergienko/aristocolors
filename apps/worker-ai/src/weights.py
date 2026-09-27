from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class WeightSpec:
    key: str
    capability: str
    source_type: str
    source_uri: str
    expected_files: tuple[str, ...]
    min_expected_size_mb: int
    target_subdir: str


DEFAULT_MODEL_CACHE_DIR = os.getenv("MODEL_CACHE_DIR", "/weights")


WEIGHT_REGISTRY: dict[str, WeightSpec] = {
    "canonical_embedding": WeightSpec(
        key="canonical_embedding",
        capability="DINOv2 ViT-L/14",
        source_type="huggingface",
        source_uri="facebook/dinov2-large",
        expected_files=(
            "config.json",
            "model.safetensors",
            "preprocessor_config.json",
        ),
        min_expected_size_mb=1000,
        target_subdir="huggingface/facebook/dinov2-large",
    ),
    "geometry_depth": WeightSpec(
        key="geometry_depth",
        capability="Depth-Anything v2 Large",
        source_type="huggingface",
        source_uri="depth-anything/Depth-Anything-V2-Large-hf",
        expected_files=(
            "config.json",
            "model.safetensors",
            "preprocessor_config.json",
        ),
        min_expected_size_mb=1000,
        target_subdir="huggingface/depth-anything/Depth-Anything-V2-Large-hf",
    ),
    "alpha_matting": WeightSpec(
        key="alpha_matting",
        capability="BiRefNet",
        source_type="huggingface",
        source_uri="ZhengPeng7/BiRefNet",
        expected_files=(
            "config.json",
            "model.safetensors",
        ),
        min_expected_size_mb=100,
        target_subdir="huggingface/ZhengPeng7/BiRefNet",
    ),
    "commercial_4k_upscale": WeightSpec(
        key="commercial_4k_upscale",
        capability="Real-ESRGAN x4plus",
        source_type="url",
        source_uri="https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
        expected_files=(
            "RealESRGAN_x4plus.pth",
        ),
        min_expected_size_mb=50,
        target_subdir="realesrgan/x4plus",
    ),
}


def _resolve_cache_dir(cache_dir: str | None = None) -> Path:
    return Path(cache_dir or os.getenv("MODEL_CACHE_DIR", DEFAULT_MODEL_CACHE_DIR)).resolve()


def _model_base_dir(spec: WeightSpec, cache_dir: str | None = None) -> Path:
    return _resolve_cache_dir(cache_dir) / spec.target_subdir


def _serialize_status(
    *,
    spec: WeightSpec,
    base_dir: Path,
    found_files: list[str],
    missing_files: list[str],
    total_size_bytes: int,
) -> dict[str, Any]:
    total_size_mb = round(total_size_bytes / (1024 * 1024), 2)
    is_complete = len(missing_files) == 0 and total_size_mb >= spec.min_expected_size_mb
    return {
        "model": spec.key,
        "capability": spec.capability,
        "sourceType": spec.source_type,
        "sourceUri": spec.source_uri,
        "cacheDir": str(base_dir),
        "expectedFiles": list(spec.expected_files),
        "foundFiles": found_files,
        "missingFiles": missing_files,
        "totalSizeBytes": total_size_bytes,
        "totalSizeMb": total_size_mb,
        "minExpectedSizeMb": spec.min_expected_size_mb,
        "isCached": is_complete,
    }


def check_cached_weights(model_key: str, cache_dir: str | None = None) -> dict[str, Any]:
    if model_key not in WEIGHT_REGISTRY:
        raise KeyError(f"Unknown model key: {model_key}")

    spec = WEIGHT_REGISTRY[model_key]
    base_dir = _model_base_dir(spec, cache_dir)

    found_files: list[str] = []
    missing_files: list[str] = []
    total_size_bytes = 0

    for relative_name in spec.expected_files:
        file_path = base_dir / relative_name
        if file_path.is_file():
            found_files.append(relative_name)
            total_size_bytes += file_path.stat().st_size
        else:
            missing_files.append(relative_name)

    return _serialize_status(
        spec=spec,
        base_dir=base_dir,
        found_files=found_files,
        missing_files=missing_files,
        total_size_bytes=total_size_bytes,
    )


def _download_huggingface_weights(
    spec: WeightSpec,
    snapshot_download: Any,
    cache_dir: str | None = None,
) -> None:
    hf_home = _resolve_cache_dir(cache_dir) / "huggingface"
    hf_home.mkdir(parents=True, exist_ok=True)

    try:
        snapshot_download(
            repo_id=spec.source_uri,
            local_dir=_model_base_dir(spec, cache_dir),
            local_dir_use_symlinks=False,
            allow_patterns=list(spec.expected_files),
        )
    except Exception as exc:
        raise RuntimeError(
            f"Failed to download Hugging Face weights for {spec.key} from {spec.source_uri}"
        ) from exc


def _download_url_weight(spec: WeightSpec, cache_dir: str | None = None) -> None:
    target_dir = _model_base_dir(spec, cache_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = target_dir / spec.expected_files[0]

    try:
        with urllib.request.urlopen(spec.source_uri) as response, open(target_file, "wb") as handle:
            handle.write(response.read())
    except Exception as exc:
        raise RuntimeError(
            f"Failed to download URL weight for {spec.key} from {spec.source_uri}"
        ) from exc


def warmup_model_weights(
    model_key: str,
    *,
    cache_dir: str | None = None,
    download_if_missing: bool = True,
) -> dict[str, Any]:
    if model_key not in WEIGHT_REGISTRY:
        raise KeyError(f"Unknown model key: {model_key}")

    initial_status = check_cached_weights(model_key, cache_dir)
    if initial_status["isCached"] or not download_if_missing:
        return initial_status

    spec = WEIGHT_REGISTRY[model_key]

    if spec.source_type == "huggingface":
        try:
            from huggingface_hub import snapshot_download
        except ImportError as exc:
            raise RuntimeError(
                "huggingface_hub is required to download Hugging Face weights, "
                f"but is not installed for model {model_key} ({spec.source_uri})"
            ) from exc

        _download_huggingface_weights(spec, snapshot_download, cache_dir)
    elif spec.source_type == "url":
        _download_url_weight(spec, cache_dir)
    else:
        raise RuntimeError(f"Unsupported source type for {model_key}: {spec.source_type}")

    final_status = check_cached_weights(model_key, cache_dir)
    if not final_status["isCached"]:
        raise RuntimeError(
            f"Downloaded weights for {model_key}, but cache validation still failed: "
            f"{json.dumps(final_status, ensure_ascii=False)}"
        )

    return final_status


def list_supported_models() -> list[str]:
    return list(WEIGHT_REGISTRY.keys())


def warmup_all_models(
    *,
    cache_dir: str | None = None,
    download_if_missing: bool = True,
    models: list[str] | None = None,
) -> dict[str, dict[str, Any]]:
    selected_models = models or list_supported_models()
    return {
        model_key: warmup_model_weights(
            model_key,
            cache_dir=cache_dir,
            download_if_missing=download_if_missing,
        )
        for model_key in selected_models
    }
