/**
 * RECONSTRUCTA — LUXURY BUTTON COMPONENT
 * Implements multi-color animated conic gradient border hover,
 * pointer-aware highlight coordinates, and accessible magnetic translation.
 */

import React, { useRef, MouseEvent } from 'react';

interface LuxuryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost';
  size?: 'sm' | 'md' | 'icon';
  magnetic?: boolean;
  children: React.ReactNode;
}

export const LuxuryButton: React.FC<LuxuryButtonProps> = ({
  variant = 'default',
  size = 'md',
  magnetic = true,
  className = '',
  children,
  onMouseMove,
  onMouseLeave,
  ...props
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    const btn = buttonRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      btn.style.setProperty('--mouse-x', `${x}px`);
      btn.style.setProperty('--mouse-y', `${y}px`);

      if (magnetic) {
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const magX = Math.max(-2, Math.min(2, (x - centerX) * 0.08));
        const magY = Math.max(-2, Math.min(2, (y - centerY) * 0.08));
        btn.style.setProperty('--magnetic-x', `${magX}`);
        btn.style.setProperty('--magnetic-y', `${magY}`);
      }
    }
    onMouseMove?.(e);
  };

  const handleMouseLeave = (e: MouseEvent<HTMLButtonElement>) => {
    const btn = buttonRef.current;
    if (btn) {
      btn.style.setProperty('--magnetic-x', '0');
      btn.style.setProperty('--magnetic-y', '0');
    }
    onMouseLeave?.(e);
  };

  let variantClass = '';
  if (variant === 'primary') variantClass = 'btn-luxury-primary';
  else if (variant === 'ghost') variantClass = 'btn-luxury-ghost';

  let sizeClass = '';
  if (size === 'sm') sizeClass = 'btn-luxury-sm';
  else if (size === 'icon') sizeClass = 'btn-luxury-icon';

  return (
    <button
      ref={buttonRef}
      className={`btn-luxury ${variantClass} ${sizeClass} ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </button>
  );
};
