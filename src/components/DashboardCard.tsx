import React from 'react';
import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cardGestures } from '../utils/motion';
import AnimatedNumber from './AnimatedNumber';

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
  const isNumeric = typeof value === 'number' || (!isNaN(Number(value)) && typeof value === 'string');
  const numValue = typeof value === 'number' ? value : Number(value);

  return (
    <motion.div
      {...cardGestures}
      className={`telemetry-card glass-panel-luxury p-5 rounded-2xl border border-white/8 hover:border-white/20 transition-colors bg-gradient-to-br ${c.accent} to-transparent cursor-default`}
    >
      <div className="flex items-start justify-between mb-3">
        <motion.div
          whileHover={{ rotate: [0, -6, 6, 0], transition: { duration: 0.3 } }}
          className={`w-11 h-11 rounded-xl ${c.icon} flex items-center justify-center flex-shrink-0 border border-white/10 shadow-md`}
        >
          {icon}
        </motion.div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full font-mono ${
              trend.value > 0
                ? 'bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20'
                : trend.value < 0
                ? 'bg-[#E10600]/10 text-[#E10600] border border-[#E10600]/20'
                : 'bg-white/5 text-white/50 border border-white/10'
            }`}
          >
            {trend.value > 0 ? <TrendingUp className="w-3 h-3" /> : trend.value < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <p className={`text-3xl sm:text-4xl font-black ${c.value} tabular-nums leading-none font-display tracking-tight`}>
        {isNumeric ? <AnimatedNumber value={numValue} /> : value}
      </p>
      <p className="text-xs sm:text-sm font-bold text-white mt-2 font-display">{title}</p>
      {subtitle && <p className="text-[11px] text-white/40 mt-0.5 font-mono">{subtitle}</p>}
    </motion.div>
  );
};

export default DashboardCard;
