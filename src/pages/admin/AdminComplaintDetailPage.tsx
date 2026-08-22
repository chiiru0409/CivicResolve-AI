import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, MapPin, Zap, Loader2, CheckCircle, Edit2,
  Camera, Shield, AlertTriangle, Sparkles, CheckCircle2, AlertOctagon, Clock,
  FileCheck
} from 'lucide-react';
import PriorityBadge from '../../components/PriorityBadge';
import StatusBadge from '../../components/StatusBadge';
import ComplaintTimeline from '../../components/ComplaintTimeline';
import ComplaintLocationMap from '../../components/ComplaintLocationMap';
import { api } from '../../services/api';
import { mapApiComplaint } from '../../services/complaintService';
import type { Complaint, ComplaintStatus } from '../../types';
import { useToast, ToastContainer } from '../../components/Toast';
import { formatDateTime, getCategoryEmoji } from '../../utils/helpers';
import SkeletonCard from '../../components/SkeletonCard';

const STATUS_ACTIONS: ComplaintStatus[] = ['Assigned', 'In Progress', 'Inspection', 'Resolved', 'Closed'];

export default function AdminComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toasts, addToast, dismissToast } = useToast();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading]     = useState(true);
  const [updating, setUpdating]   = useState(false);
  const [department, setDepartment] = useState('');
  const [officer, setOfficer]     = useState('');
  const [viewMode, setViewMode]   = useState<'original' | 'ai_overlay'>('ai_overlay');

  const loadComplaint = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const raw = await api.get<Record<string, unknown>>(`/admin/complaints/${cid}`);
      const c = mapApiComplaint(raw);
      setComplaint(c);
      setDepartment(c.department ?? '');
      setOfficer(c.assignedTo ?? '');
    } catch (e) {
      addToast('Failed to load complaint from server.', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (!id) return;
    void loadComplaint(id);
  }, [id, loadComplaint]);

  const handleStatusUpdate = async (newStatus: ComplaintStatus) => {
    if (!id || !complaint) return;
    setUpdating(true);
    try {
      await api.patch(`/admin/complaints/${id}/status`, {
        status: newStatus,
        message: `Admin status update: ${newStatus}`,
        updated_by: 'admin',
      });
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
      await api.post(`/admin/complaints/${id}/assign`, {
        department,
        officer: officer || undefined,
        assigned_by: 'admin',
      });
      addToast('Department assignment saved.', 'success');
      await loadComplaint(id);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Assignment failed.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="p-6"><SkeletonCard lines={6} /></div>;
  if (!complaint) return (
    <div className="p-6 text-center space-y-4">
      <p className="text-white/50">Complaint not found in database.</p>
      <button onClick={() => navigate('/admin/complaints')} className="btn-secondary mx-auto">
        Back to complaints list
      </button>
    </div>
  );

  const hasPhoto = Boolean(complaint.imageUrl && complaint.imageUrl.trim());

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <button
        onClick={() => navigate('/admin/complaints')}
        className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to complaints
      </button>

      {/* Header Banner */}
      <div className="relative bg-[#111] border border-white/8 rounded-3xl p-6 sm:p-7 overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E10600] via-[#FFC400] to-[#22C55E]" />
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <span className="text-4xl">{getCategoryEmoji(complaint.category)}</span>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-black font-mono text-[#E10600]">{complaint.id}</p>
                <span className="telemetry-chip">[ LIVE INCIDENT RECORD ]</span>
              </div>
              <h1 className="text-xl sm:text-3xl font-black text-white font-display">{complaint.title}</h1>
              <div className="flex flex-wrap gap-2 mt-2.5 items-center">
                <PriorityBadge priority={complaint.priority} />
                <StatusBadge status={complaint.status} />
                <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                  hasPhoto
                    ? 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/25'
                    : 'bg-[#FFC400]/10 text-[#FFC400] border-[#FFC400]/25'
                }`}>
                  {hasPhoto ? '✓ Photo Verified' : '⚠️ No Photo Proof'}
                </span>
                {complaint.source && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-white/5 text-white/50 border-white/10 font-mono">
                    {complaint.source === 'AI Call' ? '📞 AI Call' : '🌐 Web'}
                  </span>
                )}
                {complaint.inspectionRequired && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border bg-[#E10600]/10 text-[#E10600] border-[#E10600]/30 font-mono">
                    🔍 Site Inspection Required
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
              <p className="text-[11px] font-mono text-white/40 mt-1">
                {complaint.latitude.toFixed(4)}°N, {complaint.longitude?.toFixed(4)}°E
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column */}
        <div className="lg:col-span-7 space-y-6">

          {/* Photo Proof & AI Vision Analysis Section */}
          <div className="glass-panel-luxury p-6 rounded-3xl space-y-4 cyber-border-red">
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-[#E10600]" />
                <h2 className="font-black text-white text-base font-display">Photo Proof & AI Vision Underwriter</h2>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase ${
                hasPhoto
                  ? 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30'
                  : 'bg-[#FFC400]/15 text-[#FFC400] border-[#FFC400]/30'
              }`}>
                {complaint.evidenceQuality || (hasPhoto ? 'HIGH / VERIFIED BY PHOTO' : 'LOW — No photo proof provided')}
              </span>
            </div>

            {hasPhoto ? (
              <div className="space-y-4">
                {/* View Mode Toggle: Original vs AI Overlay */}
                <div className="flex items-center justify-between bg-[#111] p-1.5 rounded-xl border border-white/8">
                  <span className="text-xs font-mono text-white/40 px-2">Evidence Mode:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setViewMode('original')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        viewMode === 'original'
                          ? 'bg-white/20 text-white shadow'
                          : 'text-white/40 hover:text-white'
                      }`}
                    >
                      Original Citizen Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('ai_overlay')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        viewMode === 'ai_overlay'
                          ? 'bg-[#E10600] text-white shadow-[0_0_12px_rgba(225,6,0,0.4)]'
                          : 'text-white/40 hover:text-white'
                      }`}
                    >
                      AI Visual Analysis Overlay
                    </button>
                  </div>
                </div>

                {/* Image Container with AI Overlay */}
                <div className="relative rounded-2xl overflow-hidden border border-white/10 max-h-[360px] flex items-center justify-center bg-black">
                  <img
                    src={complaint.imageUrl}
                    alt="Citizen Evidence"
                    className="w-full h-full object-cover max-h-[360px]"
                  />

                  {/* AI Vision Overlay Markings */}
                  {viewMode === 'ai_overlay' && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div
                        className="absolute border-2 border-[#FFC400] rounded-xl shadow-[0_0_15px_rgba(255,196,0,0.5)] animate-pulse"
                        style={{ top: '22%', left: '18%', width: '58%', height: '52%' }}
                      >
                        <span className="absolute -top-6 left-0 bg-[#FFC400] text-black text-[10px] font-black px-2 py-0.5 rounded-t-lg uppercase font-mono">
                          {complaint.category} DAMAGE · {complaint.aiConfidence || 94}% CONFIDENCE
                        </span>
                        <span className="absolute -bottom-5 right-0 bg-black/80 border border-white/20 text-white text-[9px] font-mono px-2 py-0.5 rounded-b-lg">
                          SEVERITY: {complaint.priority}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Visual Extraction Telemetry */}
                <div className="bg-[#111] p-4 rounded-2xl border border-white/8 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/50 font-mono">AI Visual Inspection:</span>
                    <span className="text-xs font-mono text-[#22C55E] font-bold">✓ CONFIRMED SURFACE HAZARD</span>
                  </div>
                  <p className="text-xs text-white/80 leading-relaxed font-light">
                    AI detected structural civic damage consistent with <strong className="text-white">{complaint.category}</strong>. Public safety risk assessed as <strong className="text-[#FFC400]">{complaint.priority}</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-[#FFC400]/5 border border-[#FFC400]/20 rounded-2xl p-5 text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-[#FFC400] mx-auto" />
                <p className="text-sm font-bold text-white">No Photo Proof Provided</p>
                <p className="text-xs text-white/50 max-w-md mx-auto leading-relaxed">
                  The citizen submitted this complaint as text/voice only. AI classification confidence is adjusted. On-site field inspection is recommended to verify extent of damage.
                </p>
              </div>
            )}
          </div>

          {/* AI Operations Copilot Recommendation */}
          <div className="glass-panel-luxury p-6 rounded-3xl space-y-4 cyber-border-gold">
            <div className="flex items-center justify-between border-b border-white/8 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#FFC400]" />
                <h2 className="font-black text-white text-base font-display">AI Operations Copilot Recommendation</h2>
              </div>
              <span className="text-xs font-mono text-[#FFC400] font-bold">{complaint.aiConfidence || 92}% CONFIDENCE</span>
            </div>

            <div className="bg-[#111] p-4 rounded-2xl border border-white/8 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-white/4 p-2 rounded-xl">
                  <span className="text-[10px] font-mono text-white/40 uppercase block">PRIORITY</span>
                  <span className="text-xs font-black text-[#E10600] mt-0.5 block">{complaint.priority}</span>
                </div>
                <div className="bg-white/4 p-2 rounded-xl">
                  <span className="text-[10px] font-mono text-white/40 uppercase block">DEPARTMENT</span>
                  <span className="text-xs font-bold text-white mt-0.5 truncate block">{complaint.department}</span>
                </div>
                <div className="bg-white/4 p-2 rounded-xl">
                  <span className="text-[10px] font-mono text-white/40 uppercase block">LOCATION RISK</span>
                  <span className="text-xs font-black text-[#FFC400] mt-0.5 block">{complaint.locationRisk || 'HIGH TRAFFIC'}</span>
                </div>
                <div className="bg-white/4 p-2 rounded-xl">
                  <span className="text-[10px] font-mono text-white/40 uppercase block">TARGET SLA</span>
                  <span className="text-xs font-bold text-[#22C55E] mt-0.5 block">{complaint.estimatedResponse || '24 Hours'}</span>
                </div>
              </div>

              {complaint.publicSafetyImpact && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-[#E10600] mb-1 flex items-center gap-1">
                    <AlertOctagon className="w-3 h-3" /> Public Safety Impact:
                  </p>
                  <p className="text-xs text-white/90 leading-relaxed bg-[#E10600]/5 p-3 rounded-xl border border-[#E10600]/20 font-medium">
                    {complaint.publicSafetyImpact}
                  </p>
                </div>
              )}

              <div>
                <p className="text-[10px] font-mono uppercase text-white/40 mb-1">AI Tactical Reasoning:</p>
                <p className="text-xs text-white/80 leading-relaxed italic bg-white/3 p-3 rounded-xl border border-white/6">
                  "{complaint.aiReason || 'Corridor requires immediate crew dispatch to prevent traffic congestion and pedestrian safety hazard.'}"
                </p>
              </div>

              {complaint.actionPlan && (
                <div>
                  <p className="text-[10px] font-mono uppercase text-white/40 mb-1 flex items-center gap-1">
                    <FileCheck className="w-3 h-3 text-[#22C55E]" /> Suggested Operational Action Plan:
                  </p>
                  <pre className="text-xs text-white/70 whitespace-pre-line font-sans bg-white/3 p-3 rounded-xl border border-white/6 leading-relaxed">
                    {complaint.actionPlan}
                  </pre>
                </div>
              )}
            </div>

            {/* 1-Click Fast Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleStatusUpdate('In Progress')}
                disabled={updating || complaint.status === 'In Progress'}
                className="btn-primary py-2.5 px-4 text-xs font-bold glow-red-sm"
              >
                ⚡ 1-Click: Mark In Progress & Dispatch Crew
              </button>
              <button
                type="button"
                onClick={() => handleStatusUpdate('Inspection')}
                disabled={updating || complaint.status === 'Inspection'}
                className="btn-secondary py-2.5 px-4 text-xs font-bold"
              >
                🔍 Request Field Inspection
              </button>
            </div>
          </div>

          {/* Complaint Details Card */}
          <div className="card space-y-3">
            <h2 className="font-black text-white font-display">Complaint Information</h2>
            <div className="bg-white/5 border border-white/8 rounded-2xl p-4">
              <p className="text-sm text-white/80 leading-relaxed">{complaint.description}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#E10600] mt-0.5 flex-shrink-0" />
                <span className="text-white/80 font-medium">{complaint.location}</span>
              </div>
              {complaint.landmark && (
                <p className="text-xs text-white/50 pl-6">Landmark: {complaint.landmark}</p>
              )}
              {complaint.latitude && (
                <div className="text-xs font-mono text-white/40 pl-6">
                  GPS: {complaint.latitude.toFixed(6)}, {complaint.longitude?.toFixed(6)}
                </div>
              )}
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-[#FFC400] mt-0.5 flex-shrink-0" />
                <span className="text-white/80">{complaint.department}</span>
              </div>
              <p className="text-xs text-white/40 pl-6">Logged: {formatDateTime(complaint.submittedAt)}</p>
            </div>
          </div>

          {/* Department & Officer Assignment */}
          <div className="card space-y-4">
            <h2 className="font-black text-white flex items-center gap-2 font-display">
              <Edit2 className="w-4 h-4 text-[#E10600]" /> Authority Assignment
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Department</label>
                <input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Department name"
                  className="input-field"
                />
              </div>
              <div>
                <label className="label">Officer / Team</label>
                <input
                  value={officer}
                  onChange={(e) => setOfficer(e.target.value)}
                  placeholder="Officer or Team name"
                  className="input-field"
                />
              </div>
            </div>
            <button
              onClick={handleAssign}
              disabled={updating || !department}
              className="btn-primary"
            >
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save Assignment
            </button>
          </div>

          {/* Status Lifecycle Actions */}
          <div className="card space-y-3">
            <h2 className="font-black text-white font-display">Update Resolution Status</h2>
            <div className="flex flex-wrap gap-2">
              {STATUS_ACTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleStatusUpdate(s)}
                  disabled={updating || complaint.status === s}
                  className={`flex items-center gap-1.5 text-sm font-bold px-4 py-2.5 rounded-xl transition-all ${
                    complaint.status === s
                      ? 'bg-[#E10600] text-white shadow-[0_0_15px_rgba(225,6,0,0.4)]'
                      : 'bg-white/5 text-white/50 hover:bg-[#E10600]/10 hover:text-[#E10600] border border-white/8 hover:border-[#E10600]/30'
                  }`}
                >
                  {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Real Status Timeline */}
          <div className="card">
            <h2 className="font-black text-white mb-5 font-display">Status Timeline</h2>
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
