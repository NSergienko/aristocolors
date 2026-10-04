'use client';

import React, { useState } from 'react';

export type HarmonizationSettings = { aspectRatio: '9:16' | '1:1' | '16:9'; intensity: number };

export function HarmonizationDock({ onPrepare, onStart }: { onPrepare: (settings: HarmonizationSettings) => Promise<void>; onStart: () => void }) {
  const [aspectRatio, setAspectRatio] = useState<HarmonizationSettings['aspectRatio']>('16:9');
  const [intensity, setIntensity] = useState(80);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  return <section aria-label="Scene Harmonization" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #ffffff12', color: '#dce7f8', minHeight: 0, overflowY: 'auto' }}>
    <h2 className="!text-xs !font-medium uppercase !tracking-wider !text-zinc-400 !mb-2" style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>Scene Harmonization</h2>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ flex: '0 0 auto' }}>
        <div className="items-center" role="group" aria-label="Output aspect ratio" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {([['9:16', 'Story'], ['1:1', 'Square'], ['16:9', 'Cinematic']] as const).map(([ratio, label]) =>
            <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" key={ratio} type="button" title={`${ratio} ${label}`} aria-pressed={aspectRatio === ratio} onClick={() => setAspectRatio(ratio)} style={{ padding: '6px 3px', borderRadius: 5, border: '1px solid #ffffff14', fontSize: 10, whiteSpace: 'nowrap',
              background: aspectRatio === ratio ? '#3b4f70' : '#ffffff05', color: '#dce7f8', cursor: 'pointer' }}>{ratio}</button>)}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <label className="gap-2 leading-relaxed" htmlFor="harmonization-intensity" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>Harmonization Intensity <span>{intensity}%</span></label>
        <input className="!accent-cyan-300/80" id="harmonization-intensity" type="range" min={0} max={100} value={intensity} onChange={event => setIntensity(Number(event.currentTarget.value))} style={{ width: '100%', accentColor: '#82c9da' }} />
      </div>
      <button className="hover:!bg-cyan-200 !bg-cyan-300/80 !text-zinc-950 !border-cyan-200/20 transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed" type="button" disabled={preparing} onClick={async () => {
        onStart();
        setPreparing(true); setNotice(null);
        try { await onPrepare({ aspectRatio, intensity }); setNotice('Scene request downloaded. Harmonization engine is not connected yet.'); }
        catch (cause) { setNotice(cause instanceof Error ? cause.message : 'Unable to prepare the scene request.'); }
        finally { setPreparing(false); }
      }} style={{ width: '100%', padding: '9px 4px', borderRadius: 7, border: '1px solid #9ee9f455', background: '#80cbd9', color: '#0b1723', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{preparing ? 'Preparing...' : '⚡ HARMONIZE SCENE'}</button>
    </div>
    <p title="Estimated credits; target lighting context. No credits charged when preparing a request." style={{ marginTop: 8, fontSize: 9, color: '#9fb0c9' }}>⚡ 5 Credits • Matched to Light</p>
    {notice && <p role="status" style={{ marginTop: 6, fontSize: 10, lineHeight: 1.5, color: '#9fb0c9' }}>{notice}</p>}
  </section>;
}
