'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

export type SettingsTabId = 'profile' | 'workspace' | 'preferences';

interface NavTab {
  id: SettingsTabId;
  label: string;
  icon: React.ReactNode;
}

const SETTINGS_TABS: readonly NavTab[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: 'workspace',
    label: 'Workspace',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: 'preferences',
    label: 'Preferences',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>('profile');

  // Form states (UI mock only)
  const [displayName, setDisplayName] = useState('Demo Artist');
  const [email, setEmail] = useState('artist@aristocolors.app');
  const [role, setRole] = useState('Creative Professional');

  const [workspaceName, setWorkspaceName] = useState('Primary Studio');
  const [defaultProjectView, setDefaultProjectView] = useState('Grid');
  const [defaultExportFormat, setDefaultExportFormat] = useState('PNG');
  const [defaultExportResolution, setDefaultExportResolution] = useState('2K');

  // Preferences: Appearance
  const [interfaceTheme, setInterfaceTheme] = useState('Dark');
  const [uiDensity, setUiDensity] = useState('Compact');
  const [panelContrast, setPanelContrast] = useState('Standard');

  // Preferences: Canvas & Viewport
  const [canvasBackground, setCanvasBackground] = useState('Neutral Dark');
  const [transparencyPreview, setTransparencyPreview] = useState('Checkerboard');
  const [checkerboardSize, setCheckerboardSize] = useState('Medium');
  const [zoomBehavior, setZoomBehavior] = useState('Cursor Centered');
  const [fitCanvasOnOpen, setFitCanvasOnOpen] = useState(true);

  // Preferences: Guides & Snapping
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState('16 px');
  const [snapToObjects, setSnapToObjects] = useState(true);
  const [snapToGuides, setSnapToGuides] = useState(true);
  const [smartGuides, setSmartGuides] = useState(true);
  const [showCanvasBounds, setShowCanvasBounds] = useState(true);

  // Preferences: Workflow & Performance
  const [autoSaveProjects, setAutoSaveProjects] = useState(true);
  const [autoSaveInterval, setAutoSaveInterval] = useState('1 min');
  const [generationNotifications, setGenerationNotifications] = useState(true);
  const [previewQuality, setPreviewQuality] = useState('Balanced');
  const [gpuAcceleration, setGpuAcceleration] = useState(true);
  const [layerThumbnailQuality, setLayerThumbnailQuality] = useState('Medium');

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2200);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '36px',
    padding: '0 12px',
    backgroundColor: 'var(--surface-0)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
    transition: 'border-color var(--transition-fast)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '6px',
    display: 'block',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text-tertiary)',
    marginBottom: '10px',
    borderBottom: '1px solid var(--border-subtle)',
    paddingBottom: '6px',
  };

  const toggleItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    backgroundColor: 'var(--surface-0)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-subtle)',
    cursor: 'pointer',
    userSelect: 'none',
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 220px) 1fr',
        gap: '24px',
        alignItems: 'start',
      }}
    >
      {/* Left Settings Internal Nav */}
      <nav
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          backgroundColor: 'var(--surface-1)',
          padding: '8px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {SETTINGS_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`btn-base btn-sm ${isActive ? 'btn-secondary' : 'btn-ghost'}`}
              style={{
                justifyContent: 'flex-start',
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                backgroundColor: isActive ? 'var(--surface-2)' : 'transparent',
                borderColor: isActive ? 'var(--border-subtle)' : 'transparent',
              }}
            >
              <span style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-tertiary)' }}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right Active Settings Content */}
      <div
        className="card-base"
        style={{
          padding: '24px 28px',
          backgroundColor: 'var(--surface-1)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <form onSubmit={handleSave}>
          {/* Section 1: Profile */}
          {activeTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  Profile Information
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Manage your personal display identity and account credentials.
                </p>
              </div>

              {/* Avatar Item */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '14px 16px',
                  backgroundColor: 'var(--surface-0)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #00F0FF 0%, #151821 50%, #FF9900 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-brand)',
                    fontSize: '16px',
                    fontWeight: 800,
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    flexShrink: 0,
                  }}
                >
                  DA
                </div>
                <div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                    {displayName}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    {role} • {email}
                  </span>
                </div>
              </div>

              {/* Form Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Role</label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '8px' }}>
                <Button variant="primary" size="sm" type="submit">
                  Save Changes
                </Button>
                {saveStatus === 'saved' && (
                  <span style={{ fontSize: '12px', color: 'var(--accent-emerald)', fontWeight: 500 }}>
                    Preferences saved
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Section 2: Workspace */}
          {activeTab === 'workspace' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h2
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  Workspace Configuration
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Customize default project views and render export standards.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Workspace Name</label>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Default Project View</label>
                  <select
                    value={defaultProjectView}
                    onChange={(e) => setDefaultProjectView(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="Grid">Grid</option>
                    <option value="List">List</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Default Export Format</label>
                  <select
                    value={defaultExportFormat}
                    onChange={(e) => setDefaultExportFormat(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="PNG">PNG</option>
                    <option value="JPG">JPG</option>
                    <option value="WebP">WebP</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Default Export Resolution</label>
                  <select
                    value={defaultExportResolution}
                    onChange={(e) => setDefaultExportResolution(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="1080p">1080p</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '8px' }}>
                <Button variant="primary" size="sm" type="submit">
                  Save Changes
                </Button>
                {saveStatus === 'saved' && (
                  <span style={{ fontSize: '12px', color: 'var(--accent-emerald)', fontWeight: 500 }}>
                    Preferences saved
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Section 3: Preferences */}
          {activeTab === 'preferences' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
              <div>
                <h2
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  Workspace Preferences
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Fine-tune canvas viewport, snapping guides, visual density, and compositing acceleration.
                </p>
              </div>

              {/* 1. Appearance */}
              <div>
                <div style={sectionHeaderStyle}>Appearance</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={labelStyle}>Interface Theme</label>
                    <select
                      value={interfaceTheme}
                      onChange={(e) => setInterfaceTheme(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="Dark">Dark</option>
                      <option value="Dark High-Contrast">Dark High-Contrast</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>UI Density</label>
                    <select
                      value={uiDensity}
                      onChange={(e) => setUiDensity(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="Comfortable">Comfortable</option>
                      <option value="Compact">Compact</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Panel Contrast</label>
                    <select
                      value={panelContrast}
                      onChange={(e) => setPanelContrast(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="Standard">Standard</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Canvas & Viewport */}
              <div>
                <div style={sectionHeaderStyle}>Canvas & Viewport</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>Canvas Background</label>
                    <select
                      value={canvasBackground}
                      onChange={(e) => setCanvasBackground(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="Neutral Dark">Neutral Dark</option>
                      <option value="Neutral Mid">Neutral Mid</option>
                      <option value="Neutral Light">Neutral Light</option>
                      <option value="Checkerboard">Checkerboard</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Transparency Preview</label>
                    <select
                      value={transparencyPreview}
                      onChange={(e) => setTransparencyPreview(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="Checkerboard">Checkerboard</option>
                      <option value="Solid">Solid</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Checkerboard Size</label>
                    <select
                      value={checkerboardSize}
                      onChange={(e) => setCheckerboardSize(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="Small">Small</option>
                      <option value="Medium">Medium</option>
                      <option value="Large">Large</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Zoom Behavior</label>
                    <select
                      value={zoomBehavior}
                      onChange={(e) => setZoomBehavior(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="Cursor Centered">Cursor Centered</option>
                      <option value="Canvas Centered">Canvas Centered</option>
                    </select>
                  </div>
                </div>

                <label style={toggleItemStyle}>
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                      Fit Canvas on Project Open
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                      Automatically center and scale the artboard to fit available screen bounds on load
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={fitCanvasOnOpen}
                    onChange={(e) => setFitCanvasOnOpen(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                  />
                </label>
              </div>

              {/* 3. Guides & Snapping */}
              <div>
                <div style={sectionHeaderStyle}>Guides & Snapping</div>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ maxWidth: '280px' }}>
                    <label style={labelStyle}>Grid Size</label>
                    <select
                      value={gridSize}
                      onChange={(e) => setGridSize(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="8 px">8 px</option>
                      <option value="16 px">16 px</option>
                      <option value="32 px">32 px</option>
                      <option value="64 px">64 px</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  <label style={toggleItemStyle}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                        Show Grid
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        Render geometric grid overlay across active canvas
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={showGrid}
                      onChange={(e) => setShowGrid(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                    />
                  </label>

                  <label style={toggleItemStyle}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                        Snap to Objects
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        Align selections to bounding boxes of nearby layers
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={snapToObjects}
                      onChange={(e) => setSnapToObjects(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                    />
                  </label>

                  <label style={toggleItemStyle}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                        Snap to Guides
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        Lock dragging edges to horizontal and vertical guides
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={snapToGuides}
                      onChange={(e) => setSnapToGuides(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                    />
                  </label>

                  <label style={toggleItemStyle}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                        Smart Guides
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        Dynamic distance indicators and equidistant spacing hints
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={smartGuides}
                      onChange={(e) => setSmartGuides(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                    />
                  </label>

                  <label style={{ ...toggleItemStyle, gridColumn: '1 / -1' }}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                        Show Canvas Bounds
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        Display visible boundary frame around active canvas
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={showCanvasBounds}
                      onChange={(e) => setShowCanvasBounds(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                    />
                  </label>
                </div>
              </div>

              {/* 4. Workflow & Performance */}
              <div>
                <div style={sectionHeaderStyle}>Workflow & Performance</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '12px' }}>
                  <div>
                    <label style={labelStyle}>Auto-save Interval</label>
                    <select
                      value={autoSaveInterval}
                      onChange={(e) => setAutoSaveInterval(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="30 sec">30 sec</option>
                      <option value="1 min">1 min</option>
                      <option value="2 min">2 min</option>
                      <option value="5 min">5 min</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Preview Quality</label>
                    <select
                      value={previewQuality}
                      onChange={(e) => setPreviewQuality(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="Performance">Performance</option>
                      <option value="Balanced">Balanced</option>
                      <option value="High Quality">High Quality</option>
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Layer Thumbnail Quality</label>
                    <select
                      value={layerThumbnailQuality}
                      onChange={(e) => setLayerThumbnailQuality(e.target.value)}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={toggleItemStyle}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                        Auto-save Projects
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        Periodically backup project layers, masks, and workspace session
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoSaveProjects}
                      onChange={(e) => setAutoSaveProjects(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                    />
                  </label>

                  <label style={toggleItemStyle}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                        Generation Notifications
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        Notify when AI image generation or finishing completes in the background
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={generationNotifications}
                      onChange={(e) => setGenerationNotifications(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                    />
                  </label>

                  <label style={toggleItemStyle}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                        GPU Preview Acceleration
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        Enable hardware acceleration for real-time viewport filters and blend modes
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={gpuAcceleration}
                      onChange={(e) => setGpuAcceleration(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)', cursor: 'pointer' }}
                    />
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '8px' }}>
                <Button variant="primary" size="sm" type="submit">
                  Save Changes
                </Button>
                {saveStatus === 'saved' && (
                  <span style={{ fontSize: '12px', color: 'var(--accent-emerald)', fontWeight: 500 }}>
                    Preferences saved
                  </span>
                )}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
