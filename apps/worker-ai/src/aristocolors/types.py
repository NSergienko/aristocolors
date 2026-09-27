from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class LabColor:
    l: float
    a: float
    b: float

    def to_dict(self) -> dict[str, float]:
        return {
            "l": self.l,
            "a": self.a,
            "b": self.b,
        }


@dataclass(frozen=True)
class ColorClusterData:
    hex: str
    proportion: float
    lab: LabColor

    def to_dict(self) -> dict[str, Any]:
        return {
            "hex": self.hex,
            "proportion": self.proportion,
            "lab": self.lab.to_dict(),
        }


@dataclass(frozen=True)
class LuminanceStatsData:
    mean: float
    stdDev: float
    min: float
    max: float

    def to_dict(self) -> dict[str, float]:
        return {
            "mean": self.mean,
            "stdDev": self.stdDev,
            "min": self.min,
            "max": self.max,
        }


@dataclass(frozen=True)
class TextureAnalysisData:
    edgeDensity: float
    entropy: float
    contrastRatio: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "edgeDensity": self.edgeDensity,
            "entropy": self.entropy,
            "contrastRatio": self.contrastRatio,
        }


@dataclass(frozen=True)
class DeterministicFeaturesData:
    dominantColors: list[ColorClusterData] = field(default_factory=list)
    luminanceStats: LuminanceStatsData | None = None
    textureAnalysis: TextureAnalysisData | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "dominantColors": [color.to_dict() for color in self.dominantColors],
            "luminanceStats": None if self.luminanceStats is None else self.luminanceStats.to_dict(),
            "textureAnalysis": None if self.textureAnalysis is None else self.textureAnalysis.to_dict(),
        }


@dataclass(frozen=True)
class InferredLightingData:
    brightness: dict[str, Any]
    temperature: str
    uniformity: float
    ambientFillRatio: float
    contrastRatio: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "brightness": self.brightness,
            "temperature": self.temperature,
            "uniformity": self.uniformity,
            "ambientFillRatio": self.ambientFillRatio,
            "contrastRatio": self.contrastRatio,
        }


@dataclass(frozen=True)
class InferredSurfaceNormalsData:
    dominantFacing: str
    confidence: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "dominantFacing": self.dominantFacing,
            "confidence": self.confidence,
        }


@dataclass(frozen=True)
class InferredFeaturesData:
    lighting: InferredLightingData | None = None
    surfaceNormals: InferredSurfaceNormalsData | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "lighting": None if self.lighting is None else self.lighting.to_dict(),
            "surfaceNormals": None if self.surfaceNormals is None else self.surfaceNormals.to_dict(),
        }


@dataclass(frozen=True)
class AristoColorsProfileData:
    profileId: str
    sourceAssetId: str
    schemaVersion: str
    extractorVersion: str
    canonicalModelName: str
    deterministicFeatures: DeterministicFeaturesData
    inferredFeatures: InferredFeaturesData

    def to_dict(self) -> dict[str, Any]:
        return {
            "profileId": self.profileId,
            "sourceAssetId": self.sourceAssetId,
            "schemaVersion": self.schemaVersion,
            "extractorVersion": self.extractorVersion,
            "canonicalModelName": self.canonicalModelName,
            "deterministicFeatures": self.deterministicFeatures.to_dict(),
            "inferredFeatures": self.inferredFeatures.to_dict(),
        }


@dataclass(frozen=True)
class AristoColorsEmbeddingRecordData:
    profileId: str
    modelName: str
    modelVersion: str
    dimension: int
    vector: list[float]

    def to_dict(self) -> dict[str, Any]:
        return {
            "profileId": self.profileId,
            "modelName": self.modelName,
            "modelVersion": self.modelVersion,
            "dimension": self.dimension,
            "vector": self.vector,
        }


@dataclass(frozen=True)
class ImageBuffer:
    width: int
    height: int
    rgb_bytes: bytes


@dataclass(frozen=True)
class ExtractedStyleDna:
    profile: AristoColorsProfileData
    canonicalEmbedding: AristoColorsEmbeddingRecordData | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile": self.profile.to_dict(),
            "canonicalEmbedding": None if self.canonicalEmbedding is None else self.canonicalEmbedding.to_dict(),
            "metadata": self.metadata,
        }
