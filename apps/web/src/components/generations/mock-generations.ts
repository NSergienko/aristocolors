export type GenerationStage = 'Harmonized' | 'Final Polish';
export type GenerationStatus = 'Completed' | 'Processing' | 'Failed';

export interface GenerationItem {
  id: string;
  projectId: string;
  projectName: string;
  stage: GenerationStage;
  resolution: string;
  status: GenerationStatus;
  imageUrl: string;
  timestamp: string;
  styleDnaProfile?: string;
  elapsedTime?: string;
}

export const MOCK_GENERATIONS: readonly GenerationItem[] = [
  {
    id: 'gen-memory-01',
    projectId: 'proj-anatomy-soul',
    projectName: 'Memory Architecture',
    stage: 'Harmonized',
    resolution: '2048 × 2048',
    status: 'Completed',
    imageUrl: '/artwork/memory-architecture.jpg',
    timestamp: '42 min ago',
    styleDnaProfile: 'Neon Dusk',
    elapsedTime: '8.2s',
  },
  {
    id: 'gen-desert-01',
    projectId: 'proj-desert-sentinel',
    projectName: 'Desert Sentinel',
    stage: 'Final Polish',
    resolution: '3840 × 2160',
    status: 'Completed',
    imageUrl: '/artwork/desert-sentinel.jpg',
    timestamp: '2 hours ago',
    styleDnaProfile: 'Golden Hour',
    elapsedTime: '14.1s',
  },
  {
    id: 'gen-cyberpunk-01',
    projectId: 'proj-cyberpunk-district',
    projectName: 'Cyberpunk District Recon',
    stage: 'Harmonized',
    resolution: '3840 × 2160',
    status: 'Completed',
    imageUrl: '/artwork/cyberpunk-district-recon.jpg',
    timestamp: '5 hours ago',
    styleDnaProfile: 'Blue Hour',
    elapsedTime: '9.6s',
  },
  {
    id: 'gen-obsidian-01',
    projectId: 'proj-obsidian-launch',
    projectName: 'Obsidian Product Launch',
    stage: 'Final Polish',
    resolution: '3840 × 2160',
    status: 'Completed',
    imageUrl: '/artwork/obsidian-product.jpg',
    timestamp: 'Yesterday',
    styleDnaProfile: 'Obsidian Core',
    elapsedTime: '12.4s',
  },
];
