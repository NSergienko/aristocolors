'use client';

import React, { useRef } from 'react';
import Link from 'next/link';

export interface StudioTopbarProps {
  projectTitle?: string;
  projectStatus?: string;
  zoomLevel?: string;
  onZoomChange?: (zoom: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onExport?: () => void;
  onAddImage?: (file: File) => void;
}

export const StudioTopbar: React.FC<StudioTopbarProps> = ({
  projectTitle = 'Obsidian Product Launch',
  projectStatus = 'Saved',
  zoomLevel = '100%',
  onZoomChange,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onExport,
  onAddImage,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAddImageClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };
  return (
    <header
      style={{
        height: '50px',
        backgroundColor: 'var(--surface-1)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 30,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left: Back Link & Project Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link
          href="/projects"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: 500,
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            transition: 'color var(--transition-fast)',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Projects</span>
        </Link>

        <div
          style={{
            width: '1px',
            height: '16px',
            backgroundColor: 'var(--border-subtle)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {projectTitle}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--accent-emerald)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-xs)',
            }}
          >
            <span
              style={{
                width: '4px',
                height: '4px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-emerald)',
              }}
            />
            {projectStatus}
          </span>
        </div>
      </div>

      {/* Center: Editor Controls (Undo / Redo) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          title={canUndo ? 'Undo (Ctrl+Z)' : 'Nothing to undo'}
          style={{
            background: 'none',
            border: 'none',
            color: canUndo ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: canUndo ? 'pointer' : 'not-allowed',
            opacity: canUndo ? 1 : 0.35,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12px',
            transition: 'opacity var(--transition-fast), color var(--transition-fast)',
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
          <span>Undo</span>
        </button>

        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          title={canRedo ? 'Redo (Ctrl+Y)' : 'Nothing to redo'}
          style={{
            background: 'none',
            border: 'none',
            color: canRedo ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            cursor: canRedo ? 'pointer' : 'not-allowed',
            opacity: canRedo ? 1 : 0.35,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12px',
            transition: 'opacity var(--transition-fast), color var(--transition-fast)',
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
          <span>Redo</span>
        </button>
      </div>

      {/* Right: Add Image, Zoom, Export, Settings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* + Add Image Button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onAddImage?.(file);
            }
            e.target.value = '';
          }}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={handleAddImageClick}
          title="Import Image Layer (PNG, JPEG, WebP)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            height: '28px',
            padding: '0 12px',
            backgroundColor: 'rgba(0, 240, 255, 0.08)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--accent-cyan)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
            userSelect: 'none',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Image</span>
        </button>

        {/* Zoom Selector */}
        <div
          title="Canvas Zoom Level"
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <select
            value={zoomLevel}
            onChange={(e) => onZoomChange?.(e.target.value)}
            style={{
              appearance: 'none',
              WebkitAppearance: 'none',
              height: '28px',
              padding: '0 24px 0 10px',
              backgroundColor: 'var(--surface-0)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="50%">50%</option>
            <option value="75%">75%</option>
            <option value="100%">100%</option>
            <option value="125%">125%</option>
            <option value="150%">150%</option>
            <option value="Fit">Fit</option>
          </select>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: 'absolute',
              right: '8px',
              pointerEvents: 'none',
              color: 'var(--text-tertiary)',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        <button
          type="button"
          onClick={onExport}
          title="Export Canvas as PNG (aristocolors-obsidian-product.png)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            height: '28px',
            padding: '0 12px',
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Export</span>
        </button>

        <Link
          href="/settings"
          title="Studio Settings & Workspace Preferences"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            backgroundColor: 'var(--surface-0)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            transition: 'border-color var(--transition-fast), color var(--transition-fast)',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>
    </header>
  );
};
