// ============================================================
// Utility functions — CivicResolve AI
// ============================================================

/** Generate a unique complaint ID in the format CR-YYYY-XXXXXX */
export function generateComplaintId(): string {
  const year = new Date().getFullYear();
  const num = Math.floor(Math.random() * 900000) + 100000;
  return `CR-${year}-${num}`;
}

/** Format a date string to a human-readable format */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Format a date string to include time */
export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Get relative time string */
export function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

/** Merge class names (simple utility) */
export function cn(...classes: (string | undefined | null | boolean)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Simulate an async delay */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Get priority color classes — racing theme */
export function getPriorityColor(priority: string): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (priority) {
    case 'HIGH':
    case 'CRITICAL':
      return {
        bg: 'bg-civic-red/10',
        text: 'text-civic-red',
        border: 'border-civic-red/30',
        dot: 'bg-civic-red',
      };
    case 'MEDIUM':
      return {
        bg: 'bg-civic-yellow/10',
        text: 'text-civic-yellow',
        border: 'border-civic-yellow/30',
        dot: 'bg-civic-yellow',
      };
    default:
      return {
        bg: 'bg-civic-elevated',
        text: 'text-civic-muted',
        border: 'border-civic-border',
        dot: 'bg-civic-muted',
      };
  }
}

/** Get status color classes — racing theme */
export function getStatusColor(status: string): {
  bg: string;
  text: string;
} {
  switch (status) {
    case 'Resolved':
    case 'Closed':
      return { bg: 'bg-civic-success/10', text: 'text-civic-success' };
    case 'In Progress':
    case 'Inspection':
      return { bg: 'bg-blue-500/10', text: 'text-blue-400' };
    case 'Escalated':
      return { bg: 'bg-civic-red/10', text: 'text-civic-red' };
    case 'Assigned':
    case 'Routed':
      return { bg: 'bg-civic-yellow/10', text: 'text-civic-yellow' };
    case 'Submitted':
    case 'AI_Analysis':
      return { bg: 'bg-civic-elevated', text: 'text-civic-muted' };
    default:
      return { bg: 'bg-civic-elevated', text: 'text-civic-muted' };
  }
}

/** Get category emoji */
export function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    Roads: '🛣️',
    Garbage: '🗑️',
    Drainage: '🌊',
    Water: '💧',
    Streetlights: '💡',
    Infrastructure: '🏗️',
    Other: '📋',
  };
  return map[category] || '📋';
}

/** Truncate text */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}
