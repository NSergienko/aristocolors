import type { DeterministicFeatures, InferredFeatures } from '@aristocolors/contracts';

/**
 * Utility to generate normalized unit vectors for DINOv2 (1024d), SigLIP (768d), and CLIP (512d)
 */
export function generateRandomUnitVector(dimension: number): number[] {
  const vec = new Float64Array(dimension);
  let normSq = 0;
  for (let i = 0; i < dimension; i++) {
    const val = (Math.random() - 0.5) * 2;
    vec[i] = val;
    normSq += val * val;
  }
  const norm = Math.sqrt(normSq) || 1;
  const result = new Array<number>(dimension);
  for (let i = 0; i < dimension; i++) {
    result[i] = Number((vec[i] / norm).toFixed(6));
  }
  return result;
}

/**
 * Canonical test seed data for AristoColors Style Profiles
 */
export function createSeedDeterministicFeatures(): DeterministicFeatures {
  return {
    palette: [
      { hex: '#1A1E29', weight: 0.35, lab: { l: 12.5, a: 2.1, b: -8.4 } },
      { hex: '#D4AF37', weight: 0.25, lab: { l: 72.3, a: 8.6, b: 62.1 } },
      { hex: '#4A5568', weight: 0.2, lab: { l: 36.8, a: -1.2, b: -4.3 } },
      { hex: '#E2E8F0', weight: 0.12, lab: { l: 91.2, a: -0.4, b: 1.2 } },
      { hex: '#8C1D40', weight: 0.08, lab: { l: 28.4, a: 45.2, b: 14.8 } },
    ],
    luminanceStats: {
      mean: 48.2,
      stdDev: 14.6,
      skewness: 0.32,
    },
    textureAnalysis: {
      grainType: 'medium_painterly',
      fftRadialEnergy: 0.42,
      edgeBleedRadiusPx: 4,
      laplacianNoiseVariance: 0.08,
    },
  };
}

export function createSeedInferredFeatures(): InferredFeatures {
  return {
    lighting: {
      azimuthDeg: -45,
      elevationDeg: 35,
      colorTempKelvin: 5600,
      intensity: 1.0,
      contrastRatio: '8.4:1',
      ambientFillRatio: 0.4,
      confidence: 0.92,
      estimatorVersion: 'sh-estimator-v1.4',
    },
    surfaceNormals: {
      dominantFacing: 'front',
      roughnessScore: 0.38,
      confidence: 0.88,
      estimatorVersion: 'dsine-v2.0',
    },
  };
}

/**
 * Seed Generator for HNSW Vector Benchmark
 * Prepares N synthetic DINOv2 1024d embeddings with realistic cluster centers.
 */
export function generateBenchmarkVectors(count: number, dimension = 1024): Float32Array {
  console.log(`[Seed Generator] Generating ${count} synthetic vectors (${dimension}d)...`);
  const data = new Float32Array(count * dimension);

  // Create 10 style cluster centers
  const clusterCount = 10;
  const clusters: Float64Array[] = [];
  for (let c = 0; c < clusterCount; c++) {
    const center = new Float64Array(dimension);
    let normSq = 0;
    for (let d = 0; d < dimension; d++) {
      const v = (Math.random() - 0.5) * 2;
      center[d] = v;
      normSq += v * v;
    }
    const norm = Math.sqrt(normSq) || 1;
    for (let d = 0; d < dimension; d++) {
      center[d] /= norm;
    }
    clusters.push(center);
  }

  // Populate vectors with slight gaussian variance around chosen cluster
  for (let i = 0; i < count; i++) {
    const cluster = clusters[i % clusterCount];
    const offset = i * dimension;
    let normSq = 0;
    for (let d = 0; d < dimension; d++) {
      const noise = (Math.random() - 0.5) * 0.2;
      const val = cluster[d] + noise;
      data[offset + d] = val;
      normSq += val * val;
    }
    const norm = Math.sqrt(normSq) || 1;
    for (let d = 0; d < dimension; d++) {
      data[offset + d] /= norm;
    }
  }

  return data;
}
