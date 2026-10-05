'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HarmonizationSettings } from './harmonization-dock';

export type CompositionPreview = { src: string; width: number; height: number };

export function CompositionPreviewModal({ snapshot, onClose, onProceed }: {
  snapshot: CompositionPreview; onClose: () => void; onProceed: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [ratio, setRatio] = useState<HarmonizationSettings['aspectRatio']>('16:9');
  const [ratioWidth, ratioHeight] = ratio.split(':').map(Number);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby="composition-preview-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => event.stopPropagation()}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="bg-black/85 backdrop-blur-md"
      style={{ position: 'fixed', inset: 0, margin: 0, width: '100vw', height: '100dvh', maxWidth: 'none', maxHeight: 'none', border: 0, padding: 24, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', color: '#e4e4e7' }}>
      <div onClick={event => { if (event.target === event.currentTarget) onClose(); }} style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <section style={{ width: 'min(1120px, 100%)', maxHeight: '100%', display: 'flex', flexDirection: 'column', background: '#111316', border: '1px solid #ffffff12', borderRadius: 12, overflow: 'hidden' }}>
          <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, padding: '16px 20px', borderBottom: '1px solid #ffffff0c', flexShrink: 0 }}>
            <h2 id="composition-preview-title" style={{ fontSize: 14, fontWeight: 500, marginRight: 'auto' }}>Composition Preview</h2>
            <div role="group" aria-label="Preview format" style={{ display: 'flex', gap: 6 }}>
              {([['16:9', 'Cinematic'], ['1:1', 'Square'], ['9:16', 'Story']] as const).map(([value, label]) =>
                <button key={value} type="button" aria-pressed={ratio === value} onClick={() => setRatio(value)}
                  className="hover:!bg-zinc-800 transition-colors"
                  style={{ padding: '7px 10px', borderRadius: 6, fontSize: 11, border: ratio === value ? '1px solid #80cbd94d' : '1px solid #ffffff0c', background: ratio === value ? '#80cbd910' : '#18181b', color: ratio === value ? '#f0fafb' : '#a1a1aa', cursor: 'pointer' }}>{value} {label}</button>)}
            </div>
            <button type="button" aria-label="Close composition preview" autoFocus onClick={onClose} className="hover:!bg-zinc-800" style={{ width: 28, height: 28, borderRadius: 6, background: 'transparent', color: '#a1a1aa', cursor: 'pointer' }}>✕</button>
          </header>
          <div style={{ flex: 1, minHeight: 0, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <div style={{ position: 'relative', width: `min(100%, calc((100dvh - 260px) * ${ratioWidth / ratioHeight}))`, aspectRatio: `${ratioWidth} / ${ratioHeight}`, background: '#090b0d', border: '1px solid #ffffff26' }}>
              {/* This frame contains a snapshot only; it never clips or changes editor objects. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={snapshot.src} alt="Current composition preview" className="object-contain" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
              <div aria-hidden="true" style={{ position: 'absolute', inset: '5%', border: '1px dashed #ffffff20', pointerEvents: 'none' }} />
            </div>
          </div>
          <footer style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid #ffffff0c', flexShrink: 0 }}>
            <p style={{ marginRight: 'auto', fontSize: 11, color: '#a1a1aa' }}>{snapshot.width} × {snapshot.height} • Ready for Harmonization</p>
            <button type="button" onClick={onClose} className="hover:!bg-zinc-800" style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #27272a', background: '#18181b', color: '#e4e4e7', fontSize: 12, cursor: 'pointer' }}>Close</button>
            <button type="button" onClick={onProceed} className="hover:!bg-cyan-200" style={{ padding: '8px 12px', borderRadius: 6, background: '#80cbd9', color: '#0b1723', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>⚡ Proceed to Harmonize</button>
          </footer>
        </section>
      </div>
    </dialog>, document.body,
  );
}
