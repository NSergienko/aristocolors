'use client';

import React from 'react';
import type { HarmonizationRefinements } from '@/lib/studio/harmonization-contract';
import { getCanonicalPreset, primaryAccent } from '@/lib/studio/canonical-presets';

export function HarmonizationReviewControls({ values, onChange, profileId, available, saving, ready, error, onAccept }: {
  profileId?: string;
  values: HarmonizationRefinements; onChange: (values: HarmonizationRefinements) => void;
  available: boolean; saving: boolean; ready: boolean; error: string | null; onAccept: () => void;
}) {
  const preset = getCanonicalPreset(profileId);
  const light = preset.profile.inferredFeatures.lighting;
  return <section style={{ padding: 8, overflowY: 'auto' }}>
    <h2 style={{ fontSize: 12, fontWeight: 500, color: '#e4e4e7', marginBottom: 20 }}>Harmonization Review</h2>
    <div style={{ fontSize: 11, color: '#a1a1aa', lineHeight: 1.7, marginBottom: 16 }}>
      <p style={{ color: '#e4e4e7' }}>{preset.name}</p>
      <p>Azimuth {light.azimuthDeg}° · Elevation {light.elevationDeg}°</p>
      <p>Temperature {Math.max(1000, Math.min(40000, light.colorTempKelvin - values.warmth * 40))}K · Tint {primaryAccent(preset.profile)}</p>
    </div>
    {([['contactShadow', 'Contact Shadow Intensity', 0, 100, '%'], ['edgeFeather', 'Edge Feather / Blending', 0, 20, 'px'], ['warmth', 'Color Match & Tone Warmth', -50, 50, '']] as const).map(([key, label, min, max, suffix]) =>
      <label key={key} style={{ display: 'block', fontSize: 11, color: '#a1a1aa', marginBottom: 24 }}>
        <span style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginBottom: 10 }}>{label}<span style={{ color: '#e4e4e7', whiteSpace: 'nowrap' }}>{values[key]}{suffix}</span></span>
        <input aria-label={label} type="range" min={min} max={max} step={1} value={values[key]} disabled={!available || saving} onChange={event => onChange({ ...values, [key]: Number(event.currentTarget.value) })} style={{ width: '100%', accentColor: '#80cbd9' }} />
      </label>)}
    {!available && <p style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 16 }}>Run Harmonize Scene to create a result with comparison and foreground data.</p>}
    <button type="button" disabled={!available || !ready || saving} onClick={onAccept} className="disabled:opacity-40 hover:!bg-cyan-200" style={{ width: '100%', padding: '10px 6px', background: '#80cbd9', color: '#0b1723', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>{saving ? 'Saving refined piece…' : 'Accept & Proceed to 03 Finish →'}</button>
    {error && <p role="alert" style={{ marginTop: 10, fontSize: 11, color: '#e4b0b0' }}>{error}</p>}
  </section>;
}
