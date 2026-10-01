'use client';

import React, { useState } from 'react';

export interface NewProjectCardProps {
  onCreate?: () => void;
  onDropFiles?: (files: FileList) => void;
}

export const NewProjectCard: React.FC<NewProjectCardProps> = ({ onCreate, onDropFiles }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      onClick={onCreate}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onDropFiles?.(e.dataTransfer.files);
        }
      }}
      style={{
        borderRadius: 'var(--radius-md)',
        border: `1px dashed ${isDragOver ? 'var(--accent-cyan)' : 'var(--border-medium)'}`,
        backgroundColor: isDragOver ? 'var(--surface-3)' : 'var(--surface-1)',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        cursor: 'pointer',
        minHeight: '220px',
        transition: 'all var(--transition-fast)',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-strong)';
        e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
      }}
      onMouseLeave={(e) => {
        if (!isDragOver) {
          e.currentTarget.style.borderColor = 'var(--border-medium)';
          e.currentTarget.style.backgroundColor = 'var(--surface-1)';
        }
      }}
    >
      {/* Plus Icon Box */}
      <div
        style={{
          width: '42px',
          height: '42px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--surface-2)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '14px',
          color: 'var(--accent-cyan)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>

      <h4
        style={{
          fontFamily: 'var(--font-brand)',
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '4px',
        }}
      >
        New Project
      </h4>

      <p
        style={{
          fontSize: '12px',
          color: 'var(--text-tertiary)',
          maxWidth: '180px',
          lineHeight: 1.4,
          marginBottom: '12px',
        }}
      >
        Start blank or drop source assets
      </p>

      {/* Drag & drop affordance indicator */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--surface-2)',
          border: '1px solid var(--border-subtle)',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span>DROP TO IMPORT</span>
      </div>
    </div>
  );
};
