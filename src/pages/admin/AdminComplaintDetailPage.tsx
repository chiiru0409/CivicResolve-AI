import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, MapPin, Zap, Loader2, CheckCircle, Edit2 } from 'lucide-react';
import PriorityBadge from '../../components/PriorityBadge';
import StatusBadge from '../../components/StatusBadge';
import ComplaintTimeline from '../../components/ComplaintTimeline';
import ComplaintLocationMap from '../../components/ComplaintLocationMap';
import { api, isBackendAvailable } from '../../services/api';
import { getAllComplaints, updateComplaintStatus } from '../../services/complaintService';
import type { Complaint } from '../../types';
import { useToast, ToastContainer } from '../../components/Toast';
import { formatDateTime, getCategoryEmoji } from '../../utils/helpers';
import SkeletonCard from '../../components/SkeletonCard';

type AdminStatus = 'Assigned' | 'In Progress' | 'Inspection' | 'Resolved' | 'Closed';
const STATUS_ACTIONS: AdminStatus[] = ['Assigned', 'In Progress', 'Inspection', 'Resolved', 'Closed'];

export default function AdminComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toasts, addToast, dismissToast } = useToast();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading]     = useState(true);
  const [updating, setUpdating]   = useState(false);
  const [department, setDepartment] = useState('');
  const [officer, setOfficer]     = useState('');

  useEffect(() => {
    if (!id) return;
    loadComplaint(id);
  }, [id]);

  const loadComplaint = async (cid: string) => {
    setLoading(true);
    try {
      if (isBackendAvailable()) {
        const raw = await api.get<Record<string, unknown>>(`/admin/complaints/${cid}`);
        // Map API response to Complaint
        const c: Complaint = {
          id:                String(raw.complaint_number ?? raw.id),
          title:             String(raw.title ?? ''),
          description:       String(raw.description ?? ''),
          category:          raw.category as Complaint['category'],
          priority:          raw.priority as Complaint['priority'],
          status:            raw.status as Complaint['status'],
          department:        String(raw.department ?? ''),
          location:          String(raw.location ?? ''),
          latitude:          raw.latitude != null ? Number(raw.latitude) : undefined,
          longitude:         raw.longitude != null ? Number(raw.longitude) : undefined,
          landmark:          raw.landmark as string | undefined,
          imageUrl:          raw.image_path as string | undefined,
          submittedAt:       String(raw.created_at ?? ''),
          updatedAt:         String(raw.updated_at ?? ''),
          assignedTo:        raw.assigned_officer as string | undefined,
          estimatedResponse: raw.estimated_response as string | undefined,
          aiConfidence:      raw.ai_confidence as number | undefined,
          aiReason:          raw.ai_reason as string | undefined,
          escalationLevel:   Number(raw.escalation_level ?? 0),
          zone:              raw.zone as string | undefined,
          isAnonymous:       Boolean(raw.is_anonymous),
          contactPreference: String(raw.contact_preference ?? 'email'),
          source:            (raw.source as string) ?? (raw.contact_preference === 'voice' ? 'AI Call' : 'Web'),
          timeline: [],
        };
        const updates = raw.updates as Array<{ status: string; message: string | null; created_at: string }> ?? [];
        c.timeline = ['Submitted','AI_Analysis','Routed','Assigned','In Progress','Inspection','Resolved'].map((step, i) => {
          const u = updates.find((x) => x.status === step);
          const isDone = updates.some((x) => x.status === step);
          const isCurr = c.status === step;
          return { id: `s${i}`, label: step === 'AI_Analysis' ? 'AI Analysis' : step === 'In Progress' ? 'Work In Progress' : step, timestamp: u?.created_at ?? (isDone ? c.submittedAt : null), status: isCurr ? 'current' : isDone ? 'completed' : 'pending', note: u?.message ?? undefined } as Complaint['timeline'][0];
        });
        setComplaint(c);
        setDepartment(c.department ?? '');
        setOfficer(c.assignedTo ?? '');
      } else {
        const all = getAllComplaints();
        const c = all.find((x) => x.id === cid);
        if (c) { setComplaint(c); setDepartment(c.department ?? ''); setOfficer(c.assignedTo ?? ''); }
      }
    } catch (e) {
      addToast('Failed to load complaint.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (newStatus: AdminStatus) => {
    if (!id || !complaint) return;
    setUpdating(true);
    try {
      if (isBackendAvailable()) {
        await api.patch(`/admin/complaints/${id}/status`, { status: newStatus, message: `Status updated to ${newStatus}`, updated_by: 'admin' });
      } else {
        updateComplaintStatus(complaint.id, newStatus as Complaint['status']);
      }
      addToast(`Status updated to "${newStatus}"`, 'success');
      await loadComplaint(id);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Update failed.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleAssign = async () => {
    if (!id || !department) return;
    setUpdating(true);
    try {
      if (isBackendAvailable()) {
        await api.post(`/admin/complaints/${id}/assign`, { department, officer: officer || undefined, assigned_by: 'admin' });
      }
      addToast('Assignment saved.', 'success');
      await loadComplaint(id);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Assignment failed.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="p-6"><SkeletonCard lines={6} /></div>;
  if (!complaint) return <div className="p-6 text-white/50">Complaint not found.</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <button onClick={() => navigate('/admin/complaints')}
        className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to complaints
      </button>

      {/* Header */}
      <div className="relative bg-[#111] border border-white/8 rounded-2xl p-6 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600]/40 to-transparent" />
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <span className="text-4xl">{getCategoryEmoji(complaint.category)}</span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-black font-mono text-[#E10600]">{complaint.id}</p>
                <span className="telemetry-chip">[ DISPATCH LOG ]</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white">{complaint.title}</h1>
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <PriorityBadge priority={complaint.priority} />
                <StatusBadge status={complaint.status} />
                {complaint.source && (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                    complaint.source === 'AI Call'
                      ? 'bg-[#FFC400]/10 text-[#FFC400] border-[#FFC400]/25'
                      : 'bg-white/5 text-white/50 border-white/10'
                  }`}>
                    {complaint.source === 'AI Call' ? '📞 AI Call' : '🌐 Web'}
                  </span>
                )}
              </div>
            </div>
          </div>
          {complaint.latitude && (
            <div className="hidden sm:block text-right">
              <span className="telemetry-chip-green">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                GEO LOCATED
              </span>
              <p className="text-[11px] font-mono text-white/30 mt-1">
                {complaint.latitude.toFixed(4)}°N, {complaint.longitude?.toFixed(4)}°E
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Complaint info, AI analysis, Assignment, Status actions, Timeline) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Complaint info */}
          <div className="card space-y-3">
            <h2 className="font-black text-white">Complaint Details</h2>
            <div className="bg-white/5 border border-white/8 rounded-xl p-4">
              <p className="text-sm text-white/70 leading-relaxed">{complaint.description}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#E10600] mt-0.5 flex-shrink-0" />
                <span className="text-white/70">{complaint.location}</span>
              </div>
              {complaint.latitude && (
                <div className="text-xs font-mono text-white/40">
                  GPS: {complaint.latitude.toFixed(6)}, {complaint.longitude?.toFixed(6)}
                </div>
              )}
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-[#FFC400] mt-0.5 flex-shrink-0" />
                <span className="text-white/70">{complaint.department}</span>
              </div>
              <p className="text-xs text-white/30">Submitted: {formatDateTime(complaint.submittedAt)}</p>
            </div>
          </div>

          {/* AI Analysis */}
          <div className="bg-[#111] border border-white/8 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#FFC400]" />
              <h2 className="font-black text-white">AI Analysis</h2>
              {complaint.aiConfidence && (
                <span className="ml-auto text-xs font-black text-[#FFC400] bg-[#FFC400]/10 border border-[#FFC400]/20 px-2 py-0.5 rounded-full">
                  {complaint.aiConfidence}% confidence
                </span>
              )}
            </div>
            {complaint.aiReason && (
              <div className="bg-white/5 border border-white/8 rounded-xl p-3">
                <p className="text-sm text-white/60 italic">"{complaint.aiReason}"</p>
              </div>
            )}
            {complaint.imageUrl && (
              <div>
                <p className="text-xs text-white/40 mb-2 font-semibold uppercase tracking-wide">Evidence</p>
                <img src={complaint.imageUrl} alt="Evidence" className="rounded-xl w-full max-h-48 object-cover" />
              </div>
            )}
          </div>

          {/* Assignment */}
          <div className="card space-y-4">
            <h2 className="font-black text-white flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-[#E10600]" /> Assignment
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Department</label>
                <input value={department} onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Department name" className="input-field" />
              </div>
              <div>
                <label className="label">Officer / Team</label>
                <input value={officer} onChange={(e) => setOfficer(e.target.value)}
                  placeholder="Officer name (optional)" className="input-field" />
              </div>
            </div>
            <button onClick={handleAssign} disabled={updating || !department}
              className="btn-primary">
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save Assignment
            </button>
          </div>

          {/* Status actions */}
          <div className="card space-y-3">
            <h2 className="font-black text-white">Update Status</h2>
            <div className="flex flex-wrap gap-2">
              {STATUS_ACTIONS.map((s) => (
                <button key={s} onClick={() => handleStatusUpdate(s)}
                  disabled={updating || complaint.status === s}
                  className={`flex items-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl transition-all ${
                    complaint.status === s
                      ? 'bg-[#E10600] text-white'
                      : 'bg-white/5 text-white/50 hover:bg-[#E10600]/10 hover:text-[#E10600] border border-white/8 hover:border-[#E10600]/30'
                  }`}>
                  {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="card">
            <h2 className="font-black text-white mb-5">Status Timeline</h2>
            <ComplaintTimeline events={complaint.timeline} />
          </div>
        </div>

        {/* Right Column: Location Map */}
        <div className="lg:col-span-5 lg:sticky lg:top-6">
          <ComplaintLocationMap complaint={complaint} />
        </div>
      </div>
    </div>
  );
}
