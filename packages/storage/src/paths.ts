/**
 * Canonical Cloudflare R2 Bucket Directory Structure:
 * - assets/originals/{userId}/{assetId}.png
 * - assets/masks/{userId}/{assetId}.png
 * - assets/intermediates/{userId}/{generationId}/depth.png
 * - assets/renders/{userId}/{generationId}/{ratio}.png
 */

export type AssetExtension = 'png' | 'webp' | 'jpg' | 'jpeg';

export type CommercialAspectRatio = '1:1' | '9:16' | '16:9' | '4:5';

export function normalizeRatioToFilename(ratio: CommercialAspectRatio | string): string {
  return ratio.replace(':', 'x');
}

export const R2Paths = {
  /**
   * Reference / raw cutout uploaded by user
   * Path: assets/originals/{userId}/{assetId}.png
   */
  original(userId: string, assetId: string, ext: AssetExtension = 'png'): string {
    return `assets/originals/${userId}/${assetId}.${ext}`;
  },

  /**
   * SAM/BiRefNet Alpha Mask associated with an asset
   * Path: assets/masks/{userId}/{assetId}.png
   */
  mask(userId: string, assetId: string, ext: AssetExtension = 'png'): string {
    return `assets/masks/${userId}/${assetId}.${ext}`;
  },

  /**
   * Intermediate Depth / Normal map for generation pipeline
   * Path: assets/intermediates/{userId}/{generationId}/depth.png
   */
  intermediateDepth(userId: string, generationId: string, ext: AssetExtension = 'png'): string {
    return `assets/intermediates/${userId}/${generationId}/depth.${ext}`;
  },

  /**
   * Generic intermediate artifact (depth, surface_normals, edge_bleed)
   * Path: assets/intermediates/{userId}/{generationId}/{name}.png
   */
  intermediate(userId: string, generationId: string, name: string, ext: AssetExtension = 'png'): string {
    return `assets/intermediates/${userId}/${generationId}/${name}.${ext}`;
  },

  /**
   * Final commercial render per aspect ratio
   * Path: assets/renders/{userId}/{generationId}/{ratio}.png (e.g. 9x16.png or 1x1.png)
   */
  render(userId: string, generationId: string, ratio: CommercialAspectRatio | string, ext: AssetExtension = 'png'): string {
    const formattedRatio = normalizeRatioToFilename(ratio);
    return `assets/renders/${userId}/${generationId}/${formattedRatio}.${ext}`;
  },
};
