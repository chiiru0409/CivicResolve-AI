import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, MapPin, Building2, Clock, Bell,
  Plus, RefreshCw, AlertCircle, Zap, Loader2,
} from 'lucide-react';
import { trackComplaint } from '../services/complaintService';
import PriorityBadge from '../components/PriorityBadge';
import StatusBadge from '../components/StatusBadge';
import ComplaintTimeline from '../components/ComplaintTimeline';
import PageTransition from '../components/PageTransition';
import type { Complaint } from '../types';
import { formatDate, getCategoryEmoji } from '../utils/helpers';
import { useToast, ToastContainer } from '../components/Toast';
import { buttonGestures, cardGestures } from '../utils/motion';

const TrackComplaintPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { toasts, addToast, dismissToast } = useToast();

  const [inputId, setInputId]       = useState(searchParams.get('id') ?? '');
  const [complaint, setComplaint]   = useState<Complaint | null>(null);
  const [notFound, setNotFound]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [reminderSent, setReminderSent] = useState(false);

  const doSearch = useCallback(async (id: string) => {
    const trimmed = id.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setNotFound(false);
    try {
      const result = await trackComplaint(trimmed);
      if (result) { setComplaint(result); setNotFound(false); }
      else         { setComplaint(null);  setNotFound(true); }
    } catch {
      setComplaint(null);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-search when URL param is present
  useEffect(() => {
    const id = searchParams.get('id');
    if (id) { setInputId(id); void doSearch(id); }
  }, [searchParams, doSearch]);

  const handleSearch = () => { if (inputId.trim()) void doSearch(inputId); };
  const handleKey    = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  const handleReminder = () => {
    setReminderSent(true);
    addToast('Reminder sent to the department!', 'success');
    setTimeout(() => setReminderSent(false), 5000);
  };

  return (
    <PageTransition className="min-h-screen bg-[#070707] pt-20 pb-12">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="max-w-2xl mx-auto px-4 sm:px-6">

        {/* ── Header ───────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-[#FFC400]/10 border border-[#FFC400]/20 text-[#FFC400] text-sm font-bold px-4 py-2 rounded-full mb-4 font-mono shadow-[0_0_12px_rgba(255,196,0,0.15)]">
            <Search className="w-4 h-4" />
            Complaint Tracking
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white font-display">
            Track Your Complaint
          </h1>
          <p className="text-white/50 mt-3 font-sans">
            Enter your complaint ID to see the current status and full timeline.
          </p>
        </div>

        {/* ── Search box ───────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111] border border-white/8 rounded-2xl p-5 mb-5 shadow-xl"
        >
          <label className="block text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 font-mono">
            Enter Complaint ID
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={inputId}
              onChange={(e) => setInputId(e.target.value.toUpperCase())}
              onKeyDown={handleKey}
              placeholder="e.g. CR-2026-004821"
              className="input-field flex-1 font-mono tracking-wider"
              maxLength={18}
            />
            <motion.button
              {...buttonGestures}
              onClick={handleSearch}
              disabled={loading}
              className="btn-primary flex-shrink-0 px-5 font-mono"
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Search className="w-4 h-4" />
              }
              <span>Track</span>
            </motion.button>
          </div>
        </motion.div>

        {/* ── Loading / Results / Empty with AnimatePresence ─ */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-[#111] border border-white/8 rounded-2xl p-10 text-center shadow-xl"
            >
              <Loader2 className="w-10 h-10 text-[#E10600] animate-spin mx-auto mb-3" />
              <p className="text-white/50 text-sm font-medium font-sans">Searching for complaint…</p>
            </motion.div>
          )}

          {!loading && notFound && (
            <motion.div
              key="not-found"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-[#111] border border-white/8 rounded-2xl p-10 text-center shadow-xl"
            >
              <AlertCircle className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white font-semibold font-display">Complaint not found</p>
              <p className="text-white/40 text-sm mt-1 font-sans">
                Check the ID and try again. Format: <span className="font-mono text-[#E10600]">CR-YYYY-XXXXXX</span>
              </p>
            </motion.div>
          )}

          {!loading && complaint && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >

              {/* Header card */}
              <motion.div
                {...cardGestures}
                className="relative bg-[#111] border border-white/8 rounded-2xl p-6 overflow-hidden shadow-2xl"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#E10600] to-transparent" />

                <div className="flex items-center justify-between gap-2 mb-4 pb-2 border-b border-white/8">
                  <span className="telemetry-chip-red">[ INCIDENT TELEMETRY ]</span>
                  <span className="text-[10px] font-mono text-white/30">DISPATCH: ACTIVE</span>
                </div>

                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{getCategoryEmoji(complaint.category)}</span>
                    <div>
                      <p className="text-xs text-[#E10600] font-black font-mono mb-0.5">{complaint.id}</p>
                      <h2 className="font-black text-white text-lg leading-snug font-display">{complaint.title}</h2>
                    </div>
                  </div>
                  <motion.button
                    {...buttonGestures}
                    onClick={() => void doSearch(complaint.id)}
                    className="p-2 rounded-xl hover:bg-white/5 text-white/30 hover:text-white transition-colors flex-shrink-0"
                    title="Refresh"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </motion.button>
                </div>

                {/* Priority / Status / Date row */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div>
                    <p className="text-xs text-white/30 mb-1.5 font-mono">Priority</p>
                    <PriorityBadge priority={complaint.priority} />
                  </div>
                  <div>
                    <p className="text-xs text-white/30 mb-1.5 font-mono">Status</p>
                    <StatusBadge status={complaint.status} />
                  </div>
                  <div>
                    <p className="text-xs text-white/30 mb-1.5 font-mono">Submitted</p>
                    <p className="text-sm font-semibold text-white font-mono">{formatDate(complaint.submittedAt)}</p>
                  </div>
                </div>

                {/* Meta info */}
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2 text-sm">
                    <Building2 className="w-4 h-4 text-[#FFC400] mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium text-white font-display">{complaint.department}</span>
                      {complaint.assignedTo && (
                        <span className="text-xs text-[#FFC400] ml-2 font-mono">→ {complaint.assignedTo}</span>
                      )}
                    </div>
                  </div>
                  {complaint.location && (
                    <div className="flex items-center gap-2 text-sm text-white/50 font-sans">
                      <MapPin className="w-4 h-4 text-[#E10600] flex-shrink-0" />
                      <span>{complaint.location}</span>
                    </div>
                  )}
                  {complaint.estimatedResponse && (
                    <div className="flex items-center gap-2 text-sm text-white/50 font-mono">
                      <Clock className="w-4 h-4 text-[#FFC400] flex-shrink-0" />
                      <span>
                        Est. response:{' '}
                        <strong className="text-[#FFC400]">{complaint.estimatedResponse}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* AI analysis */}
                {complaint.aiReason && (
                  <div className="mt-4 bg-[#FFC400]/5 border border-[#FFC400]/15 rounded-xl p-3">
                    <p className="text-xs text-[#FFC400] font-bold mb-1 flex items-center gap-1.5 font-mono">
                      <Zap className="w-3.5 h-3.5" /> AI Analysis
                    </p>
                    <p className="text-xs text-white/50 font-sans">"{complaint.aiReason}"</p>
                    {complaint.aiConfidence && (
                      <p className="text-xs text-[#FFC400] mt-1 font-mono">
                        Confidence: {complaint.aiConfidence}%
                      </p>
                    )}
                  </div>
                )}

                {/* Escalated banner */}
                {complaint.status === 'Escalated' && (
                  <div className="mt-4 bg-[#E10600]/10 border border-[#E10600]/20 rounded-xl p-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[#E10600] flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-[#E10600] font-mono">Complaint Escalated</p>
                      <p className="text-xs text-[#E10600]/60 font-sans">
                        Level {complaint.escalationLevel ?? 1} — Department head notified.
                      </p>
                    </div>
                  </div>
                )}

                {/* Resolved banner */}
                {['Resolved', 'Closed'].includes(complaint.status) && (
                  <div className="mt-4 bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-xl p-3 flex items-center gap-2">
                    <div className="w-4 h-4 text-[#22C55E] flex-shrink-0">✓</div>
                    <p className="text-xs font-bold text-[#22C55E] font-sans">
                      Issue resolved{complaint.updatedAt ? ` on ${formatDate(complaint.updatedAt)}` : ''}.
                    </p>
                  </div>
                )}
              </motion.div>

              {/* Timeline */}
              <div className="bg-[#111] border border-white/8 rounded-2xl p-6 shadow-xl">
                <h3 className="font-black text-white mb-5 font-display">Resolution Timeline</h3>
                <ComplaintTimeline events={complaint.timeline} />
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <motion.button
                  {...buttonGestures}
                  onClick={handleReminder}
                  disabled={reminderSent}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all border font-mono ${
                    reminderSent
                      ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20 cursor-not-allowed'
                      : 'bg-[#FFC400]/10 hover:bg-[#FFC400]/15 text-[#FFC400] border-[#FFC400]/20'
                  }`}
                >
                  <Bell className="w-4 h-4" />
                  <span>{reminderSent ? 'Reminder Sent!' : 'Send Reminder'}</span>
                </motion.button>
                <motion.button
                  {...buttonGestures}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-white/5 hover:bg-white/10 text-white/40 hover:text-white border border-white/8 transition-colors font-mono"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Information</span>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Empty state ───────────────────────────────── */}
          {!loading && !complaint && !notFound && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-[#111] border border-white/8 rounded-2xl p-16 text-center shadow-xl"
            >
              <Search className="w-14 h-14 text-white/10 mx-auto mb-4" />
              <p className="text-white/40 font-medium font-sans">Enter a Complaint ID to track its status</p>
              <p className="text-white/20 text-sm mt-1 font-mono">CR-YYYY-XXXXXX</p>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </PageTransition>
  );
};

export default TrackComplaintPage;
