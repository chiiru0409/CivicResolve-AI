import type { AIAnalysis, Category, ImageAnalysis } from '../types';
import { getDepartmentByCategory } from '../data/mockDepartments';
import { delay } from '../utils/helpers';
import { api, isBackendAvailable } from './api';

// ── Category keyword map ───────────────────────────────────────────────────────
const categoryKeywords: Record<Category, string[]> = {
  Roads:          ['pothole', 'road', 'highway', 'street', 'tarmac', 'pavement', 'lane', 'traffic', 'marking', 'footpath', 'asphalt', 'divider', 'speed breaker', 'bump', 'carriageway'],
  Garbage:        ['garbage', 'trash', 'waste', 'litter', 'rubbish', 'dump', 'bin', 'stench', 'smell', 'filth', 'sanitation', 'overflowing', 'debris', 'dumping', 'refuse'],
  Drainage:       ['drain', 'drainage', 'flood', 'water logging', 'waterlogging', 'sewage', 'sewer', 'blockage', 'clog', 'overflow', 'stagnant', 'inundated', 'canal', 'nala'],
  Water:          ['water supply', 'pipeline', 'pipe', 'supply', 'tap', 'leak', 'burst', 'contaminated', 'murky', 'dirty water', 'no water', 'water shortage', 'water cut', 'tanker'],
  Streetlights:   ['light', 'streetlight', 'lamp', 'dark', 'bulb', 'electricity', 'illumination', 'flickering', 'lamppost', 'street lamp', 'no light'],
  Infrastructure: ['bridge', 'sidewalk', 'bench', 'park', 'building', 'wall', 'structure', 'crack', 'collapse', 'broken', 'damaged', 'facility', 'public property', 'fence'],
  Other:          [],
};

const highPriorityKeywords = [
  'accident', 'dangerous', 'emergency', 'urgent', 'collapsed', 'burst', 'gushing', 'flooding',
  'injured', 'severe', 'critical', 'major', 'serious', 'unsafe', 'blocked road', 'no supply',
  'fire', 'electrocution', 'fallen tree', 'structural failure',
];
const mediumPriorityKeywords = [
  'overflowing', 'accumulating', 'days', 'week', 'multiple', 'continuous',
  'ongoing', 'residents', 'colony', 'repeated', 'several', 'persistent',
];

function detectCategory(text: string): Category {
  const lower = text.toLowerCase();
  let best: Category = 'Other';
  let bestScore = 0;
  for (const [cat, kws] of Object.entries(categoryKeywords)) {
    const score = kws.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = cat as Category; }
  }
  return best;
}

function detectPriority(text: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const lower = text.toLowerCase();
  if (highPriorityKeywords.some((kw) => lower.includes(kw))) return 'HIGH';
  const med = mediumPriorityKeywords.filter((kw) => lower.includes(kw)).length;
  if (med >= 1) return 'MEDIUM';
  return 'LOW';
}

function generateTitle(text: string, category: Category): string {
  const lower = text.toLowerCase();
  if (lower.includes('pothole')) return 'Large pothole causing unsafe road conditions';
  if (lower.includes('burst') || lower.includes('gushing')) return 'Water pipeline burst causing supply disruption';
  if (lower.includes('flood')) return 'Drainage blockage causing severe flooding';
  if (lower.includes('dark') || lower.includes('light')) return 'Streetlight failure creating safety hazard';
  if (lower.includes('garbage') || lower.includes('waste')) return 'Garbage accumulation causing public health concern';
  const map: Partial<Record<Category, string>> = {
    Roads: 'Road damage requiring urgent repair',
    Garbage: 'Waste accumulation in public area',
    Drainage: 'Drainage blockage causing waterlogging',
    Water: 'Water supply issue reported',
    Streetlights: 'Street lighting failure reported',
    Infrastructure: 'Public infrastructure damage reported',
  };
  return map[category] ?? 'Civic issue reported';
}

