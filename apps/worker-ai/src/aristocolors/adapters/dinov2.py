from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
from PIL import Image

from ...weights import DEFAULT_MODEL_CACHE_DIR, WEIGHT_REGISTRY, check_cached_weights
from .base import DinoAdapter, ModelWeightNotCachedError


class DinoV2Adapter(DinoAdapter):
    MODEL_KEY = "canonical_embedding"

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
            from transformers import AutoImageProcessor, AutoModel
        except ImportError as exc:
            raise RuntimeError(
                "DinoV2Adapter requires torch and transformers to be installed"
            ) from exc

        self._torch = torch
        self._AutoImageProcessor = AutoImageProcessor
        self._AutoModel = AutoModel

        self._device = device or ("cuda" if self._torch.cuda.is_available() else "cpu")

        self._processor = self._AutoImageProcessor.from_pretrained(
            str(self._model_dir),
            local_files_only=True,
        )
        self._model = self._AutoModel.from_pretrained(
            str(self._model_dir),
            local_files_only=True,
        )
        self._model.eval()
        self._model.to(self._device)

    def embed_image(self, image: Image.Image) -> list[float]:
        image_rgb = image.convert("RGB")

        inputs = self._processor(images=image_rgb, return_tensors="pt")
        inputs = {key: value.to(self._device) for key, value in inputs.items()}

        with self._torch.inference_mode():
            outputs = self._model(**inputs)

            embedding_tensor = None

            if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                embedding_tensor = outputs.pooler_output
            elif hasattr(outputs, "last_hidden_state") and outputs.last_hidden_state is not None:
                embedding_tensor = outputs.last_hidden_state[:, 0]
            else:
                raise RuntimeError("DINOv2 model output does not contain pooler_output or last_hidden_state")

            if embedding_tensor.ndim != 2 or embedding_tensor.shape[0] != 1:
                raise RuntimeError(f"Unexpected DINOv2 embedding shape: {tuple(embedding_tensor.shape)}")

            if embedding_tensor.shape[1] != 1024:
                raise RuntimeError(
                    f"Expected DINOv2 embedding dimension 1024, got {embedding_tensor.shape[1]}"
                )

            normalized = self._torch.nn.functional.normalize(embedding_tensor, p=2, dim=1)
            vector = normalized[0].detach().cpu().to(self._torch.float32).numpy()

        return vector.tolist()


class MockDinoAdapter(DinoAdapter):
    def __init__(self, dimension: int = 1024):
        self._dimension = dimension

    def embed_image(self, image: Image.Image) -> list[float]:
        image_rgb = image.convert("RGB")
        image_bytes = image_rgb.tobytes()
        digest = hashlib.sha256(image_bytes).digest()

        values: list[float] = []
        counter = 0
        while len(values) < self._dimension:
            block = hashlib.sha256(digest + counter.to_bytes(4, "big")).digest()
            for i in range(0, len(block), 4):
                chunk = block[i:i + 4]
                if len(chunk) < 4:
                    continue
                integer = int.from_bytes(chunk, "big", signed=False)
                scaled = (integer / 0xFFFFFFFF) * 2.0 - 1.0
                values.append(float(scaled))
                if len(values) >= self._dimension:
                    break
            counter += 1

        array = np.asarray(values, dtype=np.float32)
        norm = float(np.linalg.norm(array))
        if norm == 0.0:
            array[0] = 1.0
            norm = 1.0
        array = array / norm
        return array.astype(np.float32).tolist()
