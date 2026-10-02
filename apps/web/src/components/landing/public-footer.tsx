import React from 'react';

export const PublicFooter: React.FC = () => {
  return (
    <footer
      style={{
        backgroundColor: 'var(--surface-0)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '28px clamp(20px, 4vw, 48px) 20px clamp(20px, 4vw, 48px)',
      }}
    >
      <div
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Main Row: Brand + Short descriptor on left, compact links on right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '24px',
            flexWrap: 'wrap',
          }}
        >
          {/* Brand & Descriptor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: 'var(--radius-xs)',
                  background: 'linear-gradient(135deg, #FF9A3D 0%, #15171D 50%, #00F0FF 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span style={{ fontFamily: 'var(--font-brand)', fontSize: '11px', fontWeight: 800, color: '#fff' }}>
                  A
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-brand)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                AristoColors
              </span>
            </div>
            <span style={{ color: 'var(--border-strong)', fontSize: '13px' }}>•</span>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
              AI photobashing and Style DNA harmonization for digital artists and studios.
            </p>
          </div>

          {/* Compact navigation & legal links */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              flexWrap: 'wrap',
              fontSize: '13px',
            }}
          >
            <a href="#workflow" className="nav-link">Workflow</a>
            <a href="#showcase" className="nav-link">Showcase</a>
            <a href="#pricing" className="nav-link">Pricing</a>
            <a href="/login" className="nav-link">Launch Studio</a>
            <span style={{ color: 'var(--border-medium)', margin: '0 -4px' }}>|</span>
            <a href="#" className="nav-link" style={{ color: 'var(--text-tertiary)' }}>Privacy</a>
            <a href="#" className="nav-link" style={{ color: 'var(--text-tertiary)' }}>Terms</a>
          </nav>
        </div>

        {/* Small bottom copyright / legal row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '12px',
            color: 'var(--text-tertiary)',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span>© {new Date().getFullYear()} AristoColors Studio. All rights reserved.</span>
          <span>Billing and subscription management powered by WayForPay.</span>
        </div>
      </div>
    </footer>
  );
};
