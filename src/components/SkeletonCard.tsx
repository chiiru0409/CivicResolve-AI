import React from 'react';

interface SkeletonCardProps {
  lines?: number;
  className?: string;
}

export const SkeletonLine: React.FC<{ width?: string; height?: string }> = ({
  width = 'w-full', height = 'h-3',
}) => (
  <div className={`skeleton rounded-lg ${width} ${height}`} />
);

const SkeletonCard: React.FC<SkeletonCardProps> = ({ lines = 3, className = '' }) => (
  <div className={`card space-y-3 ${className}`}>
    <div className="flex items-center gap-3">
      <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonLine width="w-1/2" height="h-3" />
        <SkeletonLine width="w-1/3" height="h-2.5" />
      </div>
    </div>
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonLine key={i} width={i % 2 === 0 ? 'w-full' : 'w-3/4'} />
    ))}
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="bg-civic-surface border border-civic-border rounded-2xl overflow-hidden">
    <div className="bg-civic-elevated h-11 border-b border-civic-border" />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-civic-border last:border-0">
        <SkeletonLine width="w-24"  height="h-3" />
        <SkeletonLine width="w-48"  height="h-3" />
        <SkeletonLine width="w-16"  height="h-3" />
        <SkeletonLine width="w-20"  height="h-3" />
        <SkeletonLine width="w-16"  height="h-3" />
      </div>
    ))}
  </div>
);

export const SkeletonStat: React.FC = () => (
  <div className="telemetry-card space-y-3">
    <div className="skeleton w-10 h-10 rounded-xl" />
    <SkeletonLine width="w-16" height="h-7" />
    <SkeletonLine width="w-24" height="h-3" />
  </div>
);

export default SkeletonCard;
