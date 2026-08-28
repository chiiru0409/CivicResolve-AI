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

const CACHE_TTL_MS = 15000;
const _adminCache = new Map<string, AdminCacheEntry>();
let _citizenCache: { complaints: Complaint[]; timestamp: number } | null = null;

export function invalidateAdminComplaintsCache() {
  _adminCache.clear();
  try {
    window.dispatchEvent(new CustomEvent('complaints:updated'));
  } catch {
    // ignore
  }
}

export function invalidateCitizenComplaintsCache() {
  _citizenCache = null;
  try {
    window.dispatchEvent(new CustomEvent('complaints:updated'));
  } catch {
    // ignore
  }
}

// ── Citizen: own complaints list ──────────────────────────────────────────────
export function useCitizenComplaints() {
  const hasCached = _citizenCache != null;
  const [complaints, setComplaints] = useState<Complaint[]>(() => hasCached ? _citizenCache!.complaints : []);
  const [loading, setLoading]       = useState<boolean>(() => !hasCached);
  const [error, setError]           = useState<string | null>(null);
  const mountedRef                  = useRef(true);

  const load = useCallback(async (isBackground = false) => {
    const isFresh = _citizenCache != null && (Date.now() - _citizenCache.timestamp < CACHE_TTL_MS);
    if (!isBackground && !isFresh && !_citizenCache) {
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
    const isFresh = _citizenCache != null && (Date.now() - _citizenCache.timestamp < CACHE_TTL_MS);
    if (_citizenCache) {
      setComplaints(_citizenCache.complaints);
      setLoading(false);
    }
    void load(isFresh);

    const onUpdate = () => {
      _citizenCache = null;
      if (mountedRef.current) void load(true);
    };
    window.addEventListener('complaints:updated', onUpdate);
    window.addEventListener('auth:logout', invalidateCitizenComplaintsCache);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('complaints:updated', onUpdate);
      window.removeEventListener('auth:logout', invalidateCitizenComplaintsCache);
    };
  }, [load]);

  return { complaints, loading, error, refetch: () => { _citizenCache = null; void load(false); } };
}

// ── Single complaint detail ───────────────────────────────────────────────────
const _singleComplaintCache = new Map<string, { complaint: Complaint; timestamp: number }>();

export function invalidateSingleComplaintCache(id?: string) {
  if (id) {
    _singleComplaintCache.delete(id);
  } else {
    _singleComplaintCache.clear();
  }
}

export function useComplaint(id?: string) {
  const cached = id ? _singleComplaintCache.get(id) : null;
  const isFresh = cached != null && (Date.now() - cached.timestamp < CACHE_TTL_MS);
  const [complaint, setComplaint] = useState<Complaint | null>(() => cached ? cached.complaint : null);
  const [loading, setLoading]     = useState<boolean>(() => !cached);
  const [error, setError]         = useState<string | null>(null);
  const [notFound, setNotFound]   = useState<boolean>(false);
  const mountedRef                = useRef(true);

  const load = useCallback(async (targetId: string, isBackground = false) => {
    const currentCached = _singleComplaintCache.get(targetId);
    if (!isBackground && !currentCached) {
      setLoading(true);
    }
    setError(null);
    setNotFound(false);
    try {
      const data = await getComplaintById(targetId);
      if (!mountedRef.current) return;
      if (!data) {
        setNotFound(true);
      } else {
        _singleComplaintCache.set(targetId, { complaint: data, timestamp: Date.now() });
        setComplaint(data);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load complaint details.');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (id) {
      const currentCached = _singleComplaintCache.get(id);
      const fresh = currentCached != null && (Date.now() - currentCached.timestamp < CACHE_TTL_MS);
      if (currentCached) {
        setComplaint(currentCached.complaint);
        setLoading(false);
      }
      void load(id, fresh);
    } else {
      setLoading(false);
    }
    return () => {
      mountedRef.current = false;
    };
  }, [id, load]);

  return { complaint, loading, error, notFound, refetch: () => id && load(id, false) };
}

// ── Public complaint tracker ──────────────────────────────────────────────────
export function useTrackComplaint(complaintNumber?: string) {
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading]     = useState<boolean>(false);
  const [error, setError]         = useState<string | null>(null);
  const [notFound, setNotFound]   = useState<boolean>(false);
  const mountedRef                = useRef(true);

  const search = useCallback(async (num: string) => {
    const clean = num.trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await trackComplaint(clean);
      if (!mountedRef.current) return;
      if (!data) {
        setNotFound(true);
      } else {
        setComplaint(data);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to retrieve complaint tracking data.');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
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
  const hasCached = cached != null;
  const isCacheFresh = cached != null && (Date.now() - cached.timestamp < CACHE_TTL_MS);
  const [complaints, setComplaints] = useState<Complaint[]>(() => hasCached ? cached.complaints : []);
  const [total, setTotal]           = useState<number>(() => hasCached ? cached.total : 0);
  const [loading, setLoading]       = useState<boolean>(() => !hasCached);
  const [error, setError]           = useState<string | null>(null);
  const mountedRef                  = useRef(true);

  const load = useCallback(async (isBackground = false) => {
    const currentCached = _adminCache.get(filtersKey);
    const isFresh = currentCached != null && (Date.now() - currentCached.timestamp < CACHE_TTL_MS);
    if (!isBackground && !isFresh && !currentCached) {
      setLoading(true);
    }
    setError(null);
    try {
      const parsedFilters: Record<string, string> = JSON.parse(filtersKey);
      const params = new URLSearchParams(parsedFilters);
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
    const isFresh = currentCached != null && (Date.now() - currentCached.timestamp < CACHE_TTL_MS);
    if (currentCached) {
      setComplaints(currentCached.complaints);
      setTotal(currentCached.total);
      setLoading(false);
    }
    void load(isFresh);

    const onUpdate = () => {
      _adminCache.clear();
      if (mountedRef.current) {
        void load(true);
      }
    };
    window.addEventListener('complaints:updated', onUpdate);
    window.addEventListener('auth:logout', invalidateAdminComplaintsCache);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('complaints:updated', onUpdate);
      window.removeEventListener('auth:logout', invalidateAdminComplaintsCache);
    };
  }, [filtersKey, load]);

  return {
    complaints,
    total,
    loading,
    error,
    refetch: () => {
      _adminCache.delete(filtersKey);
      void load(false);
    },
  };
}
