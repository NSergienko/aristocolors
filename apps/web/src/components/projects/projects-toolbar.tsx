'use client';

import React, { useState } from 'react';

export type ProjectsTab = 'recent' | 'all';
export type ProjectFilter = 'all' | 'game-art' | 'splash' | 'marketing' | 'draft';
export type ViewDensity = 'large' | 'dense';

export interface ProjectsToolbarProps {
  onSearchChange?: (term: string) => void;
  onFilterChange?: (filter: ProjectFilter) => void;
  onTabChange?: (tab: ProjectsTab) => void;
  onViewDensityChange?: (density: ViewDensity) => void;
}

export const ProjectsToolbar: React.FC<ProjectsToolbarProps> = ({
  onSearchChange,
  onFilterChange,
  onTabChange,
  onViewDensityChange,
}) => {
  const [activeTab, setActiveTab] = useState<ProjectsTab>('all');
  const [activeFilter, setActiveFilter] = useState<ProjectFilter>('all');
  const [viewDensity, setViewDensity] = useState<ViewDensity>('large');
  const [searchQuery, setSearchQuery] = useState('');

  const handleTab = (tab: ProjectsTab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const handleFilter = (filter: ProjectFilter) => {
    setActiveFilter(filter);
    onFilterChange?.(filter);
  };

  const handleDensity = (density: ViewDensity) => {
    setViewDensity(density);
    onViewDensityChange?.(density);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '12px 0',
        marginBottom: '20px',
        borderBottom: '1px solid var(--border-subtle)',
        flexWrap: 'wrap',
      }}
    >
      {/* Left Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          onClick={() => handleTab('all')}
          className={`btn-base btn-sm ${activeTab === 'all' ? 'btn-secondary' : 'btn-ghost'}`}
          style={{
            fontWeight: activeTab === 'all' ? 600 : 500,
            color: activeTab === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          All Projects
        </button>
        <button
          type="button"
          onClick={() => handleTab('recent')}
          className={`btn-base btn-sm ${activeTab === 'recent' ? 'btn-secondary' : 'btn-ghost'}`}
          style={{
            fontWeight: activeTab === 'recent' ? 600 : 500,
            color: activeTab === 'recent' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          Recent Projects
        </button>
      </div>

      {/* Right Controls: Search, Filter, Density */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', width: '200px' }}>
          <span
            style={{
              position: 'absolute',
              left: '9px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              onSearchChange?.(e.target.value);
            }}
            className="input-field"
            style={{
              height: '30px',
              paddingLeft: '28px',
              paddingRight: '8px',
              fontSize: '12px',
            }}
          />
        </div>

        {/* Filter Pills */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--surface-1)',
            padding: '2px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'game-art', label: 'Game Art' },
              { key: 'splash', label: 'Splash Art' },
              { key: 'marketing', label: 'Marketing' },
              { key: 'draft', label: 'Draft' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => handleFilter(filter.key)}
              style={{
                background: activeFilter === filter.key ? 'var(--surface-3)' : 'transparent',
                border: 'none',
                color: activeFilter === filter.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: activeFilter === filter.key ? 600 : 500,
                padding: '3px 8px',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* View density toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: 'var(--surface-1)',
            padding: '2px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            title="Large Grid"
            onClick={() => handleDensity('large')}
            style={{
              background: viewDensity === 'large' ? 'var(--surface-3)' : 'transparent',
              border: 'none',
              color: viewDensity === 'large' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              padding: '4px 6px',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </button>
          <button
            type="button"
            title="Dense Grid"
            onClick={() => handleDensity('dense')}
            style={{
              background: viewDensity === 'dense' ? 'var(--surface-3)' : 'transparent',
              border: 'none',
              color: viewDensity === 'dense' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              padding: '4px 6px',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="4" height="4" />
              <rect x="10" y="3" width="4" height="4" />
              <rect x="17" y="3" width="4" height="4" />
              <rect x="3" y="10" width="4" height="4" />
              <rect x="10" y="10" width="4" height="4" />
              <rect x="17" y="10" width="4" height="4" />
              <rect x="3" y="17" width="4" height="4" />
              <rect x="10" y="17" width="4" height="4" />
              <rect x="17" y="17" width="4" height="4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
