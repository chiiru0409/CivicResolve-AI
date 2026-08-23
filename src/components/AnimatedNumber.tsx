import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'motion/react';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  duration?: number;
  formatter?: (val: number) => string;
}

/**
 * AnimatedNumber — Smooth spring-animated numeric counter.
 * Used across KPI telemetry cards, dashboard metrics, and AI brief counters.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  className = '',
  formatter = (v) => Math.round(v).toLocaleString(),
}) => {
  const spring = useSpring(value, {
    mass: 0.8,
    stiffness: 180,
    damping: 24,
  });

  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    return spring.on('change', (latest) => {
      setDisplayValue(latest);
    });
  }, [spring]);

  return (
    <motion.span className={`tabular-nums font-mono ${className}`}>
      {formatter(displayValue)}
    </motion.span>
  );
};

export default AnimatedNumber;
