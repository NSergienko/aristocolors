'use client';

import React, { useEffect, useState } from 'react';

type Color = { rgb: number[]; lab: number[]; weight: number; x: number; y: number; luminance: number };
type Telemetry = { palette: { hex: string; lab: number[]; percentage: number }[];
  azimuth: number | null; elevation: number | null; kelvin: number | null; confidence: number };

function xyz(rgb: number[]) {
  const [r, g, b] = rgb.map(value => value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  return [0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b];
}
function lab(rgb: number[]) {
  const white = [0.95047, 1, 1.08883]; // CIELAB, D65 reference white.
  const [x, y, z] = xyz(rgb).map((value, index) => {
    const ratio = value / white[index];
    return ratio > 216 / 24389 ? Math.cbrt(ratio) : (24389 / 27 * ratio + 16) / 116;
  });
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const distance = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);

export function analyzeStyle(image: HTMLCanvasElement): Telemetry | null {
  const context = image.getContext('2d');
  if (!context) return null;
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const colors: Color[] = [];
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const weight = pixels[offset + 3] / 255;
    if (weight <= 0.01) continue;
    const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    const index = offset / 4;
    colors.push({ rgb, lab: lab(rgb), weight, x: (index % image.width) / image.width,
      y: Math.floor(index / image.width) / image.height, luminance: xyz(rgb)[1] });
  }
  if (!colors.length) return null;
  // Fixed farthest-point initialization and fixed iteration count make the palette repeatable.
  const centers = [colors[0].lab];
  while (centers.length < 5) {
    let best = colors[0];
    let maximum = 0;
    for (const color of colors) {
      const score = Math.min(...centers.map(center => distance(color.lab, center)));
      if (score > maximum) { maximum = score; best = color; }
    }
    if (maximum < 1) break;
    centers.push(best.lab);
  }
  let groups = centers.map(() => ({ weight: 0, rgb: [0, 0, 0], lab: [0, 0, 0] }));
  for (let iteration = 0; iteration < 8; iteration++) {
    groups = centers.map(() => ({ weight: 0, rgb: [0, 0, 0], lab: [0, 0, 0] }));
    for (const color of colors) {
      let closest = 0;
      for (let index = 1; index < centers.length; index++) {
        if (distance(color.lab, centers[index]) < distance(color.lab, centers[closest])) closest = index;
      }
      const group = groups[closest];
      group.weight += color.weight;
      for (let channel = 0; channel < 3; channel++) {
        group.rgb[channel] += color.rgb[channel] * color.weight;
        group.lab[channel] += color.lab[channel] * color.weight;
      }
    }
    groups.forEach((group, index) => { if (group.weight) centers[index] = group.lab.map(value => value / group.weight); });
  }
  const total = colors.reduce((sum, color) => sum + color.weight, 0);
  const palette = groups.filter(group => group.weight > 0).sort((a, b) => b.weight - a.weight).map(group => ({
    hex: '#' + group.rgb.map(value => Math.round(value / group.weight).toString(16).padStart(2, '0')).join(''),
    lab: group.lab.map(value => value / group.weight), percentage: group.weight / total * 100,
  }));
  const average = colors.reduce((sum, color) => sum + color.luminance * color.weight, 0) / total;
  const contrast = Math.sqrt(colors.reduce((sum, color) => sum + (color.luminance - average) ** 2 * color.weight, 0) / total);
  const brightTotal = colors.reduce((sum, color) => sum + color.luminance ** 3 * color.weight, 0);
  const centroid = (axis: 'x' | 'y', bright: boolean) => colors.reduce((sum, color) =>
    sum + color[axis] * color.weight * (bright ? color.luminance ** 3 : 1), 0) / (bright ? brightTotal : total);
  const dx = brightTotal ? centroid('x', true) - centroid('x', false) : 0;
  const dy = brightTotal ? centroid('y', true) - centroid('y', false) : 0;
  const directional = contrast > 0.03 && Math.hypot(dx, dy) > 0.025;
  const highlights = colors.filter(color => color.luminance > average + contrast &&
    Math.max(...color.rgb) - Math.min(...color.rgb) < 60);
  let kelvin: number | null = null;
  if (highlights.length > 5) {
    const weight = highlights.reduce((sum, color) => sum + color.weight, 0);
    const rgb = [0, 1, 2].map(channel => highlights.reduce((sum, color) => sum + color.rgb[channel] * color.weight, 0) / weight);
    const [x, y, z] = xyz(rgb);
    const n = (x / (x + y + z) - 0.332) / (0.1858 - y / (x + y + z));
    const estimate = 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
    if (Number.isFinite(estimate) && estimate >= 2000 && estimate <= 12500) kelvin = Math.round(estimate / 100) * 100;
  }
  return { palette, azimuth: directional ? Math.round((Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360) : null,
    elevation: directional ? Math.round(Math.atan2(Math.max(0, -dy), 0.5) * 180 / Math.PI) : null,
    kelvin, confidence: directional ? Math.round(Math.min(0.65, Math.hypot(dx, dy) * contrast * 6) * 100) : 0 };
}

export function StyleDnaPanel({ getSample, label }: { getSample: () => HTMLCanvasElement | null; label: string }) {
  const [data, setData] = useState<Telemetry | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    try { const sample = getSample(); setData(sample ? analyzeStyle(sample) : null); setFailed(false); }
    catch { setFailed(true); setData(null); }
  }, [getSample]);
  return <section style={{ padding: '8px', color: '#aab2c0', fontSize: 12 }}>
    <p style={{ marginBottom: 18, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={label}>{label}</p>
    {!data ? <p>{failed ? 'Unable to read artwork pixels.' : 'No visible artwork pixels to analyze.'}</p> : <>
      <h3 style={{ fontSize: 10, letterSpacing: 1.2, marginBottom: 12 }}>DETERMINISTIC PALETTE · CIELAB</h3>
      {data.palette.map(color => <div key={color.hex + color.lab.join(',')} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ width: 28, height: 28, borderRadius: 5, background: color.hex, border: '1px solid #ffffff20', flexShrink: 0 }} />
        <div style={{ flex: 1 }}><div>{color.hex.toUpperCase()}</div><div style={{ fontSize: 9, color: '#7e899b' }}>L* {color.lab[0].toFixed(1)} a* {color.lab[1].toFixed(1)} b* {color.lab[2].toFixed(1)}</div></div>
        <span style={{ borderRadius: 4, padding: '3px 5px', background: '#ffffff08', fontSize: 10 }}>{color.percentage.toFixed(1)}%</span>
      </div>)}
      <div style={{ marginTop: 22, padding: 12, background: '#20242c', border: '1px solid #ffffff0a', borderRadius: 8 }}>
        <h3 style={{ fontSize: 10, letterSpacing: 1.1, marginBottom: 12 }}>INFERRED LIGHTING</h3>
        <p style={{ marginBottom: 8 }}>Azimuth <strong style={{ float: 'right' }}>{data.azimuth === null ? 'Undetermined' : `${data.azimuth}°`}</strong></p>
        <p style={{ marginBottom: 8 }}>Elevation proxy <strong style={{ float: 'right' }}>{data.elevation === null ? '—' : `${data.elevation}°`}</strong></p>
        <p style={{ marginBottom: 10 }}>Highlight tint <strong>{data.kelvin ? `≈ ${data.kelvin}K · ${data.kelvin < 5000 ? 'Warm' : data.kelvin > 7000 ? 'Cool' : 'Neutral'}` : 'Undetermined'}</strong></p>
        <span style={{ display: 'inline-block', padding: '4px 6px', borderRadius: 4, background: '#8b9fc71a', color: '#b1c3e3', fontSize: 10 }}>{data.confidence}% heuristic confidence</span>
        <p style={{ marginTop: 10, color: '#7e899b', fontSize: 10, lineHeight: 1.6 }}>Image-based estimates from highlight position and color. Surface colors can bias these values; they do not measure physical lights.</p>
      </div>
      <p style={{ marginTop: 12, fontSize: 10, color: '#707887' }}>Alpha-weighted color clusters · D65 reference white</p>
    </>}
  </section>;
}
