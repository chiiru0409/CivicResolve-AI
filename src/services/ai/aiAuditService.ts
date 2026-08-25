/**
 * aiAuditService.ts — Audit Logging & Explainability Service for Municipal AI Actions
 *
 * Ensures all AI-suggested actions and administrative executions are recorded,
 * transparent, and auditable.
 */

import { api, isBackendAvailable } from '../api';

export interface AIAuditRecord {
  id: string;
  complaintId?: string;
  actionType: 'classification' | 'duplicate_flag' | 'priority_escalation' | 'department_assignment' | 'status_update' | 'admin_query';
  actorRole: 'system_ai' | 'citizen' | 'admin';
  actorId?: string;
  summary: string;
  previousValue?: string;
  newValue?: string;
  rationale: string;
  timestamp: string;
}

const localAuditLog: AIAuditRecord[] = [];

/** Log an AI action into the audit trail */
export async function logAIAction(record: Omit<AIAuditRecord, 'id' | 'timestamp'>): Promise<AIAuditRecord> {
  const auditEntry: AIAuditRecord = {
    ...record,
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
  };

  localAuditLog.unshift(auditEntry);
  if (localAuditLog.length > 200) localAuditLog.pop();

  if (isBackendAvailable()) {
    try {
      await api.post('/admin/ai/audit', auditEntry);
    } catch {
      // ignore backend audit failure
    }
  }

  return auditEntry;
}

/** Retrieve recent audit logs for administration inspection */
export async function getAIAuditLogs(limit: number = 30): Promise<AIAuditRecord[]> {
  if (isBackendAvailable()) {
    try {
      const res = await api.get<AIAuditRecord[]>(`/admin/ai/audit?limit=${limit}`);
      if (res && res.length > 0) return res;
    } catch {
      // fall back to local log
    }
  }
  return localAuditLog.slice(0, limit);
}
