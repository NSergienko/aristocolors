'use client';

import React, { useState, useEffect } from 'react';
import type { CanvasSelectionInfo, CanvasLayerItem } from '@/components/canvas/canvas-workspace';

export interface StudioInspectorProps {
  selection?: CanvasSelectionInfo | null;
  layers?: CanvasLayerItem[];
  onSelectLayer?: (id?: string) => void;
  onUpdateTransform?: (transform: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    opacity?: number;
    blendMode?: string;
  }) => void;
  onToggleVisibility?: (id?: string) => void;
  onMoveLayerUp?: (id: string) => void;
  onMoveLayerDown?: (id: string) => void;
  onDeleteLayer?: (id: string) => void;
}

export const StudioInspector: React.FC<StudioInspectorProps> = ({
  selection,
  layers = [],
  onSelectLayer,
  onUpdateTransform,
  onToggleVisibility,
  onMoveLayerUp,
  onMoveLayerDown,
  onDeleteLayer,
}) => {
  const isSelected = Boolean(selection?.isSelected);
  const selectedLayerId = selection?.id;

  // Find index of selected layer in layers array (which is ordered top-to-bottom)
  const selectedLayerIndex = layers.findIndex((l) => l.id === selectedLayerId);
  const isTopLayer = selectedLayerIndex === 0;
  const isBottomLayer = selectedLayerIndex === layers.length - 1;

  // Local input states for smooth two-way editing
  const [xVal, setXVal] = useState<string>('400');
  const [yVal, setYVal] = useState<string>('300');
  const [wVal, setWVal] = useState<string>('600');
  const [hVal, setHVal] = useState<string>('400');
  const [rotVal, setRotVal] = useState<string>('0');
  const [opacityVal, setOpacityVal] = useState<number>(100);
  const [blendModeVal, setBlendModeVal] = useState<string>('Normal');

  // Sync inputs when canvas selection values change
  useEffect(() => {
    if (selection?.isSelected) {
      if (selection.x !== undefined) setXVal(String(selection.x));
      if (selection.y !== undefined) setYVal(String(selection.y));
      if (selection.width !== undefined) setWVal(String(selection.width));
      if (selection.height !== undefined) setHVal(String(selection.height));
      if (selection.rotation !== undefined) setRotVal(String(selection.rotation));
      if (selection.opacity !== undefined) setOpacityVal(selection.opacity);
      if (selection.blendMode !== undefined) setBlendModeVal(selection.blendMode);
    }
  }, [
    selection?.isSelected,
    selection?.id,
    selection?.x,
    selection?.y,
    selection?.width,
    selection?.height,
    selection?.rotation,
    selection?.opacity,
    selection?.blendMode,
  ]);

  const handleXChange = (val: string) => {
    setXVal(val);
    const num = parseFloat(val);
    if (!isNaN(num)) onUpdateTransform?.({ x: num });
  };

  const handleYChange = (val: string) => {
    setYVal(val);
    const num = parseFloat(val);
    if (!isNaN(num)) onUpdateTransform?.({ y: num });
  };

  const handleWChange = (val: string) => {
    setWVal(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) onUpdateTransform?.({ width: num });
  };

  const handleHChange = (val: string) => {
    setHVal(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) onUpdateTransform?.({ height: num });
  };

  const handleRotChange = (val: string) => {
    setRotVal(val);
    const num = parseFloat(val.replace('°', ''));
    if (!isNaN(num)) onUpdateTransform?.({ rotation: num });
  };

  const handleOpacityChange = (val: number) => {
    setOpacityVal(val);
    onUpdateTransform?.({ opacity: val });
  };

  const handleBlendModeChange = (val: string) => {
    setBlendModeVal(val);
    onUpdateTransform?.({ blendMode: val });
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--text-tertiary)',
    padding: '12px 16px 8px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    userSelect: 'none',
  };

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'var(--text-tertiary)',
    fontFamily: 'var(--font-mono)',
    display: 'block',
    marginBottom: '4px',
  };

  const fieldInputStyle: React.CSSProperties = {
    width: '100%',
    height: '28px',
    backgroundColor: 'var(--surface-0)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    padding: '0 8px',
    outline: 'none',
    transition: 'border-color var(--transition-fast)',
  };

  const compactBtnStyle = (disabled: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    backgroundColor: 'var(--surface-0)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-xs)',
    color: disabled ? 'var(--text-tertiary)' : 'var(--text-secondary)',
    fontSize: '11px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transition: 'background-color var(--transition-fast), color var(--transition-fast)',
  });

  return (
    <aside
      aria-label="Studio Inspector"
      style={{
        width: '320px',
        backgroundColor: 'var(--surface-1)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* 1. Dynamic Layers Section */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={sectionHeaderStyle}>
          <span>Layers</span>
          <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
            {layers.length} {layers.length === 1 ? 'layer' : 'layers'}
          </span>
        </div>

        {/* Selected Layer Stacking & Delete Actions Bar */}
        {isSelected && selectedLayerId && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              backgroundColor: 'var(--surface-0)',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  marginRight: '2px',
                }}
              >
                Order:
              </span>
              <button
                type="button"
                disabled={isTopLayer}
                onClick={() => onMoveLayerUp?.(selectedLayerId)}
                title={isTopLayer ? 'Already at top' : 'Move Layer Up (Bring Forward)'}
                style={compactBtnStyle(isTopLayer)}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="18 15 12 9 6 15" />
                </svg>
                <span>Up</span>
              </button>
              <button
                type="button"
                disabled={isBottomLayer}
                onClick={() => onMoveLayerDown?.(selectedLayerId)}
                title={isBottomLayer ? 'Already at bottom' : 'Move Layer Down (Send Backward)'}
                style={compactBtnStyle(isBottomLayer)}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span>Down</span>
              </button>
            </div>

            <button
              type="button"
              disabled={selection?.isBase}
              onClick={() => onDeleteLayer?.(selectedLayerId)}
              title={selection?.isBase ? 'Base artwork is protected' : 'Delete Selected Layer'}
              style={{
                ...compactBtnStyle(Boolean(selection?.isBase)),
                color: '#f87171',
                borderColor: 'rgba(239, 68, 68, 0.25)',
              }}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              <span>Delete</span>
            </button>
          </div>
        )}

        {/* Layers List */}
        {layers.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
              }}
            >
              No layers
            </span>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-tertiary)',
                lineHeight: 1.4,
                maxWidth: '200px',
              }}
            >
              Add an image to start building your composite.
            </span>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '6px 8px',
              gap: '2px',
            }}
          >
            {layers.map((layer) => {
              const layerIsSelected = selectedLayerId === layer.id;
              const isVisible = layer.visible;

              return (
                <div
                  key={layer.id}
                  onClick={() => onSelectLayer?.(layer.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: layerIsSelected
                      ? 'rgba(0, 240, 255, 0.08)'
                      : 'transparent',
                    border: layerIsSelected
                      ? '1px solid rgba(0, 240, 255, 0.3)'
                      : '1px solid transparent',
                    cursor: 'pointer',
                    transition:
                      'background-color var(--transition-fast), border-color var(--transition-fast)',
                  }}
                >
                  {/* Visibility Toggle Icon */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility?.(layer.id);
                    }}
                    title={isVisible ? 'Hide layer' : 'Show layer'}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: isVisible
                        ? layerIsSelected
                          ? 'var(--accent-cyan)'
                          : 'var(--text-secondary)'
                        : 'var(--text-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isVisible ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    )}
                  </button>

                  {/* Thumbnail / Type Icon */}
                  <div
                    style={{
                      color: layerIsSelected
                        ? 'var(--accent-cyan)'
                        : 'var(--text-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {layer.type === 'paint' ? (
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
                        <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4.49 2.02 2.2 0 3.51-1.34 3.51-3.02 0-.75-.3-1.44-.82-1.94" />
                      </svg>
                    ) : (
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                    )}
                  </div>

                  {/* Layer Name */}
                  <span
                    title={layer.name}
                    style={{
                      flex: 1,
                      fontSize: '12px',
                      fontWeight: layerIsSelected ? 600 : 400,
                      color: layerIsSelected
                        ? 'var(--text-primary)'
                        : isVisible
                        ? 'var(--text-secondary)'
                        : 'var(--text-tertiary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {layer.name}
                  </span>

                  {/* Layer Type Badge */}
                  <span
                    style={{
                      fontSize: '9px',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                      padding: '2px 5px',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'var(--surface-0)',
                      color: layerIsSelected
                        ? 'var(--accent-cyan)'
                        : 'var(--text-tertiary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {layer.type === 'paint' ? 'PAINT' : 'IMAGE'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Active Selection vs. Empty Selection State */}
      {isSelected ? (
        <>
          {/* Transform Section */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={sectionHeaderStyle}>
              <span>Transform</span>
            </div>

            <div
              style={{
                padding: '12px 16px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
              }}
            >
              <div>
                <label style={fieldLabelStyle}>X (px)</label>
                <input
                  type="number"
                  value={xVal}
                  onChange={(e) => handleXChange(e.target.value)}
                  style={fieldInputStyle}
                />
              </div>

              <div>
                <label style={fieldLabelStyle}>Y (px)</label>
                <input
                  type="number"
                  value={yVal}
                  onChange={(e) => handleYChange(e.target.value)}
                  style={fieldInputStyle}
                />
              </div>

              <div>
                <label style={fieldLabelStyle}>Width (px)</label>
                <input
                  type="number"
                  value={wVal}
                  onChange={(e) => handleWChange(e.target.value)}
                  style={fieldInputStyle}
                />
              </div>

              <div>
                <label style={fieldLabelStyle}>Height (px)</label>
                <input
                  type="number"
                  value={hVal}
                  onChange={(e) => handleHChange(e.target.value)}
                  style={fieldInputStyle}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={fieldLabelStyle}>Rotation (°)</label>
                <input
                  type="number"
                  value={rotVal}
                  onChange={(e) => handleRotChange(e.target.value)}
                  style={fieldInputStyle}
                />
              </div>
            </div>
          </div>

          {/* Appearance Section */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={sectionHeaderStyle}>
              <span>Appearance</span>
            </div>

            <div
              style={{
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <label style={{ ...fieldLabelStyle, marginBottom: 0 }}>
                    Opacity
                  </label>
                  <span
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {opacityVal}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={opacityVal}
                  onChange={(e) => handleOpacityChange(Number(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: 'var(--accent-cyan)',
                    cursor: 'pointer',
                  }}
                />
              </div>

              <div>
                <label style={fieldLabelStyle}>Blend Mode</label>
                <select
                  value={blendModeVal}
                  onChange={(e) => handleBlendModeChange(e.target.value)}
                  style={{
                    ...fieldInputStyle,
                    cursor: 'pointer',
                  }}
                >
                  <option value="Normal">Normal</option>
                  <option value="Multiply">Multiply</option>
                  <option value="Screen">Screen</option>
                  <option value="Overlay">Overlay</option>
                </select>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Empty Selection State */
        <div
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: 'var(--surface-0)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-tertiary)',
              marginBottom: '4px',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
              <path d="m13 13 6 6" />
            </svg>
          </div>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
            }}
          >
            No layer selected
          </span>
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
              lineHeight: 1.4,
              maxWidth: '220px',
            }}
          >
            Select an object on the canvas or from the Layers panel to inspect its
            properties.
          </span>
        </div>
      )}
    </aside>
  );
};
