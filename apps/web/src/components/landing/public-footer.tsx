import React from 'react';

export const PublicFooter: React.FC = () => {
  return (
    <footer
      style={{
        backgroundColor: 'var(--surface-0)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '36px clamp(20px, 4vw, 48px) 24px clamp(20px, 4vw, 48px)',
      }}
    >
      <div
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '36px',
            flexWrap: 'wrap',
          }}
        >
          {/* Brand & Description */}
          <div style={{ maxWidth: '380px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
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
              <span style={{ fontFamily: 'var(--font-brand)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                AristoColors
              </span>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              AI photobashing and Style DNA harmonization for digital artists, game studios and commercial production teams.
            </p>
          </div>

          {/* Navigation Columns */}
          <div style={{ display: 'flex', gap: '48px', flexWrap: 'wrap' }}>
            <div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-primary)',
                  display: 'block',
                  marginBottom: '10px',
                }}
              >
                Platform
              </span>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <li><a href="#workflow" style={{ transition: 'color var(--transition-fast)' }}>Workflow</a></li>
                <li><a href="#showcase" style={{ transition: 'color var(--transition-fast)' }}>Showcase</a></li>
                <li><a href="#pricing" style={{ transition: 'color var(--transition-fast)' }}>Pricing</a></li>
                <li><a href="/login" style={{ transition: 'color var(--transition-fast)' }}>Launch Studio</a></li>
              </ul>
            </div>

            <div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-primary)',
                  display: 'block',
                  marginBottom: '10px',
                }}
              >
                Legal & Security
              </span>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <li><a href="#">Privacy Policy</a></li>
                <li><a href="#">Terms of Service</a></li>
                <li><a href="#">Security Overview</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Clear typography, copyright & WayForPay statement */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '18px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <span>© {new Date().getFullYear()} AristoColors Studio. All rights reserved.</span>
          <span style={{ color: 'var(--text-tertiary)' }}>
            Billing and subscription management powered by WayForPay.
          </span>
        </div>
      </div>
    </footer>
  );
};
