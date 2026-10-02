import React from 'react';

export const ShowcaseSection: React.FC = () => {
  return (
    <section
      id="showcase"
      style={{
        scrollMarginTop: '72px',
        padding: 'clamp(48px, 7vh, 72px) clamp(20px, 4vw, 48px)',
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--surface-0)',
      }}
    >
      <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
        {/* Header */}
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
            Editorial Portfolio
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
            Built for Visual Work
          </h2>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            Production-grade fidelity crafted across concept art, marketing campaigns and digital set extensions.
          </p>
        </div>

        {/* Asymmetric Gallery: 58% Large Left Feature / 42% Stacked Right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '24px',
          }}
        >
          {/* Left Column: Dominant 58% Feature — Anatomy of Soul */}
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
              position: 'relative',
              minHeight: '460px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '24px',
              boxShadow: 'var(--shadow-elevation-2)',
              backgroundImage: 'url(/artwork/memory-architecture.jpg)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Gradient shadow overlay for text contrast */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(16, 17, 22, 0.25) 0%, rgba(16, 17, 22, 0.45) 50%, rgba(16, 17, 22, 0.95) 100%)',
                pointerEvents: 'none',
              }}
            />

            {/* Top Category Badge */}
            <div style={{ position: 'relative', zIndex: 2 }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-xs)',
                  backgroundColor: 'rgba(16, 17, 22, 0.8)',
                  backdropFilter: 'blur(8px)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                Conceptual Sculpture & Keyframe
              </span>
            </div>

            {/* Bottom Title & Palette Mood */}
            <div style={{ position: 'relative', zIndex: 2 }}>
              <h3
                style={{
                  fontFamily: 'var(--font-brand)',
                  fontSize: '26px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: '6px',
                }}
              >
                Anatomy of Soul — Memory Architecture
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '460px', lineHeight: 1.5 }}>
                Suspended translucent membranes and caustics harmonizing internal coral luminescence, delicate metallic filaments and refractive crystal dispersion.
              </p>
            </div>
          </div>

          {/* Right Column: Two Stacked Editorial Cards */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            {/* Top Stacked Card: Cyberpunk District Recon (Game Art & Keyframe) */}
            <div
              style={{
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
                position: 'relative',
                minHeight: '218px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '20px',
                boxShadow: 'var(--shadow-elevation-1)',
                backgroundImage: 'url(/artwork/cyberpunk-district-recon.jpg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Contrast overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(16, 17, 22, 0.25) 0%, rgba(16, 17, 22, 0.85) 100%)',
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative', zIndex: 2 }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'rgba(16, 17, 22, 0.75)',
                    backdropFilter: 'blur(8px)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  Game Art & Environment
                </span>
              </div>
              <div style={{ position: 'relative', zIndex: 2 }}>
                <h4
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  Cyberpunk District Recon
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Tiered transit viaducts, brutalist concrete, and rain reflections unified under blue-hour ambient light.
                </p>
              </div>
            </div>

            {/* Middle Stacked Card: Desert Sentinel (Matte Painting & Concept Art) */}
            <div
              style={{
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
                position: 'relative',
                minHeight: '218px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '20px',
                boxShadow: 'var(--shadow-elevation-1)',
                backgroundImage: 'url(/artwork/desert-sentinel.jpg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Contrast overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(16, 17, 22, 0.25) 0%, rgba(16, 17, 22, 0.85) 100%)',
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative', zIndex: 2 }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'rgba(16, 17, 22, 0.75)',
                    backdropFilter: 'blur(8px)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  Matte Painting & Concept
                </span>
              </div>
              <div style={{ position: 'relative', zIndex: 2 }}>
                <h4
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  Desert Sentinel
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Ancient sandstone monolith with oxidized industrial framing, directional dust scattering and canyon depth.
                </p>
              </div>
            </div>

            {/* Bottom Stacked Card: Obsidian Product (Campaign Creative & Industrial Design) */}
            <div
              style={{
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle)',
                position: 'relative',
                minHeight: '218px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '20px',
                boxShadow: 'var(--shadow-elevation-1)',
                backgroundImage: 'url(/artwork/obsidian-product.jpg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Contrast overlay */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(180deg, rgba(16, 17, 22, 0.25) 0%, rgba(16, 17, 22, 0.85) 100%)',
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative', zIndex: 2 }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-xs)',
                    backgroundColor: 'rgba(16, 17, 22, 0.75)',
                    backdropFilter: 'blur(8px)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  Campaign Creative & Industrial Design
                </span>
              </div>
              <div style={{ position: 'relative', zIndex: 2 }}>
                <h4
                  style={{
                    fontFamily: 'var(--font-brand)',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  Obsidian Product
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Volcanic glass, machined copper accents, and minimal studio architecture harmonized through unified directional lighting and reflections.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
