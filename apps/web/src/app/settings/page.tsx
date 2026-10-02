'use client';

import React from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsPanel } from '@/components/settings/settings-panel';

export default function SettingsPage() {
  return (
    <AppShell activeNavId="settings">
      {/* Page Header */}
      <PageHeader
        title="Settings"
        subtitle="Manage your account and workspace preferences."
      />

      {/* Settings Panel */}
      <SettingsPanel />
    </AppShell>
  );
}
