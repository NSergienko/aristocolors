import React from 'react';
import { Badge } from '@/components/ui/badge';

export interface TopbarProps {
  planTier?: 'Standard' | 'Pro';
  creditsBalance?: number;
  userName?: string;
  userEmail?: string;
}

export const Topbar: React.FC<TopbarProps> = ({
  planTier = 'Pro',
  creditsBalance = 1000,
  userName = 'Demo Artist',
  userEmail = 'artist@aristocolors.com',
}) => {
  return (
    <header
      style={{
        height: '60px',
        backgroundColor: 'var(--surface-1)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        userSelect: 'none',
      }}
    >
      {/* Left indicator / Workspace breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}
        >
          Workspace
        </span>
        <span style={{ color: 'var(--border-strong)', fontSize: '12px' }}>/</span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          Primary Studio
        </span>
      </div>

      {/* Right controls: Plan, Credits, User */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Plan Indicator Badge */}
        <Badge variant={planTier === 'Pro' ? 'amber' : 'cyan'} dot>
          {planTier} Plan
        </Badge>

        {/* Credits Indicator */}
        <div
          title="Available generation credits"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            backgroundColor: 'var(--surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {/* Energy / Lightning Icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent-cyan)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '0.02em',
            }}
          >
            {creditsBalance.toLocaleString()} <span style={{ color: 'var(--accent-cyan)' }}>CR</span>
          </span>
        </div>

        {/* Divider */}
        <div
          style={{
            width: '1px',
            height: '24px',
            backgroundColor: 'var(--border-subtle)',
          }}
        />

        {/* User / Avatar placeholder */}
        <div
          title={`${userName} (${userEmail})`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--surface-3)',
              border: '1px solid var(--border-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-brand)',
              fontWeight: 700,
              fontSize: '12px',
              color: 'var(--text-primary)',
            }}
          >
            {userName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()}
            {/* Emerald active indicator */}
            <span
              style={{
                position: 'absolute',
                bottom: '-1px',
                right: '-1px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-emerald)',
                border: '2px solid var(--surface-1)',
                boxShadow: '0 0 6px var(--accent-emerald)',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                lineHeight: '14px',
              }}
            >
              {userName}
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-tertiary)',
                lineHeight: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {planTier.toUpperCase()}_TIER
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
