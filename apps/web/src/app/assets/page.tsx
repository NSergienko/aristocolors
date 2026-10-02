'use client';

import React from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { AssetsLibrary } from '@/components/assets/assets-library';

export default function AssetsPage() {
  const handleUploadClick = () => {
    // UI-only action for now
    console.log('Upload asset clicked');
  };

  return (
    <AppShell activeNavId="assets">
      {/* Header */}
      <PageHeader
        title="Assets"
        subtitle="Organize and inspect plates, references, textures, and harmonized composites."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={handleUploadClick}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            }
          >
            Upload Asset
          </Button>
        }
      />

      {/* Main Assets Library View */}
      <AssetsLibrary />
    </AppShell>
  );
}
