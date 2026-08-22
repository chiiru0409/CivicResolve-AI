import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardList, AlertTriangle, CheckCircle, Clock, ArrowRight, Zap,
  RefreshCw, Sparkles, Shield, Cpu, MapPin, Layers, ChevronRight
} from 'lucide-react';
import DashboardCard from '../../components/DashboardCard';
import PriorityBadge from '../../components/PriorityBadge';
import StatusBadge from '../../components/StatusBadge';
import MapView from '../../components/MapView';
import AdminAIAssistant from '../../components/AdminAIAssistant';
import { useAdminComplaints } from '../../hooks/useComplaints';
import { SkeletonStat } from '../../components/SkeletonCard';
import { formatDateTime, getCategoryEmoji, truncate } from '../../utils/helpers';
import { api } from '../../services/api';

interface AdminBrief {
  total_complaints: number;
  today_complaints: number;
  high_priority_count: number;
  pending_count: number;
  resolved_count: number;
  overdue_count: number;
  top_department: string;
  top_category: string;
  urgency_level: string;
  ai_summary: string;
  key_bullet_points: string[];
}

interface AdminOverviewData {
  total_complaints: number;
  submitted: number;
  assigned: number;
  in_progress: number;
  inspection: number;
  resolved: number;
  pending: number;
  active_complaints: number;
  high_priority: number;
  critical: number;
  active_incidents: number;
}

