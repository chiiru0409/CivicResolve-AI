import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  const [extractedData, setExtractedData] = useState<Record<string, unknown>>({});
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [interimText, setInterimText] = useState('');
  const [createdComplaint, setCreatedComplaint] = useState<VoiceTurnResponse['complaint'] | null>(null);

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

    // Check browser speech recognition support
    if (!isSpeechRecognitionSupported()) {
      setPermissionError('Speech Recognition is not supported in this browser. You can type your responses in the call.');
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
      const fallbackGreeting = 'Hello! You have reached CivicResolve AI Municipal Helpline. Please describe the civic issue you would like to report.';
      speakAndListen(fallbackGreeting, 'problem', {});
    } finally {
      setIsProcessing(false);
    }
  };

  // Process Agent Response
  const handleAgentResponse = (response: VoiceTurnResponse) => {
    setStage(response.stage);
    setExtractedData(response.extracted_data || {});

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
            title: response.complaint.title || 'Voice Report',
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
        if (nextStage !== 'submitted' && !isMuted) {
          startCitizenListening(nextStage, data);
        }
      },
      () => {
        setIsAiSpeaking(false);
        if (nextStage !== 'submitted' && !isMuted) {
          startCitizenListening(nextStage, data);
        }
      },
    );
  };

  // Listen for Citizen Speech
  const startCitizenListening = (currentStage: string, currentData: Record<string, unknown>) => {
    if (isMuted || !isSpeechRecognitionSupported()) return;

    setIsUserListening(true);
    setInterimText('');

    recognitionRef.current?.startListening(
      (text: string, isFinal: boolean) => {
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
        } else if (error === 'no-speech') {
          // If no speech detected in listening window, prompt gently
          // only if user didn't speak
        }
      },
      () => {
        setIsUserListening(false);
      },
    );
  };

  // Handle Spoken Turn
  const handleCitizenUtterance = async (spokenText: string, currentStage: string, currentData: Record<string, unknown>) => {
    if (!spokenText.trim()) return;

    // Add user speech to transcript
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
      const response = await sendVoiceTurn(spokenText, currentStage, currentData, coords);
      handleAgentResponse(response);
    } catch {
      speakAndListen("I received your input. Could you please confirm if you'd like me to submit this official complaint now?", 'confirm', currentData);
    } finally {
      setIsProcessing(false);
    }
  };

  // Manual fallback submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim() || isProcessing) return;
    const text = manualText.trim();
    setManualText('');
    stopSpeaking();
    recognitionRef.current?.abortListening();
    handleCitizenUtterance(text, stage, extractedData);
  };

  // End Call
  const handleEndCall = () => {
    stopSpeaking();
    recognitionRef.current?.abortListening();
    setCallStatus('ended');
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#070707] text-white pt-20 pb-12 px-4 sm:px-6 flex flex-col justify-center items-center relative overflow-hidden">
        {/* Background Ambient Glows */}
        <div className="ambient-glow-red w-[600px] h-[600px] -top-32 -left-32 opacity-20 pointer-events-none" />
        <div className="ambient-glow-yellow w-[500px] h-[500px] top-1/2 right-0 opacity-15 pointer-events-none" />
        <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />

        <div className="w-full max-w-3xl mx-auto flex flex-col h-full z-10 space-y-5">

          {/* ── Call Header Bar ────────────────────────────────────────── */}
          <div className="bg-[#111] border border-white/10 rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[#22C55E] animate-pulse" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black tracking-wide text-white uppercase">
                    CivicResolve AI Voice Helpline
                  </span>
                  <span className="telemetry-chip hidden sm:inline-flex">[ QWEN-2.5:3B ]</span>
                </div>
                <p className="text-[11px] font-mono text-white/40">
                  {callStatus === 'calling' ? 'CONNECTING TO AI AGENT...' : callStatus === 'connected' ? 'CALL ACTIVE · 24/7 DISPATCH' : 'CALL ENDED'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-white/5 border border-white/10 px-3 py-1 rounded-xl flex items-center gap-1.5 font-mono text-xs text-white/70">
                <Clock className="w-3.5 h-3.5 text-[#FFC400]" />
                <span>{formatCallTime(callDuration)}</span>
              </div>
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`p-2 rounded-xl transition-all ${
                  audioEnabled ? 'bg-white/5 text-white/70 hover:text-white' : 'bg-[#E10600]/20 text-[#E10600]'
                }`}
                title={audioEnabled ? 'Mute AI Voice' : 'Unmute AI Voice'}
              >
                {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* ── Center Stage: Radar Visualizer & Status ────────────────── */}
          <div className="bg-[#0D0D0D] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center relative overflow-hidden min-h-[280px] shadow-2xl">
            {/* Top red specular line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600]/50 to-transparent" />

            {/* Concentric Animated Voice Rings */}
            <div className="relative flex items-center justify-center my-4">
              {/* Outer pulsing ring for AI speaking */}
              {isAiSpeaking && (
                <>
                  <div className="absolute w-36 h-36 rounded-full bg-[#E10600]/20 animate-ping" />
                  <div className="absolute w-48 h-48 rounded-full border border-[#E10600]/30 animate-pulse" />
                </>
              )}

              {/* Outer pulsing ring for Citizen speaking */}
              {isUserListening && (
                <>
                  <div className="absolute w-36 h-36 rounded-full bg-[#22C55E]/20 animate-ping" />
                  <div className="absolute w-48 h-48 rounded-full border border-[#22C55E]/40 animate-pulse" />
                </>
              )}

              {/* Core Avatar Button */}
              <div
                className={`w-24 h-24 rounded-full flex items-center justify-center relative z-10 transition-all duration-300 shadow-2xl ${
                  isAiSpeaking
                    ? 'bg-gradient-to-tr from-[#E10600] to-[#FFC400] text-white ring-4 ring-[#E10600]/40 scale-105'
                    : isUserListening
                    ? 'bg-gradient-to-tr from-[#22C55E] to-[#16A34A] text-white ring-4 ring-[#22C55E]/40 scale-105'
                    : 'bg-[#181818] border-2 border-white/20 text-white/60'
                }`}
              >
                {isAiSpeaking ? (
                  <Radio className="w-10 h-10 animate-pulse" />
                ) : isUserListening ? (
                  <Mic className="w-10 h-10 animate-bounce" />
                ) : (
                  <Sparkles className="w-10 h-10 text-[#FFC400]" />
                )}
              </div>
            </div>

            {/* Dynamic Status Text Indicator */}
            <div className="text-center mt-2 space-y-1">
              <div className="inline-flex items-center gap-2">
                {isAiSpeaking ? (
                  <span className="telemetry-chip-red">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E10600] animate-pulse" />
                    AI AGENT SPEAKING...
                  </span>
                ) : isUserListening ? (
                  <span className="telemetry-chip-green">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                    LISTENING... SPEAK FREELY
                  </span>
                ) : isProcessing ? (
                  <span className="telemetry-chip-yellow">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFC400] animate-pulse" />
                    AI REASONING (QWEN2.5)...
                  </span>
                ) : (
                  <span className="telemetry-chip">HELPLINE ACTIVE</span>
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

          {/* ── Live Conversation Transcript Drawer ────────────────────── */}
          <div className="bg-[#111] border border-white/10 rounded-2xl p-4 sm:p-5 max-h-56 overflow-y-auto space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/8 sticky top-0 bg-[#111]/95 backdrop-blur z-10">
              <span className="text-[11px] font-mono uppercase text-white/40 font-bold">
                Live Call Transcript
              </span>
              <span className="text-[10px] font-mono text-white/30">
                {transcript.length} turns recorded
              </span>
            </div>

            {transcript.length === 0 ? (
              <p className="text-xs text-white/30 italic text-center py-4">
                Call started. The AI agent will begin speaking shortly...
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
                      <span className="text-[#E10600]">[AI AGENT]:</span>
                    ) : (
                      <span className="text-[#22C55E]">[YOU]:</span>
                    )}
                  </div>
                  <div className="flex-1 break-words">
                    <p>{item.text}</p>
                    <span className="text-[9px] font-mono text-white/20 block mt-0.5">{item.timestamp}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          {/* ── Confirmed Complaint Registration Card ─────────────────── */}
          {createdComplaint && (
            <div className="bg-[#22C55E]/10 border-2 border-[#22C55E]/30 rounded-2xl p-5 shadow-2xl animate-fadeIn">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-[#22C55E]/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-6 h-6 text-[#22C55E]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-[#22C55E] tracking-wider">
                      ✓ Complaint Officially Registered via Voice
                    </span>
                    <h3 className="text-base font-black text-white mt-0.5">
                      {createdComplaint.complaint_number}
                    </h3>
                    <p className="text-xs text-white/60 mt-1">
                      Category: <strong>{createdComplaint.category}</strong> · Department: <strong>{createdComplaint.department}</strong>
                    </p>
                  </div>
                </div>

                <Link
                  to={`/track?id=${createdComplaint.complaint_number}`}
                  className="btn-primary text-xs py-2 px-4 whitespace-nowrap flex-shrink-0"
                >
                  Track Status <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* ── Microphone / Permission Alerts ────────────────────────── */}
          {permissionError && (
            <div className="bg-[#FFC400]/10 border border-[#FFC400]/20 rounded-xl p-3.5 flex items-center gap-3 text-xs text-[#FFC400]">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p className="flex-1">{permissionError}</p>
            </div>
          )}

          {/* ── Text Input Fallback (Optional) ─────────────────────────── */}
          {showTextInput && (
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Type your response here..."
                className="input-field flex-1"
                disabled={isProcessing}
              />
              <button
                type="submit"
                disabled={!manualText.trim() || isProcessing}
                className="btn-primary px-4 py-2 text-xs"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* ── Bottom Call Control Dock ───────────────────────────────── */}
          <div className="bg-[#111] border border-white/10 rounded-2xl p-4 flex items-center justify-between shadow-2xl">
            {/* Left: Keyboard text toggle */}
            <button
              type="button"
              onClick={() => setShowTextInput(!showTextInput)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                showTextInput
                  ? 'bg-[#E10600]/15 text-[#E10600] border-[#E10600]/30'
                  : 'bg-white/5 text-white/60 hover:text-white border-white/10'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">{showTextInput ? 'Hide Text Input' : 'Type Response'}</span>
            </button>

            {/* Center: Push to Speak / Mic Toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (isUserListening) {
                    recognitionRef.current?.stopListening();
                  } else {
                    stopSpeaking();
                    startCitizenListening(stage, extractedData);
                  }
                }}
                className={`p-3.5 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                  isUserListening
                    ? 'bg-[#22C55E] text-white shadow-[0_0_20px_rgba(34,197,94,0.5)] scale-105'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
                title={isUserListening ? 'Stop Listening' : 'Speak Now (Push to Talk)'}
              >
                {isUserListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (!isMuted) {
                    recognitionRef.current?.stopListening();
                  }
                }}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isMuted
                    ? 'bg-[#E10600]/20 text-[#E10600] border-[#E10600]/40'
                    : 'bg-white/5 text-white/60 hover:text-white border-white/10'
                }`}
                title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            </div>

            {/* Right: End Call Button */}
            <button
              type="button"
              onClick={handleEndCall}
              className="flex items-center gap-2 bg-[#E10600] hover:bg-[#C90000] text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all active:scale-95"
            >
              <PhoneOff className="w-4 h-4" />
              <span>End Call</span>
            </button>
          </div>

        </div>
      </div>
    </PageTransition>
  );
}
