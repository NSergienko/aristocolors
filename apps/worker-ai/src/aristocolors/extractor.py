from __future__ import annotations

import hashlib
import math
import uuid
from typing import Any

import numpy as np
from PIL import Image

from .adapters.base import DepthAdapter, DinoAdapter, MattingAdapter
from .inferred import extract_inferred_features
from .types import (
    AristoColorsEmbeddingRecordData,
    AristoColorsProfileData,
    ColorClusterData,
    DeterministicFeaturesData,
    ExtractedStyleDna,
    ImageBuffer,
    LabColor,
    LuminanceStatsData,
    TextureAnalysisData,
)


_SCHEMA_VERSION = "1.2.0"
_EXTRACTOR_VERSION = "extractor_v1.2"
_CANONICAL_MODEL_NAME = "facebook/dinov2-large"
_CANONICAL_MODEL_VERSION = "canonical_embedding"


def _validate_image_buffer(image: ImageBuffer) -> None:
    if image.width <= 0:
        raise ValueError("ImageBuffer.width must be > 0")
    if image.height <= 0:
        raise ValueError("ImageBuffer.height must be > 0")

    expected_len = image.width * image.height * 3
    if len(image.rgb_bytes) != expected_len:
        raise ValueError(
            f"ImageBuffer rgb_bytes length mismatch: expected {expected_len}, got {len(image.rgb_bytes)}"
        )


def _image_buffer_to_numpy_rgb(image: ImageBuffer) -> np.ndarray:
    _validate_image_buffer(image)
    return np.frombuffer(image.rgb_bytes, dtype=np.uint8).reshape((image.height, image.width, 3))


def _image_buffer_to_pil(image: ImageBuffer) -> Image.Image:
    rgb = _image_buffer_to_numpy_rgb(image)
    return Image.fromarray(rgb, mode="RGB")


def _srgb_to_linear(value: np.ndarray) -> np.ndarray:
    return np.where(
        value <= 0.04045,
        value / 12.92,
        ((value + 0.055) / 1.055) ** 2.4,
    )


def _rgb_to_lab(rgb_uint8: np.ndarray) -> np.ndarray:
    rgb = rgb_uint8.astype(np.float32) / 255.0
    rgb_linear = _srgb_to_linear(rgb)

    xyz = np.empty_like(rgb_linear, dtype=np.float32)
    xyz[..., 0] = (
        0.4124564 * rgb_linear[..., 0]
        + 0.3575761 * rgb_linear[..., 1]
        + 0.1804375 * rgb_linear[..., 2]
    )
    xyz[..., 1] = (
        0.2126729 * rgb_linear[..., 0]
        + 0.7151522 * rgb_linear[..., 1]
        + 0.0721750 * rgb_linear[..., 2]
    )
    xyz[..., 2] = (
        0.0193339 * rgb_linear[..., 0]
        + 0.1191920 * rgb_linear[..., 1]
        + 0.9503041 * rgb_linear[..., 2]
    )

    x_n = 0.95047
    y_n = 1.00000
    z_n = 1.08883

    xr = xyz[..., 0] / x_n
    yr = xyz[..., 1] / y_n
    zr = xyz[..., 2] / z_n

    delta = 6.0 / 29.0
    delta3 = delta ** 3
    factor = 1.0 / (3.0 * delta * delta)
    offset = 4.0 / 29.0

    def f(t: np.ndarray) -> np.ndarray:
        return np.where(t > delta3, np.cbrt(t), factor * t + offset)

    fx = f(xr)
    fy = f(yr)
    fz = f(zr)

    lab = np.empty_like(rgb_linear, dtype=np.float32)
    lab[..., 0] = 116.0 * fy - 16.0
    lab[..., 1] = 500.0 * (fx - fy)
    lab[..., 2] = 200.0 * (fy - fz)
    return lab


