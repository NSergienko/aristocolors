import React from 'react';
import { notFound } from 'next/navigation';
import { getProjectById } from '@/components/projects/mock-projects';
import { StepOneStudio } from '@/components/studio/step-one-studio';

interface ProjectStudioPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ localImport?: string }>;
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

export default async function ProjectStudioPage({ params, searchParams }: ProjectStudioPageProps) {
  const resolvedParams = await params;
  const { localImport } = await searchParams;
  const project = getProjectById(resolvedParams.id);

  if (!project) {
    notFound();
  }

  return (
    <StepOneStudio
      key={localImport || project.id}
      localImportToken={localImport}
      projectId={project.id}
      projectTitle={project.title}
      initialArtworkUrl={project.imageUrl}
    />
  );
}
