import type { ProjectCardData } from './project-card';

export const MOCK_PROJECTS: readonly ProjectCardData[] = [
  {
    id: 'proj-cyberpunk-district',
    title: 'Cyberpunk District Recon',
    layersCount: 16,
    lastEdited: '8 min ago',
    resolution: '3840 × 2160',
    category: 'game-art',
    profileName: 'Blue Hour',
    imageUrl: '/artwork/cyberpunk-district-recon.jpg',
    gridOverlay: false,
    gradientBackground: `
      radial-gradient(circle at 75% 25%, rgba(61, 112, 214, 0.45) 0%, transparent 60%),
      linear-gradient(135deg, #0e1220 0%, #151b2a 50%, #090c14 100%)
    `,
  },
  {
    id: 'proj-desert-sentinel',
    title: 'Desert Sentinel',
    layersCount: 14,
    lastEdited: '2 hours ago',
    resolution: '3840 × 2160',
    category: 'splash',
    profileName: 'Golden Hour',
    imageUrl: '/artwork/desert-sentinel.jpg',
    gridOverlay: false,
    gradientBackground: `
      radial-gradient(circle at 50% 30%, rgba(255, 153, 0, 0.5) 0%, rgba(255, 90, 0, 0.2) 35%, transparent 65%),
      linear-gradient(180deg, #1c130b 0%, #3a1a0d 45%, #120a05 100%)
    `,
  },
  {
    id: 'proj-anatomy-soul',
    title: 'Anatomy of Soul — Memory Architecture',
    layersCount: 8,
    lastEdited: '12 min ago',
    resolution: '2048 × 2048',
    category: 'marketing',
    profileName: 'Neon Dusk',
    imageUrl: '/artwork/memory-architecture.jpg',
    gridOverlay: true,
    gradientBackground: `
      radial-gradient(circle at 80% 20%, rgba(0, 240, 255, 0.45) 0%, transparent 45%),
      radial-gradient(circle at 15% 75%, rgba(255, 0, 128, 0.4) 0%, transparent 40%),
      linear-gradient(135deg, #0d0f17 0%, #1e112a 50%, #080d14 100%)
    `,
  },
  {
    id: 'proj-obsidian-launch',
    title: 'Obsidian Product Launch',
    layersCount: 6,
    lastEdited: 'Yesterday',
    resolution: '1920 × 1080',
    category: 'marketing',
    profileName: 'Obsidian Core',
    gridOverlay: true,
    gradientBackground: `
      radial-gradient(circle at 50% 50%, rgba(0, 240, 255, 0.2) 0%, transparent 50%),
      linear-gradient(145deg, #151821 0%, #0a0b0e 40%, #121620 70%, #060709 100%)
    `,
  },
  {
    id: 'proj-forgotten-temple',
    title: 'Forgotten Temple',
    layersCount: 22,
    lastEdited: '3 days ago',
    resolution: '3840 × 2160',
    category: 'splash',
    profileName: 'Emerald Mist',
    gridOverlay: false,
    gradientBackground: `
      radial-gradient(circle at 30% 25%, rgba(0, 229, 153, 0.35) 0%, transparent 45%),
      radial-gradient(circle at 75% 70%, rgba(255, 153, 0, 0.25) 0%, transparent 40%),
      linear-gradient(160deg, #08140f 0%, #0f271d 45%, #050a08 100%)
    `,
  },
  {
    id: 'proj-midnight-auto',
    title: 'Midnight Automotive',
    layersCount: 11,
    lastEdited: '5 days ago',
    resolution: '2560 × 1440',
    category: 'marketing',
    profileName: 'Cyber Night',
    gridOverlay: true,
    gradientBackground: `
      radial-gradient(ellipse at 85% 65%, rgba(255, 30, 80, 0.35) 0%, transparent 40%),
      radial-gradient(ellipse at 15% 35%, rgba(0, 240, 255, 0.3) 0%, transparent 45%),
      linear-gradient(135deg, #070b14 0%, #0e172a 50%, #05070d 100%)
    `,
  },
];
