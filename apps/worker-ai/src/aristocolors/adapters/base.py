from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image


class ModelWeightNotCachedError(RuntimeError):
    def __init__(self, model_key: str, model_dir: Path | None = None):
        message = f"Required model weights are not cached for model_key={model_key}"
        if model_dir is not None:
            message += f" at {model_dir}"
        super().__init__(message)
        self.model_key = model_key
        self.model_dir = model_dir


@dataclass(frozen=True)
class DepthEstimationResult:
    depth_map: np.ndarray
    width: int
    height: int


@dataclass(frozen=True)
class MattingResult:
    alpha_mask: np.ndarray
    width: int
    height: int


class DinoAdapter(ABC):
    @abstractmethod
    def embed_image(self, image: Image.Image) -> list[float]:
        raise NotImplementedError


class DepthAdapter(ABC):
    @abstractmethod
    def estimate_depth(self, image: Image.Image) -> DepthEstimationResult:
        raise NotImplementedError


class MattingAdapter(ABC):
    @abstractmethod
    def estimate_alpha(self, image: Image.Image) -> MattingResult:
        raise NotImplementedError
