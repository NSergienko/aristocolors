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
import { listStudioProjectIndexes } from '@/components/studio/studio-project-storage';

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

  const handleCreateNew = () => {
    router.push('/projects/new');
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
    </AppShell>
  );
}
