import React, { useEffect, useState } from 'react';
import { TrendingUp, Brain, BarChart2, Zap } from 'lucide-react';
import { api, isBackendAvailable } from '../../services/api';
import { getAnalyticsSummary } from '../../services/complaintService';

const BAR_COLORS: Record<string, string> = {
  Roads: '#E10600', Garbage: '#FFC400', Drainage: '#3B82F6',
  Water: '#06B6D4', Streetlights: '#FFC400', Infrastructure: '#9A9A9A', Other: '#666',
  HIGH: '#E10600', MEDIUM: '#FFC400', LOW: '#22C55E',
};

const Bar: React.FC<{ data: { label: string; value: number }[]; maxVal?: number }> = ({ data, maxVal }) => {
  const max = maxVal ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <p className="text-sm text-white/50 w-28 flex-shrink-0 truncate">{item.label}</p>
          <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(item.value / max) * 100}%`, backgroundColor: BAR_COLORS[item.label] ?? '#E10600' }} />
          </div>
          <p className="text-sm font-black text-white w-8 text-right tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
};

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState(getAnalyticsSummary());

  useEffect(() => {
    if (isBackendAvailable()) {
      api.get<Record<string, unknown>>('/admin/analytics').then((data) => {
        setSummary((prev) => ({
          ...prev,
          totalComplaints: Number(data.total_complaints ?? prev.totalComplaints),
          highPriority:    Number(data.high_priority ?? prev.highPriority),
          pending:         Number(data.pending ?? prev.pending),
          resolved:        Number(data.resolved ?? prev.resolved),
          resolutionRate:  Number(data.resolution_rate ?? prev.resolutionRate),
          byCategory: (data.by_category as { category: string; count: number }[] ?? []).map((x) => ({ category: x.category as never, count: x.count })),
          byPriority: (data.by_priority as { priority: string; count: number }[] ?? []).map((x) => ({ priority: x.priority as never, count: x.count })),
        }));
      }).catch(() => {});
    }
  }, []);

  const catData = summary.byCategory.map((x) => ({ label: x.category, value: x.count }));
  const priData = summary.byPriority.map((x) => ({ label: x.priority, value: x.count }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Civic Analytics</h1>
        <p className="text-white/40 text-sm mt-0.5">AI-powered insights from complaint data</p>
      </div>
      <div className="speed-line" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total',          value: summary.totalComplaints, color: 'text-white' },
          { label: 'Resolved',       value: summary.resolved,        color: 'text-[#22C55E]' },
          { label: 'Resolution Rate',value: `${summary.resolutionRate}%`, color: 'text-[#FFC400]' },
          { label: 'Avg. Resolution', value: `${summary.avgResolutionDays}d`, color: 'text-white/70' },
        ].map((s) => (
          <div key={s.label} className="telemetry-card">
            <p className={`text-3xl font-black tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-sm text-white/40 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 className="w-5 h-5 text-[#E10600]" />
            <h2 className="font-black text-white">By Category</h2>
          </div>
          <Bar data={catData} />
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-5">
            <BarChart2 className="w-5 h-5 text-[#FFC400]" />
            <h2 className="font-black text-white">By Priority</h2>
          </div>
          <Bar data={priData} />
        </div>
      </div>

      {/* AI recurring problems */}
      <div className="relative bg-[#111] border border-white/8 rounded-2xl p-6 overflow-hidden">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[#FFC400]/40 to-transparent mb-5" />
        <div className="flex items-center gap-3 mb-5">
          <Brain className="w-5 h-5 text-[#FFC400]" />
          <h2 className="font-black text-white">AI Pattern Detection</h2>
        </div>
        <div className="space-y-4">
          {summary.recurringIssues.map((issue, i) => (
            <div key={i} className="bg-white/5 border border-white/8 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-[#E10600]/10 text-[#E10600] text-xs font-bold px-2.5 py-1 rounded-full border border-[#E10600]/20">
                  {issue.count} complaints
                </span>
                <span className="text-xs text-white/40">in last {issue.days} days</span>
              </div>
              <p className="font-bold text-white mb-2">{issue.area} · {issue.category}</p>
              <div className="flex items-start gap-2 bg-[#FFC400]/5 border border-[#FFC400]/15 rounded-xl p-3">
                <Zap className="w-4 h-4 text-[#FFC400] mt-0.5 flex-shrink-0" />
                <p className="text-sm text-white/60">{issue.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resolution trend */}
      <div className="card">
        <h2 className="font-black text-white mb-5">Resolution Time Trend (Days)</h2>
        <div className="flex items-end gap-3 h-32">
          {[{ m: 'Mar', d: 4.2 },{ m: 'Apr', d: 3.8 },{ m: 'May', d: 3.5 },{ m: 'Jun', d: 3.1 },{ m: 'Jul', d: 2.8 },{ m: 'Aug', d: 2.4 }].map((x) => (
            <div key={x.m} className="flex-1 flex flex-col items-center gap-2">
              <span className="text-xs font-bold text-[#E10600]">{x.d}d</span>
              <div className="w-full bg-[#E10600]/70 hover:bg-[#E10600] rounded-t-lg transition-all cursor-pointer"
                style={{ height: `${(x.d / 4.5) * 100}%` }} />
              <span className="text-xs text-white/40">{x.m}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#22C55E] font-semibold mt-3 flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" /> 42% improvement in resolution time
        </p>
      </div>
    </div>
  );
}
