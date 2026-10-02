'use client';

import React, { useState, useMemo } from 'react';
import { MOCK_ASSETS, type AssetCategory, type AssetData } from './mock-assets';

export type AssetSortOption = 'newest' | 'name' | 'resolution';

interface CategoryTab {
  id: AssetCategory;
  label: string;
}

const CATEGORY_TABS: readonly CategoryTab[] = [
  { id: 'all', label: 'All Assets' },
  { id: 'composites', label: 'Composites' },
  { id: 'references', label: 'References' },
  { id: 'source', label: 'Source Images' },
  { id: 'generated', label: 'Generated' },
  { id: 'materials', label: 'Materials' },
];

interface CategoryVisualConfig {
  tag: string;
  accentColor: string;
  borderAccent: string;
  background: string;
  icon: React.ReactNode;
}

const CATEGORY_CONFIGS: Record<Exclude<AssetCategory, 'all'>, CategoryVisualConfig> = {
  source: {
    tag: 'Source Plate',
    accentColor: 'var(--text-secondary)',
    borderAccent: 'rgba(255, 255, 255, 0.16)',
    background: 'radial-gradient(ellipse at 50% 40%, #1e222c 0%, #13151b 75%, #0f1015 100%)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  materials: {
    tag: 'Material Pass',
    accentColor: 'var(--accent-amber)',
    borderAccent: 'rgba(255, 154, 61, 0.28)',
    background: 'radial-gradient(ellipse at 50% 40%, #231b15 0%, #151419 75%, #0f1015 100%)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  references: {
    tag: 'Visual Ref',
    accentColor: '#a78bfa',
    borderAccent: 'rgba(167, 139, 250, 0.28)',
    background: 'radial-gradient(ellipse at 50% 40%, #1d1728 0%, #14131b 75%, #0f1015 100%)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="22" y1="12" x2="18" y2="12" />
        <line x1="6" y1="12" x2="2" y2="12" />
        <line x1="12" y1="6" x2="12" y2="2" />
        <line x1="12" y1="22" x2="12" y2="18" />
      </svg>
    ),
  },
  composites: {
    tag: 'Composite',
    accentColor: '#38bdf8',
    borderAccent: 'rgba(56, 189, 248, 0.28)',
    background: 'radial-gradient(ellipse at 50% 40%, #161f2a 0%, #12151b 75%, #0f1015 100%)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="13" height="13" rx="1.5" />
        <path d="M8 8h13v13H8z" />
      </svg>
    ),
  },
  generated: {
    tag: 'Synthesized',
    accentColor: '#fb923c',
    borderAccent: 'rgba(251, 146, 60, 0.28)',
    background: 'radial-gradient(ellipse at 50% 40%, #241816 0%, #161318 75%, #0f1015 100%)',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
      </svg>
    ),
  },
};

