/**
 * chatService.ts — Intelligent Contextual Civic AI Assistant
 *
 * Provides natural language complaint intake, intelligent multi-turn follow-ups,
 * contextual tracking inquiries, and SLA explanations for authenticated citizens.
 */

import { api, isBackendAvailable } from '../api';
import type { Category, Complaint } from '../../types';
import { classifyCivicIssue } from './classificationService';
import { trackComplaint, getMineComplaints } from '../complaintService';
import { calculateSlaDeadline } from './routingService';

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
}

export interface ConversationState {
  stage: 'greeting' | 'collecting_issue' | 'collecting_location' | 'collecting_safety' | 'ready_to_file' | 'tracking_query' | 'idle';
  detectedCategory?: Category;
  detectedPriority?: string;
  issueDescription?: string;
  locationText?: string;
  safetyRisk?: string;
  turnCount: number;
}

let _chatState: ConversationState = { stage: 'idle', turnCount: 0 };

export function resetConversationState(): void {
  _chatState = { stage: 'idle', turnCount: 0 };
}

export function getConversationState(): ConversationState {
  return { ..._chatState };
}

/** Check if text contains a complaint ID like CR-2026-XXXXXX */
function extractComplaintId(text: string): string | null {
  const match = text.match(/CR-\d{4}-\d{4,8}/i);
  return match ? match[0].toUpperCase() : null;
}

/** Process a conversational message from a citizen */
export async function getIntelligentChatResponse(
  userMessage: string,
  history: Array<{ role: string; content: string }>,
  authenticatedUserEmail?: string
): Promise<ChatResponseResult> {
  const trimmed = userMessage.trim();
  const lower = trimmed.toLowerCase();
  _chatState.turnCount++;

  // 1. Try real backend chat endpoint if online
  if (isBackendAvailable()) {
    try {
      const res = await api.post<ChatResponseResult>('/chat', {
        message: userMessage,
        history: history.map((h) => ({ role: h.role, content: h.content })),
      });
      if (res && res.message) return res;
    } catch {
      // Fall through to deterministic contextual intelligence
    }
  }

  // 2. Contextual Complaint Tracking Queries
  const explicitId = extractComplaintId(userMessage);

  if (explicitId || lower.includes('where is my complaint') || lower.includes('status of') || lower.includes('check my complaint') || lower.includes('why hasnt it been resolved') || lower.includes('why hasn\'t it been resolved')) {
    _chatState.stage = 'tracking_query';

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
        };
      } else {
        return {
          message: `I looked up **${explicitId}** in the municipal database, but no matching record was found. Please double-check the ticket number format (e.g. \`CR-2026-004821\`).`,
          quickReplies: ['Check my complaints list', 'Report a new problem'],
        };
      }
    }

    // If authenticated, fetch the user's latest complaint
    if (authenticatedUserEmail) {
      const userComplaints = await getMineComplaints().catch(() => []);
      if (userComplaints.length > 0) {
        const latest = userComplaints[0];
        const sla = calculateSlaDeadline(latest.submittedAt, latest.priority, latest.category);

        return {
          message: `You have **${userComplaints.length} active report(s)**. Your latest is **${latest.complaintNumber || latest.id}** (${latest.category}):\n\n` +
            `• **Current Stage**: \`${latest.status}\`\n` +
            `• **Assigned To**: ${latest.department}\n` +
            `• **SLA Clock**: ${sla.formattedCountdown}\n\n` +
            `Would you like to view details for this complaint or file a new one?`,
          quickReplies: [`Track ${latest.complaintNumber || latest.id}`, 'Why is it taking time?', 'Report new issue'],
        };
      }
    }

    return {
      message: `To check your complaint status, please provide your **Complaint ID** (e.g., \`CR-2026-004821\`) or open your **Citizen Dashboard**.`,
      quickReplies: ['Report a problem', 'How does tracking work?'],
    };
  }

  // 3. Greeting / How it works
  if (/^(hi|hello|hey|namaste|good morning|good evening)\b/i.test(lower) || _chatState.stage === 'idle') {
    _chatState.stage = 'greeting';
    return {
      message: `Hello! 👋 I am **Civic AI**, your autonomous municipal assistant.\n\nDescribe any issue in your neighborhood (e.g., *"Large pothole near college"*, *"Drainage overflow on 100ft road"*, *"Broken streetlight"*), and I'll classify and file it for you.`,
      quickReplies: ['Report a pothole', 'Drainage overflow', 'Garbage not collected', 'Check my complaint'],
    };
  }

  // 4. Conversational Complaint Filing & Follow-Up Questions
  // Stage A: Collecting Location if user provided description first
  if (_chatState.stage === 'collecting_location') {
    _chatState.locationText = trimmed;
    _chatState.stage = 'collecting_safety';

    return {
      message: `Got the location: **${trimmed}**.\n\nOne quick question: **Is this causing an immediate safety hazard, blocking traffic, or affecting homes/pedestrians?**`,
      quickReplies: ['Yes, blocking traffic / safety risk', 'No, moderate issue', 'Affecting residential water/power'],
    };
  }

  // Stage B: Collecting Safety / Finalizing structured report
  if (_chatState.stage === 'collecting_safety') {
    _chatState.safetyRisk = trimmed;
    _chatState.stage = 'ready_to_file';

    const classified = classifyCivicIssue({
      description: _chatState.issueDescription || '',
      location: _chatState.locationText || 'Municipal Sector',
    });

    return {
      message: `✅ **Structured Civic Complaint Prepared**\n\nI have combined your report into a verified ticket. Review the AI classification below and click **File Complaint** to officially register it:`,
      suggestComplaint: true,
      quickReplies: ['File Complaint', 'Edit details', 'Cancel'],
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
        description: _chatState.issueDescription || '',
        location: _chatState.locationText || 'Municipal Sector',
        category: classified.category,
        priority: classified.priority,
        title: classified.title,
      },
    };
  }

  // Stage C: New Issue Intake
  const classification = classifyCivicIssue({ description: trimmed });
  if (classification.category !== 'Other' || trimmed.length > 15) {
    _chatState.stage = 'collecting_location';
    _chatState.detectedCategory = classification.category;
    _chatState.detectedPriority = classification.priority;
    _chatState.issueDescription = trimmed;

    return {
      message: `I've categorized this as **${classification.category}** (Severity: \`${classification.priority}\`).\n\nWhere exactly is this occurring? Please share a street name, landmark, or area (e.g. *"Near Indiranagar Metro Pillar 42"*).`,
      quickReplies: ['Near my current location', 'Main Market Road', 'Residential Sector 4', 'Near Bus Stand'],
    };
  }

  // 5. Default Fallback
  return {
    message: `I'm here to help you report and track civic issues across your city. You can:\n\n• **Report an issue**: *"The water pipe is leaking outside my building"*\n• **Track a ticket**: *"Status of CR-2026-004821"*\n• **Ask for guidance**: *"Which department handles streetlight issues?"*`,
    quickReplies: ['Report a problem', 'Track complaint', 'Common civic issues'],
  };
}
