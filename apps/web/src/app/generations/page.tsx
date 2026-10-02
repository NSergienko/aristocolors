'use client';

import React from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/layout/page-header';
import { GenerationsFeed } from '@/components/generations/generations-feed';

export default function GenerationsPage() {
  return (
    <AppShell activeNavId="generations">
      {/* Header */}
      <PageHeader
        title="Generations"
        subtitle="Recent harmonization and refinement results."
      />

      {/* Main Generations Feed View */}
      <GenerationsFeed />
    </AppShell>
  );
}
