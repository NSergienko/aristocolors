import React from 'react';
import { notFound } from 'next/navigation';
import { getProjectById } from '@/components/projects/mock-projects';
import { StudioShell } from '@/components/studio/studio-shell';

interface ProjectStudioPageProps {
  params: Promise<{ id: string }> | { id: string };
}

export async function generateMetadata({ params }: ProjectStudioPageProps) {
  const resolvedParams = await params;
  const project = getProjectById(resolvedParams.id);
  if (!project) {
    return {
      title: 'Project Not Found | AristoColors',
    };
  }
  return {
    title: `${project.title} — Studio | AristoColors`,
    description: 'Integrated creative photobashing studio editor',
  };
}

export default async function ProjectStudioPage({ params }: ProjectStudioPageProps) {
  const resolvedParams = await params;
  const project = getProjectById(resolvedParams.id);

  if (!project) {
    notFound();
  }

  return (
    <StudioShell
      projectId={project.id}
      projectTitle={project.title}
      initialArtworkUrl={project.imageUrl}
    />
  );
}
