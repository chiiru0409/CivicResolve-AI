import React from 'react';
import { getStatusColor } from '../utils/helpers';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const statusDots: Record<string, string> = {
  Submitted:    'bg-civic-muted',
  AI_Analysis:  'bg-civic-yellow animate-pulse',
  Routed:       'bg-civic-yellow',
  Assigned:     'bg-blue-400',
  'In Progress':'bg-blue-400 animate-pulse',
  Inspection:   'bg-blue-400',
  Resolved:     'bg-civic-success',
  Closed:       'bg-civic-success',
  Escalated:    'bg-civic-red animate-pulse',
};

const displayNames: Record<string, string> = {
  AI_Analysis: 'AI Analysis',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const colors = getStatusColor(status);
  const dot = statusDots[status] || 'bg-civic-muted';
  const label = displayNames[status] || status;

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${colors.bg} ${colors.text} ${sizeClasses[size]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  );
};

export default StatusBadge;
