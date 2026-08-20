import React from 'react';

interface PriorityBadgeProps {
  priority: string;
  size?: 'sm' | 'md' | 'lg';
}

const priorityConfig: Record<string, { dot: string; text: string; bg: string; border: string; label: string }> = {
  HIGH:     { dot: 'bg-civic-red',     text: 'text-civic-red',     bg: 'bg-civic-red/10',     border: 'border-civic-red/30',     label: 'HIGH' },
  CRITICAL: { dot: 'bg-civic-red',     text: 'text-civic-red',     bg: 'bg-civic-red/10',     border: 'border-civic-red/30',     label: 'CRITICAL' },
  MEDIUM:   { dot: 'bg-civic-yellow',  text: 'text-civic-yellow',  bg: 'bg-civic-yellow/10',  border: 'border-civic-yellow/30',  label: 'MEDIUM' },
  LOW:      { dot: 'bg-civic-success', text: 'text-civic-success', bg: 'bg-civic-success/10', border: 'border-civic-success/30', label: 'LOW' },
};

const sizeClasses = {
  sm: 'text-[10px] px-2 py-0.5 gap-1',
  md: 'text-xs px-2.5 py-1 gap-1.5',
  lg: 'text-sm px-3 py-1.5 gap-1.5',
};

const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, size = 'md' }) => {
  const cfg = priorityConfig[priority] || priorityConfig.LOW;

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold border ${cfg.bg} ${cfg.text} ${cfg.border} ${sizeClasses[size]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

export default PriorityBadge;
