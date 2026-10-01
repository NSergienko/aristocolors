import React from 'react';
import { Button } from '@/components/ui/button';

export const PublicHeader: React.FC = () => {
  return (
    <header
      style={{
        height: '64px',
        backgroundColor: 'rgba(16, 17, 22, 0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 clamp(20px, 4vw, 48px)',
      }}
    >
      {/* Brand logo */}
      <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(135deg, #FF9A3D 0%, #15171D 50%, #00F0FF 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-brand)',
              fontWeight: 800,
              fontSize: '13px',
              color: '#fff',
            }}
          >
            A
          </span>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: '16px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: 'var(--text-primary)',
          }}
        >
          AristoColors
        </span>
      </a>

      {/* Navigation */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
        <a href="#workflow" className="nav-link">
          Workflow
        </a>
        <a href="#showcase" className="nav-link">
          Showcase
        </a>
        <a href="#pricing" className="nav-link">
          Pricing
        </a>
      </nav>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <a href="/login" className="nav-link" style={{ padding: '6px 10px' }}>
          Sign In
        </a>
        <a
          href="/projects"
          className="btn-base btn-primary btn-sm"
          style={{ textDecoration: 'none' }}
        >
          Launch Studio
        </a>
      </div>
    </header>
  );
};
