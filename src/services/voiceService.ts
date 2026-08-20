/**
 * voiceService.ts — Browser Speech-to-Text, Text-to-Speech & Voice Agent communication.
 *
 * Uses native Web Speech API (SpeechRecognition + SpeechSynthesis)
 * combined with CivicResolve AI's backend Voice Turn API.
 */

import { api, isBackendAvailable } from './api';

export interface VoiceTurnResponse {
  reply_text: string;
  stage: 'greeting' | 'problem' | 'location' | 'landmark' | 'confirm' | 'submitted';
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
    source?: string;
    created_at: string;
  } | null;
}

// ── Web Speech Recognition Interface Definitions ─────────────────────────────

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
    this.recognition.lang = 'en-IN'; // Indian English / Global English support

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

    this.onResultCallback = onResult;
    this.onErrorCallback = onError;
    this.onEndCallback = onEnd;

    try {
      this.recognition.start();
      this.isListening = true;
    } catch {
      // Already running or invalid state
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.isListening = false;
    }
  }

  public abortListening(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // ignore
      }
      this.isListening = false;
    }
  }
}

// ── Text to Speech Synthesizer ────────────────────────────────────────────────

export function speakText(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: unknown) => void,
): void {
  if (!isSpeechSynthesisSupported()) {
    onEnd?.();
    return;
  }

  // Cancel ongoing speech before speaking new response
  window.speechSynthesis.cancel();

  const cleanText = text
    .replace(/CR-\d{4}-\d+/g, (m) => m.split('').join(' ')) // Space out ID for clarity
    .replace(/[#*`_]/g, ''); // strip markdown chars

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  // Pick a natural sounding English voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(
    (v) =>
      v.lang.startsWith('en') &&
      (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('India')),
  );
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  if (onStart) utterance.onstart = onStart;
  if (onEnd) utterance.onend = onEnd;
  if (onError) utterance.onerror = onError;

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

// ── Backend Voice Turn API ────────────────────────────────────────────────────

export async function sendVoiceTurn(
  message: string,
  stage: string,
  extractedData: Record<string, unknown>,
  coords?: { latitude?: number; longitude?: number },
): Promise<VoiceTurnResponse> {
  if (isBackendAvailable()) {
    try {
      const response = await api.post<VoiceTurnResponse>('/voice/turn', {
        message,
        stage,
        extracted_data: extractedData,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      });
      return response;
    } catch (err) {
      console.warn('Backend voice turn error, using fallback:', err);
    }
  }

  // Offline / Fallback Voice Agent State Machine
  const msg = message.trim().toLowerCase();
  const data = { ...extractedData };

  if (stage === 'greeting' || message === '__START__') {
    return {
      reply_text: 'Hello! You have reached CivicResolve AI Municipal Helpline. Please describe the civic issue you would like to report.',
      stage: 'problem',
      extracted_data: data,
      action: 'speak',
    };
  }

  if (stage === 'problem') {
    data.description = message;
    data.category = message.includes('water') ? 'Water' : message.includes('pothole') || message.includes('road') ? 'Roads' : message.includes('garbage') ? 'Garbage' : message.includes('light') ? 'Streetlights' : 'Drainage';
    return {
      reply_text: `I understand. I have noted this ${data.category} issue. Where is this problem located? Please tell me the street, road, or area name.`,
      stage: 'location',
      extracted_data: data,
      action: 'speak',
    };
  }

  if (stage === 'location') {
    data.location = message;
    return {
      reply_text: `Got it, ${message}. Are there any nearby landmarks or additional details to help our field team?`,
      stage: 'landmark',
      extracted_data: data,
      action: 'speak',
    };
  }

  if (stage === 'landmark') {
    data.landmark = message.toLowerCase().includes('no') ? undefined : message;
    return {
      reply_text: `Thank you. I have recorded a ${data.category} complaint for ${data.description} at ${data.location}${data.landmark ? ', near ' + data.landmark : ''}. Would you like me to submit this official complaint now?`,
      stage: 'confirm',
      extracted_data: data,
      action: 'confirm',
    };
  }

  if (stage === 'confirm') {
    if (msg.includes('yes') || msg.includes('submit') || msg.includes('ok') || msg.includes('sure') || msg.includes('confirm')) {
      const year = new Date().getFullYear();
      const rand = Math.floor(100000 + Math.random() * 900000);
      const cid = `CR-${year}-${rand}`;
      return {
        reply_text: `Your complaint has been successfully registered under Complaint ID ${cid}. It has been routed to the Municipal Department. You can track this anytime on our portal. Thank you for calling CivicResolve AI!`,
        stage: 'submitted',
        extracted_data: data,
        action: 'completed',
        complaint: {
          id: cid,
          complaint_number: cid,
          title: `${data.category} Issue Reported via Voice`,
          description: String(data.description || ''),
          category: String(data.category || 'Other'),
          priority: 'HIGH',
          department: 'Municipal Operations Department',
          location: String(data.location || ''),
          status: 'Submitted',
          source: 'AI Call',
          created_at: new Date().toISOString(),
        },
      };
    } else {
      return {
        reply_text: 'Understood. The complaint has been cancelled. Is there anything else I can assist you with?',
        stage: 'problem',
        extracted_data: {},
        action: 'speak',
      };
    }
  }

  return {
    reply_text: 'Please describe the problem you are facing.',
    stage: 'problem',
    extracted_data: data,
    action: 'speak',
  };
}
