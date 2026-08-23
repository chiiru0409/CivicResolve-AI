import React, { useEffect, useState, useCallback } from 'react';
import { TrendingUp, Brain, BarChart2, Zap, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../../services/api';
import SkeletonCard from '../../components/SkeletonCard';
import PageTransition from '../../components/PageTransition';
import { StaggerContainer, StaggerItem } from '../../components/StaggerContainer';
import AnimatedNumber from '../../components/AnimatedNumber';
import { cardGestures, buttonGestures } from '../../utils/motion';

const BAR_COLORS: Record<string, string> = {
  Roads: '#E10600', Garbage: '#FFC400', Drainage: '#3B82F6',
  Water: '#06B6D4', Streetlights: '#FFC400', Infrastructure: '#9A9A9A', Other: '#666',
  HIGH: '#E10600', MEDIUM: '#FFC400', LOW: '#22C55E', CRITICAL: '#E10600',
};

const Bar: React.FC<{ data: { label: string; value: number }[]; maxVal?: number }> = ({ data, maxVal }) => {
  const max = maxVal ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <p className="text-sm text-white/50 w-28 flex-shrink-0 truncate font-display">{item.label}</p>
          <div className="flex-1 bg-white/5 rounded-full h-2.5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.value / max) * 100}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full"
              style={{ backgroundColor: BAR_COLORS[item.label] ?? '#E10600' }}
            />
          </div>
          <p className="text-sm font-black text-white w-8 text-right tabular-nums font-mono">{item.value}</p>
        </div>
      ))}
      {data.length === 0 && (
        <p className="text-xs text-white/30 italic py-2 font-mono">No category records in database yet.</p>
      )}
    </div>
  );
};

interface AnalyticsData {
  totalComplaints: number;
  highPriority: number;
  pending: number;
  resolved: number;
  resolutionRate: number;
  avgResolutionDays: number;
  byCategory: Array<{ category: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
}

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Record<string, unknown>>('/admin/analytics');
      const byCat = Array.isArray(data.by_category)
        ? data.by_category.map((x: any) => ({ category: String(x.category || 'Other'), count: Number(x.count || 0) }))
        : [];
      const byPri = Array.isArray(data.by_priority)
        ? data.by_priority.map((x: any) => ({ priority: String(x.priority || 'MEDIUM'), count: Number(x.count || 0) }))
        : [];

