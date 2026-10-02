'use client';

import React, { useState, useMemo } from 'react';
import { MOCK_GENERATIONS, type GenerationItem } from './mock-generations';

export const GenerationsFeed: React.FC = () => {
  const [filter, setFilter] = useState('all');

  const filteredGenerations = useMemo(() => {
    if (filter === 'harmonized') {
      return MOCK_GENERATIONS.filter((g) => g.stage === 'Harmonized');
    }
    if (filter === 'polish') {
      return MOCK_GENERATIONS.filter((g) => g.stage === 'Final Polish');
    }
    return MOCK_GENERATIONS;
  }, [filter]);

  return (
    <div>
      {/* Compact Top Filter Bar */}
      <div
        style={{
          maxWidth: '1060px',
          margin: '0 auto 24px auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Showing {filteredGenerations.length} processed outputs
          </span>
        </div>

        {/* Right-side compact filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Filter:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              height: '32px',
              padding: '0 12px',
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Generations</option>
            <option value="harmonized">Harmonized</option>
            <option value="polish">Final Polish</option>
          </select>
        </div>
      </div>

      {/* 2-Column Creative Artwork Gallery (Constrained & Centered) */}
      <div
        style={{
          maxWidth: '1060px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: '20px',
        }}
      >
        {filteredGenerations.map((gen) => (
          <div
            key={gen.id}
            className="card-base card-hoverable"
            style={{
              padding: '0',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'var(--surface-1)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-elevation-1)',
            }}
          >
            {/* Dominant 4:3 Balanced Artwork Preview */}
            <div
              style={{
                width: '100%',
                aspectRatio: '4 / 3',
                position: 'relative',
                overflow: 'hidden',
                backgroundColor: 'var(--surface-0)',
                backgroundImage: `url(${gen.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Subtle Ambient Vignette Overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(16, 17, 22, 0.18) 0%, rgba(16, 17, 22, 0.45) 100%)',
                  pointerEvents: 'none',
                }}
              />

              {/* Restrained Top Overlay Badges */}
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  right: '12px',
                  zIndex: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                {/* Stage Pill */}
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: gen.stage === 'Final Polish' ? 'var(--accent-amber)' : 'var(--accent-cyan)',
                    backgroundColor: 'rgba(16, 17, 22, 0.85)',
                    backdropFilter: 'blur(8px)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-xs)',
                    border: gen.stage === 'Final Polish'
                      ? '1px solid rgba(255, 154, 61, 0.35)'
                      : '1px solid rgba(0, 240, 255, 0.3)',
                  }}
                >
                  {gen.stage}
                </span>

                {/* Status Indicator */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--accent-emerald)',
                    backgroundColor: 'rgba(16, 17, 22, 0.85)',
                    backdropFilter: 'blur(8px)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid rgba(0, 229, 153, 0.3)',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-emerald)',
                      boxShadow: '0 0 6px var(--accent-emerald)',
                    }}
                  />
                  {gen.status}
                </div>
              </div>
            </div>

            {/* Compact Information Area Below Image */}
            <div
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                backgroundColor: 'var(--surface-2)',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    margin: 0,
                  }}
                  title={gen.projectName}
                >
                  {gen.projectName}
                </h3>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '3px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{gen.resolution}</span>
                  <span style={{ color: 'var(--border-strong)' }}>•</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{gen.timestamp}</span>
                </div>
              </div>

              {/* Compact "Open Project" UI Action */}
              <button
                type="button"
                className="btn-base btn-secondary btn-sm"
                style={{
                  gap: '6px',
                  fontSize: '12px',
                  padding: '4px 10px',
                  height: '28px',
                  flexShrink: 0,
                }}
              >
                <span>Open Project</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
