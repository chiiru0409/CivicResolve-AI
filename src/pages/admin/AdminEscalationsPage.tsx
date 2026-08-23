import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Clock, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import { useAdminComplaints } from '../../hooks/useComplaints';
import PriorityBadge from '../../components/PriorityBadge';
import StatusBadge from '../../components/StatusBadge';
import { api } from '../../services/api';
import { useToast, ToastContainer } from '../../components/Toast';
import { formatDate, getCategoryEmoji } from '../../utils/helpers';
import SkeletonCard from '../../components/SkeletonCard';
import PageTransition from '../../components/PageTransition';
import { StaggerContainer, StaggerItem } from '../../components/StaggerContainer';
import AnimatedNumber from '../../components/AnimatedNumber';
import { cardGestures, buttonGestures } from '../../utils/motion';

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function isOverdue(c: { priority: string; submittedAt: string; status: string }) {
  const d = daysSince(c.submittedAt);
  if (c.priority === 'HIGH' || c.priority === 'CRITICAL') return d >= 2;
  if (c.priority === 'MEDIUM') return d >= 4;
  if (c.priority === 'LOW') return d >= 7;
  return false;
}

export default function AdminEscalationsPage() {
  const { complaints, loading, error, refetch } = useAdminComplaints();
  const { toasts, addToast, dismissToast } = useToast();
  const [escalating, setEscalating] = useState<string | null>(null);

  const overdue = complaints.filter((c) => !['Resolved', 'Closed', 'Archived'].includes(c.status) && isOverdue(c));

  const handleEscalate = async (id: string) => {
    setEscalating(id);
    try {
      await api.patch(`/admin/complaints/${id}/status`, {
        status: 'Escalated',
        message: 'Escalated due to overdue SLA response threshold.',
        updated_by: 'admin',
      });
      addToast(`${id} escalated to senior municipal supervisor.`, 'warning');
      void refetch();
    } catch (e) {
      addToast('Escalation failed.', 'error');
    } finally {
      setEscalating(null);
    }
  };

  return (
    <PageTransition className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight font-display">SLA Escalation Queue</h1>
          <p className="text-white/40 text-sm mt-0.5 font-sans">Authoritative tracking of municipal complaints exceeding standard resolution deadlines</p>
        </div>
        <motion.button
          {...buttonGestures}
          onClick={() => void refetch()}
          disabled={loading}
          className="flex items-center gap-2 text-xs font-semibold text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 rounded-xl transition-colors font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E10600]' : ''}`} />
          <span>Refresh</span>
        </motion.button>
      </div>

      <div className="speed-line" />

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      ) : error ? (
        <div className="card text-center py-16 bg-[#111] border-white/10 rounded-3xl space-y-4 shadow-xl">
          <AlertTriangle className="w-10 h-10 text-[#FFC400] mx-auto" />
          <p className="text-xl font-bold text-white font-display">Unable to Load Escalations Queue</p>
          <p className="text-white/50 text-sm max-w-md mx-auto font-mono">{error}</p>
          <motion.button
            {...buttonGestures}
            onClick={() => void refetch()}
            className="btn-primary py-2 px-4 text-xs font-bold inline-flex items-center gap-2 font-mono"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
          </motion.button>
        </div>
      ) : (
        <>
          <StaggerContainer className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StaggerItem>
              <div className="telemetry-card">
                <p className="text-3xl font-black text-[#E10600] font-display">
                  <AnimatedNumber value={overdue.length} />
                </p>
                <p className="text-sm text-white/40 mt-1 font-mono">Total Overdue</p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="telemetry-card">
                <p className="text-3xl font-black text-[#FFC400] font-display">
                  <AnimatedNumber value={overdue.filter((c) => ['HIGH', 'CRITICAL'].includes(c.priority)).length} />
                </p>
                <p className="text-sm text-white/40 mt-1 font-mono">High Priority Overdue</p>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="telemetry-card">
                <p className="text-3xl font-black text-white/70 font-display">
                  <AnimatedNumber value={overdue.filter((c) => c.status === 'Escalated').length} />
                </p>
                <p className="text-sm text-white/40 mt-1 font-mono">Active Escalations</p>
              </div>
            </StaggerItem>
          </StaggerContainer>

          {overdue.length === 0 ? (
            <div className="card text-center py-16 bg-[#111] border-white/8 rounded-3xl shadow-xl">
              <CheckCircle className="w-12 h-12 text-[#22C55E] mx-auto mb-4" />
              <p className="text-lg font-bold text-white font-display">Zero Overdue Complaints</p>
              <p className="text-white/40 text-sm mt-1 font-sans">All active citizen complaints are currently within their SLA resolution benchmark window.</p>
            </div>
          ) : (
            <StaggerContainer className="space-y-4">
              {overdue.map((c) => {
                const days = daysSince(c.submittedAt);
                const expected = (c.priority === 'HIGH' || c.priority === 'CRITICAL') ? 2 : c.priority === 'MEDIUM' ? 4 : 7;
                const delay = Math.max(1, days - expected);
                const isEsc = c.status === 'Escalated';

                return (
                  <StaggerItem key={c.id}>
                    <motion.div
                      {...cardGestures}
                      className={`card border shadow-lg ${isEsc ? 'border-[#FFC400]/30 bg-[#14120F]' : 'border-[#E10600]/30 bg-[#140F0F]'}`}
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
                        <div className="flex items-start gap-3">
                          <span className="text-2xl">{getCategoryEmoji(c.category)}</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-xs font-black font-mono text-[#E10600]">{c.id}</span>
                              <PriorityBadge priority={c.priority} size="sm" />
                              <StatusBadge status={c.status} size="sm" />
                            </div>
                            <p className="font-bold text-white font-display">{String(c.title ?? '')}</p>
                            <p className="text-xs text-white/40 mt-0.5 font-mono">{c.department} · {formatDate(c.submittedAt)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 bg-[#E10600]/15 text-[#E10600] px-3 py-1.5 rounded-xl border border-[#E10600]/25 flex-shrink-0 font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">{delay}d overdue</span>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-3">
                        <motion.button
                          {...buttonGestures}
                          onClick={() => void handleEscalate(c.id)}
                          disabled={!!escalating || isEsc}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all font-mono ${
                            isEsc
                              ? 'bg-[#FFC400]/10 text-[#FFC400] border border-[#FFC400]/20 cursor-not-allowed'
                              : 'btn-primary py-2 px-4'
                          }`}
                        >
                          {escalating === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isEsc ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                          {isEsc ? 'Escalated to Supervisor' : escalating === c.id ? 'Escalating…' : 'Escalate Priority'}
                        </motion.button>
                      </div>
                    </motion.div>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          )}
        </>
      )}
    </PageTransition>
  );
}
