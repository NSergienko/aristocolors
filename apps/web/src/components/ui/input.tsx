import React, { type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
}

export const Input: React.FC<InputProps> = ({ icon, className = '', disabled, style, ...props }) => {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        position: 'relative',
        width: '100%',
        ...style,
      }}
    >
      {icon && (
        <span
          style={{
            position: 'absolute',
            left: '10px',
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-tertiary)',
            pointerEvents: 'none',
          }}
        >
          {icon}
        </span>
      )}
      <input
        disabled={disabled}
        className={`input-field ${className}`.trim()}
        style={{
          paddingLeft: icon ? '32px' : '10px',
        }}
        {...props}
      />
    </div>
  );
};
