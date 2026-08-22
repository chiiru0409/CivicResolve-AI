import { useState, useEffect, useCallback, useRef } from 'react';
import type { Complaint } from '../types';
import {
  getMineComplaints,
  getComplaintById,
  trackComplaint,
  mapApiComplaint,
} from '../services/complaintService';
import { api } from '../services/api';

// ── Shared in-memory cache for seamless navigation without state reset ──────
interface AdminCacheEntry {
  complaints: Complaint[];
  total: number;
  timestamp: number;
}

const _adminCache = new Map<string, AdminCacheEntry>();
let _citizenCache: { complaints: Complaint[]; timestamp: number } | null = null;

export function invalidateAdminComplaintsCache() {
  _adminCache.clear();
  window.dispatchEvent(new CustomEvent('complaints:updated'));
}

export function invalidateCitizenComplaintsCache() {
  _citizenCache = null;
  window.dispatchEvent(new CustomEvent('complaints:updated'));
}

// ── Citizen: own complaints list ──────────────────────────────────────────────
export function useCitizenComplaints() {
  const [complaints, setComplaints] = useState<Complaint[]>(() => _citizenCache?.complaints ?? []);
  const [loading, setLoading]       = useState<boolean>(() => _citizenCache == null);
  const [error, setError]           = useState<string | null>(null);
  const mountedRef                  = useRef(true);

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground && !_citizenCache) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await getMineComplaints();
      _citizenCache = { complaints: data, timestamp: Date.now() };
      if (mountedRef.current) {
        setComplaints(data);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load citizen complaints.');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const hasCache = _citizenCache != null;
    void load(hasCache);

    const onUpdate = () => {
      if (mountedRef.current) {
        void load(true);
      }
    };
    window.addEventListener('complaints:updated', onUpdate);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('complaints:updated', onUpdate);
    };
  }, [load]);

  return { complaints, loading, error, refetch: () => load(false) };
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
      .catch((e) => setError(e instanceof Error ? e.message : 'Error loading complaint detail'))
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
      setError(err instanceof Error ? err.message : 'Error finding complaint.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (complaintNumber) void search(complaintNumber);
  }, [complaintNumber, search]);

  return { complaint, loading, error, notFound, search };
}

// ── Admin: all complaints with persistent shared cache ────────────────────────
export function useAdminComplaints(filters?: Record<string, string>) {
  // Normalize filters for consistent key matching
  const cleanFilters: Record<string, string> = {};
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v && v !== 'All' && v.trim() !== '') {
        cleanFilters[k] = v.trim();
      }
    }
  }
  const filtersKey = JSON.stringify(cleanFilters);

  const cached = _adminCache.get(filtersKey);
  const [complaints, setComplaints] = useState<Complaint[]>(() => cached?.complaints ?? []);
  const [total, setTotal]           = useState<number>(() => cached?.total ?? (cached?.complaints.length ?? 0));
  const [loading, setLoading]       = useState<boolean>(() => cached == null);
  const [error, setError]           = useState<string | null>(null);
  const mountedRef                  = useRef(true);

  const load = useCallback(async (isBackground = false) => {
    const currentCached = _adminCache.get(filtersKey);
    if (!isBackground && !currentCached) {
      setLoading(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams({ ...cleanFilters, _t: Date.now().toString() });
      const data = await api.get<{ total: number; items: Record<string, unknown>[] }>(
        `/admin/complaints?${params.toString()}`,
      );
      const mapped = (data.items || []).map(mapApiComplaint);
      const newTotal = data.total ?? mapped.length;

      _adminCache.set(filtersKey, {
        complaints: mapped,
        total: newTotal,
        timestamp: Date.now(),
      });

      if (mountedRef.current) {
        setComplaints(mapped);
        setTotal(newTotal);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load complaints from server.');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [filtersKey]);

  useEffect(() => {
    mountedRef.current = true;
    const currentCached = _adminCache.get(filtersKey);
    if (currentCached) {
      setComplaints(currentCached.complaints);
      setTotal(currentCached.total);
      setLoading(false);
    }
    void load(currentCached != null);

    const onUpdate = () => {
      if (mountedRef.current) {
        void load(true);
      }
    };
    window.addEventListener('complaints:updated', onUpdate);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('complaints:updated', onUpdate);
    };
  }, [filtersKey, load]);

  return { complaints, total, loading, error, refetch: () => load(false) };
}
