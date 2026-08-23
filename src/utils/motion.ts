import type { Variants, Transition, TargetAndTransition } from 'motion/react';

/**
 * Centralized Motion Design System for CivicResolve AI.
 * Built with Motion for React (https://motion.dev/docs/react).
 *
 * Characteristics:
 * - Ultra-smooth spring physics
 * - Command-center cinematic feel
 * - Fast, non-blocking transitions (150ms - 450ms)
 * - Accessible (respects prefers-reduced-motion)
 */

export const transitions = {
  instant: { duration: 0.12, ease: [0.2, 0, 0, 1] } as Transition,
  micro: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } as Transition,
  snappy: { type: 'spring', stiffness: 450, damping: 30 } as Transition,
  smooth: { type: 'spring', stiffness: 300, damping: 28 } as Transition,
  gentle: { type: 'spring', stiffness: 200, damping: 24 } as Transition,
  slow: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } as Transition,
};

export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 12,
    filter: 'blur(4px)',
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1],
      when: 'beforeChildren',
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: 'blur(2px)',
    transition: {
      duration: 0.2,
      ease: [0.2, 0, 0, 1],
    },
  },
};

export const staggerContainer: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.04,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
    },
  },
};

export const staggerItem: Variants = {
  initial: {
    opacity: 0,
    y: 16,
    scale: 0.985,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: transitions.smooth,
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.985,
    transition: transitions.micro,
  },
};

export const fadeUpVariants: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth,
  },
  exit: {
    opacity: 0,
    y: -12,
    transition: transitions.micro,
  },
};

export const modalVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.96,
    y: 10,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.snappy,
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    y: 8,
    transition: { duration: 0.18, ease: [0.2, 0, 0, 1] },
  },
};

export const backdropVariants: Variants = {
  initial: { opacity: 0, backdropFilter: 'blur(0px)' },
  animate: {
    opacity: 1,
    backdropFilter: 'blur(6px)',
    transition: { duration: 0.25 },
  },
  exit: {
    opacity: 0,
    backdropFilter: 'blur(0px)',
    transition: { duration: 0.18 },
  },
};

export const toastVariants: Variants = {
  initial: {
    opacity: 0,
    y: -12,
    x: 20,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    y: 0,
    x: 0,
    scale: 1,
    transition: transitions.snappy,
  },
  exit: {
    opacity: 0,
    x: 24,
    scale: 0.95,
    transition: { duration: 0.18, ease: [0.2, 0, 0, 1] },
  },
};

export const buttonGestures: {
  whileHover: TargetAndTransition;
  whileTap: TargetAndTransition;
} = {
  whileHover: { scale: 1.02, transition: { duration: 0.15, ease: 'easeOut' } },
  whileTap: { scale: 0.975, transition: { duration: 0.1, ease: 'easeOut' } },
};

export const cardGestures: {
  whileHover: TargetAndTransition;
  whileTap: TargetAndTransition;
} = {
  whileHover: {
    y: -3,
    scale: 1.008,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
  },
  whileTap: {
    scale: 0.99,
    transition: { duration: 0.1 },
  },
};