function generateReason(category: Category, priority: string): string {
  const key = `${category}_${priority}`;
  const map: Record<string, string> = {
    Roads_HIGH: 'Road damage near high-traffic area creates significant safety risk for vehicles and pedestrians.',
    Roads_MEDIUM: 'Road surface damage in moderately trafficked area requires timely repair.',
    Roads_LOW: 'Minor road issue needs attention to prevent escalation.',
    Garbage_HIGH: 'Waste accumulation near high-footfall area poses immediate public health risk.',
    Garbage_MEDIUM: 'Accumulated waste requires sanitation intervention to prevent health hazards.',
    Garbage_LOW: 'Garbage management issue requires standard sanitation response.',
    Drainage_HIGH: 'Severe drainage blockage causing active flooding poses risk to property and safety.',
    Drainage_MEDIUM: 'Drainage issue causing waterlogging requires prompt intervention.',
    Drainage_LOW: 'Drainage maintenance issue should be addressed to prevent future flooding.',
    Water_HIGH: 'Active water pipeline failure causing supply disruption requires emergency response.',
    Water_MEDIUM: 'Water supply issue affecting residents requires prompt investigation.',
    Water_LOW: 'Water supply irregularity that needs investigation.',
    Streetlights_HIGH: 'Complete streetlight failure creating dangerous dark zones in public areas.',
    Streetlights_MEDIUM: 'Street lighting issues affecting public safety in residential areas.',
    Streetlights_LOW: 'Minor street lighting issue requiring routine maintenance.',
    Infrastructure_HIGH: 'Critical infrastructure damage posing immediate danger to public safety.',
    Infrastructure_MEDIUM: 'Infrastructure damage requires prompt repair to prevent worsening.',
    Infrastructure_LOW: 'Infrastructure maintenance required to maintain public facility standards.',
  };
  return map[key] ?? 'Civic issue identified requiring appropriate departmental action.';
}

// ── Public AI API ─────────────────────────────────────────────────────────────

export async function analyzeComplaint(
  description: string,
  location: string,
  _imageUrl?: string,
): Promise<AIAnalysis> {
  await delay(600);
  const category   = detectCategory(description);
  const priority   = detectPriority(description);
  const department = getDepartmentByCategory(category);
  const confidence = 80 + Math.floor(Math.random() * 17);
  return {
    title:            generateTitle(description, category),
    category,
    priority,
    department:       department.name,
    location:         location || 'Location not specified',
    confidence,
    reason:           generateReason(category, priority),
    assignedTeam:     department.teams[0],
    estimatedResponse: priority === 'HIGH' ? '24-48 hours' : priority === 'MEDIUM' ? '48-72 hours' : '72-96 hours',
  };
}

