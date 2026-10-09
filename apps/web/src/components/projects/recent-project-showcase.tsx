'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface RecentProjectShowcaseProps {
  id?: string;
  title?: string;
  layersCount?: number;
  lastEdited?: string;
  resolution?: string;
  profileName?: string;
  imageUrl?: string;
  onOpen?: () => void;
  isUserProject?: boolean;
  onDelete?: () => void;
}

export const RecentProjectShowcase: React.FC<RecentProjectShowcaseProps> = ({
  id = 'proj-cyberpunk-district',
  title = 'Cyberpunk District Recon',
  layersCount = 16,
  lastEdited = '8 min ago',
  resolution = '3840 × 2160',
  profileName = 'Blue Hour',
  imageUrl = '/artwork/cyberpunk-district-recon.jpg',
  onOpen,
  isUserProject = false,
  onDelete,
}) => {
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--surface-1)',
        marginBottom: '28px',
        boxShadow: 'var(--shadow-elevation-2)',
      }}
    >
      {/* Dominant Artwork Canvas Area */}
      <div
        style={{
          height: '280px',
          width: '100%',
          position: 'relative',
          background: imageUrl
            ? `linear-gradient(180deg, rgba(11, 12, 16, 0.2) 0%, rgba(18, 20, 26, 0.92) 100%), url(${imageUrl}) center/cover no-repeat`
            : `
            radial-gradient(ellipse at 75% 20%, rgba(0, 240, 255, 0.28) 0%, transparent 50%),
            radial-gradient(ellipse at 20% 85%, rgba(255, 0, 128, 0.22) 0%, transparent 45%),
            radial-gradient(circle at 50% 50%, rgba(255, 153, 0, 0.15) 0%, transparent 60%),
            linear-gradient(180deg, rgba(11, 12, 16, 0.2) 0%, rgba(18, 20, 26, 0.95) 100%),
            linear-gradient(135deg, #0b0c10 0%, #151821 50%, #0d1017 100%)
          `,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '24px',
        }}
      >
        {/* Subtle Perspective Grid / Horizon Lines */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.22,
            backgroundImage: `
              linear-gradient(to right, rgba(0, 240, 255, 0.18) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(0, 240, 255, 0.18) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 30%, transparent 90%)',
            pointerEvents: 'none',
          }}
        />

        {/* Top Badges */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Badge variant="cyan" dot>
              Active Workspace
            </Badge>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-tertiary)',
                backgroundColor: 'rgba(0,0,0,0.4)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {resolution}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(0,0,0,0.5)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>AristoColors Profile:</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-amber)' }}>
              {profileName}
            </span>
          </div>
        </div>

        {/* Bottom Banner Content */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '20px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--accent-cyan)',
                display: 'block',
                marginBottom: '4px',
              }}
            >
              Recent Composition
            </span>
            <h2
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: '26px',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              {title}
            </h2>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginTop: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              <span>{layersCount} Layers</span>
              <span style={{ color: 'var(--border-strong)' }}>•</span>
              <span>Edited {lastEdited}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              size="md"
              onClick={onOpen}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              }
            >
              Resume Editing
            </Button>
            <button
              type="button"
              onClick={onDelete}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#fca5a5',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="m19 6-1 14H6L5 6" />
                <path d="M10 11v5M14 11v5" />
              </svg>
              Delete Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
