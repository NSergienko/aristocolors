'use client';

import React, { useState } from 'react';

export type HarmonizationSettings = { aspectRatio: '9:16' | '1:1' | '16:9'; intensity: number };

export function HarmonizationDock({ onPrepare }: { onPrepare: (settings: HarmonizationSettings) => Promise<void> }) {
  const [aspectRatio, setAspectRatio] = useState<HarmonizationSettings['aspectRatio']>('16:9');
  const [intensity, setIntensity] = useState(80);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  return <footer aria-label="Generation Dock" style={{ position: 'fixed', bottom: 16, left: 176, right: 256, zIndex: 100,
    padding: '16px 20px', borderRadius: 16, background: 'rgba(20,25,34,0.94)', backdropFilter: 'blur(20px)',
    border: '1px solid #91a9d42a', boxShadow: '0 16px 48px #0009', color: '#dce7f8' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
      <div style={{ flex: '1 1 250px' }}>
        <div style={{ fontSize: 10, letterSpacing: 1.5, color: '#a3b5d3', marginBottom: 8 }}>HARMONIZATION</div>
        <div role="group" aria-label="Output aspect ratio" style={{ display: 'flex', gap: 5 }}>
          {([['9:16', 'Story'], ['1:1', 'Square'], ['16:9', 'Cinematic']] as const).map(([ratio, label]) =>
            <button key={ratio} type="button" aria-pressed={aspectRatio === ratio} onClick={() => setAspectRatio(ratio)} style={{ padding: '7px 8px', borderRadius: 5, border: '1px solid #ffffff14', fontSize: 10,
              background: aspectRatio === ratio ? '#3b4f70' : '#ffffff05', color: '#dce7f8', cursor: 'pointer' }}>{ratio} {label}</button>)}
        </div>
      </div>
      <div style={{ flex: '1 1 160px' }}>
        <label htmlFor="harmonization-intensity" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 8 }}>Harmonization Intensity <span>{intensity}%</span></label>
        <input id="harmonization-intensity" type="range" min={0} max={100} value={intensity} onChange={event => setIntensity(Number(event.currentTarget.value))} style={{ width: '100%', accentColor: '#82c9da' }} />
      </div>
      <button type="button" disabled={preparing} onClick={async () => {
        setPreparing(true); setNotice(null);
        try { await onPrepare({ aspectRatio, intensity }); setNotice('Scene request downloaded. Harmonization engine is not connected yet.'); }
        catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Unable to prepare the scene request.'); }
        finally { setPreparing(false); }
      }} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid #9ee9f455', background: '#80cbd9', color: '#0b1723', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{preparing ? 'Preparing...' : '⚡ HARMONIZE SCENE'}</button>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 12, fontSize: 10, color: '#9fb0c9' }}>
      <span title="Target lighting context for the future engine" style={{ padding: '4px 7px', borderRadius: 5, background: '#8296be14' }}>Target: Matched to Background Light</span>
      <span style={{ padding: '4px 7px', borderRadius: 5, background: '#8296be14' }}>⚡ 5 Credits · estimate</span>
      <span>Prepare scene request · no credits charged</span>
    </div>
    {notice && <p role="status" style={{ fontSize: 11, color: '#b9cee9', marginTop: 8 }}>{notice}</p>}
  </footer>;
}