def _quantize_colors(rgb_uint8: np.ndarray, k: int = 5) -> list[tuple[np.ndarray, float]]:
    pixels = rgb_uint8.reshape(-1, 3).astype(np.float32)
    if pixels.shape[0] == 0:
        return []

    unique_pixels = np.unique(rgb_uint8.reshape(-1, 3), axis=0)
    if unique_pixels.shape[0] <= k:
        counts = []
        all_pixels = rgb_uint8.reshape(-1, 3)
        total = float(all_pixels.shape[0])
        for color in unique_pixels:
            count = float(np.sum(np.all(all_pixels == color, axis=1)))
            counts.append((color.astype(np.float32), count / total))
        counts.sort(key=lambda item: item[1], reverse=True)
        return counts

    luminance = 0.2126 * pixels[:, 0] + 0.7152 * pixels[:, 1] + 0.0722 * pixels[:, 2]
    order = np.argsort(luminance)
    seeds_idx = np.linspace(0, len(order) - 1, num=k, dtype=int)
    centroids = pixels[order[seeds_idx]].copy()

    for _ in range(10):
        distances = np.sum((pixels[:, None, :] - centroids[None, :, :]) ** 2, axis=2)
        labels = np.argmin(distances, axis=1)

        new_centroids = centroids.copy()
        for idx in range(k):
            members = pixels[labels == idx]
            if members.shape[0] > 0:
                new_centroids[idx] = np.mean(members, axis=0)

        if np.allclose(new_centroids, centroids):
            centroids = new_centroids
            break
        centroids = new_centroids

    distances = np.sum((pixels[:, None, :] - centroids[None, :, :]) ** 2, axis=2)
    labels = np.argmin(distances, axis=1)

    total = float(pixels.shape[0])
    clusters: list[tuple[np.ndarray, float]] = []
    for idx in range(k):
        members = pixels[labels == idx]
        if members.shape[0] == 0:
            continue
        centroid = np.mean(members, axis=0)
        proportion = float(members.shape[0] / total)
        clusters.append((centroid, proportion))

    clusters.sort(key=lambda item: item[1], reverse=True)
    return clusters


def _rgb_to_hex(rgb: np.ndarray) -> str:
    values = np.clip(np.rint(rgb), 0, 255).astype(np.uint8)
    return "#{:02x}{:02x}{:02x}".format(int(values[0]), int(values[1]), int(values[2]))


def _compute_dominant_colors(rgb_uint8: np.ndarray) -> list[ColorClusterData]:
    clusters = _quantize_colors(rgb_uint8, k=5)
    if not clusters:
        return []

    dominant_colors: list[ColorClusterData] = []
    for centroid, proportion in clusters:
        centroid_uint8 = np.clip(np.rint(centroid), 0, 255).astype(np.uint8).reshape((1, 1, 3))
        lab = _rgb_to_lab(centroid_uint8)[0, 0]
        dominant_colors.append(
            ColorClusterData(
                hex=_rgb_to_hex(centroid),
                proportion=float(proportion),
                lab=LabColor(
                    l=float(lab[0]),
                    a=float(lab[1]),
                    b=float(lab[2]),
                ),
            )
        )
    return dominant_colors


def _compute_luminance_stats(rgb_uint8: np.ndarray) -> LuminanceStatsData:
    rgb = rgb_uint8.astype(np.float32) / 255.0
    luminance = (
        0.2126 * rgb[:, :, 0]
        + 0.7152 * rgb[:, :, 1]
        + 0.0722 * rgb[:, :, 2]
    ).astype(np.float32)

    return LuminanceStatsData(
        mean=float(np.mean(luminance)),
        stdDev=float(np.std(luminance)),
        min=float(np.min(luminance)),
        max=float(np.max(luminance)),
    )


def _compute_edge_density(gray: np.ndarray) -> float:
    grad_y, grad_x = np.gradient(gray)
    magnitude = np.sqrt(grad_x * grad_x + grad_y * grad_y)
    threshold = float(np.mean(magnitude) + np.std(magnitude))
    edges = magnitude > threshold
    return float(np.mean(edges.astype(np.float32)))


def _compute_entropy(gray_uint8: np.ndarray) -> float:
    hist, _ = np.histogram(gray_uint8, bins=256, range=(0, 255), density=False)
    total = np.sum(hist)
    if total <= 0:
        return 0.0
    probs = hist.astype(np.float64) / float(total)
    probs = probs[probs > 0]
    return float(-np.sum(probs * np.log2(probs)))


