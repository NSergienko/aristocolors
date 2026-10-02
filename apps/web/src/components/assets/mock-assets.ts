export type AssetCategory = 'all' | 'composites' | 'references' | 'source' | 'generated' | 'materials';

export interface AssetData {
  id: string;
  name: string;
  category: Exclude<AssetCategory, 'all'>;
  categoryLabel: string;
  dimensions: string;
  format: string;
  fileSize: string;
  imageUrl: string;
  projectContext?: string;
  updatedAt: string;
}

export const MOCK_ASSETS: readonly AssetData[] = [
  {
    id: 'asset-brutalist-atrium-plate',
    name: 'Brutalist Atrium Plate',
    category: 'source',
    categoryLabel: 'Source Images',
    dimensions: '6016 × 4016',
    format: 'RAW',
    fileSize: '38.4 MB',
    imageUrl: '',
    projectContext: 'Obsidian Product Launch',
    updatedAt: '18 min ago',
  },
  {
    id: 'asset-smoked-glass-cutout',
    name: 'Smoked Glass Cutout',
    category: 'materials',
    categoryLabel: 'Materials',
    dimensions: '2400 × 3200',
    format: 'PNG',
    fileSize: '8.7 MB',
    imageUrl: '',
    projectContext: 'Obsidian Product Launch',
    updatedAt: '34 min ago',
  },
  {
    id: 'asset-copper-surface-reference',
    name: 'Copper Surface Reference',
    category: 'references',
    categoryLabel: 'References',
    dimensions: '4096 × 4096',
    format: 'JPG',
    fileSize: '6.1 MB',
    imageUrl: '',
    projectContext: 'Obsidian Product Launch',
    updatedAt: '1 hour ago',
  },
  {
    id: 'asset-desert-canyon-background',
    name: 'Desert Canyon Background Plate',
    category: 'source',
    categoryLabel: 'Source Images',
    dimensions: '5760 × 3240',
    format: 'JPG',
    fileSize: '12.3 MB',
    imageUrl: '',
    projectContext: 'Desert Sentinel',
    updatedAt: '3 hours ago',
  },
  {
    id: 'asset-weathered-sandstone-texture',
    name: 'Weathered Sandstone Texture',
    category: 'materials',
    categoryLabel: 'Materials',
    dimensions: '4096 × 4096',
    format: 'PNG',
    fileSize: '15.8 MB',
    imageUrl: '',
    projectContext: 'Desert Sentinel',
    updatedAt: 'Yesterday',
  },
  {
    id: 'asset-rainy-district-background',
    name: 'Rainy District Background Plate',
    category: 'source',
    categoryLabel: 'Source Images',
    dimensions: '6000 × 3376',
    format: 'JPG',
    fileSize: '14.6 MB',
    imageUrl: '',
    projectContext: 'Cyberpunk District Recon',
    updatedAt: 'Yesterday',
  },
  {
    id: 'asset-atmospheric-lighting-reference',
    name: 'Atmospheric Lighting Reference',
    category: 'references',
    categoryLabel: 'References',
    dimensions: '2560 × 1440',
    format: 'JPG',
    fileSize: '3.9 MB',
    imageUrl: '',
    projectContext: 'Cyberpunk District Recon',
    updatedAt: '2 days ago',
  },
];
