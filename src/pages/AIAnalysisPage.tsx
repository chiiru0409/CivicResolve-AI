import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, Loader2, ArrowRight, Edit3,
  AlertCircle, MapPin, Building2, Zap, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { analyzeComplaint } from '../services/aiService';
import { submitComplaint, checkDuplicateComplaint } from '../services/complaintService';
import PriorityBadge from '../components/PriorityBadge';
import type { AIAnalysis } from '../types';

// ── Processing steps ─────────────────────────────────────────
interface Step { label: string; done: boolean; active: boolean }

const INITIAL_STEPS: Step[] = [
  { label: 'Understanding complaint description', done: false, active: false },
  { label: 'Analyzing image evidence',            done: false, active: false },
  { label: 'Identifying issue location & GPS',    done: false, active: false },
  { label: 'Cross-referencing duplicate complaints', done: false, active: false },
  { label: 'Classifying issue category & hazard', done: false, active: false },
  { label: 'Finding responsible municipal authority', done: false, active: false },
];

interface DuplicateInfo {
  is_potential_duplicate: boolean;
  similarity_percentage: number;
  existing_complaint_id?: string;
  existing_title?: string;
  explanation?: string;
}

const AIAnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'processing' | 'result' | 'error'>('processing');
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);
  const [pendingData, setPendingData] = useState<Record<string, string> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('pendingComplaint');
    if (!stored) { navigate('/report'); return; }
    const data = JSON.parse(stored) as Record<string, string>;
    setPendingData(data);
    runAnalysis(data);
  }, []);

  const runAnalysis = async (data: Record<string, string>) => {
    const stepDelays = [400, 800, 1200, 1600, 2000, 2400];
    stepDelays.forEach((d, idx) => {
      setTimeout(() => {
        setSteps((prev) => prev.map((s, i) => ({ ...s, done: i < idx, active: i === idx })));
      }, d);
    });

    try {
      const [aiRes, dupRes] = await Promise.all([
        analyzeComplaint(data.description, data.location, data.imageUrl),
        checkDuplicateComplaint({
          description: data.description,
          location: data.location,
          latitude: data.latitude ? parseFloat(data.latitude) : undefined,
          longitude: data.longitude ? parseFloat(data.longitude) : undefined,
        }).catch(() => null),
      ]);

      await new Promise((r) => setTimeout(r, 400));
      setSteps((prev) => prev.map((s) => ({ ...s, done: true, active: false })));
      setAnalysis(aiRes);
      if (dupRes && dupRes.is_potential_duplicate) {
        setDuplicateInfo(dupRes);
      }
      setPhase('result');
    } catch {
      setPhase('error');
    }
  };

  const handleConfirm = async () => {
    if (!analysis || !pendingData) return;
    setSubmitting(true);
    try {
      const complaint = await submitComplaint({
        description:        pendingData.description,
        location:           pendingData.location || '',
        latitude:           pendingData.latitude  ? parseFloat(pendingData.latitude)  : undefined,
        longitude:          pendingData.longitude ? parseFloat(pendingData.longitude) : undefined,
        location_accuracy:  pendingData.accuracy  ? parseFloat(pendingData.accuracy)  : undefined,
        landmark:           pendingData.landmark  || undefined,
        contact_preference: pendingData.contactPreference || 'email',
        is_anonymous:       pendingData.isAnonymous === 'true',
        image_path:         pendingData.imageUrl || undefined,
        evidence_quality:   pendingData.imageUrl ? 'HIGH / VERIFIED BY PHOTO' : 'LOW — No photo proof provided',
        title:              analysis.title,
        category:           analysis.category,
        priority:           analysis.priority,
        department:         analysis.department,
        ai_confidence:      analysis.confidence,
        ai_reason:          analysis.reason,
        estimated_response: analysis.estimatedResponse,
        assigned_team:      analysis.assignedTeam,
      });
      sessionStorage.removeItem('pendingComplaint');
      navigate(`/success/${complaint.id}`);
    } catch {
      setPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Processing ───────────────────────────────────────────────
  if (phase === 'processing') {
    const progress = steps.filter((s) => s.done).length;

    return (
      <div className="min-h-screen bg-[#070707] pt-20 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="card text-center">
            {/* AI processing icon */}
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div className="w-16 h-16 bg-white/5 border border-[#E10600]/30 rounded-2xl flex items-center justify-center">
                <Zap className="w-8 h-8 text-[#E10600] animate-pulse" />
              </div>
            </div>

            <h2 className="text-2xl font-black text-white mb-1 font-display">
              <span>CIVIC</span>
              <span className="text-[#E10600]">RESOLVE</span>
              <span className="text-[#FFC400] text-lg"> AI</span>
            </h2>
            <p className="text-white/50 mb-2 text-sm">Synthesizing intelligence & routing telemetry…</p>

            {/* Progress bar */}
            <div className="w-full bg-white/10 rounded-full h-1.5 mb-6 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#E10600] to-[#FFC400] rounded-full transition-all duration-500"
                style={{ width: `${(progress / steps.length) * 100}%` }}
              />
            </div>

            {/* Steps */}
            <div className="space-y-2.5 text-left">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${
                    step.done
                      ? 'bg-[#E10600]/5 border border-[#E10600]/20'
                      : step.active
                      ? 'bg-[#FFC400]/5 border border-[#FFC400]/30'
                      : 'bg-white/3 border border-white/6 opacity-40'
                  }`}
                >
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center">
                    {step.done ? (
                      <CheckCircle className="w-5 h-5 text-[#E10600]" />
                    ) : step.active ? (
                      <Loader2 className="w-5 h-5 text-[#FFC400] animate-spin" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-white/20" />
                    )}
                  </div>
                  <span className={`text-sm font-medium ${
                    step.done ? 'text-[#E10600]' : step.active ? 'text-[#FFC400]' : 'text-white/30'
                  }`}>
                    {step.label}
                  </span>
                  {step.active && (
                    <span className="ml-auto text-[10px] bg-[#FFC400]/10 text-[#FFC400] px-2 py-0.5 rounded-full border border-[#FFC400]/30 font-bold animate-pulse font-mono">
                      ANALYZING
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-[#070707] pt-20 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4 text-center">
          <div className="card">
            <AlertCircle className="w-12 h-12 text-[#E10600] mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Analysis Failed</h2>
            <p className="text-white/50 mb-6">There was an error analyzing your complaint. Please verify your connection and try again.</p>
            <button onClick={() => navigate('/report')} className="btn-primary justify-center w-full">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Analysis Result ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#070707] pt-20 pb-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] text-sm font-bold px-4 py-2 rounded-full mb-4">
            <CheckCircle className="w-4 h-4" />
            AI Analysis Complete
          </div>
          <h1 className="text-3xl font-black text-white font-display">Intelligence Report</h1>
          <p className="text-white/50 mt-2">Review the AI findings and confirm to submit</p>
        </div>

        {duplicateInfo && (
          <div className="bg-[#FFC400]/10 border border-[#FFC400]/30 rounded-2xl p-4 mb-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#FFC400] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[#FFC400]">Potential Duplicate Incident Detected</p>
              <p className="text-xs text-white/80 mt-1 leading-relaxed">{duplicateInfo.explanation}</p>
              <p className="text-[11px] text-white/50 mt-1">You may still proceed with submission if this represents a new recurrence or separate location.</p>
            </div>
          </div>
        )}

        {analysis && (
          <div className="space-y-4">
            {/* AI Intelligence Card */}
            <div className="relative bg-[#111] border border-[#E10600]/30 rounded-2xl p-6 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600] to-transparent" />
              <div className="relative">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#E10600]/10 border border-[#E10600]/30 rounded-xl flex items-center justify-center">
                      <Zap className="w-5 h-5 text-[#E10600]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-black text-white text-sm font-display">AI INTELLIGENCE REPORT</p>
                        <span className="telemetry-chip-green">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                          VERIFIED
                        </span>
                      </div>
                      <p className="text-white/40 text-xs font-mono">AUTONOMOUS MUNICIPAL CLASSIFICATION</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#FFC400]/10 border border-[#FFC400]/30 px-3 py-1.5 rounded-xl">
                    <span className="text-base font-black font-mono text-[#FFC400]">{analysis.confidence}%</span>
                    <span className="text-[10px] font-mono text-[#FFC400] uppercase font-bold">CONFIDENCE</span>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-white mb-2">{analysis.title}</h3>

                {/* Reasoning stream */}
                <div className="bg-[#181818] border border-white/8 rounded-xl p-3.5 mt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-mono uppercase text-white/40">AI Context Reasoning</span>
                    <span className="text-[10px] font-mono text-[#FFC400]">AUTONOMOUS DISPATCH</span>
                  </div>
                  <p className="text-xs text-white/70 italic leading-relaxed">
                    "{analysis.reason}"
                  </p>
                </div>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card">
                <p className="text-xs text-white/40 mb-1 uppercase tracking-wide font-semibold">Category</p>
                <p className="font-black text-white text-lg">{analysis.category}</p>
              </div>
              <div className="card">
                <p className="text-xs text-white/40 mb-2 uppercase tracking-wide font-semibold">Priority</p>
                <PriorityBadge priority={analysis.priority} size="lg" />
              </div>
              <div className="card col-span-2">
                <div className="flex items-start gap-3">
                  <Building2 className="w-5 h-5 text-[#FFC400] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-white/40 mb-0.5 uppercase tracking-wide font-semibold">Responsible Department</p>
                    <p className="font-bold text-white">{analysis.department}</p>
                    {analysis.assignedTeam && (
                      <p className="text-xs text-[#FFC400] mt-0.5">→ {analysis.assignedTeam}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-[#E10600] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Location</p>
                    <p className="font-semibold text-white text-sm truncate">{analysis.location}</p>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-[#FFC400] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Est. Response</p>
                    <p className="font-bold text-[#FFC400] text-sm">{analysis.estimatedResponse}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => navigate('/report')} className="btn-secondary justify-center py-4">
                <Edit3 className="w-5 h-5" />
                Edit Details
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="btn-primary justify-center py-4 text-sm font-bold shadow-sm hover:shadow active:scale-[0.98] transition-all duration-150 glow-red"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Submitting...</>
                ) : (
                  <>Confirm & Submit<ArrowRight className="w-5 h-5" /></>
                )}
              </button>
            </div>

            <p className="text-xs text-white/40 text-center">
              By confirming, your complaint will be permanently stored and routed to municipal field dispatch.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAnalysisPage;
