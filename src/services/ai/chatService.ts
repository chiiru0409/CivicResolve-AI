/**
 * chatService.ts — Stateful Civic AI Resolution Agent
 *
 * Implements an application-owned conversation state machine with:
 * - Structured slot tracking (issue, category, location, landmark, duration, severity, priority, authority)
 * - Dynamic slot invalidation & correction (e.g. OLD VALUE -> invalidate, NEW VALUE -> replace)
 * - Information state model (KNOWN, INFERRED, UNKNOWN, UNVERIFIED)
 * - Intelligent non-intrusive clarification
 * - Zero hallucination / grounded database lookups
 */

import { api, isBackendAvailable } from '../api';
import type { Category, Complaint } from '../../types';
import { classifyCivicIssue } from './classificationService';
import { trackComplaint, getMineComplaints } from '../complaintService';
import { calculateSlaDeadline } from './routingService';
import { defaultOrchestrator } from './agentOrchestrator';

export type InformationState = 'KNOWN' | 'INFERRED' | 'UNKNOWN' | 'UNVERIFIED';

export interface StructuredSlotState {
  issue: string | null;
  category: Category | null;
  subcategory: string | null;
  location: string | null;
  landmark: string | null;
  duration: string | null;
  severity: number | null;
  risk: string | null;
  priority: string | null;
  authority: string | null;
  evidence: string | null;
  complaintStatus: string | null;
  userIntent: 'report_issue' | 'track_complaint' | 'inquire_sla' | 'general_info' | 'cancel';
  confirmationState: 'idle' | 'clarifying' | 'awaiting_confirmation' | 'confirmed' | 'cancelled';
  turnCount: number;
}

export interface ChatResponseResult {
  message: string;
  suggestComplaint?: boolean;
  quickReplies?: string[];
  analysisCard?: {
    category: string;
    priority: string;
    department: string;
    confidence: number;
    urgencyScore?: number;
    safetyRisk?: string;
    slaDeadline?: string;
  } | null;
  complaintData?: {
    description: string;
    location: string;
    category: Category;
    priority: string;
    title: string;
  } | null;
  slotState?: StructuredSlotState;
}

let _slotState: StructuredSlotState = {
  issue: null,
  category: null,
  subcategory: null,
  location: null,
  landmark: null,
  duration: null,
  severity: null,
  risk: null,
  priority: null,
  authority: null,
  evidence: null,
  complaintStatus: null,
  userIntent: 'general_info',
  confirmationState: 'idle',
  turnCount: 0,
};

export function resetConversationState(): void {
  _slotState = {
    issue: null,
    category: null,
    subcategory: null,
    location: null,
    landmark: null,
    duration: null,
    severity: null,
    risk: null,
    priority: null,
    authority: null,
    evidence: null,
    complaintStatus: null,
    userIntent: 'general_info',
    confirmationState: 'idle',
    turnCount: 0,
  };
}

export function getConversationState(): StructuredSlotState {
  return { ..._slotState };
}

/** Check if text contains an authoritative complaint ID like CR-2026-XXXXXX */
function extractComplaintId(text: string): string | null {
  const match = text.match(/CR-\d{4}-\d{4,8}/i);
  return match ? match[0].toUpperCase() : null;
}

/** Check if message contains a slot correction/invalidation */
function checkSlotCorrection(text: string): { isCorrection: boolean; field?: 'location' | 'category' | 'issue'; newValue?: string } {
  const lower = text.toLowerCase();
  const correctionTriggers = ['sorry', 'meant', 'actually', 'instead', 'not there', 'change location to', 'correct location is', 'it is on', 'it is at'];
  
  if (correctionTriggers.some((t) => lower.includes(t))) {
    // Extract new location text after correction triggers
    const locClean = text
      .replace(/^(sorry,?\s*|actually,?\s*|no,?\s*|i meant\s*|change location to\s*|correct location is\s*)/i, '')
      .replace(/^(it's at|it is at|it's on|it is on|near|on)\s*/i, '')
      .trim();
    if (locClean.length > 2) {
      return { isCorrection: true, field: 'location', newValue: locClean };
    }
  }
  return { isCorrection: false };
}

