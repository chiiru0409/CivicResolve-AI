import React, { useState } from 'react';
import { AlertTriangle, Clock, CheckCircle, Loader2 } from 'lucide-react';
import { useAdminComplaints } from '../../hooks/useComplaints';
import PriorityBadge from '../../components/PriorityBadge';
import StatusBadge from '../../components/StatusBadge';
import { api, isBackendAvailable } from '../../services/api';
import { escalateComplaint } from '../../services/complaintService';
import { useToast, ToastContainer } from '../../components/Toast';
import { formatDate, getCategoryEmoji } from '../../utils/helpers';

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function isOverdue(c: { priority: string; submittedAt: string; status: string }) {
  const d = daysSince(c.submittedAt);
  if (c.priority === 'HIGH'   && d >= 2) return true;
  if (c.priority === 'MEDIUM' && d >= 4) return true;
  if (c.priority === 'LOW'    && d >= 7) return true;
  return false;
}

export default function AdminEscalationsPage() {
  const { complaints, refetch } = useAdminComplaints();
  const { toasts, addToast, dismissToast } = useToast();
  const [escalating, setEscalating] = useState<string | null>(null);

  const overdue = complaints.filter((c) => !['Resolved','Closed'].includes(c.status) && isOverdue(c));

  const handleEscalate = async (id: string) => {
    setEscalating(id);
    try {
      if (isBackendAvailable()) {
        await api.patch(`/admin/complaints/${id}/status`, { status: 'Escalated', message: 'Escalated due to overdue response time.', updated_by: 'system' });
      } else {
        escalateComplaint(id);
      }
      addToast(`${id} escalated.`, 'warning');
      refetch();
    } catch (e) {
      addToast('Escalation failed.', 'error');
    } finally {
      setEscalating(null);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div>
        <h1 className="text-2xl font-black text-white">Escalations</h1>
        <p className="text-white/40 text-sm mt-0.5">Complaints exceeding expected resolution time</p>
      </div>
      <div className="speed-line" />

      <div className="grid grid-cols-3 gap-4">
        <div className="telemetry-card"><p className="text-2xl font-black text-[#E10600]">{overdue.length}</p><p className="text-sm text-white/40">Overdue</p></div>
        <div className="telemetry-card"><p className="text-2xl font-black text-[#FFC400]">{overdue.filter((c) => c.priority === 'HIGH').length}</p><p className="text-sm text-white/40">High Priority</p></div>
        <div className="telemetry-card"><p className="text-2xl font-black text-white/50">{overdue.filter((c) => c.status === 'Escalated').length}</p><p className="text-sm text-white/40">Escalated</p></div>
      </div>

      {overdue.length === 0 ? (
        <div className="card text-center py-16">
          <CheckCircle className="w-12 h-12 text-[#22C55E] mx-auto mb-4" />
          <p className="text-white font-bold">No overdue complaints!</p>
          <p className="text-white/40 text-sm mt-1">All complaints are within expected resolution time.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {overdue.map((c) => {
            const days = daysSince(c.submittedAt);
            const expected = c.priority === 'HIGH' ? 2 : c.priority === 'MEDIUM' ? 4 : 7;
            const delay = days - expected;
            const isEsc = c.status === 'Escalated';

            return (
              <div key={c.id} className={`card border ${isEsc ? 'border-[#FFC400]/20' : 'border-[#E10600]/20'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{getCategoryEmoji(c.category)}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-black font-mono text-[#E10600]">{c.id}</span>
                        <PriorityBadge priority={c.priority} size="sm" />
                        <StatusBadge status={c.status} size="sm" />
                      </div>
                      <p className="font-bold text-white">{String(c.title ?? '')}</p>
                      <p className="text-xs text-white/40 mt-0.5">{c.department} · {formatDate(c.submittedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#E10600]/10 text-[#E10600] px-3 py-1.5 rounded-xl border border-[#E10600]/20 flex-shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">{delay}d overdue</span>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button onClick={() => handleEscalate(c.id)} disabled={!!escalating || isEsc}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                      isEsc ? 'bg-[#FFC400]/10 text-[#FFC400] border border-[#FFC400]/20 cursor-not-allowed'
                            : 'bg-[#E10600] hover:bg-[#C90000] text-white'}`}>
                    {escalating === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : isEsc ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {isEsc ? 'Escalated' : escalating === c.id ? 'Escalating…' : 'Escalate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
