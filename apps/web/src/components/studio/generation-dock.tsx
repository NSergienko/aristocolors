'use client';

import React, { useState } from 'react';

export const GenerationDock: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('Harmonize');
  const [quality, setQuality] = useState('Balanced');
  const [outputRes, setOutputRes] = useState('2K');

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'var(--text-tertiary)',
    fontFamily: 'var(--font-mono)',
    display: 'block',
    marginBottom: '4px',
  };

  const selectStyle: React.CSSProperties = {
    height: '32px',
    backgroundColor: 'var(--surface-0)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    padding: '0 8px',
    outline: 'none',
    cursor: 'not-allowed',
    width: '100%',
  };

  return (
    <footer
      aria-label="Generation Dock"
      style={{
        height: '160px',
        backgroundColor: 'var(--surface-1)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'stretch',
        padding: '16px 20px',
        gap: '20px',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 25,
      }}
    >
      {/* Left: Prompt Field */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px',
          }}
        >
          <label style={{ ...labelStyle, marginBottom: 0 }}>
            Harmonization Guidance
          </label>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            Natural language guidance
          </span>
        </div>
        <textarea
          disabled
          title="Generation pipeline is not connected"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe lighting, atmosphere, material integration, and seam treatment..."
          style={{
            flex: 1,
            backgroundColor: 'var(--surface-0)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: '13px',
            padding: '10px 12px',
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.4,
          }}
        />
      </div>

      {/* Center: Parameters */}
      <div
        style={{
          width: '240px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px',
          alignContent: 'center',
        }}
      >
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Mode</label>
          <select
            disabled
            title="Generation pipeline is not connected"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={selectStyle}
          >
            <option value="Harmonize">Harmonize</option>
            <option value="Blend">Blend</option>
            <option value="Refine">Refine</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Quality</label>
          <select
            disabled
            title="Generation pipeline is not connected"
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            style={selectStyle}
          >
            <option value="Performance">Performance</option>
            <option value="Balanced">Balanced</option>
            <option value="High Quality">High Quality</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Output</label>
          <select
            disabled
            title="Generation pipeline is not connected"
            value={outputRes}
            onChange={(e) => setOutputRes(e.target.value)}
            style={selectStyle}
          >
            <option value="1080p">1080p</option>
            <option value="2K">2K</option>
            <option value="4K">4K</option>
          </select>
        </div>
      </div>

      {/* Right: Primary Action & Status */}
      <div
        style={{
          width: '180px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '10px',
          borderLeft: '1px solid var(--border-subtle)',
          paddingLeft: '20px',
        }}
      >
        <button
          type="button"
          disabled
          title="Harmonize (Phase 4 Pipeline Required)"
          style={{
            height: '42px',
            backgroundColor: 'var(--accent-cyan)',
            color: '#070a0e',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'not-allowed',
            opacity: 0.85,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            letterSpacing: '0.01em',
            boxShadow: '0 2px 12px rgba(0, 240, 255, 0.2)',
            transition: 'opacity var(--transition-fast)',
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
          </svg>
          <span>Harmonize</span>
        </button>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-emerald)',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Pipeline not connected
          </span>
        </div>
      </div>
    </footer>
  );
};
