'use client';

import React from 'react';
import type { EditableImage, LayerCrop } from './studio-object-transform';
import { emptyCrop } from './studio-object-transform';

export type StackAction = 'front' | 'back' | 'forward' | 'backward';
export type AlignAction = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';
const buttonStyle: React.CSSProperties = { padding: '7px 5px', background: '#242a35', color: '#cbd7e9', fontSize: 10,
  border: '1px solid #ffffff0c', borderRadius: 5, cursor: 'pointer' };
const inputStyle: React.CSSProperties = { width: '100%', background: '#11151c', color: '#dbe6f6', padding: 6,
  border: '1px solid #ffffff15', borderRadius: 4, fontSize: 11 };

export function ArrangeInspector({ object, isBase, canUp, canDown, onStack, onAlign, onFlip, onRotate, onCrop }: {
  object: EditableImage; isBase: boolean; canUp: boolean; canDown: boolean;
  onStack: (action: StackAction) => void; onAlign: (action: AlignAction) => void;
  onFlip: (axis: 'x' | 'y') => void; onRotate: (angle: number) => void; onCrop: (crop: LayerCrop) => void;
}) {
  const angle = ((object.angle % 360) + 360) % 360;
  const crop = object.studioCrop ?? emptyCrop();
  return <section style={{ margin: '20px 8px 0', borderTop: '1px solid #ffffff0a', paddingTop: 16, color: '#aab7ca' }}>
    <h3 style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>Arrange &amp; Align</h3>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 12 }}>
      {([['front', 'Bring to Front', canUp], ['back', 'Send to Back', canDown],
        ['forward', 'Bring Forward', canUp], ['backward', 'Send Backward', canDown]] as const).map(([action, label, enabled]) =>
        <button key={action} type="button" disabled={isBase || !enabled} onClick={() => onStack(action)} style={{ ...buttonStyle, opacity: isBase || !enabled ? 0.4 : 1 }}>{label}</button>)}
    </div>
    {isBase && <p style={{ fontSize: 10, color: '#7d8a9e', marginBottom: 10 }}>Base artwork stays at the bottom.</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 16 }}>
      {([['left', 'Left'], ['center-x', 'Center X'], ['right', 'Right'], ['top', 'Top'], ['center-y', 'Center Y'], ['bottom', 'Bottom']] as const)
        .map(([action, label]) => <button key={action} type="button" title={`Align ${label} to canvas`} onClick={() => onAlign(action)} style={buttonStyle}>{label}</button>)}
    </div>
    <h3 style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>Orientation</h3>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 12 }}>
      <button type="button" aria-pressed={object.flipX} onClick={() => onFlip('x')} style={buttonStyle}>Flip Horizontal</button>
      <button type="button" aria-pressed={object.flipY} onClick={() => onFlip('y')} style={buttonStyle}>Flip Vertical</button>
      <button type="button" onClick={() => onRotate(angle - 90)} style={buttonStyle}>90° CCW</button>
      <button type="button" onClick={() => onRotate(angle + 90)} style={buttonStyle}>90° CW</button>
    </div>
    <label htmlFor="object-angle" style={{ display: 'block', fontSize: 10, marginBottom: 6 }}>Rotation · {angle.toFixed(1)}°</label>
    <input id="object-angle" aria-label="Rotation angle" type="range" min={0} max={360} step={1} value={angle} onChange={event => onRotate(Number(event.currentTarget.value))} style={{ width: '100%', accentColor: '#8b9fc7' }} />
    <input aria-label="Rotation angle in degrees" type="number" min={0} max={360} step={1} value={Number(angle.toFixed(1))} onChange={event => {
      if (event.currentTarget.value !== '' && Number.isFinite(event.currentTarget.valueAsNumber)) onRotate(Math.max(0, Math.min(360, event.currentTarget.valueAsNumber)));
    }} style={{ ...inputStyle, marginTop: 6, marginBottom: 16 }} />
    <h3 style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>Crop &amp; Inset</h3>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {(['top', 'bottom', 'left', 'right'] as const).map(side => <label key={side} style={{ fontSize: 10 }}>
        {side[0].toUpperCase() + side.slice(1)} Inset %
        <input aria-label={`${side} inset percent`} type="number" min={0} max={100} step={1} value={crop[side]} onChange={event => {
          if (event.currentTarget.value === '' || !Number.isFinite(event.currentTarget.valueAsNumber)) return;
          const opposite = side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : side === 'left' ? 'right' : 'left';
          onCrop({ ...crop, [side]: Math.max(0, Math.min(100 - crop[opposite], event.currentTarget.valueAsNumber)) });
        }} style={{ ...inputStyle, marginTop: 5 }} />
      </label>)}
    </div>
    <button type="button" onClick={() => onCrop(emptyCrop())} style={{ ...buttonStyle, width: '100%', marginTop: 10 }}>Reset Crop</button>
  </section>;
}
