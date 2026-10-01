'use client';

import React, { useState, type ReactNode } from 'react';
import { Sidebar, type NavItemId } from './sidebar';
import { Topbar } from './topbar';

export interface AppShellProps {
  activeNavId?: NavItemId;
  planTier?: 'Standard' | 'Pro';
  creditsBalance?: number;
  userName?: string;
  userEmail?: string;
  children: ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeNavId = 'projects',
  planTier = 'Pro',
  creditsBalance = 1000,
  userName = 'Demo Artist',
  userEmail = 'artist@aristocolors.com',
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: 'var(--surface-0)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Sidebar (260px / 72px) */}
      <Sidebar
        activeId={activeNavId}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
      />

      {/* Main Column */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {/* Topbar */}
        <Topbar
          planTier={planTier}
          creditsBalance={creditsBalance}
          userName={userName}
          userEmail={userEmail}
        />

        {/* Content Region */}
        <main
          style={{
            flex: 1,
            padding: '28px 32px',
            maxWidth: '1440px',
            width: '100%',
            margin: '0 auto',
            overflowY: 'auto',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
