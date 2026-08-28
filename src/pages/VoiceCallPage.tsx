import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Zap,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  MessageSquare,
  Send,
  Radio,
  Camera,
  MapPin,
  Tag,
  Building2,
  ShieldAlert,
  HelpCircle,
  Check,
  X,
  Edit3,
  RefreshCw,
  FileText,
} from 'lucide-react';
import PageTransition from '../components/PageTransition';
import {
  VoiceRecognitionManager,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  speakText,
  stopSpeaking,
  sendVoiceTurn,
  type VoiceTurnResponse,
} from '../services/voiceService';
import { analyzeImageEvidence } from '../services/ai/visionService';
import { buttonGestures, cardGestures } from '../utils/motion';

interface TranscriptItem {
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
}

export default function VoiceCallPage() {
  const navigate = useNavigate();

  // Call State
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'ended'>('calling');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserListening, setIsUserListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);

  // Conversation State
  const [stage, setStage] = useState<string>('greeting');
  const [extractedData, setExtractedData] = useState<Record<string, any>>({});
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [interimText, setInterimText] = useState('');
  const [uiHints, setUiHints] = useState<VoiceTurnResponse['ui_hints']>({});
  const [createdComplaint, setCreatedComplaint] = useState<VoiceTurnResponse['complaint'] | null>(null);

  // Multimodal photo attachment
  const [attachedImage, setAttachedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Manual text fallback
  const [showTextInput, setShowTextInput] = useState(false);
  const [manualText, setManualText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // GPS Coordinates
  const [coords, setCoords] = useState<{ latitude?: number; longitude?: number }>({});

  const recognitionRef = useRef<VoiceRecognitionManager | null>(null);
  const timerRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, interimText]);

  // Call Timer
  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = window.setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  // Request Geolocation in background
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {
          // ignore geolocation error
        },
        { timeout: 5000 },
      );
    }
  }, []);

  // Initialize Call
  useEffect(() => {
    recognitionRef.current = new VoiceRecognitionManager();

    if (!isSpeechRecognitionSupported()) {
      setPermissionError('Speech Recognition is not supported in this browser. You can use the text typing option.');
      setShowTextInput(true);
    }

    // Connect call after 1 second simulated ring
    const timer = setTimeout(() => {
      setCallStatus('connected');
      startCallGreeting();
    }, 1200);

    return () => {
      clearTimeout(timer);
      stopSpeaking();
      recognitionRef.current?.abortListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatCallTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start Call Greeting Turn
  const startCallGreeting = async () => {
    setIsProcessing(true);
    try {
      const response = await sendVoiceTurn('__START__', 'greeting', {}, coords);
      handleAgentResponse(response);
    } catch {
      const fallbackGreeting =
        'Hello! Welcome to CivicResolve AI Municipal Helpline. I can help you report and track public issues such as potholes, garbage, water leaks, or broken streetlights. What would you like to report?';
      speakAndListen(fallbackGreeting, 'listening', {});
    } finally {
      setIsProcessing(false);
    }
  };

  // Process Agent Response
  const handleAgentResponse = (response: VoiceTurnResponse) => {
    setStage(response.stage);
    setExtractedData(response.extracted_data || {});
    if (response.ui_hints) {
      setUiHints(response.ui_hints);
    }

    if (response.complaint) {
      setCreatedComplaint(response.complaint);
      try {
        const STORAGE_KEY = 'civicresolve_complaints';
        const storedJson = localStorage.getItem(STORAGE_KEY);
        const stored = storedJson ? JSON.parse(storedJson) : [];
        const cid = response.complaint.complaint_number || response.complaint.id;
        const exists = stored.some((item: { id?: string; complaint_number?: string }) => item.id === cid || item.complaint_number === cid);
        if (!exists) {
          const newComplaintObj = {
            id: cid,
            title: response.complaint.title || 'Voice Helpline Report',
            description: response.complaint.description || '',
            category: response.complaint.category || 'Other',
            priority: response.complaint.priority || 'MEDIUM',
            status: response.complaint.status || 'Submitted',
            department: response.complaint.department || 'Municipal Operations',
            location: response.complaint.location || '',
            source: 'AI Call',
            submittedAt: response.complaint.created_at || new Date().toISOString(),
            updatedAt: response.complaint.created_at || new Date().toISOString(),
            timeline: [
              { id: 't1', label: 'Submitted', timestamp: new Date().toISOString(), status: 'completed', note: 'Registered via AI Voice Helpline' },
              { id: 't2', label: 'AI Analysis', timestamp: new Date().toISOString(), status: 'completed', note: 'Processed by Voice AI Agent' },
              { id: 't3', label: 'Assigned', timestamp: null, status: 'current' },
              { id: 't4', label: 'In Progress', timestamp: null, status: 'pending' },
              { id: 't5', label: 'Resolved', timestamp: null, status: 'pending' },
            ],
          };
          stored.unshift(newComplaintObj);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        }
      } catch {
        // ignore localStorage error
      }
    }

    speakAndListen(response.reply_text, response.stage, response.extracted_data);
  };

  // Speak AI Output & Automatically Listen for Citizen Response
  const speakAndListen = (text: string, nextStage: string, data: Record<string, unknown>) => {
    // Add to transcript
    setTranscript((prev) => [
      ...prev,
      {
        sender: 'ai',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    if (!audioEnabled) {
      if (nextStage !== 'submitted') {
        startCitizenListening(nextStage, data);
      }
      return;
    }

    setIsAiSpeaking(true);
    speakText(
      text,
      () => {
        setIsAiSpeaking(true);
      },
      () => {
        setIsAiSpeaking(false);
        if (nextStage !== 'submitted' && !isMuted && !isUserListening) {
          startCitizenListening(nextStage, data);
        }
      },
      () => {
        setIsAiSpeaking(false);
        if (nextStage !== 'submitted' && !isMuted && !isUserListening) {
          startCitizenListening(nextStage, data);
        }
      },
    );
  };

  // Listen for Citizen Speech with Instant Barge-In
  const startCitizenListening = (currentStage: string, currentData: Record<string, unknown>) => {
    if (isMuted || !isSpeechRecognitionSupported()) return;

    setIsUserListening(true);
    setInterimText('');

    recognitionRef.current?.startListening(
      (text: string, isFinal: boolean) => {
        // Instant Barge-In: if user starts speaking while AI is talking, immediately cancel AI speech
        if (text.trim().length > 0 && isAiSpeaking) {
          stopSpeaking();
          setIsAiSpeaking(false);
        }

        setInterimText(text);
        if (isFinal && text.trim().length > 0) {
          setIsUserListening(false);
          setInterimText('');
          handleCitizenUtterance(text.trim(), currentStage, currentData);
        }
      },
      (error: string) => {
        setIsUserListening(false);
        if (error === 'not-allowed') {
          setPermissionError('Microphone permission was denied. Please allow microphone access or use text input.');
          setShowTextInput(true);
        }
      },
      () => {
        setIsUserListening(false);
      },
    );
  };

  // Handle Citizen Spoken Turn
  const handleCitizenUtterance = async (spokenText: string, currentStage: string, currentData: Record<string, unknown>) => {
    if (!spokenText.trim()) return;

    setTranscript((prev) => [
      ...prev,
      {
        sender: 'user',
        text: spokenText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    setIsProcessing(true);
    try {
      const historyList = transcript.map((t) => ({
        role: t.sender === 'ai' ? 'assistant' : 'user',
        content: t.text,
      }));

      const response = await sendVoiceTurn(spokenText, currentStage, currentData, coords, historyList);
      handleAgentResponse(response);
    } catch {
      speakAndListen(
        "I'm here to help. Could you please describe your issue or confirm if you want me to submit this report?",
        'confirm',
        currentData,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle manual keyboard submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim() || isProcessing) return;

    const userText = manualText.trim();
    setManualText('');
    stopSpeaking();
    recognitionRef.current?.stopListening();
    handleCitizenUtterance(userText, stage, extractedData);
  };

  // Handle Photo Evidence Attachment
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAttachedImage(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setIsAnalyzingImage(true);

    try {
      const visionResult = await analyzeImageEvidence(file, String(extractedData.description || ''));
      setIsAnalyzingImage(false);

      const photoMsg = `I have attached a photo proof showing ${visionResult.detectedObjects?.join(', ') || 'the civic issue'}.`;
      handleCitizenUtterance(photoMsg, stage, {
        ...extractedData,
        evidence_mentioned: true,
        evidence_quality: 'HIGH / VERIFIED BY PHOTO',
        category: visionResult.suggestedCategory || extractedData.category,
      });
    } catch {
      setIsAnalyzingImage(false);
      handleCitizenUtterance('I have attached a photo of the location.', stage, {
        ...extractedData,
        evidence_mentioned: true,
      });
    }
  };

  const handleEndCall = () => {
    stopSpeaking();
    recognitionRef.current?.abortListening();
    setCallStatus('ended');
    setTimeout(() => {
      if (createdComplaint) {
        navigate(`/track?id=${createdComplaint.complaint_number || createdComplaint.id}`);
      } else {
        navigate('/');
      }
    }, 900);
  };

  // Determine active state display
  const getStageIndicator = () => {
    if (stage === 'submitted' && createdComplaint) return 'REGISTERED';
    if (stage === 'confirm') return 'WAITING FOR CONFIRMATION';
    if (stage === 'tracking') return 'TRACKING';
    if (stage === 'cancelled') return 'CANCELLED';
    if (stage === 'location' || stage === 'location_collection') return 'COLLECTING LOCATION';
    if (stage === 'information_collection' || stage === 'problem') return 'COLLECTING DETAILS';
    if (isProcessing) return 'UNDERSTANDING';
    if (isAiSpeaking) return 'AI SPEAKING';
    if (isUserListening) return 'CITIZEN LISTENING';
    return 'READY';
  };

  const isConfirmedReady = stage === 'confirm' && (extractedData.description || extractedData.category);
  const hasExtractedBlueprint = (extractedData.description || extractedData.category || extractedData.location) && stage !== 'greeting';

  return (
    <PageTransition>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 relative">
        <div className="w-full max-w-2xl mx-auto space-y-4">

          {/* ── Top Command Bar ────────────────────────────────────────────── */}
          <div className="bg-[#111]/90 border border-white/10 rounded-2xl p-4 flex items-center justify-between backdrop-blur-xl shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-3.5 h-3.5 rounded-full ${callStatus === 'connected' ? 'bg-[#22C55E]' : 'bg-[#FFC400]'} animate-ping absolute inset-0 opacity-75`} />
                <div className={`w-3.5 h-3.5 rounded-full ${callStatus === 'connected' ? 'bg-[#22C55E]' : 'bg-[#FFC400]'} relative z-10`} />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-wide text-white font-mono flex items-center gap-2">
                  CIVICRESOLVE AI HELPLINE
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E10600]/20 text-[#E10600] border border-[#E10600]/40">
                    24/7 LIVE
                  </span>
                </h1>
                <p className="text-[11px] font-mono text-white/40">
                  {callStatus === 'calling'
                    ? 'CONNECTING TO CIVIC OPERATOR...'
                    : callStatus === 'connected'
                    ? 'OPERATOR ACTIVE · MULTI-TURN AI'
                    : 'CALL COMPLETED'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="bg-white/5 border border-white/10 px-3 py-1 rounded-xl flex items-center gap-1.5 font-mono text-xs text-white/70">
                <Clock className="w-3.5 h-3.5 text-[#FFC400]" />
                <span>{formatCallTime(callDuration)}</span>
              </div>
              <motion.button
                {...buttonGestures}
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`p-2 rounded-xl transition-colors ${
                  audioEnabled ? 'bg-white/5 text-white/70 hover:text-white' : 'bg-[#E10600]/20 text-[#E10600]'
                }`}
                title={audioEnabled ? 'Mute AI Voice' : 'Unmute AI Voice'}
              >
                {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </motion.button>
            </div>
          </div>

          {/* ── Dynamic Conversational Stage Stepper ──────────────────────── */}
          <div className="bg-[#0D0D0D]/90 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between text-[10px] font-mono text-white/50 overflow-x-auto gap-2">
            {[
              { id: 'greeting', label: '1. GREETING', active: true },
              { id: 'listening', label: '2. LISTENING', active: stage !== 'greeting' },
              { id: 'details', label: '3. UNDERSTANDING', active: !!extractedData.description || stage === 'location' || stage === 'confirm' || stage === 'submitted' },
              { id: 'location', label: '4. LOCATION', active: !!extractedData.location || stage === 'confirm' || stage === 'submitted' },
              { id: 'confirm', label: '5. CONFIRM', active: stage === 'confirm' || stage === 'submitted' },
              { id: 'submitted', label: '6. REGISTERED', active: stage === 'submitted' && !!createdComplaint },
            ].map((step, idx, arr) => (
              <div key={step.id} className="flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className={`px-2.5 py-1 rounded-md transition-all font-bold ${
                    step.active
                      ? 'bg-[#E10600]/20 text-[#E10600] border border-[#E10600]/40 shadow-[0_0_8px_rgba(225,6,0,0.25)]'
                      : 'bg-white/5 text-white/30 border border-white/5'
                  }`}
                >
                  {step.label}
                </span>
                {idx < arr.length - 1 && <span className="text-white/20">→</span>}
              </div>
            ))}
          </div>

          {/* ── Center Stage: Visualizer Aura & Spoken Status ─────────────── */}
          <div className="bg-[#0D0D0D] border border-white/10 rounded-3xl p-6 sm:p-7 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl min-h-[260px]">
            {/* Top red ambient glow */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#E10600]/50 to-transparent" />

            {/* Concentric Animated Voice Rings */}
            <div className="relative flex items-center justify-center my-3">
              {/* Outer pulsing ring for AI speaking */}
              {isAiSpeaking && (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                    className="absolute w-36 h-36 rounded-full bg-[#E10600]/30"
                  />
                  <div className="absolute w-48 h-48 rounded-full border border-[#E10600]/30 animate-pulse" />
                </>
              )}

              {/* Outer pulsing ring for Citizen speaking */}
              {isUserListening && (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                    className="absolute w-36 h-36 rounded-full bg-[#22C55E]/30"
                  />
                  <div className="absolute w-48 h-48 rounded-full border border-[#22C55E]/40 animate-pulse" />
                </>
              )}

              {/* Center Voice Avatar Icon */}
              <motion.div
                animate={
                  isAiSpeaking
                    ? { scale: [1, 1.07, 1] }
                    : isUserListening
                    ? { scale: [1, 1.08, 1] }
                    : { scale: 1 }
                }
                transition={{ duration: 1.2, repeat: Infinity }}
                className={`w-24 h-24 rounded-full flex items-center justify-center relative z-10 transition-colors duration-300 shadow-2xl ${
                  isAiSpeaking
                    ? 'bg-gradient-to-tr from-[#E10600] to-[#FFC400] text-white ring-4 ring-[#E10600]/40'
                    : isUserListening
                    ? 'bg-gradient-to-tr from-[#22C55E] to-[#16A34A] text-white ring-4 ring-[#22C55E]/40'
                    : 'bg-[#181818] border-2 border-white/20 text-white/60'
                }`}
              >
                {isAiSpeaking ? (
                  <Radio className="w-10 h-10 animate-pulse" />
                ) : isUserListening ? (
                  <Mic className="w-10 h-10" />
                ) : (
                  <Sparkles className="w-10 h-10 text-[#FFC400]" />
                )}
              </motion.div>
            </div>

            {/* Dynamic Status Text Indicator */}
            <div className="text-center mt-2 space-y-1">
              <div className="inline-flex items-center gap-2">
                {isAiSpeaking ? (
                  <span className="telemetry-chip-red">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E10600] animate-pulse" />
                    AI OPERATOR SPEAKING...
                  </span>
                ) : isUserListening ? (
                  <span className="telemetry-chip-green">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                    LISTENING... SPEAK FREELY
                  </span>
                ) : isProcessing ? (
                  <span className="telemetry-chip-yellow">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFC400] animate-pulse" />
                    AI REASONING (QWEN 2.5)...
                  </span>
                ) : (
                  <span className="telemetry-chip">HELPLINE ACTIVE · STATE: {getStageIndicator()}</span>
                )}
              </div>

              {/* Real-time speech preview caption */}
              {interimText && (
                <p className="text-sm font-mono text-[#FFC400] italic animate-pulse mt-2 max-w-md">
                  "{interimText}"
                </p>
              )}
            </div>
          </div>

          {/* ── Extracted Complaint Blueprint Drawer ───────────────────────── */}
          {hasExtractedBlueprint && stage !== 'submitted' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#141414] border border-white/10 rounded-2xl p-4 shadow-xl space-y-2.5"
            >
              <div className="flex items-center justify-between border-b border-white/8 pb-2">
                <span className="text-[11px] font-bold font-mono text-[#FFC400] uppercase flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  AI Complaint Intake Blueprint
                </span>
                <span className="text-[10px] font-mono text-white/40">
                  {stage === 'confirm' ? 'Awaiting Confirmation' : 'In Progress'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {extractedData.description && (
                  <div className="col-span-full bg-white/5 p-2 rounded-xl">
                    <span className="text-[10px] text-white/40 block font-mono">PROBLEM</span>
                    <span className="text-white font-sans">{String(extractedData.description)}</span>
                  </div>
                )}

                {extractedData.category && (
                  <div className="bg-white/5 p-2 rounded-xl flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-[#FFC400] flex-shrink-0" />
                    <div>
                      <span className="text-[10px] text-white/40 block font-mono">CATEGORY</span>
                      <span className="text-white font-mono font-bold">{String(extractedData.category)}</span>
                    </div>
                  </div>
                )}

                {extractedData.department && (
                  <div className="bg-white/5 p-2 rounded-xl flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-[#38BDF8] flex-shrink-0" />
                    <div>
                      <span className="text-[10px] text-white/40 block font-mono">DEPARTMENT</span>
                      <span className="text-white font-sans truncate block max-w-[180px]">{String(extractedData.department)}</span>
                    </div>
                  </div>
                )}

                {extractedData.location && (
                  <div className="bg-white/5 p-2 rounded-xl flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#22C55E] flex-shrink-0" />
                    <div>
                      <span className="text-[10px] text-white/40 block font-mono">LOCATION</span>
                      <span className="text-white font-mono font-bold">{String(extractedData.location)}</span>
                    </div>
                  </div>
                )}

                {extractedData.priority && (
                  <div className="bg-white/5 p-2 rounded-xl flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#E10600] flex-shrink-0" />
                    <div>
                      <span className="text-[10px] text-white/40 block font-mono">PRIORITY</span>
                      <span className={`font-mono font-black ${
                        extractedData.priority === 'CRITICAL' || extractedData.priority === 'HIGH'
                          ? 'text-[#E10600]'
                          : 'text-[#FFC400]'
                      }`}>
                        {String(extractedData.priority)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {imagePreview && (
                <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl mt-1">
                  <img src={imagePreview} alt="Evidence" className="w-12 h-12 object-cover rounded-lg border border-white/10" />
                  <div className="text-xs">
                    <span className="text-[#22C55E] font-mono font-bold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Photo Proof Attached
                    </span>
                    <p className="text-[10px] text-white/40">Visual evidence verified for field dispatch</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Interactive Confirmation Action Card ──────────────────────── */}
          {isConfirmedReady && stage === 'confirm' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#FFC400]/10 border-2 border-[#FFC400]/40 rounded-2xl p-4 shadow-2xl space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#FFC400]/20 flex items-center justify-center flex-shrink-0 text-[#FFC400]">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white font-mono">Complaint Ready for Submission</h4>
                  <p className="text-xs text-white/70 mt-0.5 font-sans">
                    Say <strong className="text-[#22C55E]">"Yes, submit it"</strong> or tap the button below to register your official complaint.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1 flex-wrap sm:flex-nowrap">
                <motion.button
                  {...buttonGestures}
                  type="button"
                  onClick={() => handleCitizenUtterance('Yes, submit it now', 'confirm', extractedData)}
                  disabled={isProcessing}
                  className="flex-1 bg-[#22C55E] hover:bg-[#16A34A] text-white py-2.5 px-4 rounded-xl font-mono text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm & Submit Ticket</span>
                </motion.button>

                <motion.button
                  {...buttonGestures}
                  type="button"
                  onClick={() => handleCitizenUtterance('Change details', 'confirm', extractedData)}
                  disabled={isProcessing}
                  className="bg-white/10 hover:bg-white/15 text-white py-2.5 px-3.5 rounded-xl font-mono text-xs font-semibold flex items-center gap-1.5 border border-white/10"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Make Changes</span>
                </motion.button>

                <motion.button
                  {...buttonGestures}
                  type="button"
                  onClick={() => handleCitizenUtterance('Cancel the complaint', 'confirm', extractedData)}
                  disabled={isProcessing}
                  className="bg-[#E10600]/15 hover:bg-[#E10600]/25 text-[#E10600] py-2.5 px-3.5 rounded-xl font-mono text-xs font-semibold flex items-center gap-1.5 border border-[#E10600]/30"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Official Registered Complaint Card ────────────────────────── */}
          {createdComplaint && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#22C55E]/10 border-2 border-[#22C55E]/40 rounded-2xl p-5 shadow-2xl shadow-[#22C55E]/10 space-y-3"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-[#22C55E]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-6 h-6 text-[#22C55E]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-[#22C55E] tracking-wider font-mono">
                      ✓ Complaint Registered in Municipal Database
                    </span>
                    <h3 className="text-lg font-black text-white mt-0.5 font-mono">
                      {createdComplaint.complaint_number}
                    </h3>
                    <p className="text-xs text-white/60 mt-1 font-sans">
                      Category: <strong className="text-white font-mono">{createdComplaint.category}</strong> · Department:{' '}
                      <strong className="text-white font-display">{createdComplaint.department}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Link
                    to={`/track?id=${createdComplaint.complaint_number}`}
                    className="flex-1 sm:flex-initial"
                  >
                    <motion.div
                      {...buttonGestures}
                      className="btn-primary text-xs py-2 px-4 whitespace-nowrap font-mono flex items-center justify-center gap-1.5"
                    >
                      <span>Track Status</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </motion.div>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Live Conversation Transcript Drawer ────────────────────── */}
          <div className="bg-[#111] border border-white/10 rounded-2xl p-4 sm:p-5 max-h-56 overflow-y-auto space-y-3 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/8 sticky top-0 bg-[#111]/95 backdrop-blur z-10 font-mono">
              <span className="text-[11px] uppercase text-white/40 font-bold flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-[#E10600]" />
                Live Helpline Call Transcript
              </span>
              <span className="text-[10px] text-white/30">
                {transcript.length} turns recorded
              </span>
            </div>

            {transcript.length === 0 ? (
              <p className="text-xs text-white/30 italic text-center py-4 font-sans">
                Call started. The AI helpline operator will begin speaking shortly...
              </p>
            ) : (
              transcript.map((item, i) => (
                <div
                  key={i}
                  className={`flex gap-3 text-xs leading-relaxed ${
                    item.sender === 'ai' ? 'text-white/90' : 'text-[#FFC400]'
                  }`}
                >
                  <div className="flex-shrink-0 font-bold font-mono">
                    {item.sender === 'ai' ? (
                      <span className="text-[#E10600]">[CIVICRESOLVE AI]:</span>
                    ) : (
                      <span className="text-[#22C55E]">[YOU]:</span>
                    )}
                  </div>
                  <div className="flex-1 break-words">
                    <p className="font-sans">{item.text}</p>
                    <span className="text-[9px] font-mono text-white/20 block mt-0.5">{item.timestamp}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* ── Contextual Quick Reply Suggestions ──────────────────────── */}
          {uiHints?.suggested_quick_replies && uiHints.suggested_quick_replies.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
              <span className="text-[10px] font-mono text-white/40 uppercase whitespace-nowrap">Suggestions:</span>
              {uiHints.suggested_quick_replies.map((reply, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleCitizenUtterance(reply, stage, extractedData)}
                  disabled={isProcessing}
                  className="px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 text-xs font-mono whitespace-nowrap transition-colors"
                >
                  {reply}
                </button>
              ))}
            </div>
          )}

          {/* ── Microphone / Permission Alerts ────────────────────────── */}
          {permissionError && (
            <div className="bg-[#FFC400]/10 border border-[#FFC400]/20 rounded-xl p-3.5 flex items-center gap-3 text-xs text-[#FFC400] font-mono">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="flex-1">{permissionError}</p>
            </div>
          )}

          {/* ── Text Input Fallback ────────────────────────────────────── */}
          {showTextInput && (
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Type your response here..."
                className="input-field flex-1 font-sans text-xs"
                disabled={isProcessing}
              />
              <motion.button
                {...buttonGestures}
                type="submit"
                disabled={!manualText.trim() || isProcessing}
                className="btn-primary px-4 py-2 text-xs font-mono"
              >
                <Send className="w-4 h-4" />
              </motion.button>
            </form>
          )}

          {/* ── Bottom Call Controls Dock ─────────────────────────────── */}
          <div className="bg-[#111] border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-2xl flex-wrap gap-2">
            {/* Left Controls: Keyboard & Photo upload */}
            <div className="flex items-center gap-2">
              <motion.button
                {...buttonGestures}
                type="button"
                onClick={() => setShowTextInput(!showTextInput)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors font-mono ${
                  showTextInput
                    ? 'bg-[#E10600]/15 text-[#E10600] border-[#E10600]/30'
                    : 'bg-white/5 text-white/60 hover:text-white border-white/10'
                }`}
                title="Type response on keyboard"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">{showTextInput ? 'Hide Input' : 'Type Text'}</span>
              </motion.button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
              <motion.button
                {...buttonGestures}
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isAnalyzingImage}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 text-white/60 hover:text-white border border-white/10 transition-colors font-mono"
                title="Attach photo proof to call"
              >
                <Camera className="w-4 h-4 text-[#FFC400]" />
                <span className="hidden sm:inline">{isAnalyzingImage ? 'Analyzing...' : 'Attach Photo'}</span>
              </motion.button>
            </div>

            {/* Center: Push to Speak / Mic Toggle */}
            <div className="flex items-center gap-3">
              <motion.button
                {...buttonGestures}
                type="button"
                onClick={() => {
                  if (isUserListening) {
                    recognitionRef.current?.stopListening();
                  } else {
                    stopSpeaking();
                    startCitizenListening(stage, extractedData);
                  }
                }}
                className={`p-3.5 rounded-2xl flex items-center justify-center transition-colors ${
                  isUserListening
                    ? 'bg-[#22C55E] text-white shadow-[0_0_20px_rgba(34,197,94,0.5)]'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
                title={isUserListening ? 'Stop Listening' : 'Speak Now (Push to Talk)'}
              >
                {isUserListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </motion.button>

              <motion.button
                {...buttonGestures}
                type="button"
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (!isMuted) {
                    recognitionRef.current?.stopListening();
                  }
                }}
                className={`p-3.5 rounded-2xl border transition-colors ${
                  isMuted
                    ? 'bg-[#E10600]/20 text-[#E10600] border-[#E10600]/40'
                    : 'bg-white/5 text-white/60 hover:text-white border-white/10'
                }`}
                title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </motion.button>
            </div>

            {/* Right: End Call Button */}
            <motion.button
              {...buttonGestures}
              type="button"
              onClick={handleEndCall}
              className="flex items-center gap-2 bg-[#E10600] hover:bg-[#C90000] text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-colors font-display"
            >
              <PhoneOff className="w-4 h-4" />
              <span>End Call</span>
            </motion.button>
          </div>

        </div>
      </div>
    </PageTransition>
  );
}
