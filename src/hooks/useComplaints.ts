import { useState, useEffect, useCallback } from 'react';
import type { Complaint } from '../types';
import {
  getMineComplaints,
  getComplaintById,
  trackComplaint,
} from '../services/complaintService';
import { api, isBackendAvailable } from '../services/api';

// ── Citizen: own complaints list ──────────────────────────────────────────────
export function useCitizenComplaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMineComplaints();
      setComplaints(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load complaints.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { complaints, loading, error, refetch: load };
}

// ── Citizen: single complaint detail ─────────────────────────────────────────
export function useComplaintById(id: string | undefined) {
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getComplaintById(id)
      .then((c) => setComplaint(c ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, [id]);

  return { complaint, loading, error };
}

// ── Public: track by complaint number ────────────────────────────────────────
export function useTrackComplaint(complaintNumber: string | undefined) {
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [notFound, setNotFound]   = useState(false);

  const search = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const c = await trackComplaint(id);
      if (c) setComplaint(c);
      else setNotFound(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (complaintNumber) void search(complaintNumber);
  }, [complaintNumber, search]);

  return { complaint, loading, error, notFound, search };
}

// ── Admin: all complaints ─────────────────────────────────────────────────────
export function useAdminComplaints(filters?: Record<string, string>) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Serialize filters for stable dependency comparison
  const filtersKey = JSON.stringify(filters ?? {});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isBackendAvailable()) {
        // Parse the serialized key back to build URLSearchParams
        const filtersObj: Record<string, string> = JSON.parse(filtersKey) as Record<string, string>;
        const params = new URLSearchParams({ ...filtersObj, _t: Date.now().toString() });
        const data = await api.get<{ total: number; items: Record<string, unknown>[] }>(
          `/admin/complaints?${params.toString()}`,
        );
        const mapped = data.items.map((raw) => ({
          id:           raw.complaint_number ?? raw.id,
          title:        raw.title,
          category:     raw.category,
          priority:     raw.priority,
          status:       raw.status,
          department:   raw.department,
          location:     raw.location,
          latitude:     raw.latitude != null ? Number(raw.latitude) : undefined,
          longitude:    raw.longitude != null ? Number(raw.longitude) : undefined,
          landmark:     raw.landmark,
          source:       (raw.source as string) ?? (raw.contact_preference === 'voice' ? 'AI Call' : 'Web'),
          submittedAt:  raw.created_at,
          updatedAt:    raw.updated_at,
          aiConfidence: raw.ai_confidence,
        } as unknown as Complaint));
        setComplaints(mapped);
        setTotal(data.total);
      } else {
        const { getAllComplaints } = await import('../services/complaintService');
        const all = getAllComplaints();
        setComplaints(all);
        setTotal(all.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }, [filtersKey]);

  useEffect(() => { void load(); }, [load]);

  return { complaints, total, loading, error, refetch: load };
}
