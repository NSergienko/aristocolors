'use client';

import React, { useRef, useState } from 'react';
import { getAcceptedHarmonizedImage, type HarmonizationResult } from '@/lib/studio/harmonization-contract';


export function HarmonizedResultView({ result, onError, finish, onCompose }: {
  result: HarmonizationResult; onError: (message: string | null) => void;
  finish: boolean; onCompose: () => void;
}) {
  const [mode, setMode] = useState<'split' | 'before' | 'after'>('split');
  const [split, setSplit] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);
  const updateSplit = (clientX: number) => {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (bounds?.width) setSplit(Math.max(0, Math.min(100, (clientX - bounds.left) / bounds.width * 100)));
  };
  const ratio = result.audit.width / result.audit.height;
  const showBefore = !finish && result.review && mode !== 'after';
  return <section aria-label={finish ? 'Finished composition' : 'Before and after harmonization review'} style={{ position: 'absolute', inset: 8, display: 'flex', flexDirection: 'column', gap: 12, background: '#141619', padding: 12, zIndex: 5 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <h2 style={{ fontSize: 13, fontWeight: 500 }}>{finish ? 'Finished Composition' : 'Harmonization Review'}</h2>
      {!finish && result.review && <div role="group" aria-label="Comparison mode" style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
        {([['split', 'Split View'], ['before', 'Before'], ['after', 'After']] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} style={{ padding: '6px 8px', fontSize: 11, borderRadius: 5, border: mode === value ? '1px solid #80cbd94d' : '1px solid #27272a', background: mode === value ? '#80cbd910' : '#18181b', color: '#e4e4e7' }}>{label}</button>)}
      </div>}
      <button type="button" onClick={onCompose} style={{ padding: '6px 8px', borderRadius: 5, background: '#18181b', color: '#a1a1aa', fontSize: 11 }}>Compose</button>
    </div>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={frameRef} style={{ position: 'relative', width: `min(100%, calc((100dvh - 220px) * ${ratio}))`, aspectRatio: String(ratio), overflow: 'hidden', background: '#090b0d' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={finish ? getAcceptedHarmonizedImage(result) ?? undefined : result.review?.refinedImageUrl ?? result.resultImageUrl} alt={finish ? 'Finished composition' : 'After harmonization'} onError={() => onError('Unable to display the harmonized result. Retry harmonization.')} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {showBefore && <img src={result.review!.beforeImageUrl} alt="Before harmonization" onError={() => onError('Unable to display the original comparison. Retry harmonization.')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', clipPath: mode === 'split' ? `inset(0 ${100 - split}% 0 0)` : undefined }} />}
        {!finish && result.review && mode === 'split' && <>
          <span style={{ position: 'absolute', top: 10, left: 10, padding: '4px 6px', background: '#0009', fontSize: 10, color: '#fff', pointerEvents: 'none' }}>Before</span>
          <span style={{ position: 'absolute', top: 10, right: 10, padding: '4px 6px', background: '#0009', fontSize: 10, color: '#fff', pointerEvents: 'none' }}>After</span>
          <div role="slider" tabIndex={0} aria-label="Before after comparison divider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(split)} aria-valuetext={`${Math.round(split)}% Before`}
            onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); updateSplit(event.clientX); }}
            onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateSplit(event.clientX); }}
            onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
            onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); setSplit(value => event.key === 'Home' ? 0 : event.key === 'End' ? 100 : Math.max(0, Math.min(100, value + (event.key === 'ArrowLeft' ? -2 : 2)))); } }}
            style={{ position: 'absolute', top: 0, bottom: 0, left: `${split}%`, width: 20, transform: 'translateX(-50%)', cursor: 'ew-resize', touchAction: 'none' }}>
            <div style={{ position: 'absolute', left: 9, top: 0, bottom: 0, width: 2, background: '#b8e8ee' }} />
            <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#17282c', border: '1px solid #80cbd9', color: '#e4f6f8' }}>⟷</span>
          </div>
        </>}
      </div>
    </div>
    {!result.review && <p style={{ color: '#a1a1aa', fontSize: 11 }}>This older result has no Before snapshot. Run Harmonize Scene again to enable comparison.</p>}
    <p style={{ fontSize: 10, color: '#a1a1aa' }}>{result.audit.width} × {result.audit.height} · {result.audit.appliedIntensity}% harmonization intensity</p>
  </section>;
}
