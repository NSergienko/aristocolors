import React, { type ReactNode } from 'react';

export type BadgeVariant = 'cyan' | 'amber' | 'emerald' | 'default';

export interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const DOT_COLORS: Record<BadgeVariant, string> = {
  cyan: 'var(--accent-cyan)',
  amber: 'var(--accent-amber)',
  emerald: 'var(--accent-emerald)',
  default: 'var(--text-tertiary)',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  dot = false,
  children,
  className = '',
  style,
}) => {
  const combinedClass = `badge-base badge-${variant} ${className}`.trim();
  const dotColor = DOT_COLORS[variant];

  return (
    <span className={combinedClass} style={style}>
      {dot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: dotColor,
            boxShadow: `0 0 6px ${dotColor}`,
          }}
        />
      )}
      {children}
    </span>
  );
};
