import { useState, useEffect, useCallback } from 'react';
import type { Complaint } from '../types';
import {
  getMineComplaints,
  getComplaintById,
  trackComplaint,
  mapApiComplaint,
} from '../services/complaintService';
import { api } from '../services/api';

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
        const filtersObj: Record<string, string> = JSON.parse(filtersKey) as Record<string, string>;
        const cleanParams: Record<string, string> = {};
        for (const [k, v] of Object.entries(filtersObj)) {
          if (v && v !== 'All') {
            cleanParams[k] = v;
          }
        }
        cleanParams._t = Date.now().toString();
        const params = new URLSearchParams(cleanParams);
        const data = await api.get<{ total: number; items: Record<string, unknown>[] }>(
          `/admin/complaints?${params.toString()}`,
        );
        const mapped = (data.items || []).map(mapApiComplaint);
        setComplaints(mapped);
        setTotal(data.total ?? mapped.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load complaints from server.');
    } finally {
      setLoading(false);
    }
  }, [filtersKey]);

  useEffect(() => { void load(); }, [load]);

  return { complaints, total, loading, error, refetch: load };
}
