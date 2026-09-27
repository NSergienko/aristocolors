from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .types import (
    ImageBuffer,
    InferredFeaturesData,
    InferredLightingData,
    InferredSurfaceNormalsData,
)


_LIGHTING_ESTIMATOR_VERSION = "sh_l2_estimator_v2.0"
_SURFACE_NORMALS_ESTIMATOR_VERSION = "depth_gradient_normals_v1.0"


@dataclass(frozen=True)
class _LightingEstimate:
    azimuth_deg: float
    elevation_deg: float
    color_temp_kelvin: float
    intensity: float
    contrast_ratio: str
    ambient_fill_ratio: float
    confidence: float
    estimator_version: str


@dataclass(frozen=True)
class _SurfaceNormalsEstimate:
    dominant_facing: str
    roughness_score: float
    confidence: float
    estimator_version: str


def eval_sh_basis_9(x: float, y: float, z: float) -> list[float]:
    return [
        0.28209479177387814,
        0.4886025119029199 * y,
        0.4886025119029199 * z,
        0.4886025119029199 * x,
        1.0925484305920792 * x * y,
        1.0925484305920792 * y * z,
        0.31539156525252005 * (3.0 * z * z - 1.0),
        1.0925484305920792 * x * z,
        0.5462742152960396 * (x * x - y * y),
    ]


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _safe_unit_vector(x: float, y: float, z: float) -> tuple[float, float, float]:
    norm = math.sqrt(x * x + y * y + z * z)
    if norm <= 1e-12:
        return 0.0, 0.0, 1.0
    return x / norm, y / norm, z / norm


def _rgb_from_image_buffer(image: ImageBuffer) -> np.ndarray:
    expected_len = image.width * image.height * 3
    if len(image.rgb_bytes) != expected_len:
        raise ValueError(
            f"ImageBuffer rgb_bytes length mismatch: expected {expected_len}, got {len(image.rgb_bytes)}"
        )

    rgb = np.frombuffer(image.rgb_bytes, dtype=np.uint8).reshape((image.height, image.width, 3))
    return rgb.astype(np.float32) / 255.0


def _build_hemisphere_directions(height: int, width: int) -> np.ndarray:
    ys = np.linspace(-1.0, 1.0, height, dtype=np.float32)
    xs = np.linspace(-1.0, 1.0, width, dtype=np.float32)
    grid_x, grid_y = np.meshgrid(xs, ys)

    radius_sq = grid_x * grid_x + grid_y * grid_y
    z_sq = np.clip(1.0 - radius_sq, 0.0, 1.0)
    grid_z = np.sqrt(z_sq, dtype=np.float32)

    dirs = np.stack([grid_x, -grid_y, grid_z], axis=-1)
    norms = np.linalg.norm(dirs, axis=-1, keepdims=True)
    norms = np.where(norms <= 1e-12, 1.0, norms)
    dirs = dirs / norms
    return dirs.astype(np.float32)


