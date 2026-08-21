/**
 * complaintService.ts
 *
 * Two-layer service:
 * 1. API layer — calls FastAPI backend when VITE_API_BASE_URL is set.
 * 2. localStorage layer — fallback for demo/offline mode.
 *
 * Components call the unified functions below and never need to know
 * which layer is active.
 */

import type { Complaint } from '../types';
import mockComplaints from '../data/mockComplaints';
import { api, isBackendAvailable, ApiError } from './api';

// ── localStorage helpers ──────────────────────────────────────────────────────
const STORAGE_KEY = 'civicresolve_complaints';

function initStorage(): void {
  if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockComplaints));
  }
}

function readStorage(): Complaint[] {
  initStorage();
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)!) as Complaint[];
  } catch {
    return mockComplaints;
  }
}

function writeStorage(complaints: Complaint[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(complaints));
}

// ── API response → Complaint mapper ───────────────────────────────────────────
// Backend uses snake_case; frontend Complaint interface uses camelCase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApiComplaint(raw: Record<string, any>): Complaint {
  const updates: Array<{ status: string; message: string | null; created_at: string }> =
    raw.updates ?? [];

  // Build timeline from complaint_updates
  const TIMELINE_STEPS = [
    'Submitted',
    'AI_Analysis',
    'Assigned',
    'In Progress',
    'Inspection',
    'Resolved',
  ];
  const currentStatus: string = raw.status ?? 'Submitted';

  const timeline = TIMELINE_STEPS.map((step, i) => {
    const updateForStep = updates.find((u) => u.status === step);
    const isDone =
      TIMELINE_STEPS.indexOf(currentStatus) > i ||
      currentStatus === step ||
      updateForStep !== undefined;
    const isCurrent = currentStatus === step;
    return {
      id: `step-${i}`,
      label:
        step === 'AI_Analysis' ? 'AI Analysis Completed' :
        step === 'In Progress'  ? 'Work In Progress' :
        step,
      timestamp: updateForStep?.created_at ?? (isDone ? raw.created_at : null),
      status: (isCurrent ? 'current' : isDone ? 'completed' : 'pending') as
        'current' | 'completed' | 'pending',
      note: updateForStep?.message ?? undefined,
    };
  });

  return {
    id:                raw.complaint_number ?? raw.id,
    title:             raw.title ?? '',
    description:       raw.description ?? '',
    category:          raw.category ?? 'Other',
    priority:          raw.priority ?? 'LOW',
    status:            raw.status ?? 'Submitted',
    department:        raw.department ?? '',
    location:          raw.location ?? '',
    latitude:          raw.latitude ?? undefined,
    longitude:         raw.longitude ?? undefined,
    landmark:          raw.landmark ?? undefined,
    imageUrl:          raw.image_path ?? undefined,
    submittedAt:       raw.created_at ?? new Date().toISOString(),
    updatedAt:         raw.updated_at ?? new Date().toISOString(),
    assignedTo:        raw.assigned_officer ?? undefined,
    estimatedResponse: raw.estimated_response ?? undefined,
    timeline,
    aiConfidence:      raw.ai_confidence ?? undefined,
    aiReason:          raw.ai_reason ?? undefined,
    escalationLevel:   raw.escalation_level ?? 0,
    zone:              raw.zone ?? undefined,
    isAnonymous:       Boolean(raw.is_anonymous),
    contactPreference: raw.contact_preference ?? 'email',
    source:            raw.source ?? (raw.contact_preference === 'voice' ? 'AI Call' : 'Web'),
  };
}

// ── Unified public API ────────────────────────────────────────────────────────

/** Submit a new complaint. Returns the created Complaint from backend. */
export async function submitComplaint(
  data: Record<string, unknown>,
): Promise<Complaint> {
  const raw = await api.post<Record<string, unknown>>('/complaints', { ...data, source: 'Web' });
  return mapApiComplaint(raw as Record<string, unknown>);
}