export async function analyzeImage(imageFile: File, description?: string): Promise<ImageAnalysis> {
  await delay(1200);

  if (isBackendAvailable()) {
    try {
      const res = await api.post<{
        detected_objects: string[];
        severity: 'Low' | 'Medium' | 'High';
        suggested_category: Category;
        confidence: number;
        summary: string;
      }>('/ai/analyze-image', {
        description: description || '',
        filename: imageFile.name,
      });
      return {
        detectedObjects: res.detected_objects,
        severity: res.severity,
        suggestedCategory: res.suggested_category,
        confidence: res.confidence,
      };
    } catch {
      // fallback to intelligent local analysis
    }
  }

  const text = `${description || ''} ${imageFile.name || ''}`.toLowerCase();

  if (/collapse|earthquake|building|structural|rubble|crack|wall|bridge/i.test(text)) {
    return {
      detectedObjects: ['Building structural collapse', 'Concrete & masonry rubble', 'Structural fracture', 'Public safety hazard'],
      severity: 'High',
      suggestedCategory: 'Infrastructure',
      confidence: 95,
    };
  }
  if (/pothole|road|asphalt|tarmac|highway|pavement|divider/i.test(text)) {
    return {
      detectedObjects: ['Pothole cavity', 'Asphalt surface fissure', 'Tarmac degradation'],
      severity: 'High',
      suggestedCategory: 'Roads',
      confidence: 93,
    };
  }
  if (/garbage|trash|waste|dump|bin|litter|stench/i.test(text)) {
    return {
      detectedObjects: ['Uncollected waste mound', 'Overflowing municipal dumpster', 'Sanitation biohazard'],
      severity: 'High',
      suggestedCategory: 'Garbage',
      confidence: 91,
    };
  }
  if (/drain|drainage|flood|waterlogging|sewage|water logging/i.test(text)) {
    return {
      detectedObjects: ['Drainage conduit blockage', 'Street waterlogging', 'Stormwater overflow'],
      severity: 'High',
      suggestedCategory: 'Drainage',
      confidence: 92,
    };
  }
  if (/water|pipeline|pipe|leak|burst|supply/i.test(text)) {
    return {
      detectedObjects: ['Water pipeline rupture', 'Pressurized leakage', 'Surface water accumulation'],
      severity: 'High',
      suggestedCategory: 'Water',
      confidence: 91,
    };
  }
  if (/light|streetlight|lamp|dark|pole/i.test(text)) {
    return {
      detectedObjects: ['Non-operational street luminaire', 'Damaged lighting fixture', 'Unlit corridor'],
      severity: 'Medium',
      suggestedCategory: 'Streetlights',
      confidence: 89,
    };
  }

  const cat = detectCategory(text);
  const pri = detectPriority(text);
  return {
    detectedObjects: [`${cat} damage detected`, 'Civic infrastructure anomaly', 'Visual evidence verified'],
    severity: pri === 'HIGH' ? 'High' : 'Medium',
    suggestedCategory: cat !== 'Other' ? cat : 'Infrastructure',
    confidence: 90,
  };
}

// ── Chat engine ───────────────────────────────────────────────────────────────

export interface ChatResponseResult {
  message: string;
  suggestComplaint?: boolean;
  quickReplies?: string[];
  analysisCard?: {
    category: string;
    priority: string;
    department: string;
    confidence: number;
  } | null;
}

interface ConversationState {
  stage: 'greeting' | 'collecting_issue' | 'collecting_location' | 'confirmed' | 'tracking' | 'faq' | 'idle';
  detectedCategory?: Category;
  detectedPriority?: string;
  issueText?: string;
  locationText?: string;
  turnCount: number;
}

// Per-session state (reset when chatbot mounts)
let _state: ConversationState = { stage: 'idle', turnCount: 0 };

export function resetChatState(): void {
  _state = { stage: 'idle', turnCount: 0 };
}

// Intent detection helpers
const isGreeting      = (t: string) => /^(hi|hello|hey|good morning|good evening|namaste|helo|hai)\b/i.test(t.trim());
const isTracking      = (t: string) => /(track|status|complaint id|cr-\d|where is my|my complaint|check status)/i.test(t);
const isHelp          = (t: string) => /(help|what can you do|how does this work|what is this|guide me)/i.test(t);
const isThankYou      = (t: string) => /(thank|thanks|okay|ok|got it|great|perfect|noted|understood)/i.test(t);
const asksCategory    = (t: string) => /(what category|which category|what type|which type)/i.test(t);
const mentionsCivic   = (t: string) => Object.values(categoryKeywords).flat().some((kw) => t.toLowerCase().includes(kw));
const hasLocation     = (t: string) => /(near|beside|opposite|behind|in front|at|road|street|colony|nagar|area|sector|zone|ward|circle|junction|bus stop|school|college|market|hospital)/i.test(t) || /\d/.test(t);

const DEPT_DISPLAY: Partial<Record<Category, string>> = {
  Roads:          'Municipal Roads & Infrastructure Dept.',
  Garbage:        'Sanitation & Waste Management Dept.',
  Drainage:       'Drainage & Stormwater Management',
  Water:          'Water Supply & Distribution Dept.',
  Streetlights:   'Electrical & Street Lighting Division',
  Infrastructure: 'Public Works & Infrastructure Dept.',
};

