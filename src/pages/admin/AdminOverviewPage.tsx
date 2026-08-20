import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, AlertTriangle, CheckCircle, Clock, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import DashboardCard from '../../components/DashboardCard';
import PriorityBadge from '../../components/PriorityBadge';
import StatusBadge from '../../components/StatusBadge';
import { useAdminComplaints } from '../../hooks/useComplaints';
import { SkeletonStat } from '../../components/SkeletonCard';
import { formatDateTime, getCategoryEmoji, truncate } from '../../utils/helpers';

export default function AdminOverviewPage() {
  const { complaints, total, loading, refetch } = useAdminComplaints();

  const high     = complaints.filter((c) => ['HIGH','CRITICAL'].includes(c.priority)).length;
  const pending  = complaints.filter((c) => !['Resolved','Closed'].includes(c.status)).length;
  const resolved = complaints.filter((c) => ['Resolved','Closed'].includes(c.status)).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Operations Center</h1>
          <p className="text-white/40 text-sm mt-0.5">Real-time complaint management</p>
        </div>
        <button onClick={refetch} disabled={loading}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white bg-white/5 border border-white/8 px-3 py-2 rounded-xl hover:border-white/15 transition-all disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#E10600]' : ''}`} /> Refresh
        </button>
      </div>

      <div className="speed-line" />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0,1,2,3].map((i) => <SkeletonStat key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardCard title="Total Complaints" value={total} subtitle="All time"      icon={<ClipboardList className="w-6 h-6" />} color="muted"  trend={{ value: 12, label: '' }} />
          <DashboardCard title="High Priority"    value={high}     subtitle="Need attention" icon={<AlertTriangle  className="w-6 h-6" />} color="red"   />
          <DashboardCard title="Pending"          value={pending}  subtitle="Open cases"     icon={<Clock          className="w-6 h-6" />} color="yellow" />
          <DashboardCard title="Resolved"         value={resolved} subtitle="Closed"         icon={<CheckCircle    className="w-6 h-6" />} color="green" trend={{ value: 8, label: '' }} />
        </div>
      )}

      {/* AI routing panel */}
      <div className="relative bg-[#111] border border-white/8 rounded-2xl p-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600]/50 to-transparent" />
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-[#E10600]/10 border border-[#E10600]/20 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-[#E10600]" />
          </div>
          <div>
            <p className="font-black text-white">AI ROUTING ENGINE</p>
            <p className="text-white/40 text-xs">Last classification sample</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 bg-[#22C55E]/10 border border-[#22C55E]/20 px-3 py-1 rounded-full">
            <div className="w-1.5 h-1.5 bg-[#22C55E] rounded-full animate-pulse" />
            <span className="text-xs font-bold text-[#22C55E]">ACTIVE</span>
          </div>
        </div>
        <div className="bg-white/5 border border-white/8 rounded-xl p-4 mb-4">
          <p className="text-xs text-white/40 mb-2 font-semibold uppercase tracking-wide">Sample Input</p>
          <p className="text-white/70 text-sm">"There is a large pothole near the main road beside the bus stop. Vehicles are swerving dangerously."</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Category', value: 'Roads',                    color: 'text-white' },
            { label: 'Priority', value: 'HIGH',                     color: 'text-[#E10600]' },
            { label: 'Dept',     value: 'Roads Dept',               color: 'text-white' },
            { label: 'Confidence', value: '94%',                    color: 'text-[#FFC400]' },
          ].map((item) => (
            <div key={item.label} className="bg-white/5 border border-white/8 rounded-xl p-3">
              <p className="text-white/40 text-[11px] uppercase tracking-wide font-semibold">{item.label}</p>
              <p className={`font-black text-sm mt-0.5 ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent complaints */}
      <div className="bg-[#111] border border-white/8 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <h2 className="font-black text-white">Recent Complaints</h2>
          <Link to="/admin/complaints" className="text-sm text-[#E10600] hover:text-[#FF1A14] font-semibold flex items-center gap-1 transition-colors">
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="divide-y divide-white/8">
          {complaints.slice(0, 6).map((c) => (
            <Link key={c.id} to={`/admin/complaints/${c.id}`}
              className="flex items-center gap-4 px-6 py-4 hover:bg-white/5 transition-colors group">
              <span className="text-xl flex-shrink-0">{getCategoryEmoji(c.category)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{truncate(String(c.title ?? ''), 50)}</p>
                <p className="text-xs text-white/30 font-mono mt-0.5">{c.id}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <PriorityBadge priority={c.priority} size="sm" />
                <StatusBadge status={c.status} size="sm" />
              </div>
              <p className="text-xs text-white/30 hidden lg:block flex-shrink-0">{formatDateTime(c.submittedAt)}</p>
              <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/60 flex-shrink-0 transition-colors" />
            </Link>
          ))}
          {complaints.length === 0 && !loading && (
            <div className="py-12 text-center text-white/40 text-sm">No complaints yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
