import React from 'react';
import { getProjectById } from '@/components/projects/mock-projects';
import { StepOneStudio } from '@/components/studio/step-one-studio';

interface ProjectStudioPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ localImport?: string }>;
}

export async function generateMetadata({ params }: ProjectStudioPageProps) {
  const resolvedParams = await params;
  const project = getProjectById(resolvedParams.id);
  return {
    title: `${project?.title ?? resolvedParams.id} — Studio | AristoColors`,
    description: 'Integrated creative photobashing studio editor',
  };
}

export default async function ProjectStudioPage({ params, searchParams }: ProjectStudioPageProps) {
  const resolvedParams = await params;
  const { localImport } = await searchParams;
  const project = getProjectById(resolvedParams.id);

  return (
    <StepOneStudio
      key={localImport || resolvedParams.id}
      localImportToken={localImport}
      projectId={resolvedParams.id}
      projectTitle={project?.title ?? resolvedParams.id}
      initialArtworkUrl={project?.imageUrl}
    />
  );
}