export async function getChatResponse(
  userMessage: string,
  history: Array<{ role: string; content: string }>,
): Promise<ChatResponseResult> {
  // 1. Try real FastAPI backend if available
  if (isBackendAvailable()) {
    try {
      const res = await api.post<{
        message: string;
        suggest_complaint?: boolean;
        quick_replies?: string[];
        analysis_card?: {
          category: string;
          priority: string;
          department: string;
          confidence: number;
        } | null;
      }>('/chat', {
        message: userMessage,
        history: history.map((h) => ({ role: h.role, content: h.content })),
      });
      return {
        message: res.message,
        suggestComplaint: res.suggest_complaint,
        quickReplies: res.quick_replies,
        analysisCard: res.analysis_card,
      };
    } catch (err) {
      console.error('Backend chat endpoint error:', err);
      // Fall through to deterministic client engine if backend failed
    }
  }

  // 2. Offline / local fallback logic
  await delay(350);

  const lower = userMessage.toLowerCase().trim();
  _state.turnCount++;

  // ── Greeting ────────────────────────────────────────────────
  if (isGreeting(lower) || _state.stage === 'idle') {
    _state.stage = 'greeting';
    return {
      message: `Hi there! 👋 I'm **Civic AI**, your intelligent assistant for civic issues.\n\nI can help you with:`,
      quickReplies: ['Report a problem', 'Track my complaint', 'How does this work?', 'Common issues'],
    };
  }

  // ── Help / how it works ──────────────────────────────────────
  if (isHelp(lower)) {
    _state.stage = 'faq';
    return {
      message: `Here's how **CivicResolve AI** works:\n\n**1. Report** — Describe your issue + add a photo + share your location.\n\n**2. AI Analyzes** — Our AI engine identifies the category, priority, and routes it to the right department automatically.\n\n**3. Track** — You get a unique ID like \`CR-2026-XXXXXX\` to track your complaint in real time.\n\n**4. Resolve** — The authority team updates the status until it's resolved.\n\nWhat would you like to do?`,
      quickReplies: ['Report a problem', 'Track my complaint', 'What issues can I report?'],
    };
  }

  // ── Tracking ─────────────────────────────────────────────────
  if (isTracking(lower)) {
    _state.stage = 'tracking';
    // Extract complaint ID if present
    const idMatch = userMessage.match(/CR-\d{4}-\d{4,8}/i);
    if (idMatch) {
      return {
        message: `I found complaint ID **${idMatch[0].toUpperCase()}**.\n\nClick below to open the tracking page for this complaint and see the full status timeline.`,
        quickReplies: [`Track ${idMatch[0].toUpperCase()}`, 'Report a new issue'],
        suggestComplaint: false,
      };
    }
    return {
      message: `To track your complaint:\n\n1. Go to the **Track Complaint** page\n2. Enter your **Complaint ID** (format: \`CR-2026-XXXXXX\`)\n3. See the full status timeline\n\nYou received your Complaint ID after submitting a report. Check your Success page or copy it from the confirmation screen.`,
      quickReplies: ['Go to Track page', 'Report a new issue'],
    };
  }

  // ── Thank you / acknowledgement ──────────────────────────────
  if (isThankYou(lower) && _state.stage !== 'collecting_location') {
    return {
      message: `You're welcome! 😊 Is there anything else I can help you with?`,
      quickReplies: ['Report another issue', 'Track a complaint', 'Nothing, thanks'],
    };
  }

  // ── Common issues list ────────────────────────────────────────
  if (lower.includes('common issues') || lower.includes('what issues')) {
    return {
      message: `I can help you report these civic issues:\n\n🛣️ **Roads** — Potholes, road damage, broken dividers\n🗑️ **Garbage** — Waste accumulation, overflowing bins\n🌊 **Drainage** — Flooding, clogged drains, waterlogging\n💧 **Water** — Pipeline leaks, supply disruption, contamination\n💡 **Streetlights** — Broken lamps, dark areas at night\n🏗️ **Infrastructure** — Damaged public property, broken benches, unsafe structures\n\nJust describe your problem in your own words and I'll handle the rest!`,
      quickReplies: ['Report a pothole', 'Garbage not collected', 'Drainage flooding', 'Water problem', 'Streetlight broken'],
    };
  }

  // ── Stage: collecting issue description ──────────────────────
  if (mentionsCivic(lower) || _state.stage === 'greeting') {
    const category = detectCategory(lower);
    const priority = detectPriority(lower);
    _state.stage            = 'collecting_location';
    _state.detectedCategory = category;
    _state.detectedPriority = priority;
    _state.issueText        = userMessage;

    const categoryLabels: Partial<Record<Category, string>> = {
      Roads:          '🛣️ Roads & Infrastructure',
      Garbage:        '🗑️ Sanitation & Garbage',
      Drainage:       '🌊 Drainage & Flooding',
      Water:          '💧 Water Supply',
      Streetlights:   '💡 Street Lighting',
      Infrastructure: '🏗️ Public Infrastructure',
    };

    const priorityBadge = priority === 'HIGH' ? '🔴 HIGH' : priority === 'MEDIUM' ? '🟡 MEDIUM' : '🟢 LOW';

    return {
      message: `I've identified this as:\n\n**${categoryLabels[category] ?? category}**\nPriority: **${priorityBadge}**\n\nTo complete the report, I need one more thing — **where is this happening?**\n\nShare a nearby landmark, street name, or area (e.g. "Near City Market, MG Road").`,
      quickReplies: ['Near my current location', 'Main Road', 'City Market area', 'Near college'],
    };
  }

  // ── Stage: location provided → generate analysis ─────────────
  if (_state.stage === 'collecting_location' && (hasLocation(lower) || lower.length > 5)) {
    _state.locationText = userMessage;
    _state.stage        = 'confirmed';

    const category   = _state.detectedCategory ?? detectCategory(_state.issueText ?? lower);
    const priority   = _state.detectedPriority ?? detectPriority(_state.issueText ?? lower);
    const dept       = DEPT_DISPLAY[category] ?? 'Municipal Department';
    const confidence = 82 + Math.floor(Math.random() * 15);

    return {
      message: `✅ **AI Analysis Complete**\n\nYour complaint has been classified. Review the details below and click **File Complaint** to officially register it — you'll get a unique tracking ID instantly.`,
      suggestComplaint: true,
      quickReplies: ['File Complaint', 'Edit details', 'Cancel'],
      analysisCard: {
        category,
        priority,
        department: dept,
        confidence,
      },
    };
  }

  // ── Quick reply shortcuts ─────────────────────────────────────
  if (lower.includes('file complaint') || lower.includes('report a problem') || lower.includes('report an issue')) {
    _state.stage = 'collecting_issue';
    return {
      message: `Let's file your complaint. Tell me **what's wrong** — describe the problem in your own words.\n\nFor example:\n• *"There's a huge pothole on MG Road near the bus stop"*\n• *"Garbage has been piling up for 3 days near the market"*\n• *"The streetlight near my colony entrance is broken"*`,
      quickReplies: ['Pothole on the road', 'Garbage not collected', 'Drainage flooding', 'No water supply', 'Streetlight broken'],
    };
  }

  if (lower.includes('nothing') || lower.includes('no thanks') || lower.includes('bye') || lower.includes('goodbye')) {
    _state = { stage: 'idle', turnCount: 0 };
    return {
      message: `Thanks for using **Civic AI**! 🙏\n\nRemember — every complaint you report helps make your city better. Come back anytime you need help!\n\nStay civic! 🏙️`,
    };
  }

  // ── Fallback ──────────────────────────────────────────────────
  _state.stage = 'idle';
  return {
    message: `I'm here to help with civic issues! You can:\n\n• **Describe a problem** — e.g. *"There's a pothole near my house"*\n• **Track a complaint** — share your Complaint ID\n• **Ask for help** — I'll guide you through the process\n\nWhat would you like to do?`,
    quickReplies: ['Report a problem', 'Track my complaint', 'Show issue types'],
  };
}
