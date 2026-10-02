import React from 'react';

interface Stage {
  number: string;
  title: string;
  tagline: string;
  description: string;
  imageUrl: string;
  moodHighlight: string;
}

const STAGES: readonly Stage[] = [
  {
    number: '01',
    title: 'Compose',
    tagline: 'Multi-layer Canvas Assembly',
    description: 'Place plates, cutouts, 3D renders and character silhouettes freely on the interactive workspace with full non-destructive transforms.',
    moodHighlight: '#3D70D6',
    imageUrl: '/artwork/pipeline-compose.jpg',
  },
  {
    number: '02',
    title: 'Harmonize',
    tagline: 'Atmospheric Style DNA Match',
    description: 'The engine extracts spherical harmonics light direction, Kelvin temperature and micrograin to synthesize contact shadows and seam blending.',
    moodHighlight: '#FF9A3D',
    imageUrl: '/artwork/pipeline-harmonize.jpg',
  },
  {
    number: '03',
    title: 'Finish',
    tagline: 'Master 4K & Multi-Format Outpaint',
    description: 'Finalize with commercial 4K Real-ESRGAN polish and batch export across 9:16 vertical video, 1:1 feed and 16:9 banner canvas ratios.',
    moodHighlight: '#2BAFA4',
    imageUrl: '/artwork/pipeline-finish.jpg',
  },
];

export const WorkflowSection: React.FC = () => {
  return (
    <section
      id="workflow"
      style={{
        scrollMarginTop: '72px',
        padding: 'clamp(48px, 7vh, 72px) clamp(20px, 4vw, 48px)',
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--surface-1)',
      }}
    >
      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* Section Header */}
        <div style={{ maxWidth: '640px', marginBottom: '36px' }}>
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
            Connected Pipeline
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
            From Composite to Cohesive
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            A structured visual journey turning disconnected creative assets into unified photographic realism.
          </p>
        </div>

        {/* Connected Horizontal Sequence */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
          }}
        >
          {STAGES.map((stage) => (
            <div
              key={stage.number}
              style={{
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--surface-2)',
                border: '1px solid var(--border-subtle)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: 'var(--shadow-elevation-1)',
              }}
            >
              {/* Large Visual Mood Window */}
              <div
                style={{
                  height: '210px',
                  width: '100%',
                  backgroundImage: `url(${stage.imageUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '16px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    backgroundColor: 'rgba(16, 17, 22, 0.75)',
                    backdropFilter: 'blur(6px)',
                    padding: '3px 10px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  Step {stage.number}
                </span>

                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: stage.moodHighlight,
                    boxShadow: `0 0 8px ${stage.moodHighlight}`,
                  }}
                />
              </div>

              {/* Text Info */}
              <div style={{ padding: '22px' }}>
                <h3
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '20px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  {stage.title}
                </h3>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: stage.moodHighlight,
                    display: 'block',
                    marginBottom: '10px',
                  }}
                >
                  {stage.tagline}
                </span>
                <p
                  style={{
                    fontSize: '15px',
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {stage.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
