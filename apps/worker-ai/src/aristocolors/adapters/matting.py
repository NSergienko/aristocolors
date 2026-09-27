from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

from ...weights import DEFAULT_MODEL_CACHE_DIR, WEIGHT_REGISTRY, check_cached_weights
from .base import MattingAdapter, MattingResult, ModelWeightNotCachedError


class BiRefNetAdapter(MattingAdapter):
    MODEL_KEY = "alpha_matting"

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
            from transformers import AutoImageProcessor, AutoModelForImageSegmentation
        except ImportError as exc:
            raise RuntimeError(
                "BiRefNetAdapter requires torch and transformers to be installed"
            ) from exc

        self._torch = torch
        self._AutoImageProcessor = AutoImageProcessor
        self._AutoModelForImageSegmentation = AutoModelForImageSegmentation

        self._device = device or ("cuda" if self._torch.cuda.is_available() else "cpu")

        self._processor = self._AutoImageProcessor.from_pretrained(
            str(self._model_dir),
            local_files_only=True,
        )
        self._model = self._AutoModelForImageSegmentation.from_pretrained(
            str(self._model_dir),
            local_files_only=True,
        )
        self._model.eval()
        self._model.to(self._device)

    def estimate_alpha(self, image: Image.Image) -> MattingResult:
        image_rgb = image.convert("RGB")
        source_width, source_height = image_rgb.size

        inputs = self._processor(images=image_rgb, return_tensors="pt")
        inputs = {key: value.to(self._device) for key, value in inputs.items()}

        with self._torch.inference_mode():
            outputs = self._model(**inputs)

            logits = None

            if hasattr(outputs, "logits") and outputs.logits is not None:
                logits = outputs.logits
            elif hasattr(outputs, "preds") and outputs.preds is not None:
                logits = outputs.preds
            else:
                raise RuntimeError("BiRefNet output does not contain logits or preds")

            if isinstance(logits, (list, tuple)):
                logits = logits[-1]

            if logits.ndim == 3:
                logits = logits.unsqueeze(1)
            elif logits.ndim == 4 and logits.shape[1] > 1:
                logits = logits[:, :1, :, :]
            elif logits.ndim != 4:
                raise RuntimeError(f"Unexpected BiRefNet output shape: {tuple(logits.shape)}")

            alpha = self._torch.sigmoid(logits)
            alpha = self._torch.nn.functional.interpolate(
                alpha,
                size=(source_height, source_width),
                mode="bilinear",
                align_corners=False,
            )

            alpha_mask = alpha[0, 0].detach().cpu().to(self._torch.float32).numpy()
            alpha_mask = np.clip(alpha_mask, 0.0, 1.0).astype(np.float32)

        return MattingResult(
            alpha_mask=alpha_mask,
            width=source_width,
            height=source_height,
        )


class MockMattingAdapter(MattingAdapter):
    def estimate_alpha(self, image: Image.Image) -> MattingResult:
        image_rgb = image.convert("RGB")
        width, height = image_rgb.size

        seed_bytes = hashlib.sha256(image_rgb.tobytes()).digest()
        seed = int.from_bytes(seed_bytes[:8], "big", signed=False) % (2**32)
        rng = np.random.default_rng(seed)

        y = np.linspace(-1.0, 1.0, height, dtype=np.float32)[:, None]
        x = np.linspace(-1.0, 1.0, width, dtype=np.float32)[None, :]

        radius = np.sqrt(x * x + y * y)
        base = np.clip(1.0 - radius, 0.0, 1.0)
        jitter = rng.uniform(-0.03, 0.03, size=(height, width)).astype(np.float32)
        alpha_mask = np.clip(base + jitter, 0.0, 1.0).astype(np.float32)

        return MattingResult(
            alpha_mask=alpha_mask,
            width=width,
            height=height,
        )