/** Get all complaints for the logged-in citizen strictly from backend. */
export async function getMineComplaints(): Promise<Complaint[]> {
  try {
    const raw = await api.get<Record<string, unknown>[]>('/complaints/mine');
    return (raw || []).map(mapApiComplaint);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return [];
    }
    throw err;
  }
}

/** Get a single complaint by ID (authenticated citizen). */
export async function getComplaintById(id: string): Promise<Complaint | undefined> {
  try {
    const raw = await api.get<Record<string, unknown>>(`/complaints/${id}`);
    return mapApiComplaint(raw);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

/** Public complaint tracking — no auth needed. */
export async function trackComplaint(complaintNumber: string): Promise<Complaint | undefined> {
  try {
    const raw = await api.get<Record<string, unknown>>(`/track/${complaintNumber}`);
    return mapApiComplaint(raw);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}


// ── localStorage-only helpers (used by admin in offline/demo mode) ────────────

export function getAllComplaints(): Complaint[] {
  return readStorage();
}

export function saveComplaint(complaint: Complaint): void {
  const list = readStorage();
  const idx  = list.findIndex((c) => c.id === complaint.id);
  if (idx >= 0) list[idx] = complaint; else list.unshift(complaint);
  writeStorage(list);
}

export function updateComplaintStatus(
  id: string,
  newStatus: Complaint['status'],
  note?: string,
): Complaint | undefined {
  const list = readStorage();
  const idx  = list.findIndex((c) => c.id === id);
  if (idx < 0) return undefined;
  list[idx].status    = newStatus;
  list[idx].updatedAt = new Date().toISOString();
  const cur = list[idx].timeline.find((t) => t.status === 'current');
  if (cur) { cur.status = 'completed'; cur.timestamp = list[idx].updatedAt; }
  const nxt = list[idx].timeline.find((t) => t.status === 'pending');
  if (nxt) { nxt.status = 'current'; if (note) nxt.note = note; }
  writeStorage(list);
  return list[idx];
}

export function escalateComplaint(id: string): Complaint | undefined {
  const list = readStorage();
  const idx  = list.findIndex((c) => c.id === id);
  if (idx < 0) return undefined;
  list[idx].status         = 'Escalated';
  list[idx].escalationLevel = (list[idx].escalationLevel ?? 0) + 1;
  list[idx].updatedAt       = new Date().toISOString();
  writeStorage(list);
  return list[idx];
}

export function getAnalyticsSummary() {
  const complaints = readStorage();
  const resolved   = complaints.filter((c) => ['Resolved','Closed'].includes(c.status));
  const pending    = complaints.filter((c) => !['Resolved','Closed'].includes(c.status));
  const high       = complaints.filter((c) => ['HIGH','CRITICAL'].includes(c.priority));

  const cats = ['Roads','Garbage','Drainage','Water','Streetlights','Infrastructure','Other'];
  const pris = ['HIGH','MEDIUM','LOW'];
  const zones = ['Zone 1','Zone 2','Zone 3','Zone 4'];

  return {
    totalComplaints: complaints.length,
    highPriority:    high.length,
    pending:         pending.length,
    resolved:        resolved.length,
    resolutionRate:  complaints.length > 0 ? Math.round((resolved.length / complaints.length) * 100) : 0,
    avgResolutionDays: 2.4,
    byCategory: cats.map((c) => ({ category: c, count: complaints.filter((x) => x.category === c).length })),
    byPriority: pris.map((p) => ({ priority: p, count: complaints.filter((x) => x.priority === p).length })),
    byArea:     zones.map((z) => ({ area: z,    count: complaints.filter((x) => x.zone === z).length })),
    recurringIssues: [
      { area: 'Market Area',    category: 'Garbage'  as const, count: 27, days: 30, recommendation: 'Increase waste collection frequency.' },
      { area: 'Residency Road', category: 'Drainage' as const, count: 14, days: 30, recommendation: 'Drainage audit and desilting required.' },
      { area: 'MG Road',        category: 'Roads'    as const, count: 11, days: 30, recommendation: 'Schedule road resurfacing.' },
    ],
  };
}

export function resetToMockData(): void {
  writeStorage(mockComplaints);
}
