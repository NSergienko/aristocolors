from __future__ import annotations

import hashlib
import io
import json
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops

from src.aristocolors.adapters.base import ModelWeightNotCachedError
from src.conditioning.compiler import ConditioningCompiler


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _sha256_hex_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _sha256_hex_text(payload: str) -> str:
    return _sha256_hex_bytes(payload.encode("utf-8"))


def _clamp_float(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _normalize_seed(seed: int | None) -> int:
    if seed is None:
        return 0
    return int(seed) & 0xFFFFFFFF


def _ensure_rgba(image: Image.Image) -> Image.Image:
    if image.mode == "RGBA":
        return image.copy()
    return image.convert("RGBA")


def _ensure_mask_l(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    prepared = image.convert("L")
    if prepared.size != size:
        prepared = prepared.resize(size, Image.Resampling.BILINEAR)
    return prepared


def _image_to_png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _stable_lora_token(name: str, scale: float) -> str:
    normalized = f"{name}:{scale:.6f}"
    return _sha256_hex_text(normalized)[:16]


@dataclass(frozen=True)
class LatentBlendLoRAConfig:
    name: str
    scale: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "scale": self.scale,
        }


@dataclass(frozen=True)
class LatentBlendInput:
    profile: Any
    target_provider: str
    base_image: Image.Image
    mask_image: Image.Image
    options: dict[str, Any] | None = None
    seed: int | None = None
    style_lora: LatentBlendLoRAConfig | None = None
    detail_lora: LatentBlendLoRAConfig | None = None

    def to_provenance_payload(self, compiled_conditioning: dict[str, Any], normalized_seed: int) -> dict[str, Any]:
        return {
            "targetProvider": self.target_provider,
            "seed": normalized_seed,
            "compiledConditioning": compiled_conditioning,
            "options": self.options or {},
            "styleLora": self.style_lora.to_dict() if self.style_lora is not None else None,
            "detailLora": self.detail_lora.to_dict() if self.detail_lora is not None else None,
            "baseImage": {
                "width": self.base_image.size[0],
                "height": self.base_image.size[1],
                "sha256": _sha256_hex_bytes(_image_to_png_bytes(_ensure_rgba(self.base_image))),
            },
            "maskImage": {
                "width": self.mask_image.size[0],
                "height": self.mask_image.size[1],
                "sha256": _sha256_hex_bytes(_image_to_png_bytes(_ensure_mask_l(self.mask_image, self.base_image.size))),
            },
        }


@dataclass(frozen=True)
class LatentBlendOutput:
    image_rgba: Image.Image
    seed: int
    provenance_sha256: str
    compiled_conditioning: dict[str, Any]
    metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "seed": self.seed,
            "provenanceSha256": self.provenance_sha256,
            "compiledConditioning": self.compiled_conditioning,
            "metadata": self.metadata,
            "image": {
                "mode": self.image_rgba.mode,
                "width": self.image_rgba.size[0],
                "height": self.image_rgba.size[1],
                "sha256": _sha256_hex_bytes(_image_to_png_bytes(self.image_rgba)),
            },
        }


class ProductionModelUnavailableError(RuntimeError):
    def __init__(self, model_key: str, model_dir: Path | None = None):
        message = f"Required local cached model is unavailable for model_key={model_key}"
        if model_dir is not None:
            message += f" at {model_dir}"
        super().__init__(message)
        self.model_key = model_key
        self.model_dir = model_dir


