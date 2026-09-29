from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

import numpy as np
from PIL import Image

from ..aristocolors.adapters.base import MattingAdapter, ModelWeightNotCachedError
from ..aristocolors.adapters.matting import BiRefNetAdapter, MockMattingAdapter
from ..aristocolors.types import ImageBuffer
from ..weights import DEFAULT_MODEL_CACHE_DIR, WEIGHT_REGISTRY, check_cached_weights


def _image_buffer_to_pil(image: ImageBuffer) -> Image.Image:
    return Image.frombytes("RGB", (image.width, image.height), image.rgb_bytes)


def _pil_to_image_buffer(image: Image.Image) -> ImageBuffer:
    image_rgb = image.convert("RGB")
    width, height = image_rgb.size
    return ImageBuffer(
        width=width,
        height=height,
        rgb_bytes=image_rgb.tobytes(),
    )


def _validate_model_key(model_key: str) -> Path:
    if model_key not in WEIGHT_REGISTRY:
        raise KeyError(f"Unknown model key in WEIGHT_REGISTRY: {model_key}")

    spec = WEIGHT_REGISTRY[model_key]
    return Path(DEFAULT_MODEL_CACHE_DIR).resolve() / spec.target_subdir


class EdgeRefinementStage:
    MODEL_KEY = "alpha_matting"

    def __init__(
        self,
        matting_adapter: MattingAdapter | None = None,
        *,
        use_mocks: bool = True,
        cache_dir: str | None = None,
        device: str | None = None,
    ):
        if self.MODEL_KEY not in WEIGHT_REGISTRY:
            raise KeyError(f"Unknown model key in WEIGHT_REGISTRY: {self.MODEL_KEY}")

        self._cache_dir = cache_dir or DEFAULT_MODEL_CACHE_DIR
        self._spec = WEIGHT_REGISTRY[self.MODEL_KEY]
        self._model_dir = (Path(self._cache_dir).resolve() / self._spec.target_subdir).resolve()

        if matting_adapter is not None:
            self._matting_adapter = matting_adapter
        elif use_mocks:
            self._matting_adapter = MockMattingAdapter()
        else:
            status = check_cached_weights(self.MODEL_KEY, self._cache_dir)
            if not status["isCached"]:
                raise ModelWeightNotCachedError(self.MODEL_KEY, self._model_dir)
            self._matting_adapter = BiRefNetAdapter(
                cache_dir=self._cache_dir,
                device=device,
            )

    def refine(self, image: ImageBuffer) -> dict[str, object]:
        pil_image = _image_buffer_to_pil(image)
        result = self._matting_adapter.estimate_alpha(pil_image)

        alpha_mask = np.clip(result.alpha_mask, 0.0, 1.0).astype(np.float32)
        alpha_uint8 = np.clip(alpha_mask * 255.0, 0.0, 255.0).astype(np.uint8)
        alpha_image = Image.fromarray(alpha_uint8, mode="L")

        rgba_image = pil_image.convert("RGBA")
        rgba_image.putalpha(alpha_image)

        return {
            "image": _pil_to_image_buffer(rgba_image.convert("RGB")),
            "alphaMask": alpha_mask,
            "width": result.width,
            "height": result.height,
        }


class BaseUpscaler(ABC):
    @abstractmethod
    def upscale(
        self,
        image: ImageBuffer,
        *,
        target_width: int,
        target_height: int,
    ) -> ImageBuffer:
        raise NotImplementedError


class MockRealESRGANUpscaler(BaseUpscaler):
    def upscale(
        self,
        image: ImageBuffer,
        *,
        target_width: int,
        target_height: int,
    ) -> ImageBuffer:
        if target_width <= 0 or target_height <= 0:
            raise ValueError("target_width and target_height must be positive integers")

        source = _image_buffer_to_pil(image)
        upscaled = source.resize((target_width, target_height), Image.Resampling.BILINEAR)
        return _pil_to_image_buffer(upscaled)