export default function AdminOverviewPage() {
  const { complaints, total, loading, error, refetch } = useAdminComplaints();
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [brief, setBrief] = useState<AdminBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);

  const fetchOverview = async () => {
    try {
      const data = await api.get<AdminOverviewData>('/admin/overview');
      setOverview(data);
    } catch (err) {
      console.warn('Could not load authoritative overview counts:', err);
    }
  };

  const fetchBrief = async () => {
    setBriefLoading(true);
    try {
      const data = await api.get<AdminBrief>('/admin/ai/brief');
      setBrief(data);
    } catch (err) {
      console.warn('Could not load AI daily brief:', err);
    } finally {
      setBriefLoading(false);
    }
  };

  useEffect(() => {
    void fetchOverview();
    void fetchBrief();
  }, []);

  const handleRefreshAll = () => {
    void refetch();
    void fetchOverview();
    void fetchBrief();
  };

  const highPriorityCases = complaints.filter((c) => ['HIGH', 'CRITICAL'].includes(c.priority));
  const pendingCases = complaints.filter((c) => !['Resolved', 'Closed'].includes(c.status));

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-mono text-[#E10600] bg-[#E10600]/10 border border-[#E10600]/25 px-3 py-1 rounded-full mb-2 uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5" />
            <span>Operations Command Center</span>
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Municipal Operations & Intelligence</h1>
          <p className="text-white/40 text-sm mt-0.5">Real-time civic dispatch telemetry, AI routing, and workload management</p>
        </div>
        <button
          onClick={handleRefreshAll}
          disabled={loading || briefLoading}
          className="flex items-center gap-2 text-xs font-semibold text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-xl hover:border-white/20 transition-all disabled:opacity-50 self-start sm:self-center glow-red-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading || briefLoading ? 'animate-spin text-[#E10600]' : ''}`} />
          <span>Refresh Operations</span>
        </button>
      </div>

      {/* Error Alert Banner if Server Connection Failed */}
      {error && (
        <div className="card p-6 bg-[#181111] border-[#E10600]/30 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3 text-left">
            <AlertTriangle className="w-6 h-6 text-[#E10600] flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-white">Database Sync Warning: Unable to load live complaints</p>
              <p className="text-xs text-white/50 mt-0.5">{error}</p>
            </div>
          </div>
          <button onClick={handleRefreshAll} className="btn-primary py-2 px-4 text-xs font-semibold flex-shrink-0">
            Retry Connection
          </button>
        </div>
      )}

      {/* ── AI Daily Civic Brief Banner ─────────────────────────────────── */}
      <div className="card p-6 bg-[#0E0E0E] border-white/10 rounded-3xl relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E10600] via-[#FFC400] to-[#22C55E]" />
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#FFC400]/10 border border-[#FFC400]/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#FFC400]" />
              </div>
              <h2 className="text-base font-black text-white tracking-wide">AI Daily Operations Brief</h2>
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                brief?.urgency_level === 'CRITICAL'
                  ? 'text-[#E10600] bg-[#E10600]/15 border-[#E10600]/30 animate-pulse'
                  : 'text-[#FFC400] bg-[#FFC400]/15 border-[#FFC400]/30'
              }`}>
                URGENCY: {brief?.urgency_level || 'NORMAL'}
              </span>
            </div>

            <p className="text-sm text-white/80 leading-relaxed max-w-4xl font-light">
              {brief?.ai_summary || 'Analyzing current municipal complaint backlog, active field teams, and critical safety hazards...'}
            </p>

            {brief?.key_bullet_points && brief.key_bullet_points.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-2 pt-2">
                {brief.key_bullet_points.map((pt, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-white/60 bg-white/3 border border-white/6 rounded-xl p-2.5">
                    <span className="text-[#FFC400] font-bold">⚡</span>
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#141414] border border-white/8 rounded-2xl p-4 flex flex-col gap-2 min-w-[200px] flex-shrink-0">
            <span className="text-[10px] font-mono text-white/40 uppercase">Top Workload Sector</span>
            <span className="text-sm font-bold text-white truncate">{brief?.top_department || 'Municipal Engineering'}</span>
            <div className="flex items-center justify-between text-xs text-white/50 pt-2 border-t border-white/6">
              <span>Overdue (&gt;48h):</span>
              <span className="font-mono text-[#E10600] font-bold">{brief?.overdue_count ?? 0} cases</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Telemetry Cards ────────────────────────────────────────── */}
      {loading && !overview ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <SkeletonStat key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardCard
            title="Total Complaints"
            value={overview?.total_complaints ?? total}
            subtitle="Database records"
            icon={<ClipboardList className="w-6 h-6" />}
            color="muted"
          />
          <DashboardCard
            title="High Priority"
            value={overview?.high_priority ?? highPriorityCases.length}
            subtitle="Urgent field response"
            icon={<AlertTriangle className="w-6 h-6" />}
            color="red"
          />
          <DashboardCard
            title="Pending Actions"
            value={overview?.pending ?? pendingCases.length}
            subtitle="Active workflows"
            icon={<Clock className="w-6 h-6" />}
            color="yellow"
          />
          <DashboardCard
            title="Resolved"
            value={overview?.resolved ?? complaints.filter((c) => ['Resolved', 'Closed'].includes(c.status)).length}
            subtitle="Closed out"
            icon={<CheckCircle className="w-6 h-6" />}
            color="green"
          />
        </div>
      )}

      {/* ── Admin AI Operations Copilot Section ─────────────────────────── */}
      <AdminAIAssistant />

      {/* ── Priority Dispatch Queue & Map Split ────────────────────────── */}
      <div className="grid lg:grid-cols-12 gap-6">
        
        {/* Priority Dispatch Queue */}
        <div className="lg:col-span-6 bg-[#0E0E0E] border border-white/8 rounded-3xl overflow-hidden flex flex-col shadow-xl">
          <div className="p-5 border-b border-white/8 bg-[#111] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#E10600]" />
              <h2 className="font-black text-white text-sm tracking-wide">Priority Dispatch Queue</h2>
            </div>
            <Link to="/admin/complaints?priority=HIGH" className="text-xs text-[#E10600] hover:text-[#FF1A14] font-bold flex items-center gap-1 transition-colors">
              View all ({highPriorityCases.length}) <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="divide-y divide-white/6 overflow-y-auto max-h-[380px]" style={{ scrollbarWidth: 'thin' }}>
            {highPriorityCases.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                to={`/admin/complaints/${c.id}`}
                className="p-4 hover:bg-white/4 transition-colors flex items-center justify-between gap-3 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white group-hover:text-[#E10600] transition-colors">{c.id}</span>
                    <PriorityBadge priority={c.priority} size="sm" />
                    <StatusBadge status={c.status} size="sm" />
                  </div>
                  <p className="text-xs font-semibold text-white/90 truncate mt-1">{c.title}</p>
                  <p className="text-[11px] text-white/40 truncate">📍 {c.location || 'Location specified'}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white transition-all flex-shrink-0" />
              </Link>
            ))}
            {highPriorityCases.length === 0 && !loading && (
              <div className="p-8 text-center text-white/40 text-xs">
                No high-priority cases pending in the queue.
              </div>
            )}
          </div>
        </div>

        {/* Live Incident Map */}
        <div className="lg:col-span-6 bg-[#0E0E0E] border border-white/8 rounded-3xl overflow-hidden flex flex-col shadow-xl">
          <div className="p-5 border-b border-white/8 bg-[#111] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#FFC400]" />
              <h2 className="font-black text-white text-sm tracking-wide">Live Municipal Hotspot Map</h2>
            </div>
            <span className="text-[10px] font-mono text-white/40">GEO-SPATIAL CLUSTER TELEMETRY</span>
          </div>
          <div className="h-[380px] relative">
            <MapView
              markers={complaints
                .filter((c) => c.latitude && c.longitude)
                .map((c) => ({
                  id: c.id,
                  complaintId: c.id,
                  x: 50,
                  y: 50,
                  priority: c.priority,
                  status: c.status,
                  category: c.category,
                  title: c.title,
                  department: c.department || '',
                  location: c.location || '',
                }))}
              complaints={complaints}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
