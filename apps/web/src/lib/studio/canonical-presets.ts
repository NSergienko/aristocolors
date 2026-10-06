import { AristoColorsProfileSchema, type AristoColorsProfile } from '@aristocolors/contracts';

// Display names belong to the registry; every profile is validated by the shared contract.
export const CANONICAL_PRESETS = [
  { name: 'Cyberpunk Neon Noir (Teal & Amber)', profile: AristoColorsProfileSchema.parse({
    id: '7a5e921d-3b84-4e20-912f-682054a10001', schemaVersion: '1.2.0', extractorVersion: 'extractor_v2.1', canonicalModelName: 'dinov2_vitl14',
    deterministicFeatures: {
      palette: [
        { hex: '#0B132B', weight: 0.40, lab: { l: 7.2, a: 3.4, b: -18.1 }, name: 'Dark Midnight Shadow' },
        { hex: '#00F0FF', weight: 0.25, lab: { l: 87.5, a: -48.2, b: -14.3 }, name: 'Electric Cyan Rim' },
        { hex: '#FFB703', weight: 0.20, lab: { l: 78.4, a: 18.2, b: 84.1 }, name: 'Golden Amber Key Light' },
        { hex: '#7209B7', weight: 0.15, lab: { l: 28.1, a: 61.2, b: -58.4 }, name: 'Deep Violet Fill' },
      ], luminanceStats: { mean: 24.2, stdDev: 14.8, skewness: 1.42 },
      textureAnalysis: { grainType: 'fine_micro_grain', fftRadialEnergy: 0.042, edgeBleedRadiusPx: 14, laplacianNoiseVariance: 0.038 },
    }, inferredFeatures: {
      lighting: { azimuthDeg: -45, elevationDeg: 35, colorTempKelvin: 4200, intensity: 0.92, contrastRatio: '8.4:1', ambientFillRatio: '0.25', confidence: 0.88, estimatorVersion: 'sh_estimator_v1.4' },
      surfaceNormals: { dominantFacing: 'front', roughnessScore: 0.65, confidence: 0.84, estimatorVersion: 'sh_estimator_v1.4' },
    },
  }) },
  { name: 'Kodak Portra 400 Editorial Commercial', profile: AristoColorsProfileSchema.parse({
    id: '7a5e921d-3b84-4e20-912f-682054a10002', schemaVersion: '1.2.0', extractorVersion: 'extractor_v2.1', canonicalModelName: 'dinov2_vitl14',
    deterministicFeatures: {
      palette: [
        { hex: '#FDF0D5', weight: 0.35, lab: { l: 94.6, a: 1.2, b: 14.5 }, name: 'Cream Highlight Glow' },
        { hex: '#C1121F', weight: 0.20, lab: { l: 38.2, a: 64.1, b: 42.5 }, name: 'Rich Terracotta Accent' },
        { hex: '#669BBC', weight: 0.25, lab: { l: 61.5, a: -12.4, b: -21.8 }, name: 'Soft Sky Pastel Ambient' },
        { hex: '#003049', weight: 0.20, lab: { l: 19.4, a: -4.8, b: -20.2 }, name: 'Warm Dark Navy Shadow' },
      ], luminanceStats: { mean: 62.4, stdDev: 21.3, skewness: -0.15 },
      textureAnalysis: { grainType: 'fine_micro_grain', fftRadialEnergy: 0.021, edgeBleedRadiusPx: 8, laplacianNoiseVariance: 0.015 },
    }, inferredFeatures: {
      lighting: { azimuthDeg: 30, elevationDeg: 55, colorTempKelvin: 5600, intensity: 0.78, contrastRatio: '4.2:1', ambientFillRatio: '0.45', confidence: 0.92, estimatorVersion: 'sh_estimator_v1.4' },
      surfaceNormals: { dominantFacing: 'front', roughnessScore: 0.42, confidence: 0.89, estimatorVersion: 'sh_estimator_v1.4' },
    },
  }) },
  { name: 'Dark Fantasy Painterly Chiaroscuro', profile: AristoColorsProfileSchema.parse({
    id: '7a5e921d-3b84-4e20-912f-682054a10003', schemaVersion: '1.2.0', extractorVersion: 'extractor_v2.1', canonicalModelName: 'dinov2_vitl14',
    deterministicFeatures: {
      palette: [
        { hex: '#0D0D0D', weight: 0.55, lab: { l: 3.2, a: 0, b: 0 }, name: 'Obsidian Velvet Black' },
        { hex: '#D4AF37', weight: 0.22, lab: { l: 72.1, a: 6.8, b: 64.2 }, name: 'Antique Gold Shimmer' },
        { hex: '#581845', weight: 0.15, lab: { l: 21.4, a: 34.5, b: 4.8 }, name: 'Crimson Wine Tone' },
        { hex: '#34495E', weight: 0.08, lab: { l: 31.2, a: -4.5, b: -12.4 }, name: 'Cold Steel Ambient' },
      ], luminanceStats: { mean: 18, stdDev: 28.6, skewness: 2.1 },
      textureAnalysis: { grainType: 'heavy_impasto', fftRadialEnergy: 0.089, edgeBleedRadiusPx: 18, laplacianNoiseVariance: 0.072 },
    }, inferredFeatures: {
      lighting: { azimuthDeg: -70, elevationDeg: 25, colorTempKelvin: 3200, intensity: 0.95, contrastRatio: '11.5:1', ambientFillRatio: '0.12', confidence: 0.79, estimatorVersion: 'sh_estimator_v1.4' },
      surfaceNormals: { dominantFacing: 'front', roughnessScore: 0.88, confidence: 0.75, estimatorVersion: 'sh_estimator_v1.4' },
    },
  }) },
] as const;

export function getCanonicalPreset(id?: string | null) {
  if (!id) return CANONICAL_PRESETS[0];
  const preset = CANONICAL_PRESETS.find(entry => entry.profile.id === id);
  if (!preset) throw new Error(`Unknown canonical AristoColors profile: ${id}`);
  return preset;
}

export function primaryAccent(profile: AristoColorsProfile): string {
  // Highest-weight chromatic swatch, not the neutral/dark shadow cluster.
  const accents = profile.deterministicFeatures.palette.filter(color => Math.hypot(color.lab.a, color.lab.b) > 20);
  return [...(accents.length ? accents : profile.deterministicFeatures.palette)].sort((a, b) => b.weight - a.weight)[0].hex;
}
