import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Plus, ArrowRight, MapPin, Clock, Sparkles,
  PhoneCall, MessageSquare, ShieldCheck, CheckCircle2,
  AlertTriangle, Activity
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCitizenComplaints } from '../hooks/useComplaints';
import PriorityBadge from '../components/PriorityBadge';
import StatusBadge from '../components/StatusBadge';
import PageTransition from '../components/PageTransition';
import SkeletonCard, { SkeletonStat } from '../components/SkeletonCard';
import { formatDate, getCategoryEmoji, truncate } from '../utils/helpers';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import AnimatedNumber from '../components/AnimatedNumber';
import { cardGestures, buttonGestures } from '../utils/motion';

export default function CitizenDashboardPage() {
  const { user } = useAuth();
  const { complaints, loading, error, refetch } = useCitizenComplaints();

  const total    = complaints.length;
  const active   = complaints.filter((c) => !['Resolved', 'Closed'].includes(c.status)).length;
  const resolved = complaints.filter((c)  => ['Resolved', 'Closed'].includes(c.status)).length;
  const high     = complaints.filter((c)  => ['HIGH', 'CRITICAL'].includes(c.priority)).length;

  const recent = complaints.slice(0, 5);

  return (
    <PageTransition className="min-h-screen bg-[#070707] pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header Brief with AI Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-6 sm:p-8 bg-[#0E0E0E] border-white/10 rounded-3xl relative overflow-hidden shadow-2xl"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E10600] via-[#FFC400] to-[#22C55E]" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-mono text-[#FFC400] bg-[#FFC400]/10 border border-[#FFC400]/25 px-3 py-1 rounded-full mb-3 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Citizen Operations Hub</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight font-display">
                Welcome back, <span className="text-[#E10600]">{user?.full_name?.split(' ')[0] ?? 'Citizen'}</span>
              </h1>
              <p className="text-white/50 text-sm mt-1 max-w-xl font-sans">
                {error
                  ? 'Unable to sync live records with municipal database.'
                  : total === 0
                  ? 'No complaints filed yet. Report an issue to start intelligent municipal resolution.'
                  : `You have ${active} active civic report(s) currently progressing through municipal verification.`}
              </p>
            </div>

            {/* Quick Report CTA */}
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/report">
                <motion.div {...buttonGestures} className="btn-primary py-3.5 px-6 glow-red-sm text-sm font-bold shadow-lg font-display flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>Report Issue</span>
                </motion.div>
              </Link>
              <Link to="/call">
                <motion.div {...buttonGestures} className="btn-secondary py-3.5 px-5 text-sm font-semibold flex items-center gap-2 font-mono">
                  <PhoneCall className="w-4 h-4 text-[#22C55E]" />
                  <span>AI Helpline</span>
                </motion.div>
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Error Alert Card if API failed */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-6 bg-[#181111] border-[#E10600]/30 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl"
          >
            <div className="flex items-center gap-3 text-left">
              <AlertTriangle className="w-6 h-6 text-[#E10600] flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-white font-display">Connection issue: Unable to load your complaints</p>
                <p className="text-xs text-white/50 mt-0.5 font-mono">{error}</p>
              </div>
            </div>
            <motion.button {...buttonGestures} onClick={() => void refetch()} className="btn-primary py-2 px-4 text-xs font-semibold flex-shrink-0 font-mono">
              Retry Sync
            </motion.button>
          </motion.div>
        )}

        {/* Telemetry Stats Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => <SkeletonStat key={i} />)}
          </div>
        ) : (
          <StaggerContainer className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Filed', value: total, color: 'text-white', sub: 'Historical records' },
              { label: 'In Resolution', value: active, color: 'text-[#FFC400]', sub: 'Active workflows' },
              { label: 'Resolved', value: resolved, color: 'text-[#22C55E]', sub: 'Verified complete' },
              { label: 'High Priority', value: high, color: high > 0 ? 'text-[#E10600]' : 'text-white/60', sub: 'Urgent SLA' },
            ].map((s) => (
              <StaggerItem key={s.label}>
                <motion.div {...cardGestures} className="telemetry-card rounded-2xl p-5 bg-[#0D0D0D] h-full">
                  <p className={`text-3xl sm:text-4xl font-black tabular-nums font-display ${s.color}`}>
                    <AnimatedNumber value={s.value} />
                  </p>
                  <p className="text-xs text-white/70 font-semibold mt-1 font-mono">{s.label}</p>
                  <p className="text-[10px] text-white/30 font-mono mt-0.5">{s.sub}</p>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        )}

        {/* Quick Actions Panel */}
        <StaggerContainer className="grid sm:grid-cols-3 gap-3">
          <StaggerItem>
            <Link to="/my-complaints">
              <motion.div {...cardGestures} className="card p-4 bg-[#111] hover:bg-white/5 border-white/8 hover:border-white/20 transition-colors rounded-2xl flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-white/70" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white font-display">My Complaints</p>
                    <p className="text-xs text-white/40 font-mono">View history & updates</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
              </motion.div>
            </Link>
          </StaggerItem>

          <StaggerItem>
            <Link to="/track">
              <motion.div {...cardGestures} className="card p-4 bg-[#111] hover:bg-white/5 border-white/8 hover:border-white/20 transition-colors rounded-2xl flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FFC400]/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-[#FFC400]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white font-display">Track by ID</p>
                    <p className="text-xs text-white/40 font-mono">Public status timeline</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
              </motion.div>
            </Link>
          </StaggerItem>

          <StaggerItem>
            <Link to="/call">
              <motion.div {...cardGestures} className="card p-4 bg-[#111] hover:bg-white/5 border-white/8 hover:border-white/20 transition-colors rounded-2xl flex items-center justify-between group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#22C55E]/10 flex items-center justify-center">
                    <PhoneCall className="w-5 h-5 text-[#22C55E]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white font-display">Voice Call Helpline</p>
                    <p className="text-xs text-white/40 font-mono">Report via spoken voice</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
              </motion.div>
            </Link>
          </StaggerItem>
        </StaggerContainer>

        {/* Recent Complaints Timeline */}
        <div className="bg-[#0E0E0E] border border-white/8 rounded-3xl overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/8 bg-[#111]">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-[#22C55E]" />
              <h2 className="font-black text-white text-base tracking-wide font-display">Your Recent Complaints</h2>
            </div>
            {complaints.length > 5 && (
              <Link to="/my-complaints" className="text-xs text-[#E10600] hover:text-[#FF1A14] font-bold flex items-center gap-1 transition-colors font-mono">
                View all ({complaints.length}) <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {loading ? (
            <div className="p-6 space-y-4">
              {[0, 1, 2].map((i) => <SkeletonCard key={i} lines={2} />)}
            </div>
          ) : recent.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto text-2xl">
                📝
              </div>
              <p className="text-white/70 font-bold text-base font-display">No complaints filed yet</p>
              <p className="text-white/40 text-xs max-w-sm mx-auto font-sans">
                When you report road damage, garbage, or water leaks, they will appear here with live resolution updates.
              </p>
              <div className="pt-3">
                <Link to="/report">
                  <motion.div {...buttonGestures} className="btn-primary inline-flex glow-red-sm font-display">
                    <Plus className="w-4 h-4" />
                    <span>File Your First Complaint</span>
                  </motion.div>
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/6">
              {recent.map((c) => {
                const borderLeft = ['HIGH', 'CRITICAL'].includes(c.priority)
                  ? 'border-l-4 border-l-[#E10600]'
                  : c.priority === 'MEDIUM'
                  ? 'border-l-4 border-l-[#FFC400]'
                  : 'border-l-4 border-l-[#22C55E]';

                return (
                  <Link
                    key={c.id}
                    to={`/track?id=${c.id}`}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 hover:bg-white/4 transition-colors group ${borderLeft}`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <span className="text-3xl flex-shrink-0 p-2 bg-white/5 rounded-xl">{getCategoryEmoji(c.category)}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white group-hover:text-[#E10600] transition-colors truncate font-display">{c.title}</p>
                        <div className="flex flex-wrap items-center gap-2.5 mt-1 text-xs text-white/40 font-mono">
                          <span className="text-[#FFC400] font-bold">{c.id}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-[#E10600]" />{c.location || 'Location provided'}</span>
                          <span>•</span>
                          <span>{c.department || 'Municipal Dept'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center flex-shrink-0">
                      <PriorityBadge priority={c.priority} size="sm" />
                      <StatusBadge status={c.status} size="sm" />
                      <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </PageTransition>
  );
}
