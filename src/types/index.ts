// ============================================================
// Core TypeScript types for CivicResolve AI
// ============================================================

// ---- Auth / User ------------------------------------------------

export interface User {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  role: 'citizen' | 'admin';
  created_at: string;
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: 'citizen' | 'admin';
  full_name: string;
  exp: number;
  iat: number;
}

export interface AuthState {
  user: TokenPayload | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
}

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ComplaintStatus =
  | 'Submitted'
  | 'AI_Analysis'
  | 'Routed'
  | 'Assigned'
  | 'In Progress'
  | 'Inspection'
  | 'Resolved'
  | 'Closed'
  | 'Escalated';

export type Category =
  | 'Roads'
  | 'Garbage'
  | 'Drainage'
  | 'Water'
  | 'Streetlights'
  | 'Infrastructure'
  | 'Other';

// ---- Complaint ---------------------------------------------------

export interface TimelineEvent {
  id: string;
  label: string;
  timestamp: string | null;
  status: 'completed' | 'current' | 'pending';
  note?: string;
}

export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  status: ComplaintStatus;
  department: string;
  location: string;
  latitude?: number;
  longitude?: number;
  landmark?: string;
  imageUrl?: string;
  evidenceQuality?: string;
  aiAnalysis?: Record<string, unknown>;
  submittedAt: string;
  updatedAt: string;
  assignedTo?: string;
  estimatedResponse?: string;
  timeline: TimelineEvent[];
  aiConfidence?: number;
  aiReason?: string;
  contactPreference?: string;
  isAnonymous?: boolean;
  escalationLevel?: number;
  zone?: string;
  source?: 'Web' | 'AI Call' | string;
}

// ---- AI Analysis ------------------------------------------------

export interface AIAnalysis {
  title: string;
  category: Category;
  priority: Priority;
  department: string;
  location: string;
  confidence: number;
  reason: string;
  assignedTeam?: string;
  estimatedResponse: string;
}

export interface ImageAnalysis {
  detectedObjects: string[];
  severity: 'Low' | 'Medium' | 'High';
  suggestedCategory: Category;
  confidence: number;
}

// ---- Notifications -----------------------------------------------

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  read: boolean;
  complaintId?: string;
}

// ---- Chat -------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: ChatAction[];
}

export interface ChatAction {
  label: string;
  onClick: () => void;
}

// ---- Departments ------------------------------------------------

export interface Department {
  id: string;
  name: string;
  shortName: string;
  categories: Category[];
  head: string;
  contact: string;
  zones: string[];
  teams: string[];
  color: string;
}

// ---- Map Marker -------------------------------------------------

export interface MapMarker {
  id: string;
  complaintId: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  priority: Priority;
  status: ComplaintStatus;
  title: string;
  category: Category;
  department: string;
  location: string;
}

// ---- Analytics --------------------------------------------------

export interface AnalyticsSummary {
  totalComplaints: number;
  highPriority: number;
  pending: number;
  resolved: number;
  resolutionRate: number;
  avgResolutionDays: number;
  byCategory: { category: Category; count: number }[];
  byPriority: { priority: Priority; count: number }[];
  byStatus: { status: ComplaintStatus; count: number }[];
  byArea: { area: string; count: number }[];
  recurringIssues: RecurringIssue[];
}

export interface RecurringIssue {
  area: string;
  category: Category;
  count: number;
  days: number;
  recommendation: string;
}
