/**
 * voiceService.ts — Voice AI Agent & Speech Pipeline
 *
 * Implements real microphone permissions, Web Speech Recognition, Speech Synthesis,
 * turn-by-turn conversational complaint intake, and voice status lookups.
 */

import { api, isBackendAvailable } from '../api';
import { classifyCivicIssue } from './classificationService';
import { trackComplaint, submitComplaint } from '../complaintService';

export interface VoiceTurnResponse {
  reply_text: string;
  stage: 'greeting' | 'problem' | 'location' | 'landmark' | 'confirm' | 'submitted' | 'tracking';
  extracted_data: {
    description?: string;
    location?: string;
    landmark?: string;
    category?: string;
    priority?: string;
    department?: string;
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

  const cleanText = text.replace(/[*_`#]/g, '').replace(/CR-\d{4}-\d+/gi, (m) => m.split('').join(' '));
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

/** Process a conversational voice turn */
export async function sendVoiceTurn(
  userSpeech: string,
  currentStage: string,
  extractedData: Record<string, unknown>,
  coords?: { latitude?: number; longitude?: number },
): Promise<VoiceTurnResponse> {
  // 1. Try real backend endpoint if online
  if (isBackendAvailable()) {
    try {
      const res = await api.post<VoiceTurnResponse>('/ai/voice-turn', {
        user_speech: userSpeech,
        stage: currentStage,
        extracted_data: extractedData,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      });
      if (res && res.reply_text) return res;
    } catch {
      // Fall through to local voice turn engine
    }
  }

  // 2. Intelligent local turn-by-turn voice dialog state machine
  const speech = userSpeech.trim();
  const lower = speech.toLowerCase();

  // Voice tracking check
  const idMatch = speech.match(/CR-\d{4}-\d{4,8}/i);
  if (idMatch || lower.includes('track') || lower.includes('status')) {
    if (idMatch) {
      const record = await trackComplaint(idMatch[0].toUpperCase()).catch(() => null);
      if (record) {
        return {
          reply_text: `Complaint ${idMatch[0].toUpperCase()} is currently ${record.status}, assigned to ${record.department}.`,
          stage: 'tracking',
          extracted_data: extractedData,
          action: 'speak',
        };
      }
    }
  }

  if (currentStage === 'greeting') {
    return {
      reply_text: "Welcome to CivicResolve AI Voice Helpline. What civic issue would you like to report today?",
      stage: 'problem',
      extracted_data: {},
      action: 'listen',
    };
  }

  if (currentStage === 'problem') {
    const classification = classifyCivicIssue({ description: speech });
    return {
      reply_text: `I understand. I have noted a ${classification.category} issue. Where is this located? Please tell me the street or landmark.`,
      stage: 'location',
      extracted_data: {
        description: speech,
        category: classification.category,
        priority: classification.priority,
        department: classification.department,
      },
      action: 'listen',
    };
  }

  if (currentStage === 'location') {
    const updated: Record<string, any> = { ...extractedData, location: speech };
    return {
      reply_text: `Got it, at ${speech}. I am ready to submit your ${updated.category || 'civic'} report. Say 'Confirm' to submit or tell me any additional details.`,
      stage: 'confirm',
      extracted_data: updated,
      action: 'listen',
    };
  }

  if (currentStage === 'confirm' || lower.includes('confirm') || lower.includes('yes') || lower.includes('submit')) {
    // Actually submit the complaint to the backend database
    try {
      const created = await submitComplaint({
        title: `${extractedData.category || 'Civic'} issue reported via Voice Helpline`,
        description: String(extractedData.description || 'Voice report'),
        location: String(extractedData.location || 'Location provided in voice call'),
        category: extractedData.category || 'Other',
        priority: extractedData.priority || 'HIGH',
        contact_preference: 'voice',
        source: 'AI Call',
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      });

      return {
        reply_text: `Your complaint has been successfully registered. Your ticket ID is ${created.complaintNumber || created.id}. You can track it anytime. Thank you for making your city better!`,
        stage: 'submitted',
        extracted_data: extractedData,
        action: 'completed',
        complaint: {
          id: created.id,
          complaint_number: created.complaintNumber || created.id,
          title: created.title,
          description: created.description,
          category: created.category,
          priority: created.priority,
          department: created.department,
          location: created.location,
          status: created.status,
          created_at: created.submittedAt,
        },
      };
    } catch {
      return {
        reply_text: "There was an issue persisting the voice complaint. Please try again or use the online reporting form.",
        stage: 'confirm',
        extracted_data: extractedData,
        action: 'speak',
      };
    }
  }

  return {
    reply_text: "I didn't quite catch that. Could you please repeat the issue or location?",
    stage: currentStage as any,
    extracted_data: extractedData,
    action: 'listen',
  };
}
