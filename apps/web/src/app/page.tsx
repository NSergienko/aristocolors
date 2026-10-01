import { PublicHeader } from '@/components/landing/public-header';
import { LandingHero } from '@/components/landing/landing-hero';
import { WorkflowSection } from '@/components/landing/workflow-section';
import { ShowcaseSection } from '@/components/landing/showcase-section';
import { PricingSection } from '@/components/landing/pricing-section';
import { PublicFooter } from '@/components/landing/public-footer';

export default function HomePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--surface-0)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PublicHeader />
      <main style={{ flex: 1 }}>
        <LandingHero />
        <WorkflowSection />
        <ShowcaseSection />
        <PricingSection />
      </main>
      <PublicFooter />
    </div>
  );
}
