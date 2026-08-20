import { useEffect, useRef } from 'react';

/**
 * Attaches an IntersectionObserver to a container ref.
 * Any child elements with className containing "reveal", "reveal-left",
 * "reveal-right", or "reveal-scale" will have "visible" added when they
 * enter the viewport.
 */
export function useScrollReveal() {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const targets = el.querySelectorAll<HTMLElement>(
      '.reveal, .reveal-left, .reveal-right, .reveal-scale',
    );

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );

    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return ref;
}

/**
 * Attach to a single element.
 */
export function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('visible'); observer.disconnect(); } },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return ref;
}

/**
 * Animated counter — counts from 0 to target when element enters viewport.
 * Returns the ref to attach to the element that displays the number.
 */
export function useCounter(target: number, duration = 1400) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const start     = performance.now();
        const startVal  = 0;

        const tick = (now: number) => {
          const elapsed  = now - start;
          const progress = Math.min(elapsed / duration, 1);
          // Ease out expo
          const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
          const value = Math.round(startVal + (target - startVal) * ease);
          el.textContent = value.toLocaleString();
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return ref;
}
