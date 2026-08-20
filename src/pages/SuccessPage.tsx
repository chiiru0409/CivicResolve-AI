import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, Copy, Search, ArrowRight, Clock, Building2, MapPin, Zap } from 'lucide-react';
import { getComplaintById } from '../services/complaintService';
import PriorityBadge from '../components/PriorityBadge';
import StatusBadge from '../components/StatusBadge';
import type { Complaint } from '../types';
import { useToast, ToastContainer } from '../components/Toast';

const SuccessPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toasts, addToast, dismissToast } = useToast();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    // getComplaintById is async — tries API first, falls back to localStorage
    getComplaintById(id).then((found) => {
      if (found) setComplaint(found);
    }).catch(() => {});
  }, [id]);

  const handleCopy = () => {
    if (!id) return;
    navigator.clipboard.writeText(id).catch(() => {});
    setCopied(true);
    addToast('Complaint ID copied!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#070707] pt-20 pb-12 flex items-center">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="max-w-lg w-full mx-auto px-4">

        {/* Success header */}
        <div className="text-center mb-8">
          <div className="relative inline-flex mb-4">
            <div className="w-20 h-20 bg-[#22C55E]/10 border-2 border-[#22C55E]/30 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-[#22C55E]" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Complaint Registered!</h1>
          <p className="text-white/50">
            Your complaint has been analyzed and routed to the appropriate authority.
          </p>
        </div>

        {/* Complaint ID card */}
        <div className="relative bg-[#111] border border-white/8 rounded-2xl mb-5 p-6 text-center overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600] to-transparent" />
          <div className="flex items-center justify-between mb-2">
            <span className="telemetry-chip-red">[ PERMANENT RECORD ]</span>
            <span className="text-[10px] font-mono text-white/30">STATUS: QUEUED</span>
          </div>
          <p className="text-xs text-white/40 mb-2 uppercase tracking-widest font-bold">Your Complaint ID</p>
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl font-black font-mono text-[#E10600] tracking-wider">{id}</span>
            <button
              onClick={handleCopy}
              className={`p-2 rounded-xl transition-all ${
                copied
                  ? 'bg-[#22C55E]/10 text-[#22C55E]'
                  : 'bg-white/5 text-white/40 hover:text-white'
              }`}
              title="Copy ID"
            >
              {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-[#E10600] mt-2 font-semibold">Save this ID to track your complaint</p>
        </div>

        {/* Complaint details */}
        {complaint && (
          <div className="bg-[#111] border border-white/8 rounded-2xl mb-5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#FFC400]" />
                Complaint Summary
              </h2>
              <span className="telemetry-chip">[ DISPATCH LOG ]</span>
            </div>

            {/* Mini location map thumbnail if coordinates exist */}
            {complaint.latitude && complaint.longitude && (
              <div className="mb-4 p-3 bg-white/4 border border-white/8 rounded-xl flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#090909] border border-white/10 relative overflow-hidden flex-shrink-0 flex items-center justify-center">
                  <div className="absolute inset-0 grid-bg opacity-40" />
                  <div className="w-4 h-4 rounded-full bg-[#E10600]/30 animate-ping absolute" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#E10600] border border-white relative z-10" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-mono text-white/40 block">INCIDENT GPS LOCK</span>
                  <span className="text-xs font-semibold text-white truncate block">{complaint.location}</span>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              {[
                {
                  label: 'Title',
                  value: <span className="text-sm font-medium text-white text-right max-w-[60%] truncate">{complaint.title}</span>,
                },
                {
                  label: 'Category',
                  value: <span className="text-sm font-semibold text-white">{complaint.category}</span>,
                },
                {
                  label: 'Priority',
                  value: <PriorityBadge priority={complaint.priority} />,
                },
                {
                  label: 'Department',
                  value: (
                    <span className="text-sm font-medium text-white text-right max-w-[60%] flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-[#FFC400] flex-shrink-0" />
                      {complaint.department}
                    </span>
                  ),
                },
                {
                  label: 'Status',
                  value: <StatusBadge status={complaint.status} />,
                },
                {
                  label: 'Location',
                  value: (
                    <span className="text-sm font-medium text-white text-right max-w-[60%] flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#E10600] flex-shrink-0" />
                      {complaint.location}
                    </span>
                  ),
                },
                {
                  label: 'Est. Response',
                  value: (
                    <span className="text-sm font-bold text-[#FFC400] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {complaint.estimatedResponse ?? '48–72 hours'}
                    </span>
                  ),
                },
              ].map(({ label, value }, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center py-2 border-b border-white/8 last:border-0"
                >
                  <span className="text-sm text-white/40 flex-shrink-0">{label}</span>
                  {value}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Link
            to={`/track?id=${id}`}
            className="btn-primary w-full justify-center py-3.5 text-sm font-bold shadow-sm hover:shadow active:scale-[0.98] transition-all duration-150"
          >
            <Search className="w-4 h-4" />
            Track Complaint
            <ArrowRight className="w-4 h-4" />
          </Link>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/report" className="btn-secondary justify-center py-3">
              Report Another
            </Link>
            <button onClick={handleCopy} className="btn-secondary justify-center py-3">
              <Copy className="w-4 h-4" />
              Copy ID
            </button>
          </div>
        </div>

        {/* What's next */}
        <div className="mt-6 bg-[#111] border border-[#FFC400]/15 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFC400]/40 to-transparent" />
          <h3 className="font-bold text-[#FFC400] text-sm mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            What happens next?
          </h3>
          <ul className="space-y-2">
            {[
              'Department team reviews your complaint',
              'Field officer assigned within 2–4 hours',
              'Site inspection scheduled',
              "You'll be notified at each step",
            ].map((step, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-white/50">
                <CheckCircle className="w-3.5 h-3.5 text-[#22C55E] flex-shrink-0" />
                {step}
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
};

export default SuccessPage;
