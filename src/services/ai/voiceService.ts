/**
 * voiceService.ts — Voice AI Agent & Speech Pipeline for CivicResolve AI
 *
 * Implements real microphone permissions, Web Speech Recognition, Speech Synthesis,
 * multi-turn conversational intake with natural intent understanding, slot tracking,
 * summary read-back confirmation, and voice status tracking.
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

/** Synthesize speech using Web Speech API */
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
    .replace(/[*_`#]/g, '')
    .replace(/CR-(\d{4})-(\d+)/gi, (_, year, num) => `C R dash ${year} dash ${num.split('').join(' ')}`);

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;
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
    'how are you', 'can you help me', 'what can you do', 'who are you', 'are you there',
  ];
  return greetings.includes(cleaned) || (cleaned.startsWith('hello') && cleaned.split(' ').length <= 3);
}

function isAffirmativeSpeech(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const affirmatives = [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'submit', 'confirm', 'proceed',
    'correct', 'right', 'fine', 'haan', 'ha', 'do it', 'go ahead', 'yes please', 'submit it',
  ];
  return affirmatives.some((a) => cleaned === a || cleaned.startsWith(a));
}

function isCancelSpeech(text: string): boolean {
  const cleaned = text.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const cancels = ['cancel', 'dont submit', 'stop', 'nevermind', 'changed my mind', 'abort', 'exit', 'no'];
  return cancels.some((c) => cleaned === c || cleaned.startsWith(c));
}

function extractLocationSpeech(text: string): string | null {
  const lower = text.toLowerCase();
  const preps = ['near', 'opposite', 'beside', 'behind', 'at', 'on'];
  for (const prep of preps) {
    const match = lower.match(new RegExp(`\\b${prep}\\s+([a-z0-9\\s]{3,35})`, 'i'));
    if (match && match[1]) {
      const loc = match[1].split(/\b(and|for|since|is|because)\b/)[0].trim();
      if (loc.length >= 3) {
        return `${prep.charAt(0).toUpperCase() + prep.slice(1)} ${loc.charAt(0).toUpperCase() + loc.slice(1)}`;
      }
    }
  }
  if (lower.includes('road') || lower.includes('street') || lower.includes('market') || lower.includes('colony') || lower.includes('nagar')) {
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
      reply_text:
        'Hello! Welcome to CivicResolve AI Municipal Helpline. I can help you report and track public infrastructure issues like potholes, garbage, drainage blockages, water supply leaks, broken streetlights, or damaged facilities. How can I help you today?',
      stage: 'listening',
      extracted_data: {},
      action: 'speak',
      ui_hints: {
        status_label: 'GREETING',
        can_confirm: false,
        can_cancel: false,
        suggested_quick_replies: ['Report a pothole', 'Garbage uncollected', 'Water leakage', 'Track complaint'],
      },
    };
  }

  // Pure Greeting (MUST NOT create a complaint)
  if (isGreetingSpeech(speech) && currentStage !== 'confirm') {
    return {
      reply_text:
        "I'm here and ready to help! If you would like to report a civic issue in your area, please describe what problem you are observing and where it is located.",
      stage: 'listening',
      extracted_data: extractedData,
      action: 'speak',
      ui_hints: {
        status_label: 'LISTENING',
        can_confirm: false,
        can_cancel: false,
        suggested_quick_replies: ['Report an issue', 'Track complaint status'],
      },
    };
  }

  // Tracking query check
  const idMatch = speech.match(/CR-\d{4}-\d{4,8}/i);
  if (idMatch || lower.includes('track') || lower.includes('status of complaint')) {
    if (idMatch) {
      const record = await trackComplaint(idMatch[0].toUpperCase()).catch(() => null);
      if (record) {
        return {
          reply_text: `I found Complaint ID ${idMatch[0].toUpperCase()}. This ${record.category} report is currently in ${record.status} status, handled by ${record.department}. Would you like to report another issue or track another ticket?`,
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
      reply_text: 'Please provide your CivicResolve Complaint ID, for example, CR-2026-123456.',
      stage: 'tracking',
      extracted_data: extractedData,
      action: 'speak',
      ui_hints: {
        status_label: 'TRACKING',
        can_confirm: false,
        can_cancel: false,
        suggested_quick_replies: ['Report a problem instead'],
      },
    };
  }

  // User Cancellation
  if (isCancelSpeech(speech) && currentStage !== 'confirm') {
    return {
      reply_text: 'No problem. I have cancelled this report and nothing was submitted. Is there anything else I can help you with?',
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
          reply_text: `Your complaint has been successfully registered. Your official Complaint ID is ${cid}. It has been routed to the ${created.department || extractedData.department || 'Municipal Department'} with ${created.priority || 'High'} priority. You can track this anytime. Is there anything else I can help you with?`,
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
            status_label: 'SUCCESS',
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
            status_label: 'CONFIRMATION',
            can_confirm: true,
            can_cancel: true,
            suggested_quick_replies: ['Confirm now', 'Cancel'],
          },
        };
      }
    } else if (isCancelSpeech(speech)) {
      return {
        reply_text: 'Understood. I will not submit this complaint. Would you like to change any details or cancel?',
        stage: 'listening',
        extracted_data: extractedData,
        action: 'speak',
        ui_hints: {
          status_label: 'COLLECTING DETAILS',
          can_confirm: false,
          can_cancel: true,
          suggested_quick_replies: ['Change location', 'Cancel'],
        },
      };
    }
  }

  // Location Stage
  if (currentStage === 'location') {
    const loc = extractLocationSpeech(speech) || speech;
    const updated: Record<string, any> = { ...extractedData, location: loc };
    const summary = `I have understood your complaint: Issue: ${updated.description}. Category: ${updated.category} at ${updated.location}. Priority: ${updated.priority}. Is this information correct? Should I submit this complaint?`;
    return {
      reply_text: summary,
      stage: 'confirm',
      extracted_data: updated,
      action: 'confirm',
      ui_hints: {
        status_label: 'CONFIRMATION',
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
    const summary = `I have understood your complaint: Issue: ${speech}. Category: ${classification.category} (${classification.department}) at ${locInSpeech}. Priority: ${classification.priority}. Is this information correct? Should I submit this complaint?`;
    return {
      reply_text: summary,
      stage: 'confirm',
      extracted_data: updatedData,
      action: 'confirm',
      ui_hints: {
        status_label: 'CONFIRMATION',
        can_confirm: true,
        can_cancel: true,
        suggested_quick_replies: ['Yes, submit it', 'Change location', 'Cancel'],
      },
    };
  }

  return {
    reply_text: `I'm sorry you are dealing with that. I have noted this ${classification.category} issue. Could you please tell me the location, street name, or nearest landmark?`,
    stage: 'location',
    extracted_data: updatedData,
    action: 'speak',
    ui_hints: {
      status_label: 'COLLECTING DETAILS',
      can_confirm: false,
      can_cancel: true,
      suggested_quick_replies: ['Near the bus stop', 'On Main Road', 'Near Market'],
    },
  };
}
