'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { RecentProjectShowcase } from '@/components/projects/recent-project-showcase';
import {
  ProjectsToolbar,
  type ProjectFilter,
  type ProjectsTab,
  type ViewDensity,
} from '@/components/projects/projects-toolbar';
import { ProjectCard } from '@/components/projects/project-card';
import { CreateProjectCard } from '@/components/projects/create-project-card';
import { MOCK_PROJECTS } from '@/components/projects/mock-projects';
import type { ProjectCardData } from '@/components/projects/project-card';
import { clearStudioManifest, listStudioProjectIndexes } from '@/components/studio/studio-project-storage';

const CANVAS_PRESETS = [
  { id: 'landscape', label: '16:9 Landscape', width: 1920, height: 1080 },
  { id: 'square', label: '1:1 Square', width: 1080, height: 1080 },
  { id: 'portrait', label: '9:16 Portrait', width: 1080, height: 1920 },
] as const;

function relativeEditedTime(timestamp: number): string {
  if (!timestamp) return 'Saved locally';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProjectsTab>('all');
  const [activeFilter, setActiveFilter] = useState<ProjectFilter>('all');
  const [viewDensity, setViewDensity] = useState<ViewDensity>('large');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('Untitled Project');
  const [selectedPresetId, setSelectedPresetId] = useState<(typeof CANVAS_PRESETS)[number]['id']>('landscape');

  const [activeProject, setActiveProject] = useState<ProjectCardData>(MOCK_PROJECTS[0]);

  useEffect(() => {
    let isCurrent = true;
    void listStudioProjectIndexes().then(([latest]) => {
      if (!isCurrent || !latest) return;
      setActiveProject({
        id: latest.data.id,
        title: latest.data.title,
        layersCount: latest.data.layersCount,
        lastEdited: relativeEditedTime(latest.data.updatedAt),
        resolution: `${latest.data.width} × ${latest.data.height}`,
        profileName: 'Local Project',
        imageUrl: latest.data.thumbnailDataUrl,
        gradientBackground: 'linear-gradient(135deg, #0b0c10 0%, #151821 50%, #0d1017 100%)',
      });
    }).catch(() => undefined);
    return () => { isCurrent = false; };
  }, []);

  const handleOpenProject = (projectId: string) => {
    // Navigate to studio workspace
    router.push(`/projects/${projectId}`);
  };

  const handleDeleteProject = (projectId: string) => {
    if (MOCK_PROJECTS.some(project => project.id === projectId)) return;
    setActiveProject(current => current.id === projectId ? MOCK_PROJECTS[0] : current);
    void Promise.all([
      clearStudioManifest(`aristocolors_project_${projectId}_manifest`),
      clearStudioManifest(`aristocolors:manifest:${projectId}`),
    ]).catch(cause => console.error('Unable to delete the local project:', cause));
  };

  const handleCreateNew = () => {
    setNewProjectTitle('Untitled Project');
    setSelectedPresetId('landscape');
    setIsCreateModalOpen(true);
  };

  const handleCreateCanvas = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const preset = CANVAS_PRESETS.find(({ id }) => id === selectedPresetId);
    const title = newProjectTitle.trim();
    if (!preset || !title) return;

    const projectId = `project-${crypto.randomUUID()}`;
    const canvas = document.createElement('canvas');
    canvas.width = preset.width;
    canvas.height = preset.height;
    const dataUrl = canvas.toDataURL('image/png');
    sessionStorage.setItem(`aristocolors:local-import:${projectId}`, JSON.stringify({
      dataUrl, name: title, canvasWidth: preset.width, canvasHeight: preset.height,
    }));
    router.push(`/projects/${projectId}?localImport=${encodeURIComponent(projectId)}`);
  };

  // Filter projects by tab, category pill, and search term
  const filteredProjects = useMemo(() => {
    let result = [...MOCK_PROJECTS];

    if (activeTab === 'recent') {
      result = result.slice(0, 3);
    }

    if (activeFilter !== 'all') {
      result = result.filter((p) => p.category === activeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.profileName.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [activeTab, activeFilter, searchQuery]);

  const gridColumns =
    viewDensity === 'large'
      ? 'repeat(auto-fill, minmax(320px, 1fr))'
      : 'repeat(auto-fill, minmax(230px, 1fr))';

  return (
    <AppShell activeNavId="projects">
      {/* Page Header */}
      <PageHeader
        title="Projects Hub"
        subtitle="Manage compositions, harmonized layers, and active creative canvases."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreateNew}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            }
          >
            New Project
          </Button>
        }
      />

      {/* Dominant Active Showcase */}
      {activeProject && (
        <RecentProjectShowcase
          id={activeProject.id}
          title={activeProject.title}
          layersCount={activeProject.layersCount}
          lastEdited={activeProject.lastEdited}
          resolution={activeProject.resolution}
          profileName={activeProject.profileName}
          imageUrl={activeProject.imageUrl}
          onOpen={() => handleOpenProject(activeProject.id)}
          isUserProject={!MOCK_PROJECTS.some(project => project.id === activeProject.id)}
          onDelete={() => handleDeleteProject(activeProject.id)}
        />
      )}

      {/* Toolbar */}
      <ProjectsToolbar
        onSearchChange={setSearchQuery}
        onFilterChange={setActiveFilter}
        onTabChange={setActiveTab}
        onViewDensityChange={setViewDensity}
      />

      {/* Projects Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridColumns,
          gap: '20px',
        }}
      >
        {/* New Project Import Card */}
        <CreateProjectCard />

        {/* Existing Project Cards */}
        {filteredProjects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onSelect={handleOpenProject}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredProjects.length === 0 && (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            backgroundColor: 'var(--surface-1)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            marginTop: '20px',
          }}
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
            No projects found matching &ldquo;{searchQuery}&rdquo;
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setActiveFilter('all');
            }}
          >
            Reset Filters
          </Button>
        </div>
      )}

      {isCreateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create New Project"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 7, 11, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            style={{
              background: '#12141a',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 14,
              padding: 24,
              maxWidth: 480,
              width: '100%',
              color: '#e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
                  Create New Project
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
                  Choose canvas dimensions and name your composition
                </p>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'transparent', border: 0, color: '#94a3b8', fontSize: 18, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCanvas} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="new-project-title" style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Project Title
                </label>
                <input
                  id="new-project-title"
                  type="text"
                  value={newProjectTitle}
                  onChange={(event) => setNewProjectTitle(event.target.value)}
                  placeholder="e.g. Neon Horizon, Forgotten Temple"
                  style={{
                    background: '#1a1d24',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: '#f8fafc',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Canvas Format
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {CANVAS_PRESETS.map((preset) => {
                    const isSelected = selectedPresetId === preset.id;
                    const label = preset.id === 'landscape' ? '16:9 Banner' : preset.id === 'square' ? '1:1 Feed' : '9:16 TikTok';
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedPresetId(preset.id)}
                        style={{
                          padding: '12px 8px',
                          borderRadius: 8,
                          border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                          background: isSelected ? '#0d2836' : '#1a1d24',
                          color: isSelected ? '#38bdf8' : '#94a3b8',
                          cursor: 'pointer',
                          textAlign: 'center',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          alignItems: 'center',
                          minWidth: 0,
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? '#f8fafc' : '#cbd5e1' }}>
                          {label}
                        </span>
                        <span style={{ fontSize: 9, opacity: 0.75 }}>{preset.width} × {preset.height}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 7,
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    background: 'transparent',
                    color: '#94a3b8',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '9px 20px',
                    borderRadius: 7,
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    background: '#38bdf8',
                    color: '#0b1723',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Create Canvas →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
