/**
 * voiceService.ts — Voice AI Agent & Speech Pipeline for CivicResolve AI
 *
 * Implements Siri / Google Assistant–level conversational helpline:
 * - Real Web Speech Recognition & Speech Synthesis
 * - Instant Barge-In / Interruption capability
 * - Siri/Google Assistant-style greetings and small-talk
 * - Multi-turn slot memory & anti-redundancy
 * - In-place self-correction
 * - Ambiguity handling & multi-issue recognition
 * - Live status tracking with real database records
 * - Hard confirmation safety gate before complaint registration
 */

import { api, isBackendAvailable } from '../api';
import { classifyCivicIssue } from './classificationService';
import { trackComplaint, submitComplaint } from '../complaintService';

export interface VoiceTurnResponse {
  reply_text: string;
  stage: 'greeting' | 'listening' | 'problem' | 'location' | 'landmark' | 'confirm' | 'submitted' | 'tracking' | 'cancelled';
  extracted_data: {
    description?: string;
    location?: string;
    landmark?: string;
    category?: string;
    priority?: string;
    department?: string;
    duration?: string;
    evidence_mentioned?: boolean;
    multi_issues?: string[];
    paused_draft?: boolean;
  };
  action: 'speak' | 'listen' | 'confirm' | 'completed' | 'ended';
  complaint?: {
    id: string;
    complaint_number: string;
    title: string;
    description: string;
    category: string;
    priority: string;
    department: string;
    location: string;
    status: string;
    created_at: string;
  } | null;
  ui_hints?: {
    status_label?: string;
    can_confirm?: boolean;
    can_cancel?: boolean;
    suggested_quick_replies?: string[];
  };
}

interface IWindow extends Window {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SpeechRecognition?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webkitSpeechRecognition?: any;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as IWindow;
  return Boolean(win.SpeechRecognition || win.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export class VoiceRecognitionManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private isListening = false;
  private onResultCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor() {
    if (!isSpeechRecognitionSupported()) return;

    const win = window as IWindow;
    const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
    this.recognition = new SpeechRecognitionClass();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-IN';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (final && this.onResultCallback) {
        this.onResultCallback(final.trim(), true);
      } else if (interim && this.onResultCallback) {
        this.onResultCallback(interim.trim(), false);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      if (this.onErrorCallback) {
        this.onErrorCallback(event.error || 'speech_recognition_error');
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onEndCallback) {
        this.onEndCallback();
      }
    };
  }

  public startListening(
    onResult: (text: string, isFinal: boolean) => void,
    onError: (error: string) => void,
    onEnd: () => void,
  ): void {
    if (!this.recognition) {
      onError('not_supported');
      return;
    }

    if (this.isListening) {
      try { this.recognition.stop(); } catch { /* ignore */ }
    }

    this.onResultCallback = onResult;
    this.onErrorCallback = onError;
    this.onEndCallback = onEnd;

    try {
      this.recognition.start();
      this.isListening = true;
    } catch {
      this.isListening = false;
      onError('start_failed');
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch { /* ignore */ }
      this.isListening = false;
    }
  }

  public abortListening(): void {
    this.stopListening();
  }
}

