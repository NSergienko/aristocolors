'use client';

import React, { useState } from 'react';

export type StudioTool =
  | 'select'
  | 'move'
  | 'transform'
  | 'mask'
  | 'brush'
  | 'eraser'
  | 'crop';

interface ToolItem {
  id: StudioTool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const TOOLS: readonly ToolItem[] = [
  {
    id: 'select',
    label: 'Select',
    shortcut: 'V',
    icon: (
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
    ),
  },
  {
    id: 'move',
    label: 'Move',
    shortcut: 'M',
    icon: (
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
        <polyline points="5 9 2 12 5 15" />
        <polyline points="9 5 12 2 15 5" />
        <polyline points="15 19 12 22 9 19" />
        <polyline points="19 9 22 12 19 15" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="12" y1="2" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    id: 'transform',
    label: 'Transform',
    shortcut: 'T',
    icon: (
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
        <path d="M4 8V4h4" />
        <path d="M20 8V4h-4" />
        <path d="M4 16v4h4" />
        <path d="M20 16v4h-4" />
        <rect x="7" y="7" width="10" height="10" rx="1" />
      </svg>
    ),
  },
  {
    id: 'mask',
    label: 'Mask',
    shortcut: 'Q',
    icon: (
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
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18a9 9 0 0 0 0-18z" />
      </svg>
    ),
  },
  {
    id: 'brush',
    label: 'Brush',
    shortcut: 'B',
    icon: (
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
        <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
        <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4.49 2.02 2.2 0 3.51-1.34 3.51-3.02 0-.75-.3-1.44-.82-1.94" />
      </svg>
    ),
  },
  {
    id: 'eraser',
    label: 'Eraser',
    shortcut: 'E',
    icon: (
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
        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
        <path d="M22 21H7" />
        <path d="m5 11 9 9" />
      </svg>
    ),
  },
  {
    id: 'crop',
    label: 'Crop',
    shortcut: 'C',
    icon: (
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
        <path d="M6 2v14a2 2 0 0 0 2 2h14" />
        <path d="M18 22V8a2 2 0 0 0-2-2H2" />
      </svg>
    ),
  },
];

export interface StudioToolstripProps {
  activeTool?: StudioTool;
  onToolSelect?: (tool: StudioTool) => void;
}

const FUNCTIONAL_TOOLS: readonly StudioTool[] = [
  'select',
  'move',
  'transform',
  'brush',
];

const DISABLED_TOOLTIPS: Partial<Record<StudioTool, string>> = {
  mask: 'Mask (Phase 4 Pipeline Required)',
  eraser: 'Eraser (Phase 4 Pipeline Required)',
  crop: 'Crop (Phase 4 Feature)',
};

export const StudioToolstrip: React.FC<StudioToolstripProps> = ({
  activeTool: controlledTool,
  onToolSelect,
}) => {
  const [internalTool, setInternalTool] = useState<StudioTool>('select');
  const activeTool = controlledTool ?? internalTool;

  const handleSelect = (toolId: StudioTool) => {
    if (!FUNCTIONAL_TOOLS.includes(toolId)) return;
    setInternalTool(toolId);
    onToolSelect?.(toolId);
  };

  return (
    <aside
      aria-label="Studio Tools"
      style={{
        width: '48px',
        backgroundColor: 'var(--surface-1)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 0',
        gap: '6px',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {TOOLS.map((tool) => {
        const isFunctional = FUNCTIONAL_TOOLS.includes(tool.id);
        const isActive = isFunctional && activeTool === tool.id;

        return (
          <button
            key={tool.id}
            type="button"
            disabled={!isFunctional}
            title={
              isFunctional
                ? `${tool.label} (${tool.shortcut})`
                : DISABLED_TOOLTIPS[tool.id] || `${tool.label} (Unavailable)`
            }
            onClick={() => handleSelect(tool.id)}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: isActive
                ? '1px solid rgba(0, 240, 255, 0.4)'
                : '1px solid transparent',
              backgroundColor: isActive
                ? 'rgba(0, 240, 255, 0.12)'
                : 'transparent',
              color: isActive
                ? 'var(--accent-cyan)'
                : isFunctional
                ? 'var(--text-secondary)'
                : 'rgba(255, 255, 255, 0.2)',
              cursor: isFunctional ? 'pointer' : 'not-allowed',
              opacity: isFunctional ? 1 : 0.35,
              transition:
                'background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast)',
            }}
          >
            {tool.icon}
          </button>
        );
      })}
    </aside>
  );
};