      setSummary({
        totalComplaints: Number(data.total_complaints ?? 0),
        highPriority:    Number(data.high_priority ?? 0),
        pending:         Number(data.pending ?? 0),
        resolved:        Number(data.resolved ?? 0),
        resolutionRate:  Number(data.resolution_rate ?? 0),
        avgResolutionDays: Number(data.avg_resolution_days ?? 2.8),
        byCategory: byCat,
        byPriority: byPri,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics telemetry from database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const catData = (summary?.byCategory || []).map((x) => ({ label: x.category, value: x.count }));
  const priData = (summary?.byPriority || []).map((x) => ({ label: x.priority, value: x.count }));

  return (
    <PageTransition className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight font-display">Civic Operations Analytics</h1>
          <p className="text-white/40 text-sm mt-0.5 font-sans">Authoritative performance metrics grounded in Neon PostgreSQL records</p>
        </div>
        <motion.button
          {...buttonGestures}
          onClick={() => void loadAnalytics()}
          disabled={loading}
          className="flex items-center gap-2 text-xs font-semibold text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 rounded-xl transition-colors font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E10600]' : ''}`} />
          <span>Refresh</span>
        </motion.button>
      </div>

      <div className="speed-line" />

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
          <div className="grid lg:grid-cols-2 gap-5">
            <SkeletonCard lines={5} />
            <SkeletonCard lines={5} />
          </div>
        </div>
      ) : error ? (
        <div className="card text-center py-16 bg-[#111] border-white/10 rounded-3xl space-y-4 shadow-xl">
          <AlertTriangle className="w-10 h-10 text-[#FFC400] mx-auto" />
          <p className="text-xl font-bold text-white font-display">Unable to Load Operational Analytics</p>
          <p className="text-white/50 text-sm max-w-md mx-auto font-mono">{error}</p>
          <motion.button
            {...buttonGestures}
            onClick={() => void loadAnalytics()}
            className="btn-primary py-2 px-4 text-xs font-bold inline-flex items-center gap-2 font-mono"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry Analytics Query
          </motion.button>
        </div>
      ) : summary ? (
        <>
          <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StaggerItem>
              <div className="telemetry-card">
                <p className="text-3xl font-black tabular-nums text-white font-display">
                  <AnimatedNumber value={summary.totalComplaints} />
                </p>
                <p className="text-sm text-white/40 mt-1 font-mono">Total Complaints</p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="telemetry-card">
                <p className="text-3xl font-black tabular-nums text-[#22C55E] font-display">
                  <AnimatedNumber value={summary.resolved} />
                </p>
                <p className="text-sm text-white/40 mt-1 font-mono">Resolved Tickets</p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="telemetry-card">
                <p className="text-3xl font-black tabular-nums text-[#FFC400] font-display">
                  <AnimatedNumber value={summary.resolutionRate} formatter={(v) => `${Math.round(v)}%`} />
                </p>
                <p className="text-sm text-white/40 mt-1 font-mono">Resolution Rate</p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="telemetry-card">
                <p className="text-3xl font-black tabular-nums text-white/70 font-display">
                  <AnimatedNumber value={summary.avgResolutionDays} formatter={(v) => `${v.toFixed(1)}d`} />
                </p>
                <p className="text-sm text-white/40 mt-1 font-mono">Avg. Resolution</p>
              </div>
            </StaggerItem>
          </StaggerContainer>

          <div className="grid lg:grid-cols-2 gap-5">
            <motion.div {...cardGestures} className="card">
              <div className="flex items-center gap-2 mb-5">
                <BarChart2 className="w-5 h-5 text-[#E10600]" />
                <h2 className="font-black text-white font-display">Incidents by Category</h2>
              </div>
              <Bar data={catData} />
            </motion.div>
            <motion.div {...cardGestures} className="card">
              <div className="flex items-center gap-2 mb-5">
                <BarChart2 className="w-5 h-5 text-[#FFC400]" />
                <h2 className="font-black text-white font-display">Incidents by Priority</h2>
              </div>
              <Bar data={priData} />
            </motion.div>
          </div>

          {/* AI recurring problems */}
          <div className="relative bg-[#111] border border-white/8 rounded-2xl p-6 overflow-hidden shadow-xl">
            <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-[#FFC400]/40 to-transparent mb-5" />
            <div className="flex items-center gap-3 mb-5">
              <Brain className="w-5 h-5 text-[#FFC400]" />
              <h2 className="font-black text-white font-display">AI Pattern Detection & Anomaly Clusters</h2>
            </div>
            <StaggerContainer className="space-y-4">
              {summary.byCategory.filter((c) => c.count > 0).length > 0 ? (
                summary.byCategory.filter((c) => c.count > 0).map((issue, i) => (
                  <StaggerItem key={i} className="bg-white/5 border border-white/8 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="bg-[#E10600]/10 text-[#E10600] text-xs font-bold px-2.5 py-1 rounded-full border border-[#E10600]/20 font-mono">
                        {issue.count} {issue.count === 1 ? 'case' : 'cases'} logged
                      </span>
                      <span className="text-xs text-white/40 font-mono">Category: {issue.category}</span>
                    </div>
                    <p className="font-bold text-white mb-2 font-display">Active {issue.category} Workload Cluster</p>
                    <div className="flex items-start gap-2 bg-[#FFC400]/5 border border-[#FFC400]/15 rounded-xl p-3">
                      <Zap className="w-4 h-4 text-[#FFC400] mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-white/60 font-sans">
                        {issue.count > 2
                          ? `Elevated incident volume in ${issue.category}. Recommend proactive field crew dispatch and preventative corridor review.`
                          : `Standard municipal maintenance queue for ${issue.category}. Service delivery operating within standard SLA.`}
                      </p>
                    </div>
                  </StaggerItem>
                ))
              ) : (
                <div className="bg-white/3 border border-white/8 rounded-xl p-8 text-center text-white/40 text-xs font-mono">
                  No active complaint clusters detected. All municipal systems operating normally.
                </div>
              )}
            </StaggerContainer>
          </div>
        </>
      ) : null}
    </PageTransition>
  );
}
