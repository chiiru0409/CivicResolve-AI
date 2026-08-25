import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle, Loader2, ArrowRight, Edit3,
  AlertCircle, MapPin, Building2, Zap, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { analyzeComplaint } from '../services/aiService';
import { submitComplaint, checkDuplicateComplaint } from '../services/complaintService';
import PriorityBadge from '../components/PriorityBadge';
import type { AIAnalysis } from '../types';
import PageTransition from '../components/PageTransition';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import { cardGestures, buttonGestures } from '../utils/motion';

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
    if (!analysis || !pendingData || submitting) return;
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

  return (
    <PageTransition className="min-h-screen bg-[#070707] pt-20 pb-12">
      <AnimatePresence mode="wait">
        {/* ── Processing Phase ─────────────────────────────────────── */}
        {phase === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-center min-h-[70vh]"
          >
            <div className="max-w-md w-full mx-auto px-4">
              <div className="card text-center shadow-2xl">
                {/* AI processing icon */}
                <div className="relative w-16 h-16 mx-auto mb-5">
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 rounded-2xl border border-[#E10600]/40 shadow-[0_0_15px_rgba(225,6,0,0.3)]"
                  />
                  <div className="w-16 h-16 bg-white/5 border border-[#E10600]/30 rounded-2xl flex items-center justify-center">
                    <Zap className="w-8 h-8 text-[#E10600] animate-pulse" />
                  </div>
                </div>

                <h2 className="text-2xl font-black text-white mb-1 font-display">
                  <span>CIVIC</span>
                  <span className="text-[#E10600]">RESOLVE</span>
                  <span className="text-[#FFC400] text-lg font-mono"> AI</span>
                </h2>
                <p className="text-white/50 mb-2 text-sm font-sans">Synthesizing intelligence & routing telemetry…</p>

                {/* Progress bar */}
                <div className="w-full bg-white/10 rounded-full h-1.5 mb-6 overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-[#E10600] to-[#FFC400] rounded-full"
                    style={{ width: `${(steps.filter((s) => s.done).length / steps.length) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>

                {/* Steps */}
                <div className="space-y-2.5 text-left">
                  {steps.map((step, i) => (
                    <motion.div
                      key={i}
                      layout
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
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Error Phase ─────────────────────────────────────────── */}
        {phase === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center min-h-[70vh]"
          >
            <div className="max-w-md w-full mx-auto px-4 text-center">
              <div className="card shadow-2xl">
                <AlertCircle className="w-12 h-12 text-[#E10600] mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white mb-2 font-display">Analysis Failed</h2>
                <p className="text-white/50 mb-6 font-sans">There was an error analyzing your complaint. Please verify your connection and try again.</p>
                <motion.button
                  {...buttonGestures}
                  onClick={() => navigate('/report')}
                  className="btn-primary justify-center w-full font-mono"
                >
                  Try Again
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Analysis Result Phase ───────────────────────────────── */}
        {phase === 'result' && analysis && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-2xl mx-auto px-4 sm:px-6"
          >
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] text-sm font-bold px-4 py-2 rounded-full mb-4 font-mono shadow-[0_0_12px_rgba(34,197,94,0.2)]">
                <CheckCircle className="w-4 h-4" />
                AI Analysis Complete
              </div>
              <h1 className="text-3xl font-black text-white font-display">Intelligence Report</h1>
              <p className="text-white/50 mt-2 font-sans">Review the AI findings and confirm to submit</p>
            </div>

            {duplicateInfo && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#FFC400]/10 border border-[#FFC400]/30 rounded-2xl p-4 mb-4"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-[#FFC400] flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-bold text-[#FFC400] font-display">Geospatial Duplicate Match ({duplicateInfo.similarity_percentage}%)</p>
                      {duplicateInfo.existing_complaint_id && (
                        <span className="telemetry-chip font-mono text-[10px] text-[#FFC400]">
                          ACTIVE #{duplicateInfo.existing_complaint_id}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/80 mt-1 leading-relaxed font-sans">{duplicateInfo.explanation}</p>
                    <p className="text-[11px] text-white/50 mt-1 font-mono">You can choose to follow the active municipal ticket or file this as an independent report.</p>

                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {duplicateInfo.existing_complaint_id && (
                        <button
                          type="button"
                          onClick={() => navigate(`/track?id=${duplicateInfo.existing_complaint_id}`)}
                          className="text-xs bg-[#FFC400]/20 hover:bg-[#FFC400]/30 text-[#FFC400] border border-[#FFC400]/40 font-mono font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <span>Follow Existing Ticket (#{duplicateInfo.existing_complaint_id})</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <span className="text-[11px] text-white/40 font-mono">or continue creating new complaint below</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            <div className="space-y-4">
              {/* AI Intelligence Card */}
              <motion.div
                {...cardGestures}
                className="relative bg-[#111] border border-[#E10600]/30 rounded-3xl p-6 overflow-hidden shadow-2xl"
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#E10600] to-transparent" />
                <div className="relative">
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#E10600]/10 border border-[#E10600]/30 rounded-xl flex items-center justify-center shadow-md">
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

                  <h3 className="text-lg font-bold text-white mb-2 font-display">{analysis.title}</h3>

                  {/* Reasoning stream */}
                  <div className="bg-[#181818] border border-white/8 rounded-2xl p-3.5 mt-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono uppercase text-white/40">AI Context Reasoning</span>
                      <span className="text-[10px] font-mono text-[#FFC400]">AUTONOMOUS DISPATCH</span>
                    </div>
                    <p className="text-xs text-white/70 italic leading-relaxed font-sans">
                      "{analysis.reason}"
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Details grid */}
              <StaggerContainer className="grid grid-cols-2 gap-3">
                <StaggerItem className="card">
                  <p className="text-xs text-white/40 mb-1 uppercase tracking-wide font-semibold font-mono">Category</p>
                  <p className="font-black text-white text-lg font-display">{analysis.category}</p>
                </StaggerItem>
                <StaggerItem className="card">
                  <p className="text-xs text-white/40 mb-2 uppercase tracking-wide font-semibold font-mono">Priority</p>
                  <PriorityBadge priority={analysis.priority} size="lg" />
                </StaggerItem>
                <StaggerItem className="card col-span-2">
                  <div className="flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-[#FFC400] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-white/40 mb-0.5 uppercase tracking-wide font-semibold font-mono">Responsible Department</p>
                      <p className="font-bold text-white font-display">{analysis.department}</p>
                      {analysis.assignedTeam && (
                        <p className="text-xs text-[#FFC400] mt-0.5 font-mono">→ {analysis.assignedTeam}</p>
                      )}
                    </div>
                  </div>
                </StaggerItem>
                <StaggerItem className="card">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-[#E10600] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-white/40 mb-0.5 font-mono">Location</p>
                      <p className="font-semibold text-white text-sm truncate font-display">{analysis.location}</p>
                    </div>
                  </div>
                </StaggerItem>
                <StaggerItem className="card">
                  <div className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-[#FFC400] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-white/40 mb-0.5 font-mono">Est. Response</p>
                      <p className="font-bold text-[#FFC400] text-sm font-mono">{analysis.estimatedResponse}</p>
                    </div>
                  </div>
                </StaggerItem>
              </StaggerContainer>

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <motion.button
                  {...buttonGestures}
                  onClick={() => navigate('/report')}
                  className="btn-secondary justify-center py-4 font-mono font-bold"
                >
                  <Edit3 className="w-5 h-5" />
                  <span>Edit Details</span>
                </motion.button>
                <motion.button
                  {...buttonGestures}
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="btn-primary justify-center py-4 text-sm font-bold glow-red font-display"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirm & Submit</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </motion.button>
              </div>

              <p className="text-xs text-white/40 text-center font-sans">
                By confirming, your complaint will be permanently stored and routed to municipal field dispatch.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  );
};

export default AIAnalysisPage;
