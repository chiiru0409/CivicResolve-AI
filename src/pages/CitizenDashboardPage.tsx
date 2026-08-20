import React from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowRight, MapPin, Clock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCitizenComplaints } from '../hooks/useComplaints';
import PriorityBadge from '../components/PriorityBadge';
import StatusBadge from '../components/StatusBadge';
import PageTransition from '../components/PageTransition';
import SkeletonCard, { SkeletonStat } from '../components/SkeletonCard';
import { formatDate, getCategoryEmoji, truncate } from '../utils/helpers';

export default function CitizenDashboardPage() {
  const { user } = useAuth();
  const { complaints, loading } = useCitizenComplaints();

  const total    = complaints.length;
  const active   = complaints.filter((c) => !['Resolved','Closed'].includes(c.status)).length;
  const resolved = complaints.filter((c)  => ['Resolved','Closed'].includes(c.status)).length;
  const high     = complaints.filter((c)  => c.priority === 'HIGH').length;

  const recent = complaints.slice(0, 5);

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#070707] pt-20 pb-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <p className="text-white/40 text-sm font-semibold tracking-widest uppercase mb-1">Citizen Dashboard</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white">
              Welcome back, <span className="text-[#E10600]">{user?.full_name?.split(' ')[0] ?? 'Citizen'}</span>
            </h1>
            <p className="text-white/50 text-sm mt-1">Here's your civic activity overview.</p>
          </div>

          {/* Stats */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[0,1,2,3].map((i) => <SkeletonStat key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total',       value: total,    color: 'text-white' },
                { label: 'Active',      value: active,   color: 'text-[#FFC400]' },
                { label: 'Resolved',    value: resolved, color: 'text-[#22C55E]' },
                { label: 'High Priority',value: high,    color: high > 0 ? 'text-[#E10600]' : 'text-white' },
              ].map((s) => (
                <div key={s.label} className="telemetry-card">
                  <p className={`text-3xl font-black tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-sm text-white/50 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Speed line */}
          <div className="speed-line mb-8" />

          {/* Actions */}
          <div className="grid sm:grid-cols-3 gap-3 mb-8">
            <Link to="/report"
              className="btn-primary py-3.5 justify-center text-sm font-bold shadow-sm hover:shadow active:scale-[0.98] transition-all duration-150 col-span-1 sm:col-span-1">
              <Plus className="w-4 h-4" /> Report New Issue
            </Link>
            <Link to="/my-complaints"
              className="btn-secondary py-3.5 justify-center text-sm font-semibold">
              My Complaints <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/track"
              className="btn-secondary py-3.5 justify-center text-sm font-semibold">
              <MapPin className="w-4 h-4" /> Track by ID
            </Link>
          </div>

          {/* Recent complaints */}
          <div className="bg-[#111] border border-white/8 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
              <h2 className="font-black text-white">Recent Complaints</h2>
              {complaints.length > 5 && (
                <Link to="/my-complaints" className="text-sm text-[#E10600] hover:text-[#FF1A14] font-semibold flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            {loading ? (
              <div className="p-6 space-y-4">
                {[0,1,2].map((i) => <SkeletonCard key={i} lines={2} />)}
              </div>
            ) : recent.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-3xl mb-3">📋</p>
                <p className="text-white/50 font-medium">No complaints yet.</p>
                <p className="text-white/30 text-sm mt-1">Report your first civic issue to get started.</p>
                <Link to="/report" className="btn-primary mt-5 inline-flex">
                  <Plus className="w-4 h-4" /> Report an Issue
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-white/8">
                {recent.map((c) => {
                  const borderLeft = ['HIGH', 'CRITICAL'].includes(c.priority)
                    ? 'border-l-2 border-l-[#E10600]'
                    : c.priority === 'MEDIUM'
                    ? 'border-l-2 border-l-[#FFC400]'
                    : 'border-l-2 border-l-[#22C55E]';

                  return (
                    <Link key={c.id} to={`/track?id=${c.id}`}
                      className={`flex items-center gap-4 px-6 py-4 hover:bg-white/5 transition-colors group ${borderLeft}`}>
                      <span className="text-2xl flex-shrink-0">{getCategoryEmoji(c.category)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{truncate(c.title, 48)}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                          <span className="font-mono text-[#E10600] font-bold">{c.id}</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-[#E10600]" />{c.location?.split(',')[0]}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <PriorityBadge priority={c.priority} size="sm" />
                        <StatusBadge status={c.status} size="sm" />
                      </div>
                      <div className="text-xs text-white/30 flex-shrink-0 hidden md:flex items-center gap-1">
                        <Clock className="w-3 h-3" />{formatDate(c.submittedAt)}
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/60 flex-shrink-0 transition-colors" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </PageTransition>
  );
}
