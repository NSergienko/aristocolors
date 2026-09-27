from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

from ...weights import DEFAULT_MODEL_CACHE_DIR, WEIGHT_REGISTRY, check_cached_weights
from .base import DepthAdapter, DepthEstimationResult, ModelWeightNotCachedError


class DepthAnythingV2Adapter(DepthAdapter):
    MODEL_KEY = "geometry_depth"

    def __init__(self, cache_dir: str | None = None, device: str | None = None):
        if self.MODEL_KEY not in WEIGHT_REGISTRY:
            raise KeyError(f"Unknown model key in WEIGHT_REGISTRY: {self.MODEL_KEY}")

        self._cache_dir = cache_dir or DEFAULT_MODEL_CACHE_DIR
        self._spec = WEIGHT_REGISTRY[self.MODEL_KEY]
        self._model_dir = (Path(self._cache_dir).resolve() / self._spec.target_subdir).resolve()

        status = check_cached_weights(self.MODEL_KEY, self._cache_dir)
        if not status["isCached"]:
            raise ModelWeightNotCachedError(self.MODEL_KEY, self._model_dir)

        try:
            import torch
            from transformers import AutoImageProcessor, AutoModelForDepthEstimation
        except ImportError as exc:
            raise RuntimeError(
                "DepthAnythingV2Adapter requires torch and transformers to be installed"
            ) from exc

        self._torch = torch
        self._AutoImageProcessor = AutoImageProcessor
        self._AutoModelForDepthEstimation = AutoModelForDepthEstimation

        self._device = device or ("cuda" if self._torch.cuda.is_available() else "cpu")

        self._processor = self._AutoImageProcessor.from_pretrained(
            str(self._model_dir),
            local_files_only=True,
        )
        self._model = self._AutoModelForDepthEstimation.from_pretrained(
            str(self._model_dir),
            local_files_only=True,
        )
        self._model.eval()
        self._model.to(self._device)

    def estimate_depth(self, image: Image.Image) -> DepthEstimationResult:
        image_rgb = image.convert("RGB")
        source_width, source_height = image_rgb.size

        inputs = self._processor(images=image_rgb, return_tensors="pt")
        inputs = {key: value.to(self._device) for key, value in inputs.items()}

        with self._torch.inference_mode():
            outputs = self._model(**inputs)

            if not hasattr(outputs, "predicted_depth") or outputs.predicted_depth is None:
                raise RuntimeError("Depth model output does not contain predicted_depth")

            depth = outputs.predicted_depth
            if depth.ndim == 3:
                depth = depth.unsqueeze(1)
            elif depth.ndim != 4:
                raise RuntimeError(f"Unexpected predicted_depth shape: {tuple(depth.shape)}")

            depth = self._torch.nn.functional.interpolate(
                depth,
                size=(source_height, source_width),
                mode="bicubic",
                align_corners=False,
            )

            depth_map = depth[0, 0].detach().cpu().to(self._torch.float32).numpy()

        return DepthEstimationResult(
            depth_map=depth_map,
            width=source_width,
            height=source_height,
        )


class MockDepthAdapter(DepthAdapter):
    def estimate_depth(self, image: Image.Image) -> DepthEstimationResult:
        image_rgb = image.convert("RGB")
        width, height = image_rgb.size

        seed_bytes = hashlib.sha256(image_rgb.tobytes()).digest()
        seed = int.from_bytes(seed_bytes[:8], "big", signed=False) % (2**32)
        rng = np.random.default_rng(seed)

        y = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
        x = np.linspace(0.0, 1.0, width, dtype=np.float32)[None, :]

        plane = 0.6 * y + 0.4 * x
        noise = rng.uniform(-0.02, 0.02, size=(height, width)).astype(np.float32)
        depth_map = np.clip(plane + noise, 0.0, 1.0).astype(np.float32)

        return DepthEstimationResult(
            depth_map=depth_map,
            width=width,
            height=height,
        )