/** Synthesize speech using Web Speech API with Siri/Google Assistant natural pacing */
export function speakText(
  text: string,
  onStartOrEnd?: () => void,
  onEnd?: () => void,
  onError?: () => void,
): void {
  const actualOnEnd = onEnd || onStartOrEnd;
  const actualOnStart = onEnd ? onStartOrEnd : undefined;

  if (!isSpeechSynthesisSupported()) {
    if (actualOnEnd) actualOnEnd();
    return;
  }

  window.speechSynthesis.cancel();

  // Strip Markdown symbols and spell out Complaint IDs cleanly for TTS
  const cleanText = text
    .replace(/[*_`#⚠️👋]/g, '')
    .replace(/CR-(\d{4})-(\d+)/gi, (_, year, num) => `C R dash ${year} dash ${num.split('').join(' ')}`);

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.05; // natural snappy pacing like modern voice assistants
  utterance.pitch = 1.0;
  utterance.lang = 'en-IN';

  utterance.onstart = () => {
    if (actualOnStart) actualOnStart();
  };

  utterance.onend = () => {
    if (actualOnEnd) actualOnEnd();
  };

  utterance.onerror = () => {
    if (onError) onError();
    else if (actualOnEnd) actualOnEnd();
  };

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

// ── Helpers for local fallback state machine ──────────────────────────────────

function isGreetingSpeech(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const greetings = [
    'hi', 'hello', 'hey', 'namaste', 'good morning', 'good evening', 'good afternoon',
    'how are you', 'how are you doing', 'can you help me', 'what can you do', 'who are you',
    'are you there', 'you there', 'is anyone there', 'hello there', 'hi there', 'hey there',
  ];
  return greetings.includes(cleaned) || (cleaned.startsWith('hello') && cleaned.split(' ').length <= 3);
}

function isAffirmativeSpeech(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const affirmatives = [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'submit', 'confirm', 'proceed',
    'correct', 'right', 'fine', 'haan', 'ha', 'do it', 'go ahead', 'yes please', 'submit it',
    'thats right', 'that is right', 'exactly', 'please submit', 'register it',
  ];
  return affirmatives.some((a) => cleaned === a || cleaned.startsWith(a));
}

function isCancelSpeech(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const cancels = [
    'cancel', 'dont submit', "don't submit", 'stop', 'nevermind', 'never mind',
    'changed my mind', 'abort', 'exit', 'forget it', "i don't want to report",
  ];
  return cancels.some((c) => cleaned === c || cleaned.startsWith(c));
}

function extractLocationSpeech(text: string): string | null {
  const lower = text.toLowerCase();
  const preps = ['near', 'opposite', 'beside', 'behind', 'at', 'on', 'outside', 'in'];
  for (const prep of preps) {
    const match = lower.match(new RegExp(`\\b${prep}\\s+([a-z0-9\\s]{3,40})`, 'i'));
    if (match && match[1]) {
      const loc = match[1].split(/\b(and|for|since|is|because|which|bro)\b/)[0].trim();
      if (loc.length >= 3 && !['road', 'street', 'area', 'house'].includes(loc)) {
        return `${prep.charAt(0).toUpperCase() + prep.slice(1)} ${loc.charAt(0).toUpperCase() + loc.slice(1)}`;
      }
    }
  }
  if (lower.includes('road') || lower.includes('street') || lower.includes('market') || lower.includes('colony') || lower.includes('nagar') || lower.includes('mall') || lower.includes('bus stop')) {
    return text.trim();
  }
  return null;
}

/** Process a conversational voice turn */
export async function sendVoiceTurn(
  userSpeech: string,
  currentStage: string,
  extractedData: Record<string, unknown>,
  coords?: { latitude?: number; longitude?: number },
  history?: Array<{ role: string; content: string }>,
): Promise<VoiceTurnResponse> {
  // 1. Try real backend endpoint if online
  if (isBackendAvailable()) {
    try {
      const res = await api.post<VoiceTurnResponse>('/voice/turn', {
        message: userSpeech,
        user_speech: userSpeech,
        stage: currentStage,
        extracted_data: extractedData,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        history: history || [],
      });
      if (res && res.reply_text) return res;
    } catch {
      // Fall through to local intelligent state machine
    }
  }

  // 2. Intelligent local turn-by-turn fallback dialog state machine
  const speech = userSpeech.trim();
  const lower = speech.toLowerCase();

  // Initial Start
  if (currentStage === 'greeting' || speech === '__START__') {
    return {
      reply_text: "Hey! You're connected to CivicResolve. How can I help you today?",
      stage: 'listening',
      extracted_data: {},
      action: 'speak',
      ui_hints: {
        status_label: 'READY',
        can_confirm: false,
        can_cancel: false,
        suggested_quick_replies: ['Report a pothole', 'Garbage uncollected', 'Water leakage', 'Track my complaint'],
      },
    };
  }

  // Unclear audio
  if (!speech) {
    return {
      reply_text: "Sorry, I didn't catch that. Could you say that again?",
      stage: currentStage as any,
      extracted_data: extractedData,
      action: 'speak',
      ui_hints: {
        status_label: 'LISTENING',
        can_confirm: false,
        can_cancel: Boolean(extractedData.description),
      },
    };
  }

  // Pure Greeting (MUST NOT create a complaint)
  if (isGreetingSpeech(speech) && currentStage !== 'confirm') {
    let reply = "Hi! What can I help you with?";
    if (lower.includes('are you there') || lower.includes('you there')) {
      reply = "Yes, I'm here. Tell me what's happening.";
    } else if (lower.includes('can you help') || lower.includes('help me')) {
      reply = "Of course. Tell me about the issue.";
    } else if (lower.includes('how are you')) {
      reply = "I'm doing well, thanks! What can I help you with today?";
    } else if (lower.startsWith('hey')) {
      reply = "Hey! You're connected to CivicResolve. How can I help you today?";
    }

    return {
      reply_text: reply,
      stage: 'listening',
      extracted_data: extractedData,
      action: 'speak',
      ui_hints: {
        status_label: 'LISTENING',
        can_confirm: false,
        can_cancel: false,
        suggested_quick_replies: ['Report a pothole', 'Track complaint status', 'How does this work?'],
      },
    };
  }

  // Assistant Query
  if (lower.includes("what's your name") || lower.includes("who are you")) {
    return {
      reply_text: "I'm CivicResolve AI, your civic helpline assistant. I can help report and track local issues. What would you like to report?",
      stage: 'listening',
      extracted_data: extractedData,
      action: 'speak',
      ui_hints: {
        status_label: 'LISTENING',
        can_confirm: false,
        can_cancel: false,
        suggested_quick_replies: ['Report an issue', 'Track a complaint'],
      },
    };
  }

  // Tracking query check
  const idMatch = speech.match(/CR-\d{4}-\d{4,8}/i);
  if (idMatch || lower.includes('track') || lower.includes('status of complaint') || lower.includes("what's happening with my complaint")) {
    if (idMatch) {
      const record = await trackComplaint(idMatch[0].toUpperCase()).catch(() => null);
      if (record) {
        return {
          reply_text: `I found Complaint ID ${idMatch[0].toUpperCase()}. This ${record.category.toLowerCase()} report at ${record.location} is currently ${record.status.toLowerCase()} under ${record.department}. Would you like to report another issue?`,
          stage: 'tracking',
          extracted_data: extractedData,
          action: 'speak',
          complaint: {
            id: record.complaintNumber || idMatch[0].toUpperCase(),
            complaint_number: record.complaintNumber || idMatch[0].toUpperCase(),
            title: record.title,
            description: record.description || 'Tracked complaint',
            category: record.category,
            priority: record.priority,
            department: record.department || 'Municipal Department',
            location: record.location || 'Reported area',
            status: record.status,
            created_at: record.submittedAt || new Date().toISOString(),
          },
          ui_hints: {
            status_label: 'TRACKING',
            can_confirm: false,
            can_cancel: false,
            suggested_quick_replies: ['Report another issue', 'End Call'],
          },
        };
      }
    }
    return {
      reply_text: 'I can help you track that. What is your Complaint ID? For example, CR-2026-123456.',
      stage: 'tracking',
      extracted_data: extractedData,
      action: 'speak',
      ui_hints: {
        status_label: 'TRACKING',
        can_confirm: false,
        can_cancel: false,
      },
    };
  }

  // User Cancellation
  if (isCancelSpeech(speech) && currentStage !== 'confirm') {
    return {
      reply_text: "No problem. I haven't submitted anything. What else can I help you with?",
      stage: 'listening',
      extracted_data: {},
      action: 'speak',
      ui_hints: {
        status_label: 'CANCELLED',
        can_confirm: false,
        can_cancel: false,
        suggested_quick_replies: ['Report a problem', 'Track complaint', 'End call'],
      },
    };
  }

  // Ambiguity Handling
  if (['there is a problem with water', 'there is a problem with the water', 'problem with water', 'water problem'].includes(lower)) {
    return {
      reply_text: "Sure. Is it a supply problem, a leakage, or poor water quality?",
      stage: 'problem',
      extracted_data: { ...extractedData, category: 'Water' },
      action: 'speak',
      ui_hints: {
        status_label: 'CLARIFYING',
        can_confirm: false,
        can_cancel: true,
        suggested_quick_replies: ['No water supply', 'Water leakage', 'Dirty drinking water'],
      },
    };
  }

  // Self-correction during confirmation
  if (currentStage === 'confirm' && (lower.includes('actually') || lower.includes('wrong') || lower.includes('no it') || lower.includes("no, it's"))) {
    const newLoc = extractLocationSpeech(speech);
    const updated = { ...extractedData, location: newLoc || speech };
    return {
      reply_text: `No problem. I'll update the location to ${updated.location}. Is everything else correct?`,
      stage: 'confirm',
      extracted_data: updated,
      action: 'confirm',
      ui_hints: {
        status_label: 'WAITING FOR CONFIRMATION',
        can_confirm: true,
        can_cancel: true,
        suggested_quick_replies: ['Yes, submit it', 'Change details', 'Cancel'],
      },
    };
  }

  // Confirmation stage
  if (currentStage === 'confirm') {
    if (isAffirmativeSpeech(speech)) {
      try {
        const created = await submitComplaint({
          title: `${extractedData.category || 'Civic'} report via Voice Helpline`,
          description: String(extractedData.description || 'Voice report'),
          location: String(extractedData.location || 'Reported in voice call'),
          landmark: extractedData.landmark ? String(extractedData.landmark) : undefined,
          category: String(extractedData.category || 'Other'),
          priority: String(extractedData.priority || 'HIGH'),
          contact_preference: 'voice',
          source: 'AI Call',
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        });

        const cid = created.complaintNumber || created.id;
        return {
          reply_text: `Done. Your complaint has been registered. Your Complaint ID is ${cid}. We've notified the ${created.department || extractedData.department || 'Municipal Department'}.`,
          stage: 'submitted',
          extracted_data: extractedData,
          action: 'completed',
          complaint: {
            id: created.id,
            complaint_number: cid,
            title: created.title,
            description: created.description,
            category: created.category,
            priority: created.priority,
            department: created.department || String(extractedData.department || 'Municipal Operations'),
            location: created.location,
            status: created.status || 'Submitted',
            created_at: created.submittedAt || new Date().toISOString(),
          },
          ui_hints: {
            status_label: 'REGISTERED',
            can_confirm: false,
            can_cancel: false,
            suggested_quick_replies: ['Track Status', 'Report another issue', 'End Call'],
          },
        };
      } catch {
        return {
          reply_text: 'There was an issue registering the complaint. Please try saying confirm again or file via the web form.',
          stage: 'confirm',
          extracted_data: extractedData,
          action: 'confirm',
          ui_hints: {
            status_label: 'WAITING FOR CONFIRMATION',
            can_confirm: true,
            can_cancel: true,
            suggested_quick_replies: ['Confirm now', 'Cancel'],
          },
        };
      }
    } else if (isCancelSpeech(speech)) {
      return {
        reply_text: 'Understood. I have not submitted this complaint. What details would you like to change?',
        stage: 'problem',
        extracted_data: extractedData,
        action: 'speak',
        ui_hints: {
          status_label: 'COLLECTING DETAILS',
          can_confirm: false,
          can_cancel: true,
          suggested_quick_replies: ['Change location', 'Cancel report'],
        },
      };
    }
  }

  // Location Stage
  if (currentStage === 'location') {
    const loc = extractLocationSpeech(speech) || speech;
    const updated: Record<string, any> = { ...extractedData, location: loc };
    const summary = `Let me make sure I have this right. You're reporting ${String(updated.description).toLowerCase()} near ${updated.location}. Should I register this complaint?`;
    return {
      reply_text: summary,
      stage: 'confirm',
      extracted_data: updated,
      action: 'confirm',
      ui_hints: {
        status_label: 'WAITING FOR CONFIRMATION',
        can_confirm: true,
        can_cancel: true,
        suggested_quick_replies: ['Yes, submit it', 'Change location', 'Cancel'],
      },
    };
  }

  // Core Problem Intake
  const classification = classifyCivicIssue({ description: speech });
  const locInSpeech = extractLocationSpeech(speech);

  const updatedData: Record<string, unknown> = {
    ...extractedData,
    description: speech,
    category: classification.category,
    priority: classification.priority,
    department: classification.department,
  };

  if (locInSpeech) {
    updatedData.location = locInSpeech;
    const summary = `Let me make sure I have this right. You're reporting ${speech.toLowerCase()} near ${locInSpeech}. Should I register this complaint?`;
    return {
      reply_text: summary,
      stage: 'confirm',
      extracted_data: updatedData,
      action: 'confirm',
      ui_hints: {
        status_label: 'WAITING FOR CONFIRMATION',
        can_confirm: true,
        can_cancel: true,
        suggested_quick_replies: ['Yes, submit it', 'Change location', 'Cancel'],
      },
    };
  }

  const followUp =
    classification.category === 'Garbage'
      ? 'Got it. What street or landmark is the garbage located near?'
      : classification.category === 'Streetlights'
      ? 'Got it. What street or landmark is the streetlight near?'
      : `Thanks. Where exactly is the ${speech.toLowerCase()} located?`;

  return {
    reply_text: followUp,
    stage: 'location',
    extracted_data: updatedData,
    action: 'speak',
    ui_hints: {
      status_label: 'COLLECTING DETAILS',
      can_confirm: false,
      can_cancel: true,
      suggested_quick_replies: ['Near Gandhi Market', 'On Main Road', 'Near the bus stop'],
    },
  };
}
