import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface DashboardCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: 'red' | 'yellow' | 'green' | 'blue' | 'muted';
  trend?: { value: number; label: string };
}

const colorMap = {
  red:    { icon: 'bg-civic-red/10 text-civic-red',    value: 'text-civic-red',     accent: 'from-civic-red/5' },
  yellow: { icon: 'bg-civic-yellow/10 text-civic-yellow', value: 'text-civic-yellow', accent: 'from-civic-yellow/5' },
  green:  { icon: 'bg-civic-success/10 text-civic-success', value: 'text-civic-success', accent: 'from-civic-success/5' },
  blue:   { icon: 'bg-blue-500/10 text-blue-400',     value: 'text-blue-400',     accent: 'from-blue-500/5' },
  muted:  { icon: 'bg-civic-elevated text-civic-muted', value: 'text-civic-text', accent: 'from-civic-elevated/50' },
};

const DashboardCard: React.FC<DashboardCardProps> = ({ title, value, subtitle, icon, color, trend }) => {
  const c = colorMap[color];

  return (
    <div className={`telemetry-card bg-gradient-to-br ${c.accent} to-transparent`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl ${c.icon} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full ${
              trend.value > 0
                ? 'bg-civic-success/10 text-civic-success'
                : trend.value < 0
                ? 'bg-civic-red/10 text-civic-red'
                : 'bg-civic-elevated text-civic-muted'
            }`}
          >
            {trend.value > 0 ? <TrendingUp className="w-3 h-3" /> : trend.value < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <p className={`text-3xl font-black ${c.value} tabular-nums leading-none`}>{value}</p>
      <p className="text-sm font-semibold text-civic-text mt-1.5">{title}</p>
      {subtitle && <p className="text-xs text-civic-muted mt-0.5">{subtitle}</p>}
    </div>
  );
};

export default DashboardCard;