def _compute_contrast_ratio(gray: np.ndarray) -> str:
    low = float(np.percentile(gray, 5.0))
    high = float(np.percentile(gray, 95.0))
    ratio = (high + 0.05) / (low + 0.05)
    ratio = max(ratio, 1.0)
    return f"{ratio:.1f}:1"


def _compute_texture_analysis(rgb_uint8: np.ndarray) -> TextureAnalysisData:
    rgb = rgb_uint8.astype(np.float32) / 255.0
    gray = (
        0.2126 * rgb[:, :, 0]
        + 0.7152 * rgb[:, :, 1]
        + 0.0722 * rgb[:, :, 2]
    ).astype(np.float32)
    gray_uint8 = np.clip(np.rint(gray * 255.0), 0, 255).astype(np.uint8)

    return TextureAnalysisData(
        edgeDensity=_compute_edge_density(gray),
        entropy=_compute_entropy(gray_uint8),
        contrastRatio=_compute_contrast_ratio(gray),
    )


def _stable_profile_id(image: ImageBuffer) -> str:
    digest = hashlib.sha256(image.rgb_bytes).hexdigest()
    return str(uuid.UUID(digest[:32]))


class AristoColorsExtractor:
    def __init__(
        self,
        dino_adapter: DinoAdapter,
        depth_adapter: DepthAdapter,
        matting_adapter: MattingAdapter,
    ):
        self._dino_adapter = dino_adapter
        self._depth_adapter = depth_adapter
        self._matting_adapter = matting_adapter

    def extract(self, image: ImageBuffer, source_asset_id: str) -> ExtractedStyleDna:
        _validate_image_buffer(image)

        if not source_asset_id or not source_asset_id.strip():
            raise ValueError("source_asset_id must be a non-empty string")

        pil_image = _image_buffer_to_pil(image)

        embedding_vector = self._dino_adapter.embed_image(pil_image)
        if len(embedding_vector) != 1024:
            raise ValueError(f"Expected canonical embedding dimension 1024, got {len(embedding_vector)}")

        depth_result = self._depth_adapter.estimate_depth(pil_image)
        if depth_result.width != image.width or depth_result.height != image.height:
            raise ValueError(
                "Depth adapter returned dimensions that do not match the source image: "
                f"expected {(image.width, image.height)}, got {(depth_result.width, depth_result.height)}"
            )

        matting_result = self._matting_adapter.estimate_alpha(pil_image)
        if matting_result.width != image.width or matting_result.height != image.height:
            raise ValueError(
                "Matting adapter returned dimensions that do not match the source image: "
                f"expected {(image.width, image.height)}, got {(matting_result.width, matting_result.height)}"
            )

        rgb_uint8 = _image_buffer_to_numpy_rgb(image)

        deterministic_features = DeterministicFeaturesData(
            dominantColors=_compute_dominant_colors(rgb_uint8),
            luminanceStats=_compute_luminance_stats(rgb_uint8),
            textureAnalysis=_compute_texture_analysis(rgb_uint8),
        )

        inferred_features = extract_inferred_features(
            image,
            depth_values=depth_result.depth_map,
            alpha_mask=matting_result.alpha_mask,
        )

        profile_id = _stable_profile_id(image)

        profile = AristoColorsProfileData(
            profileId=profile_id,
            sourceAssetId=source_asset_id.strip(),
            schemaVersion=_SCHEMA_VERSION,
            extractorVersion=_EXTRACTOR_VERSION,
            canonicalModelName=_CANONICAL_MODEL_NAME,
            deterministicFeatures=deterministic_features,
            inferredFeatures=inferred_features,
        )

        canonical_embedding = AristoColorsEmbeddingRecordData(
            profileId=profile_id,
            modelName=_CANONICAL_MODEL_NAME,
            modelVersion=_CANONICAL_MODEL_VERSION,
            dimension=1024,
            vector=[float(value) for value in embedding_vector],
        )

        metadata: dict[str, Any] = {
            "extractedAt": None,
            "profileIdStrategy": "sha256_rgb_bytes_uuid",
            "embeddingDeterministicForIdenticalInput": True,
            "imageDerivedFeaturesDeterministicForIdenticalInput": True,
            "serializedProfileByteDeterministic": False,
        }

        return ExtractedStyleDna(
            profile=profile,
            canonicalEmbedding=canonical_embedding,
            metadata=metadata,
        )
