import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { pageVariants } from '../utils/motion';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Premium Page Transition component powered by Motion for React.
 * Provides subtle command-center entrance with opacity and spring-assisted translate.
 * Respects user preferences for reduced motion automatically.
 */
const PageTransition: React.FC<PageTransitionProps> = ({ children, className = '', style }) => {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className} style={style}>{children}</div>;
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