def _project_sh_coefficients(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    height, width, _ = rgb.shape
    dirs = _build_hemisphere_directions(height, width)

    basis = np.empty((height, width, 9), dtype=np.float32)
    for row in range(height):
        for col in range(width):
            x, y, z = dirs[row, col]
            basis[row, col, :] = np.asarray(eval_sh_basis_9(float(x), float(y), float(z)), dtype=np.float32)

    luminance = (
        0.2126 * rgb[:, :, 0]
        + 0.7152 * rgb[:, :, 1]
        + 0.0722 * rgb[:, :, 2]
    ).astype(np.float32)

    weights = np.ones((height, width), dtype=np.float32)
    weight_sum = float(np.sum(weights))
    if weight_sum <= 1e-12:
        weight_sum = 1.0

    basis_weighted = basis * weights[:, :, None]

    luminance_coeffs = np.sum(basis_weighted * luminance[:, :, None], axis=(0, 1)) / weight_sum

    rgb_coeffs = np.empty((3, 9), dtype=np.float32)
    for channel in range(3):
        rgb_coeffs[channel, :] = (
            np.sum(basis_weighted * rgb[:, :, channel][:, :, None], axis=(0, 1)) / weight_sum
        )

    return luminance_coeffs.astype(np.float32), rgb_coeffs.astype(np.float32)


def _derive_lighting_direction_from_sh(coeffs: np.ndarray) -> tuple[float, float, float]:
    if coeffs.shape != (9,):
        raise ValueError(f"Expected SH coeff shape (9,), got {coeffs.shape}")

    grad_x = float(coeffs[3])
    grad_y = float(coeffs[1])
    grad_z = float(coeffs[2])

    vx, vy, vz = _safe_unit_vector(grad_x, grad_y, grad_z)
    return vx, vy, vz


def _direction_to_angles(x: float, y: float, z: float) -> tuple[float, float]:
    azimuth = math.degrees(math.atan2(x, z))
    elevation = math.degrees(math.asin(_clamp(y, -1.0, 1.0)))
    return azimuth, elevation


def _estimate_color_temperature_kelvin(rgb: np.ndarray, alpha_mask: np.ndarray | None = None) -> float:
    if alpha_mask is not None:
        weights = np.clip(alpha_mask.astype(np.float32), 0.0, 1.0)
        weight_sum = float(np.sum(weights))
        if weight_sum > 1e-12:
            mean_rgb = np.sum(rgb * weights[:, :, None], axis=(0, 1)) / weight_sum
        else:
            mean_rgb = np.mean(rgb, axis=(0, 1))
    else:
        mean_rgb = np.mean(rgb, axis=(0, 1))

    r = float(mean_rgb[0])
    g = float(mean_rgb[1])
    b = float(mean_rgb[2])

    eps = 1e-6
    rb_ratio = (r + eps) / (b + eps)
    rg_ratio = (r + eps) / (g + eps)

    kelvin = 6500.0 + (rb_ratio - 1.0) * 2200.0 + (rg_ratio - 1.0) * 600.0
    return _clamp(float(kelvin), 2000.0, 12000.0)


def _format_contrast_ratio(luminance: np.ndarray, alpha_mask: np.ndarray | None = None) -> str:
    if alpha_mask is not None:
        mask = alpha_mask > 0.05
        values = luminance[mask] if np.any(mask) else luminance.reshape(-1)
    else:
        values = luminance.reshape(-1)

    if values.size == 0:
        return "1.0:1"

    low = float(np.percentile(values, 5.0))
    high = float(np.percentile(values, 95.0))
    ratio = (high + 0.05) / (low + 0.05)
    ratio = max(ratio, 1.0)
    return f"{ratio:.1f}:1"


def _estimate_ambient_fill_ratio(
    coeffs: np.ndarray,
    luminance: np.ndarray,
    alpha_mask: np.ndarray | None = None,
) -> float:
    dc = abs(float(coeffs[0]))
    directional = float(np.linalg.norm(coeffs[1:4]))
    quadratic = float(np.linalg.norm(coeffs[4:9]))

    structure = directional + 0.5 * quadratic
    if dc <= 1e-12 and structure <= 1e-12:
        return 1.0

    base_ratio = dc / (dc + structure + 1e-12)

    if alpha_mask is not None:
        mask = alpha_mask > 0.05
        values = luminance[mask] if np.any(mask) else luminance.reshape(-1)
    else:
        values = luminance.reshape(-1)

    if values.size == 0:
        return _clamp(base_ratio, 0.0, 1.0)

    lum_std = float(np.std(values))
    lum_mean = float(np.mean(values))
    cv = lum_std / max(lum_mean, 1e-6)
    adjusted = 0.7 * base_ratio + 0.3 * (1.0 / (1.0 + 4.0 * cv))
    return _clamp(float(adjusted), 0.0, 1.0)


def _estimate_lighting_confidence(
    coeffs: np.ndarray,
    luminance: np.ndarray,
    direction: tuple[float, float, float],
    alpha_mask: np.ndarray | None = None,
) -> float:
    dc = abs(float(coeffs[0]))
    first_order = float(np.linalg.norm(coeffs[1:4]))
    second_order = float(np.linalg.norm(coeffs[4:9]))

    if alpha_mask is not None:
        mask = alpha_mask > 0.05
        values = luminance[mask] if np.any(mask) else luminance.reshape(-1)
        support_ratio = float(np.mean(mask.astype(np.float32)))
    else:
        values = luminance.reshape(-1)
        support_ratio = 1.0

    lum_std = float(np.std(values)) if values.size > 0 else 0.0
    lum_mean = float(np.mean(values)) if values.size > 0 else 0.0
    contrast_signal = lum_std / max(lum_mean, 1e-6)

    directional_strength = first_order / max(dc + second_order + 1e-6, 1e-6)
    vx, vy, vz = direction
    direction_validity = 1.0 if (abs(vx) + abs(vy) + abs(vz)) > 1e-6 else 0.0

    confidence = (
        0.45 * _clamp(directional_strength, 0.0, 1.0)
        + 0.30 * _clamp(contrast_signal * 2.0, 0.0, 1.0)
        + 0.15 * _clamp(support_ratio, 0.0, 1.0)
        + 0.10 * direction_validity
    )
    return _clamp(float(confidence), 0.0, 1.0)


def estimate_lighting(
    image: ImageBuffer,
    alpha_mask: np.ndarray | None = None,
) -> InferredLightingData:
    rgb = _rgb_from_image_buffer(image)
    luminance = (
        0.2126 * rgb[:, :, 0]
        + 0.7152 * rgb[:, :, 1]
        + 0.0722 * rgb[:, :, 2]
    ).astype(np.float32)

    luminance_coeffs, rgb_coeffs = _project_sh_coefficients(rgb)
    direction = _derive_lighting_direction_from_sh(luminance_coeffs)
    azimuth_deg, elevation_deg = _direction_to_angles(*direction)

    color_temp_kelvin = _estimate_color_temperature_kelvin(rgb, alpha_mask=alpha_mask)

    if alpha_mask is not None:
        mask = alpha_mask > 0.05
        values = luminance[mask] if np.any(mask) else luminance.reshape(-1)
    else:
        values = luminance.reshape(-1)

    intensity = float(np.mean(values)) if values.size > 0 else float(np.mean(luminance))
    contrast_ratio = _format_contrast_ratio(luminance, alpha_mask=alpha_mask)
    ambient_fill_ratio = _estimate_ambient_fill_ratio(
        luminance_coeffs,
        luminance,
        alpha_mask=alpha_mask,
    )
    confidence = _estimate_lighting_confidence(
        luminance_coeffs,
        luminance,
        direction,
        alpha_mask=alpha_mask,
    )

    return InferredLightingData(
        brightness={
            "intensity": _clamp(intensity, 0.0, 1.0),
            "azimuthDeg": float(azimuth_deg),
            "elevationDeg": float(elevation_deg),
            "colorTempKelvin": float(color_temp_kelvin),
            "confidence": float(confidence),
            "estimatorVersion": _LIGHTING_ESTIMATOR_VERSION,
        },
        temperature="warm" if color_temp_kelvin < 5000.0 else "cool",
        uniformity=float(_clamp(ambient_fill_ratio, 0.0, 1.0)),
        ambientFillRatio=float(_clamp(ambient_fill_ratio, 0.0, 1.0)),
        contrastRatio=contrast_ratio,
    )


def _prepare_depth(depth_values: np.ndarray, width: int, height: int) -> np.ndarray:
    depth = np.asarray(depth_values, dtype=np.float32)
    if depth.shape != (height, width):
        raise ValueError(f"Expected depth shape {(height, width)}, got {depth.shape}")

    finite = np.isfinite(depth)
    if not np.any(finite):
        return np.zeros((height, width), dtype=np.float32)

    valid = depth[finite]
    d_min = float(np.min(valid))
    d_max = float(np.max(valid))

    if abs(d_max - d_min) <= 1e-12:
        normalized = np.zeros((height, width), dtype=np.float32)
        normalized[finite] = 0.5
        return normalized

    normalized = np.zeros((height, width), dtype=np.float32)
    normalized[finite] = (depth[finite] - d_min) / (d_max - d_min)
    return normalized


def estimate_surface_normals(
    image: ImageBuffer,
    depth_values: np.ndarray,
    alpha_mask: np.ndarray | None = None,
) -> InferredSurfaceNormalsData:
    depth = _prepare_depth(depth_values, image.width, image.height)

    grad_y, grad_x = np.gradient(depth)
    nx = -grad_x
    ny = -grad_y
    nz = np.ones_like(depth, dtype=np.float32)

    norms = np.sqrt(nx * nx + ny * ny + nz * nz)
    norms = np.where(norms <= 1e-12, 1.0, norms)

    nx = nx / norms
    ny = ny / norms
    nz = nz / norms

    if alpha_mask is not None:
        if alpha_mask.shape != depth.shape:
            raise ValueError(f"Expected alpha_mask shape {depth.shape}, got {alpha_mask.shape}")
        weights = np.clip(alpha_mask.astype(np.float32), 0.0, 1.0)
        mask = weights > 0.05
    else:
        weights = np.ones_like(depth, dtype=np.float32)
        mask = np.ones_like(depth, dtype=bool)

    if not np.any(mask):
        weights = np.ones_like(depth, dtype=np.float32)
        mask = np.ones_like(depth, dtype=bool)

    weight_sum = float(np.sum(weights[mask]))
    if weight_sum <= 1e-12:
        weight_sum = 1.0

    mean_nx = float(np.sum(nx[mask] * weights[mask]) / weight_sum)
    mean_ny = float(np.sum(ny[mask] * weights[mask]) / weight_sum)
    mean_nz = float(np.sum(nz[mask] * weights[mask]) / weight_sum)

    abs_components = {
        "left": max(-mean_nx, 0.0),
        "right": max(mean_nx, 0.0),
        "up": max(mean_ny, 0.0),
        "down": max(-mean_ny, 0.0),
        "front": max(mean_nz, 0.0),
    }
    dominant_facing = max(abs_components.items(), key=lambda item: item[1])[0]

    local_roughness = np.sqrt(grad_x * grad_x + grad_y * grad_y).astype(np.float32)
    roughness_score = float(np.sum(local_roughness[mask] * weights[mask]) / weight_sum)
    roughness_score = _clamp(roughness_score, 0.0, 1.0)

    direction_strength = max(abs(mean_nx), abs(mean_ny), abs(mean_nz))
    mask_support = float(np.mean(mask.astype(np.float32)))
    confidence = (
        0.55 * _clamp(direction_strength, 0.0, 1.0)
        + 0.25 * _clamp(1.0 - roughness_score, 0.0, 1.0)
        + 0.20 * _clamp(mask_support, 0.0, 1.0)
    )
    confidence = _clamp(float(confidence), 0.0, 1.0)

    return InferredSurfaceNormalsData(
        dominantFacing=str(
            {
                "left": "left",
                "right": "right",
                "up": "up",
                "down": "down",
                "front": "front",
            }[dominant_facing]
        ),
        confidence=confidence,
    )


def extract_inferred_features(
    image: ImageBuffer,
    depth_values: np.ndarray | None = None,
    alpha_mask: np.ndarray | None = None,
) -> InferredFeaturesData:
    lighting = estimate_lighting(image, alpha_mask=alpha_mask)

    surface_normals = None
    if depth_values is not None:
        surface_normals = estimate_surface_normals(
            image,
            depth_values=depth_values,
            alpha_mask=alpha_mask,
        )

    return InferredFeaturesData(
        lighting=lighting,
        surfaceNormals=surface_normals,
    )