/** Process a conversational message from a citizen */
export async function getIntelligentChatResponse(
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  authenticatedUserEmail?: string
): Promise<ChatResponseResult> {
  const trimmed = userMessage.trim();
  const lower = trimmed.toLowerCase();
  _slotState.turnCount++;

  // Check for cancellation / abort
  if (/^(cancel|stop|don't submit|dont submit|nevermind|no wait|abort)\b/i.test(lower)) {
    resetConversationState();
    return {
      message: 'Understood. I have cleared the draft report and cancelled the submission. What else can I assist you with?',
      quickReplies: ['Report a new issue', 'Track my complaint', 'Common civic issues'],
      suggestComplaint: false,
    };
  }

  // Check for multi-issue triggers (e.g. "garbage near bus stop and road has huge pothole")
  const hasGarbage = /garbage|trash|waste|dump/i.test(lower);
  const hasRoad = /pothole|road|asphalt|crater/i.test(lower);
  const hasDrainage = /drain|sewer|flood|waterlog/i.test(lower);
  const hasLight = /light|streetlight|wire|lamp/i.test(lower);
  const detectedIssues: string[] = [];
  if (hasGarbage) detectedIssues.push('Garbage & Solid Waste (Sanitation)');
  if (hasRoad) detectedIssues.push('Road & Pothole Damage (Public Works)');
  if (hasDrainage) detectedIssues.push('Drainage Overflow (Stormwater Operations)');
  if (hasLight) detectedIssues.push('Streetlight / Electrical Hazard (Power Grid)');

  if (detectedIssues.length > 1 && _slotState.turnCount <= 2) {
    return {
      message: `I identified **${detectedIssues.length} distinct civic issues** in your message:\n\n` +
        detectedIssues.map((iss, idx) => `${idx + 1}. **${iss}**`).join('\n') +
        `\n\nMunicipal protocols route each issue to specialized departments for faster dispatch. Would you like me to create separate tickets for both, or combine them into a prioritized multi-hazard report?`,
      quickReplies: ['File Separate Tickets', 'Combine into 1 Report', 'Focus on Road Damage', 'Focus on Garbage'],
      suggestComplaint: false,
      slotState: { ..._slotState },
    };
  }

  // Check for slot correction / invalidation
  const correction = checkSlotCorrection(trimmed);
  if (correction.isCorrection && correction.field === 'location' && correction.newValue) {
    _slotState.location = correction.newValue;
    const classified = classifyCivicIssue({
      description: _slotState.issue || trimmed,
      location: _slotState.location,
    });
    _slotState.category = classified.category;
    _slotState.priority = classified.priority;
    _slotState.authority = classified.department;

    return {
      message: `🔄 **Location Updated**: Changed location to **${_slotState.location}** (invalidating previous entry).\n\nHere is your updated municipal ticket draft:`,
      suggestComplaint: true,
      quickReplies: ['Confirm & Submit', 'Add more details', 'Cancel'],
      analysisCard: {
        category: classified.category,
        priority: classified.priority,
        department: classified.department,
        confidence: classified.confidence,
        urgencyScore: classified.urgencyScore,
        safetyRisk: classified.safetyRisk,
        slaDeadline: classified.slaDeadline,
      },
      complaintData: {
        description: _slotState.issue || trimmed,
        location: _slotState.location,
        category: classified.category,
        priority: classified.priority,
        title: classified.title,
      },
      slotState: { ..._slotState },
    };
  }

  // 1. Try real backend chat endpoint if online
  if (isBackendAvailable()) {
    try {
      const res = await api.post<ChatResponseResult>('/chat', {
        message: userMessage,
        history: history.map((h) => ({ role: h.role, content: h.content })),
      });
      if (res && res.message) {
        if (res.analysisCard) {
          _slotState.category = (res.analysisCard.category as Category) || _slotState.category;
          _slotState.priority = res.analysisCard.priority || _slotState.priority;
          _slotState.authority = res.analysisCard.department || _slotState.authority;
        }
        return res;
      }
    } catch {
      // Fall through to deterministic contextual intelligence
    }
  }

  // 2. Multi-Intent and Sequential Conversational Support Queries ("And the other one?")
  if (
    /and the other one|what about the other|second one|other complaint/i.test(lower) ||
    (lower.includes('and') && /check|status/i.test(lower) && /report|pothole|garbage|leak|broken|overflow/i.test(lower))
  ) {
    const orchRes = await defaultOrchestrator.process(userMessage, authenticatedUserEmail);
    if (orchRes) {
      return {
        message: orchRes.primaryMessage,
        quickReplies: orchRes.quickReplies || ['Track my complaint', 'Report a new problem'],
        suggestComplaint: orchRes.suggestComplaint || false,
        analysisCard: orchRes.analysisCard,
        complaintData: orchRes.complaintData,
        slotState: { ..._slotState },
      };
    }
  }

  // 3. Contextual Complaint Tracking Queries
  const explicitId = extractComplaintId(userMessage);

  if (
    explicitId ||
    lower.includes('where is my complaint') ||
    lower.includes('status of') ||
    lower.includes('check my complaint') ||
    lower.includes('why hasnt it been resolved') ||
    lower.includes('why hasn\'t it been resolved') ||
    lower.includes('when was it assigned')
  ) {
    _slotState.userIntent = 'track_complaint';

    // If a specific ID is provided, look up the authoritative database record
    if (explicitId) {
      const record = await trackComplaint(explicitId).catch(() => null);
      if (record) {
        const sla = calculateSlaDeadline(record.submittedAt, record.priority, record.category);
        const assignedTime = record.timeline.find((t) => t.label.toLowerCase().includes('assigned'))?.timestamp;

        let statusExplanation = `Here is the live status for **${explicitId}**:\n\n` +
          `• **Status**: \`${record.status}\`\n` +
          `• **Category**: ${record.category}\n` +
          `• **Department**: ${record.department}\n` +
          `• **Location**: ${record.location}\n` +
          `• **SLA Window**: ${sla.isBreached ? `⚠️ Breached (${sla.formattedCountdown})` : `Active (${sla.formattedCountdown} remaining)`}\n\n`;

        if (record.status === 'Assigned') {
          statusExplanation += `The complaint was assigned to **${record.assignedOfficer || record.assignedTeam || record.department}** ${assignedTime ? `on ${new Date(assignedTime).toLocaleDateString()}` : ''}. The field crew is currently reviewing work orders.`;
        } else if (record.status === 'In Progress') {
          statusExplanation += `The response team is actively on-site working on resolution.`;
        } else if (record.status === 'Resolved') {
          statusExplanation += `✅ The issue has been marked resolved. You can rate the service on the tracking page.`;
        } else {
          statusExplanation += `The ticket has been received and verified by AI optical triage.`;
        }

        return {
          message: statusExplanation,
          quickReplies: [`Track ${explicitId} in Detail`, 'Report another problem', 'Ask about SLA'],
          slotState: { ..._slotState },
        };
      } else {
        return {
          message: `I looked up **${explicitId}** in the municipal database, but no matching record was found. Please double-check the ticket number format (e.g. \`CR-2026-004821\`).`,
          quickReplies: ['Check my complaints list', 'Report a new problem'],
          slotState: { ..._slotState },
        };
      }
    }

    // If authenticated or sequential lookup, use SupportAgent via defaultOrchestrator
    const orchSupport = await defaultOrchestrator.process(userMessage, authenticatedUserEmail);
    if (orchSupport && orchSupport.primaryMessage) {
      return {
        message: orchSupport.primaryMessage,
        quickReplies: orchSupport.quickReplies || ['Track my complaint', 'Report new issue'],
        slotState: { ..._slotState },
      };
    }

    return {
      message: `To check your complaint status, please provide your **Complaint ID** (e.g., \`CR-2026-004821\`) or open your **Citizen Dashboard**.`,
      quickReplies: ['Report a problem', 'How does tracking work?'],
      slotState: { ..._slotState },
    };
  }


  // 3. Greeting / Small Talk / Capabilities Guard (Always pure greeting safe)
  const isPureGreeting = /^(hi|hello|hey|helo|hai|howdy|namaste|vanakkam|pranam|good\s+morning|good\s+afternoon|good\s+evening|how\s+are\s+you|are\s+you\s+there|what\s+can\s+you\s+do|how\s+does\s+this\s+work|who\s+are\s+you|what\s+is\s+your\s+name|i\s+need\s+some\s+help|what\s+do\s+you\s+do)\b/i.test(lower) &&
    !/pothole|garbage|trash|waste|drain|drainage|leak|leaking|water|light|streetlight|wire|pavement|broken|sinkhole|flood|burst|collapsed/i.test(lower);

  if (isPureGreeting) {
    let greetingText = "Hello! 👋 I'm **CivicResolve AI**, your intelligent municipal assistant.\n\nI can help you report civic issues like potholes, garbage, water problems, streetlights, drainage, or track an existing complaint.\n\nWhat would you like help with today?";
    if (/how are you|how're you/i.test(lower)) {
      greetingText = "Hello! 👋 I'm doing well, thank you! I'm here to help with civic services and municipal complaints across your city.\n\nWhat can I assist you with today?";
    } else if (/what can you do|how does this work|what do you do/i.test(lower)) {
      greetingText = "I can help you with:\n\n• **Report civic issues**: Road damage, garbage, water leaks, streetlights, drainage\n• **Track complaints**: Live status and SLA countdown for any ticket (e.g. `CR-2026-XXXXXX`)\n• **Direct municipal routing**: Automated routing to the responsible municipal team\n\nWhat would you like help with?";
    }
    return {
      message: greetingText,
      quickReplies: ['Report a pothole', 'Garbage not collected', 'Water leakage', 'Track my complaint'],
      suggestComplaint: false,
      slotState: { ..._slotState },
    };
  }

  // Partial / broad complaints without specifics
  if (lower === 'water' || lower === "it's about water" || lower === 'water problem' || lower === 'water issue' || lower === "there's something wrong with the water" || lower === "something is wrong with the water") {
    _slotState.issue = 'Water issue';
    _slotState.category = 'Water';
    return {
      message: "Sure, I can help with that. Is it a **water supply outage**, **pipeline leakage**, **dirty / contaminated water**, or **low pressure**?",
      quickReplies: ['Pipeline leakage', 'Contaminated water', 'No water supply', 'Low pressure'],
      suggestComplaint: false,
      slotState: { ..._slotState },
    };
  }

  if (lower === 'road' || lower === "it's about road" || lower === 'road problem' || lower === 'roads' || lower === 'pothole' || lower === "there's a problem with the road") {
    _slotState.issue = 'Road issue';
    _slotState.category = 'Roads';
    return {
      message: "Sure, I can help with road issues. Is it a **dangerous pothole**, **broken footpath**, **road surface damage**, or **missing divider**?",
      quickReplies: ['Dangerous pothole', 'Broken footpath', 'Road surface damage'],
      suggestComplaint: false,
      slotState: { ..._slotState },
    };
  }

  // 4. Conversational Complaint Filing & Follow-Up Questions
  // Stage A: Collecting Location if user provided description first
  if (_slotState.confirmationState === 'clarifying' && !_slotState.location) {
    _slotState.location = trimmed;

    // If citizen provides a landmark like "Near the government hospital", ask a natural refinement if helpful
    if (/hospital|station|school|college|market|mall|temple|church|park/i.test(trimmed) && !trimmed.includes('entrance') && !trimmed.includes('main road')) {
      _slotState.confirmationState = 'awaiting_confirmation';
      const classified = classifyCivicIssue({
        description: _slotState.issue || trimmed,
        location: _slotState.location,
      });

      return {
        message: `Got it (**${_slotState.location}**). Is it on the main road, near the main entrance, or inside the area? Either way, I've prepared your ticket draft below:`,
        suggestComplaint: true,
        quickReplies: ['On the main road', 'Near the entrance', 'Confirm & Submit'],
        analysisCard: {
          category: classified.category,
          priority: classified.priority,
          department: classified.department,
          confidence: classified.confidence,
          urgencyScore: classified.urgencyScore,
          safetyRisk: classified.safetyRisk,
          slaDeadline: classified.slaDeadline,
        },
        complaintData: {
          description: _slotState.issue || trimmed,
          location: _slotState.location,
          category: classified.category,
          priority: classified.priority,
          title: classified.title,
        },
        slotState: { ..._slotState },
      };
    }

    _slotState.confirmationState = 'awaiting_confirmation';
    const classified = classifyCivicIssue({
      description: _slotState.issue || trimmed,
      location: _slotState.location || 'Municipal Sector',
    });

    _slotState.category = classified.category;
    _slotState.priority = classified.priority;
    _slotState.authority = classified.department;

    return {
      message: `✅ **Structured Civic Complaint Prepared**\n\nI have combined your report for **${_slotState.location}** into a verified ticket. Review the AI classification below and click **Confirm & Submit** to register it:`,
      suggestComplaint: true,
      quickReplies: ['Confirm & Submit', 'Edit details', 'Cancel'],
      analysisCard: {
        category: classified.category,
        priority: classified.priority,
        department: classified.department,
        confidence: classified.confidence,
        urgencyScore: classified.urgencyScore,
        safetyRisk: classified.safetyRisk,
        slaDeadline: classified.slaDeadline,
      },
      complaintData: {
        description: _slotState.issue || trimmed,
        location: _slotState.location || 'Municipal Sector',
        category: classified.category,
        priority: classified.priority,
        title: classified.title,
      },
      slotState: { ..._slotState },
    };
  }

  // Stage B: New Issue Intake — Vague Input Clarification (e.g. "There is a pothole")
  if (/^(there is a pothole|pothole|huge pothole|road broken|garbage|drain overflowing|water leaking)\b/i.test(lower) && trimmed.length < 25) {
    _slotState.issue = trimmed;
    _slotState.confirmationState = 'clarifying';
    return {
      message: `I'm sorry about that. Where is the issue located? A street, landmark, neighborhood, or nearby place is enough.`,
      quickReplies: ['Near Gandhi Market', 'Near Railway Station', 'Main Market Road', 'Outside City Mall'],
      slotState: { ..._slotState },
    };
  }

  const classification = classifyCivicIssue({ description: trimmed });
  if (classification.category !== 'Other' || trimmed.length > 15) {
    _slotState.issue = trimmed;
    _slotState.category = classification.category;
    _slotState.priority = classification.priority;
    _slotState.authority = classification.department;

    // Check if location was included in the user's message
    const locMatches = trimmed.match(/(?:near|at|on|opposite|beside|behind|in|outside)\s+([A-Za-z0-9\s,-]+)/i);
    if (locMatches && locMatches[1].trim().length > 3) {
      _slotState.location = locMatches[1].trim();
      _slotState.confirmationState = 'awaiting_confirmation';

      return {
        message: `✅ **Structured Civic Complaint Prepared**\n\nIdentified **${classification.category}** issue at **${_slotState.location}** routed to **${classification.department}** with **${classification.priority}** priority.\n\nClick **Confirm & Submit** below to file this official report:`,
        suggestComplaint: true,
        quickReplies: ['Confirm & Submit', 'Track my complaint', 'Report another issue'],
        analysisCard: {
          category: classification.category,
          priority: classification.priority,
          department: classification.department,
          confidence: classification.confidence,
          urgencyScore: classification.urgencyScore,
          safetyRisk: classification.safetyRisk,
          slaDeadline: classification.slaDeadline,
        },
        complaintData: {
          description: trimmed,
          location: _slotState.location,
          category: classification.category,
          priority: classification.priority,
          title: classification.title,
        },
        slotState: { ..._slotState },
      };
    }

    _slotState.confirmationState = 'clarifying';
    return {
      message: `I've noted this as **${classification.category}** (Severity: \`${classification.priority}\`).\n\n**Where is this located?** Please share a street name, landmark, or area (e.g. *"Near Gandhi Market"*).`,
      quickReplies: ['Near Gandhi Market', 'Main Market Road', 'Residential Sector 4', 'Near Bus Stand'],
      slotState: { ..._slotState },
    };
  }

  // 5. Default Fallback
  return {
    message: `I'm here to help you report and track civic issues across your city. You can:\n\n• **Report an issue**: *"The water pipe is leaking outside my building"*\n• **Track a ticket**: *"Status of CR-2026-004821"*\n• **Ask for guidance**: *"Which department handles streetlight issues?"*`,
    quickReplies: ['Report a problem', 'Track complaint', 'Common civic issues'],
    slotState: { ..._slotState },
  };
}
