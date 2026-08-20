import React, { useEffect, useRef } from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Lightweight page transition — CSS-only fade+slide.
 * No heavy animation library required.
 */
const PageTransition: React.FC<PageTransitionProps> = ({ children, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 300ms ease-out, transform 300ms ease-out';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
};

export default PageTransition;