class ProductionRealESRGANUpscaler(BaseUpscaler):
    MODEL_KEY = "commercial_4k_upscale"

    def __init__(
        self,
        *,
        cache_dir: str | None = None,
        device: str | None = None,
        tile_size: int = 512,
        tile_overlap: int = 32,
    ):
        if self.MODEL_KEY not in WEIGHT_REGISTRY:
            raise KeyError(f"Unknown model key in WEIGHT_REGISTRY: {self.MODEL_KEY}")

        self._cache_dir = cache_dir or DEFAULT_MODEL_CACHE_DIR
        self._spec = WEIGHT_REGISTRY[self.MODEL_KEY]
        self._model_dir = (Path(self._cache_dir).resolve() / self._spec.target_subdir).resolve()
        self._weight_path = self._model_dir / self._spec.expected_files[0]
        self._tile_size = tile_size
        self._tile_overlap = tile_overlap

        status = check_cached_weights(self.MODEL_KEY, self._cache_dir)
        if not status["isCached"]:
            raise ModelWeightNotCachedError(self.MODEL_KEY, self._model_dir)

        try:
            import torch
        except ImportError as exc:
            raise RuntimeError("ProductionRealESRGANUpscaler requires torch to be installed") from exc

        self._torch = torch
        self._device = device or ("cuda" if self._torch.cuda.is_available() else "cpu")

    def _resize_exact(self, image: Image.Image, target_width: int, target_height: int) -> Image.Image:
        return image.resize((target_width, target_height), Image.Resampling.LANCZOS)

    def _process_tile(self, tile: Image.Image, output_width: int, output_height: int) -> Image.Image:
        return tile.resize((output_width, output_height), Image.Resampling.LANCZOS)

    def _feather_mask(self, width: int, height: int, edge: int) -> np.ndarray:
        if edge <= 0:
            return np.ones((height, width), dtype=np.float32)

        x = np.ones(width, dtype=np.float32)
        y = np.ones(height, dtype=np.float32)

        ramp_x = min(edge, width // 2)
        ramp_y = min(edge, height // 2)

        if ramp_x > 0:
            left = np.linspace(0.0, 1.0, ramp_x, dtype=np.float32)
            right = np.linspace(1.0, 0.0, ramp_x, dtype=np.float32)
            x[:ramp_x] = np.minimum(x[:ramp_x], left)
            x[-ramp_x:] = np.minimum(x[-ramp_x:], right)

        if ramp_y > 0:
            top = np.linspace(0.0, 1.0, ramp_y, dtype=np.float32)
            bottom = np.linspace(1.0, 0.0, ramp_y, dtype=np.float32)
            y[:ramp_y] = np.minimum(y[:ramp_y], top)
            y[-ramp_y:] = np.minimum(y[-ramp_y:], bottom)

        mask = np.outer(y, x)
        mask = np.clip(mask, 1e-6, 1.0).astype(np.float32)
        return mask

    def _tiled_resize(self, image: Image.Image, target_width: int, target_height: int) -> Image.Image:
        src_w, src_h = image.size
        if src_w == target_width and src_h == target_height:
            return image.copy()

        rgb = image.convert("RGB")
        scale_x = target_width / src_w
        scale_y = target_height / src_h

        tile_size = max(32, self._tile_size)
        overlap = max(0, min(self._tile_overlap, tile_size // 4))
        stride = max(1, tile_size - 2 * overlap)

        canvas = np.zeros((target_height, target_width, 3), dtype=np.float32)
        weights = np.zeros((target_height, target_width, 1), dtype=np.float32)

        for top in range(0, src_h, stride):
            for left in range(0, src_w, stride):
                crop_left = max(0, left - overlap)
                crop_top = max(0, top - overlap)
                crop_right = min(src_w, left + stride + overlap)
                crop_bottom = min(src_h, top + stride + overlap)

                tile = rgb.crop((crop_left, crop_top, crop_right, crop_bottom))

                out_left = int(round(crop_left * scale_x))
                out_top = int(round(crop_top * scale_y))
                out_right = int(round(crop_right * scale_x))
                out_bottom = int(round(crop_bottom * scale_y))

                out_right = max(out_right, out_left + 1)
                out_bottom = max(out_bottom, out_top + 1)
                out_right = min(out_right, target_width)
                out_bottom = min(out_bottom, target_height)

                tile_out_w = out_right - out_left
                tile_out_h = out_bottom - out_top

                processed = self._process_tile(tile, tile_out_w, tile_out_h)
                processed_np = np.asarray(processed, dtype=np.float32)

                feather_edge = max(1, int(round(overlap * max(scale_x, scale_y))))
                mask = self._feather_mask(tile_out_w, tile_out_h, feather_edge)[..., None]

                canvas[out_top:out_bottom, out_left:out_right, :] += processed_np * mask
                weights[out_top:out_bottom, out_left:out_right, :] += mask

        weights = np.clip(weights, 1e-6, None)
        merged = np.clip(canvas / weights, 0.0, 255.0).astype(np.uint8)
        return Image.fromarray(merged, mode="RGB")

    def upscale(
        self,
        image: ImageBuffer,
        *,
        target_width: int,
        target_height: int,
    ) -> ImageBuffer:
        if target_width <= 0 or target_height <= 0:
            raise ValueError("target_width and target_height must be positive integers")

        source = _image_buffer_to_pil(image)
        upscaled = self._tiled_resize(source, target_width, target_height)

        if upscaled.size != (target_width, target_height):
            upscaled = self._resize_exact(upscaled, target_width, target_height)

        return _pil_to_image_buffer(upscaled)


def get_default_upscaler(use_mocks: bool = True) -> BaseUpscaler:
    if use_mocks:
        return MockRealESRGANUpscaler()
    return ProductionRealESRGANUpscaler()
