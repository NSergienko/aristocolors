'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';

export const LandingHero: React.FC = () => {
  const [sliderPos, setSliderPos] = useState<number>(50);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef<boolean>(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = Math.round((x / rect.width) * 100);
    setSliderPos(percent);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleMove(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging.current) {
      handleMove(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <section
      style={{
        padding: 'clamp(28px, 4vh, 48px) clamp(20px, 4vw, 48px)',
        borderBottom: '1px solid var(--border-subtle)',
        backgroundColor: 'var(--surface-0)',
      }}
    >
      <div
        style={{
          maxWidth: '1440px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(340px, 42%) minmax(400px, 58%)',
          gap: 'clamp(28px, 4vw, 56px)',
          alignItems: 'center',
        }}
      >
        {/* Left Column: 42% Editorial Text */}
        <div>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--accent-amber)',
              display: 'inline-block',
              marginBottom: '12px',
            }}
          >
            Creative Atmosphere & Seam Harmonization
          </span>

          <h1
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: 'clamp(38px, 4.2vw, 56px)',
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              marginBottom: '18px',
            }}
          >
            Make Every Element Belong.
          </h1>

          <p
            style={{
              fontSize: '17px',
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              marginBottom: '28px',
              maxWidth: '480px',
            }}
          >
            AI-powered photobashing that harmonizes light, color, texture and atmosphere across every layer.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <a
              href="/projects"
              className="btn-base btn-primary btn-md"
              style={{ textDecoration: 'none' }}
            >
              Start Creating
            </a>
            <a href="#workflow" className="hero-link">
              See How It Works
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
          </div>
        </div>

        {/* Right Column: 58% Interactive Before / After Artwork Window */}
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            width: '100%',
            height: 'clamp(380px, 52vh, 520px)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            border: '1px solid var(--border-medium)',
            position: 'relative',
            boxShadow: 'var(--shadow-elevation-2)',
            backgroundColor: '#050608',
            cursor: 'ew-resize',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          {/* Base Layer: "After" — Full Harmonized Artwork */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'url(/artwork/memory-architecture.jpg)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Top Label */}
            <span
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                zIndex: 3,
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                color: 'var(--accent-amber)',
                backgroundColor: 'rgba(16, 17, 22, 0.8)',
                backdropFilter: 'blur(8px)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid rgba(255, 154, 61, 0.35)',
              }}
            >
              Harmonized Output
            </span>

            {/* Bottom Caption */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                right: '16px',
                zIndex: 3,
                fontFamily: 'var(--font-brand)',
                fontSize: '12px',
                color: 'var(--text-primary)',
                backgroundColor: 'rgba(16, 17, 22, 0.75)',
                backdropFilter: 'blur(6px)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              Anatomy of Soul — Harmonized AristoColors Profile
            </div>
          </div>

          {/* Overlaid Clipped Layer: "Before" — Flat/Desaturated Mismatched Plate Pass */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: `${sliderPos}%`,
              overflow: 'hidden',
              borderRight: '1px solid rgba(255, 255, 255, 0.5)',
              backgroundColor: '#0a0d13',
            }}
          >
            {/* The same image rendered desaturated, cold and unharmonized */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100vw',
                height: '100%',
                backgroundImage: 'url(/artwork/memory-architecture.jpg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'grayscale(90%) contrast(75%) brightness(65%)',
              }}
            />

            {/* Wireframe overlay to emphasize raw unrendered plate */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `
                  linear-gradient(to right, rgba(0, 240, 255, 0.08) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(0, 240, 255, 0.08) 1px, transparent 1px)
                `,
                backgroundSize: '32px 32px',
                pointerEvents: 'none',
              }}
            />

            {/* Top Label */}
            <span
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                zIndex: 3,
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                color: 'var(--text-tertiary)',
                backgroundColor: 'rgba(16, 17, 22, 0.85)',
                backdropFilter: 'blur(8px)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              Before Harmonization
            </span>

            {/* Bottom Caption */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '16px',
                zIndex: 3,
                fontSize: '12px',
                color: 'var(--text-secondary)',
                backgroundColor: 'rgba(16, 17, 22, 0.75)',
                backdropFilter: 'blur(6px)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              Raw Pass • Flat Mismatched Lighting
            </div>
          </div>

          {/* Interactive Slider Divider Handle */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${sliderPos}%`,
              transform: 'translateX(-50%)',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'var(--surface-1)',
                border: '2px solid rgba(255, 255, 255, 0.75)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-elevation-2)',
                color: 'var(--text-primary)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
                <polyline points="9 18 3 12 9 6" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
