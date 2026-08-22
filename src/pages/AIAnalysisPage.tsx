import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle, Loader2, ArrowRight, Edit3,
  AlertCircle, MapPin, Building2, Zap
} from 'lucide-react';
import { analyzeComplaint } from '../services/aiService';
import { submitComplaint } from '../services/complaintService';
import PriorityBadge from '../components/PriorityBadge';
import type { AIAnalysis } from '../types';

// ── Processing steps ─────────────────────────────────────────
interface Step { label: string; done: boolean; active: boolean }

const INITIAL_STEPS: Step[] = [
  { label: 'Understanding complaint description', done: false, active: false },
  { label: 'Analyzing image evidence',            done: false, active: false },
  { label: 'Identifying issue location',          done: false, active: false },
  { label: 'Classifying issue category',          done: false, active: false },
  { label: 'Determining severity and priority',   done: false, active: false },
  { label: 'Finding responsible authority',       done: false, active: false },
];

const AIAnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'processing' | 'result' | 'error'>('processing');
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
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
    const stepDelays = [600, 1200, 1800, 2400, 3000, 3500];
    stepDelays.forEach((d, idx) => {
      setTimeout(() => {
        setSteps((prev) => prev.map((s, i) => ({ ...s, done: i < idx, active: i === idx })));
      }, d);
    });
    try {
      const result = await analyzeComplaint(data.description, data.location, data.imageUrl);
      await new Promise((r) => setTimeout(r, 500));
      setSteps((prev) => prev.map((s) => ({ ...s, done: true, active: false })));
      setAnalysis(result);
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
      await new Promise((r) => setTimeout(r, 400));
      navigate(`/success/${complaint.id}`);
    } catch {
      setPhase('error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Processing ───────────────────────────────────────────────
  if (phase === 'processing') {
    const activeIdx = steps.findIndex((s) => s.active);
    const progress = steps.filter((s) => s.done).length;

    return (
      <div className="min-h-screen bg-civic-black pt-20 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="card text-center">
            {/* AI processing icon */}
            <div className="relative w-16 h-16 mx-auto mb-5">
              <div className="w-16 h-16 bg-civic-elevated border border-civic-red/30 rounded-2xl flex items-center justify-center">
                <Zap className="w-8 h-8 text-civic-red animate-pulse" />
              </div>
            </div>

            <h2 className="text-2xl font-black text-civic-text mb-1">
              <span className="text-civic-text">CIVIC</span>
              <span className="text-civic-red">RESOLVE</span>
              <span className="text-civic-yellow text-lg"> AI</span>
            </h2>
            <p className="text-civic-muted mb-2">Analyzing your complaint...</p>

            {/* Progress bar */}
            <div className="w-full bg-civic-elevated rounded-full h-1.5 mb-6 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-civic-red to-civic-yellow rounded-full transition-all duration-500"
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
                      ? 'bg-civic-red/5 border border-civic-red/20'
                      : step.active
                      ? 'bg-civic-yellow/5 border border-civic-yellow/30'
                      : 'bg-civic-elevated border border-civic-border opacity-40'
                  }`}
                >
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center">
                    {step.done ? (
                      <CheckCircle className="w-5 h-5 text-civic-red" />
                    ) : step.active ? (
                      <Loader2 className="w-5 h-5 text-civic-yellow animate-spin" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-civic-border" />
                    )}
                  </div>
                  <span className={`text-sm font-medium ${
                    step.done ? 'text-civic-red' : step.active ? 'text-civic-yellow' : 'text-civic-border'
                  }`}>
                    {step.label}
                  </span>
                  {step.active && (
                    <span className="ml-auto text-[10px] bg-civic-yellow/10 text-civic-yellow px-2 py-0.5 rounded-full border border-civic-yellow/30 font-bold animate-pulse">
                      PROCESSING
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
      <div className="min-h-screen bg-civic-black pt-20 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4 text-center">
          <div className="card">
            <AlertCircle className="w-12 h-12 text-civic-red mx-auto mb-4" />
            <h2 className="text-xl font-bold text-civic-text mb-2">Analysis Failed</h2>
            <p className="text-civic-muted mb-6">There was an error analyzing your complaint. Please try again.</p>
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
    <div className="min-h-screen bg-civic-black pt-20 pb-12">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-civic-success/10 border border-civic-success/30 text-civic-success text-sm font-bold px-4 py-2 rounded-full mb-4">
            <CheckCircle className="w-4 h-4" />
            AI Analysis Complete
          </div>
          <h1 className="text-3xl font-black text-civic-text">Intelligence Report</h1>
          <p className="text-civic-muted mt-2">Review the AI findings and confirm to submit</p>
        </div>

        {analysis && (
          <div className="space-y-4">
            {/* AI Intelligence Card with Dynamic Telemetry Header */}
            <div className="relative bg-civic-surface border border-civic-red/30 rounded-2xl p-6 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-civic-red to-transparent" />
              <div className="absolute inset-0 speed-lines-bg opacity-20" />
              <div className="relative">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-civic-red/10 border border-civic-red/30 rounded-xl flex items-center justify-center">
                      <Zap className="w-5 h-5 text-civic-red" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-black text-civic-text text-sm">AI INTELLIGENCE REPORT</p>
                        <span className="telemetry-chip-green">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                          VERIFIED
                        </span>
                      </div>
                      <p className="text-civic-muted text-xs font-mono">MODEL: LOCAL LLM · LATENCY: 340ms</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 bg-civic-yellow/10 border border-civic-yellow/30 px-3 py-1.5 rounded-xl">
                    <span className="text-base font-black font-mono text-civic-yellow">{analysis.confidence}%</span>
                    <span className="text-[10px] font-mono text-civic-yellow uppercase font-bold">CONFIDENCE</span>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-civic-text mb-2">{analysis.title}</h3>

                {/* Reasoning stream */}
                <div className="bg-[#111] border border-white/8 rounded-xl p-3.5 mt-3">
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
                <p className="text-xs text-civic-muted mb-1 uppercase tracking-wide font-semibold">Category</p>
                <p className="font-black text-civic-text text-lg">{analysis.category}</p>
              </div>
              <div className="card">
                <p className="text-xs text-civic-muted mb-2 uppercase tracking-wide font-semibold">Priority</p>
                <PriorityBadge priority={analysis.priority} size="lg" />
              </div>
              <div className="card col-span-2">
                <div className="flex items-start gap-3">
                  <Building2 className="w-5 h-5 text-civic-yellow mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-civic-muted mb-0.5 uppercase tracking-wide font-semibold">Responsible Department</p>
                    <p className="font-bold text-civic-text">{analysis.department}</p>
                    {analysis.assignedTeam && (
                      <p className="text-xs text-civic-yellow mt-0.5">→ {analysis.assignedTeam}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-civic-red mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-civic-muted mb-0.5">Location</p>
                    <p className="font-semibold text-civic-text text-sm">{analysis.location}</p>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-civic-yellow mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-civic-muted mb-0.5">Est. Response</p>
                    <p className="font-bold text-civic-yellow text-sm">{analysis.estimatedResponse}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => navigate('/report')} className="btn-secondary justify-center py-4">
                <Edit3 className="w-5 h-5" />
                Edit Details
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="btn-primary justify-center py-4 text-sm font-bold shadow-sm hover:shadow active:scale-[0.98] transition-all duration-150"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />Submitting...</>
                ) : (
                  <>Confirm & Submit<ArrowRight className="w-5 h-5" /></>
                )}
              </button>
            </div>

            <p className="text-xs text-civic-muted text-center">
              By confirming, your complaint will be submitted and routed to the appropriate department.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAnalysisPage;
