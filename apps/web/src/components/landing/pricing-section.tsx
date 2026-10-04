import React from 'react';
import { Button } from '@/components/ui/button';

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: readonly string[];
  cta: string;
  variant: 'secondary' | 'amber';
  highlighted?: boolean;
}

const PLANS: readonly Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Explore the Fabric workspace and inspect AristoColors Profile color profiles.',
    features: ['Canvas Workspace & Layers', 'Standard 1080p Export', 'Community AristoColors Profile Profiles', '50 Starter Credits'],
    cta: 'Start Free',
    variant: 'secondary',
  },
  {
    id: 'standard',
    name: 'Standard',
    price: '$10',
    period: 'per month',
    description: 'For digital artists and creators who need fast GPU photobash blending.',
    features: ['250 Credits / month', '1 Active GPU Task', '2K Upscale & Outpaint', 'Full AristoColors Profile Extraction'],
    cta: 'Choose Standard',
    variant: 'secondary',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$25',
    period: 'per month',
    description: 'Priority GPU dispatch and multi-ratio batch exports for commercial studios.',
    features: ['1000 Credits / month', 'Priority 1 Queue (3 tasks)', 'Commercial 4K Upscale', 'Batch Ad Formats (9:16, 1:1, 16:9)'],
    cta: 'Get Pro',
    variant: 'amber',
    highlighted: true,
  },
];

export const PricingSection: React.FC = () => {
  return (
    <section
      id="pricing"
      style={{
        scrollMarginTop: '72px',
        padding: 'clamp(48px, 7vh, 72px) clamp(20px, 4vw, 48px)',
        backgroundColor: 'var(--surface-1)',
      }}
    >
      <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', maxWidth: '580px', margin: '0 auto 40px auto' }}>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--accent-amber)',
              display: 'block',
              marginBottom: '10px',
            }}
          >
            Predictable Investment
          </span>
          <h2
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: 'clamp(28px, 3.2vw, 40px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
              lineHeight: 1.15,
              marginBottom: '10px',
            }}
          >
            Simple, Transparent Plans
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            Straightforward monthly entitlements with secure processing through WayForPay.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
            alignItems: 'stretch',
          }}
        >
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              style={{
                borderRadius: 'var(--radius-lg)',
                backgroundColor: plan.highlighted ? 'var(--surface-2)' : 'var(--surface-0)',
                border: plan.highlighted ? '1px solid rgba(255, 154, 61, 0.35)' : '1px solid var(--border-subtle)',
                padding: '36px 28px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                boxShadow: plan.highlighted ? 'var(--shadow-elevation-2)' : 'none',
              }}
            >
              {plan.highlighted && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-11px',
                    left: '28px',
                    backgroundColor: 'var(--accent-amber)',
                    color: 'var(--text-inverse)',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    padding: '2px 10px',
                    borderRadius: 'var(--radius-xs)',
                  }}
                >
                  Production Choice
                </div>
              )}

              <div>
                <h3
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '20px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '8px',
                  }}
                >
                  {plan.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '14px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-brand)',
                      fontSize: '38px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {plan.price}
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>/ {plan.period}</span>
                </div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px', minHeight: '42px', lineHeight: 1.5 }}>
                  {plan.description}
                </p>

                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                  {plan.features.map((feature, idx) => (
                    <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={plan.highlighted ? 'var(--accent-amber)' : 'var(--text-tertiary)'} strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <Button variant={plan.variant} size="md" style={{ width: '100%' }}>
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