class LatentBlendModelLoader(ABC):
    @abstractmethod
    def require_pipeline(self, target_provider: str) -> Any:
        raise NotImplementedError

    @abstractmethod
    def apply_lora(self, pipeline: Any, lora: LatentBlendLoRAConfig, slot: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def clear_loras(self, pipeline: Any) -> None:
        raise NotImplementedError

    @abstractmethod
    def render(
        self,
        pipeline: Any,
        *,
        base_image: Image.Image,
        mask_image: Image.Image,
        compiled_conditioning: dict[str, Any],
        seed: int,
    ) -> Image.Image:
        raise NotImplementedError


class _MockPipelineHandle:
    def __init__(self, provider: str):
        self.provider = provider
        self.applied_loras: list[dict[str, Any]] = []


class CpuMockLatentBlendModelLoader(LatentBlendModelLoader):
    def __init__(self):
        self._pipelines: dict[str, _MockPipelineHandle] = {}

    def require_pipeline(self, target_provider: str) -> _MockPipelineHandle:
        pipeline = self._pipelines.get(target_provider)
        if pipeline is None:
            pipeline = _MockPipelineHandle(target_provider)
            self._pipelines[target_provider] = pipeline
        return pipeline

    def apply_lora(self, pipeline: _MockPipelineHandle, lora: LatentBlendLoRAConfig, slot: str) -> None:
        pipeline.applied_loras.append(
            {
                "slot": slot,
                "name": lora.name,
                "scale": float(lora.scale),
                "token": _stable_lora_token(lora.name, lora.scale),
            }
        )

    def clear_loras(self, pipeline: _MockPipelineHandle) -> None:
        pipeline.applied_loras.clear()

    def render(
        self,
        pipeline: _MockPipelineHandle,
        *,
        base_image: Image.Image,
        mask_image: Image.Image,
        compiled_conditioning: dict[str, Any],
        seed: int,
    ) -> Image.Image:
        base_rgba = _ensure_rgba(base_image)
        mask_l = _ensure_mask_l(mask_image, base_rgba.size)

        provenance_basis = {
            "provider": pipeline.provider,
            "seed": seed,
            "compiledConditioning": compiled_conditioning,
            "appliedLoras": list(pipeline.applied_loras),
        }
        basis_hash = _sha256_hex_text(_canonical_json(provenance_basis))

        rng = random.Random(seed)
        prompt_factor = int(basis_hash[:2], 16)
        style_factor = int(basis_hash[2:4], 16)
        detail_factor = int(basis_hash[4:6], 16)
        noise_factor = rng.randint(0, 255)

        overlay = Image.new("RGBA", base_rgba.size)
        pixels = overlay.load()
        width, height = overlay.size

        for y in range(height):
            for x in range(width):
                red = (x * 17 + prompt_factor) % 256
                green = (y * 13 + style_factor) % 256
                blue = ((x + y) * 7 + detail_factor + noise_factor) % 256
                alpha = 255
                pixels[x, y] = (red, green, blue, alpha)

        combined_mask = ImageChops.multiply(mask_l, Image.new("L", mask_l.size, 255))
        composited = Image.composite(overlay, base_rgba, combined_mask)
        return composited.convert("RGBA")


class ProductionCachedLatentBlendModelLoader(LatentBlendModelLoader):
    def __init__(self, cached_model_roots: dict[str, str | Path] | None = None):
        self._cached_model_roots: dict[str, Path] = {
            key: Path(value) for key, value in (cached_model_roots or {}).items()
        }

    def require_pipeline(self, target_provider: str) -> dict[str, Any]:
        model_dir = self._cached_model_roots.get(target_provider)
        if model_dir is None:
            raise ProductionModelUnavailableError(target_provider, None)
        if not model_dir.exists() or not model_dir.is_dir():
            raise ModelWeightNotCachedError(target_provider, model_dir)
        return {
            "targetProvider": target_provider,
            "modelDir": str(model_dir),
            "appliedLoras": [],
        }

    def apply_lora(self, pipeline: dict[str, Any], lora: LatentBlendLoRAConfig, slot: str) -> None:
        pipeline["appliedLoras"].append(
            {
                "slot": slot,
                "name": lora.name,
                "scale": float(lora.scale),
            }
        )

    def clear_loras(self, pipeline: dict[str, Any]) -> None:
        pipeline["appliedLoras"].clear()

    def render(
        self,
        pipeline: dict[str, Any],
        *,
        base_image: Image.Image,
        mask_image: Image.Image,
        compiled_conditioning: dict[str, Any],
        seed: int,
    ) -> Image.Image:
        raise RuntimeError(
            "ProductionCachedLatentBlendModelLoader is a local-cache-only boundary. "
            "Real model inference integration is not implemented in Part 1."
        )


class MultiModelLatentBlendPipeline:
    def __init__(
        self,
        *,
        conditioning_compiler: ConditioningCompiler | None = None,
        model_loader: LatentBlendModelLoader | None = None,
    ):
        self._conditioning_compiler = conditioning_compiler or ConditioningCompiler()
        self._model_loader = model_loader or CpuMockLatentBlendModelLoader()

    def run(self, request: LatentBlendInput) -> LatentBlendOutput:
        normalized_seed = _normalize_seed(request.seed)
        compiled_conditioning = self._conditioning_compiler.compile(
            profile=request.profile,
            target_provider=request.target_provider,
            options=request.options,
        )

        pipeline = self._model_loader.require_pipeline(request.target_provider)

        try:
            if request.style_lora is not None:
                self._model_loader.apply_lora(pipeline, request.style_lora, slot="style")

            if request.detail_lora is not None:
                self._model_loader.apply_lora(pipeline, request.detail_lora, slot="detail")

            result_image = self._model_loader.render(
                pipeline,
                base_image=request.base_image,
                mask_image=request.mask_image,
                compiled_conditioning=compiled_conditioning,
                seed=normalized_seed,
            )
        finally:
            self._model_loader.clear_loras(pipeline)

        result_rgba = _ensure_rgba(result_image)
        provenance_payload = request.to_provenance_payload(compiled_conditioning, normalized_seed)
        provenance_payload["resultImage"] = {
            "width": result_rgba.size[0],
            "height": result_rgba.size[1],
            "sha256": _sha256_hex_bytes(_image_to_png_bytes(result_rgba)),
        }
        provenance_sha256 = _sha256_hex_text(_canonical_json(provenance_payload))

        metadata = {
            "targetProvider": request.target_provider,
            "seed": normalized_seed,
            "lora": {
                "style": request.style_lora.to_dict() if request.style_lora is not None else None,
                "detail": request.detail_lora.to_dict() if request.detail_lora is not None else None,
            },
            "baseImage": {
                "width": request.base_image.size[0],
                "height": request.base_image.size[1],
            },
            "maskImage": {
                "width": request.mask_image.size[0],
                "height": request.mask_image.size[1],
            },
        }

        return LatentBlendOutput(
            image_rgba=result_rgba,
            seed=normalized_seed,
            provenance_sha256=provenance_sha256,
            compiled_conditioning=compiled_conditioning,
            metadata=metadata,
        )

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
    ) -> LatentBlendOutput:
        style_lora = None
        if style_lora_name is not None:
            style_lora = LatentBlendLoRAConfig(
                name=style_lora_name,
                scale=_clamp_float(float(style_lora_scale if style_lora_scale is not None else 1.0), 0.0, 4.0),
            )

        detail_lora = None
        if detail_lora_name is not None:
            detail_lora = LatentBlendLoRAConfig(
                name=detail_lora_name,
                scale=_clamp_float(float(detail_lora_scale if detail_lora_scale is not None else 1.0), 0.0, 4.0),
            )

        request = LatentBlendInput(
            profile=profile,
            target_provider=target_provider,
            base_image=base_image,
            mask_image=mask_image,
            options=options,
            seed=seed,
            style_lora=style_lora,
            detail_lora=detail_lora,
        )
        return self.run(request)
