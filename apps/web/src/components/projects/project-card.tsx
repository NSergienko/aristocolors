'use client';

import React from 'react';

export interface ProjectCardData {
  id: string;
  title: string;
  lastEdited: string;
  layersCount: number;
  resolution: string;
  category?: string;
  profileName: string;
  gradientBackground: string;
  gridOverlay?: boolean;
  imageUrl?: string;
}

export interface ProjectCardProps {
  project: ProjectCardData;
  onSelect?: (id: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onSelect }) => {
  return (
    <div
      onClick={() => onSelect?.(project.id)}
      className="card-base project-card"
    >
      {/* Dominant Artwork Preview (16:9 aspect ratio, >60% of card) */}
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          position: 'relative',
          background: project.imageUrl
            ? `url(${project.imageUrl}) center/cover no-repeat`
            : project.gradientBackground,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '12px',
        }}
      >
        {/* Optional Technical Horizon / Perspective Lines */}
        {project.gridOverlay && !project.imageUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0.18,
              backgroundImage: `
                linear-gradient(to right, rgba(255, 255, 255, 0.12) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255, 255, 255, 0.12) 1px, transparent 1px)
              `,
              backgroundSize: '24px 24px',
              maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 40%, transparent 95%)',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Ambient Vignette Gradient */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(18, 20, 26, 0.85) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Floating Top Badges */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: 'rgba(11, 12, 16, 0.75)',
              backdropFilter: 'blur(4px)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            {project.resolution}
          </span>
        </div>

        {/* Bottom Artwork Indicators */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 6px',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: 'rgba(11, 12, 16, 0.75)',
              backdropFilter: 'blur(4px)',
              border: '1px solid var(--border-subtle)',
              fontSize: '10px',
              color: 'var(--accent-amber)',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-amber)',
              }}
            />
            {project.profileName}
          </span>
        </div>
      </div>

      {/* Card Content & Metadata */}
      <div
        style={{
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          backgroundColor: 'var(--surface-2)',
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {project.title}
        </h3>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            marginTop: '2px',
          }}
        >
          <span>{project.layersCount} Layers</span>
          <span>{project.lastEdited}</span>
        </div>
      </div>
    </div>
  );
};