export const AssetsLibrary: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('all');
  const [sortBy, setSortBy] = useState<AssetSortOption>('newest');

  // Filter & sort assets
  const filteredAssets = useMemo(() => {
    let list = [...MOCK_ASSETS];

    if (activeCategory !== 'all') {
      list = list.filter((asset) => asset.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (asset) =>
          asset.name.toLowerCase().includes(q) ||
          asset.categoryLabel.toLowerCase().includes(q) ||
          (asset.projectContext && asset.projectContext.toLowerCase().includes(q))
      );
    }

    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'resolution') {
      list.sort((a, b) => b.dimensions.localeCompare(a.dimensions));
    }

    return list;
  }, [activeCategory, searchQuery, sortBy]);

  return (
    <div>
      {/* Compact Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          padding: '12px 0',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}
      >
        {/* Category Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveCategory(tab.id)}
              className={`btn-base btn-sm ${activeCategory === tab.id ? 'btn-secondary' : 'btn-ghost'}`}
              style={{
                fontSize: '13px',
                borderColor: activeCategory === tab.id ? 'var(--border-medium)' : 'transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Sort Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Search Input */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              width: '240px',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-tertiary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search assets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '32px',
                paddingLeft: '32px',
                paddingRight: '12px',
                backgroundColor: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                transition: 'border-color var(--transition-fast)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--border-focus)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border-subtle)';
              }}
            />
          </div>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as AssetSortOption)}
              style={{
                height: '32px',
                padding: '0 10px',
                backgroundColor: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="newest">Newest</option>
              <option value="name">Name</option>
              <option value="resolution">Resolution</option>
            </select>
          </div>
        </div>
      </div>

      {/* Asset Grid (Image-dominant creative library) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
        }}
      >
        {filteredAssets.map((asset) => {
          const hasImage = Boolean(asset.imageUrl && asset.imageUrl.trim().length > 0);
          const config = CATEGORY_CONFIGS[asset.category] || CATEGORY_CONFIGS.source;

          return (
            <div
              key={asset.id}
              className="card-base card-hoverable"
              style={{
                padding: '0',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              {/* Dominant Image Viewport (>65% visual hierarchy) */}
              {hasImage ? (
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 10',
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: 'var(--surface-0)',
                    backgroundImage: `url(${asset.imageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {/* Subtle Bottom Ambient Gradient */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(16, 17, 22, 0.75) 100%)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Format & Resolution Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      zIndex: 2,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      backgroundColor: 'rgba(16, 17, 22, 0.75)',
                      backdropFilter: 'blur(6px)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {asset.format} • {asset.dimensions}
                  </div>

                  {/* Category Pill */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '10px',
                      zIndex: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        color: config.accentColor,
                        backgroundColor: 'rgba(16, 17, 22, 0.85)',
                        backdropFilter: 'blur(6px)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-xs)',
                        border: `1px solid ${config.borderAccent}`,
                      }}
                    >
                      {asset.categoryLabel}
                    </span>
                  </div>
                </div>
              ) : (
                /* Intentional Visual Placeholder (dark premium surface with subtle tonal variation) */
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '16 / 10',
                    position: 'relative',
                    overflow: 'hidden',
                    backgroundColor: 'var(--surface-1)',
                    background: config.background,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Subtle Blueprint / Registration Grid */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0.12,
                      backgroundImage: `
                        linear-gradient(to right, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1px, transparent 1px)
                      `,
                      backgroundSize: '24px 24px',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Centered Asset-Type Visual Indicator */}
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 2,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'rgba(21, 23, 29, 0.85)',
                        border: '1px solid var(--border-medium)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: config.accentColor,
                        boxShadow: 'var(--shadow-elevation-1)',
                      }}
                    >
                      {config.icon}
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      {config.tag}
                    </span>
                  </div>

                  {/* Format & Resolution Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      zIndex: 2,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      backgroundColor: 'rgba(16, 17, 22, 0.75)',
                      backdropFilter: 'blur(6px)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-xs)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {asset.format} • {asset.dimensions}
                  </div>

                  {/* Category Pill */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '10px',
                      zIndex: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        color: config.accentColor,
                        backgroundColor: 'rgba(16, 17, 22, 0.85)',
                        backdropFilter: 'blur(6px)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-xs)',
                        border: `1px solid ${config.borderAccent}`,
                      }}
                    >
                      {asset.categoryLabel}
                    </span>
                  </div>
                </div>
              )}

              {/* Restrained Useful Metadata Row */}
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-brand)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      margin: 0,
                    }}
                    title={asset.name}
                  >
                    {asset.name}
                  </h3>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: 'var(--text-tertiary)',
                    marginTop: '2px',
                  }}
                >
                  {asset.projectContext ? (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      In: {asset.projectContext}
                    </span>
                  ) : (
                    <span>{asset.fileSize}</span>
                  )}
                  <span>{asset.updatedAt}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredAssets.length === 0 && (
        <div
          style={{
            padding: '56px 24px',
            textAlign: 'center',
            backgroundColor: 'var(--surface-1)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            marginTop: '20px',
          }}
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
            No assets found matching your criteria.
          </p>
          <button
            type="button"
            className="btn-base btn-secondary btn-sm"
            onClick={() => {
              setSearchQuery('');
              setActiveCategory('all');
            }}
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};
