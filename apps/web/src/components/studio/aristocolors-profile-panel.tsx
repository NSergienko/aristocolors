'use client';

import React, { useEffect, useState } from 'react';
import { analyzeStyle, fallbackSceneTelemetry, type ScenePixelData, type SceneTelemetry } from '@/lib/studio/engine/scene-analysis';

export function AristoColorsProfilePanel({ getSample, label }: { getSample: () => ScenePixelData | null; label: string }) {
  const [data, setData] = useState<SceneTelemetry>(fallbackSceneTelemetry());
  useEffect(() => {
    try { setData(analyzeStyle(getSample())); }
    catch { setData(fallbackSceneTelemetry()); }
  }, [getSample]);
  return <section style={{ padding: '8px', color: '#aab2c0', fontSize: 12 }}>
    <h2 style={{ fontSize: 12, fontWeight: 600, color: '#e0e8f5', marginBottom: 8 }}>AristoColors Profile</h2>
    <p style={{ marginBottom: 18, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: '#8798b2', fontSize: 11 }} title={label}>{label}</p>
    <>
      <h3 style={{ fontSize: 10, letterSpacing: 1.2, marginBottom: 12 }}>DETERMINISTIC PALETTE · CIELAB</h3>
      {data.palette.map(color => <div key={color.hex + color.lab.join(',')} style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 8, padding: 8, background: '#ffffff03', border: '1px solid #ffffff0a', borderRadius: 8 }}>
        <span aria-label={`Color ${color.hex}`} style={{ width: 38, height: 38, borderRadius: 6, background: color.hex, border: '1px solid #ffffff70', boxShadow: '0 0 0 2px #0005, inset 0 0 0 1px #ffffff15', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#e2eaf7', whiteSpace: 'nowrap' }}>{color.hex.toUpperCase()}</span>
            <span style={{ borderRadius: 4, padding: '3px 4px', background: '#8b9fc71a', border: '1px solid #8b9fc72a', color: '#c5d5ed', fontSize: 10, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{color.percentage.toFixed(1)}%</span>
          </div>
          <div style={{ fontSize: 9, color: '#8895a9', lineHeight: 1.5 }}>L* {color.lab[0].toFixed(1)} · a* {color.lab[1].toFixed(1)} · b* {color.lab[2].toFixed(1)}</div>
        </div>
      </div>)}
      <div style={{ marginTop: 22, padding: 12, background: '#20242c', border: '1px solid #ffffff0a', borderRadius: 8 }}>
        <h3 style={{ fontSize: 10, letterSpacing: 1.1, marginBottom: 12 }}>INFERRED LIGHTING</h3>
        <p style={{ marginBottom: 8 }}>Azimuth <strong style={{ float: 'right' }}>{data.azimuth === null ? 'Undetermined' : `${data.azimuth}°`}</strong></p>
        <p style={{ marginBottom: 8 }}>Elevation proxy <strong style={{ float: 'right' }}>{data.elevation === null ? '—' : `${data.elevation}°`}</strong></p>
        <p style={{ marginBottom: 10 }}>Highlight tint <strong>{data.kelvin ? `≈ ${data.kelvin}K · ${data.kelvin < 5000 ? 'Warm' : data.kelvin > 7000 ? 'Cool' : 'Neutral'}` : 'Undetermined'}</strong></p>
        <span style={{ display: 'inline-block', padding: '4px 6px', borderRadius: 4, background: '#8b9fc71a', color: '#b1c3e3', fontSize: 10 }}>{Math.round(data.confidence * 100)}% heuristic confidence</span>
        <p style={{ marginTop: 10, color: '#7e899b', fontSize: 10, lineHeight: 1.6 }}>Image-based estimates from highlight position and color. Surface colors can bias these values; they do not measure physical lights.</p>
      </div>
      <p style={{ marginTop: 12, fontSize: 10, color: '#707887' }}>Alpha-weighted color clusters · D65 reference white</p>
    </>
  </section>;
}
