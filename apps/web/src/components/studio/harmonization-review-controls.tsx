'use client';

import React from 'react';
import type { HarmonizationRefinements } from '../../lib/studio/harmonization-contract';

export function HarmonizationReviewControls({
  values,
  onChange,
  intensity,
  onIntensityChange,
  onReHarmonize,
  available,
  busy,
  saving,
  ready,
  error,
  onAccept,
}: {
  values: HarmonizationRefinements;
  onChange: (values: HarmonizationRefinements) => void;
  intensity?: number;
  onIntensityChange?: (intensity: number) => void;
  onReHarmonize?: () => void;
  available: boolean;
  busy: boolean;
  saving: boolean;
  ready: boolean;
  error: string | null;
  onAccept: () => void;
  // Deprecated preset props kept optional for backwards compatibility
  profileId?: string;
  onProfileSelect?: (profileId: string) => void;
}) {
  const currentIntensity = intensity ?? 60;

  return (
    <section
      aria-label="Harmonization Inspector"
      style={{ display: 'flex', flexDirection: 'column', gap: 14, color: '#dce7f8', fontSize: 11 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#82c9da', margin: 0 }}>
          02 Harmonize Controls
        </h2>
        {busy && <span style={{ fontSize: 10, color: '#82c9da' }}>Processing…</span>}
      </div>

      {/* Automatic Scene Status Badge */}
      <div style={{ padding: '8px 10px', background: '#141619', border: '1px solid #ffffff12', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 9, color: '#a1a1aa', textTransform: 'uppercase', fontWeight: 600 }}>Active Background Lighting</span>
        <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>Auto-detected Ambient Match</span>
        <span style={{ fontSize: 9, color: '#94a3b8' }}>Synthesizing rim highlights & cast shadow from canvas plate</span>
      </div>

      {/* Primary Harmonization Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, paddingTop: 6, borderTop: '1px solid #ffffff0f' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontWeight: 500 }}>Harmonization Intensity</span>
            <span style={{ color: '#82c9da', fontWeight: 600 }}>{currentIntensity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={currentIntensity}
            disabled={busy || !available}
            onChange={(e) => onIntensityChange?.(Number(e.currentTarget.value))}
            style={{ width: '100%', accentColor: '#82c9da' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontWeight: 500 }}>Contact Shadow Intensity</span>
            <span style={{ color: '#82c9da', fontWeight: 600 }}>{values.contactShadow}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={values.contactShadow}
            disabled={busy || !available}
            onChange={(e) => onChange({ ...values, contactShadow: Number(e.currentTarget.value) })}
            style={{ width: '100%', accentColor: '#82c9da' }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontWeight: 500 }}>Edge Softness / Blending</span>
            <span style={{ color: '#82c9da', fontWeight: 600 }}>{values.edgeFeather}px</span>
          </div>
          <input
            type="range"
            min={0}
            max={20}
            value={values.edgeFeather}
            disabled={busy || !available}
            onChange={(e) => onChange({ ...values, edgeFeather: Number(e.currentTarget.value) })}
            style={{ width: '100%', accentColor: '#82c9da' }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid #ffffff0f' }}>
        {onReHarmonize && (
          <button
            type="button"
            disabled={busy}
            onClick={onReHarmonize}
            style={{
              width: '100%',
              padding: '8px 4px',
              borderRadius: 6,
              border: '1px solid #ffffff1e',
              background: '#222731',
              color: '#e2e8f0',
              fontSize: 11,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? 'Computing…' : '⚡ Re-Harmonize'}
          </button>
        )}

        <button
          type="button"
          disabled={busy || saving || !ready}
          onClick={onAccept}
          style={{
            width: '100%',
            padding: '10px 4px',
            borderRadius: 6,
            border: '1px solid #82c9da55',
            background: ready ? '#80cbd9' : '#334155',
            color: ready ? '#0b1723' : '#94a3b8',
            fontSize: 11,
            fontWeight: 700,
            cursor: ready && !busy ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Baking & Saving…' : 'Accept & Go to Finish →'}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ margin: 0, padding: 8, borderRadius: 4, background: '#451a1a', color: '#fca5a5', fontSize: 10 }}>
          {error}
        </p>
      )}
    </section>
  );
}
