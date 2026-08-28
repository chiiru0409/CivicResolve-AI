/**
 * api.ts — Central fetch wrapper for CivicResolve AI backend with SWR caching and request deduplication.
 *
 * Rules:
 * - All API calls go through apiFetch() — never use raw fetch in components.
 * - Base URL is read from VITE_API_BASE_URL environment variable.
 * - If VITE_API_BASE_URL is not set, isBackendAvailable() returns false
 *   and callers fall back to localStorage.
 * - Every request attaches Authorization: Bearer <token> if a token exists.
 * - 401 responses clear the token and dispatch a custom 'auth:logout' event
 *   so AuthContext can react without a direct import cycle.
 * - In-flight request deduplication prevents duplicate simultaneous network calls.
 * - In-memory SWR caching provides instantaneous (<1ms) screen renders with quiet background revalidation.
 */

/** Backend is the single source of truth */
export function isBackendAvailable(): boolean {
  return true;
}

/** Read the JWT from localStorage. */
function getToken(): string | null {
  return localStorage.getItem('civic_token');
}

/** Build default headers, attaching the Bearer token when present. */
function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Construct safe, clean URL for API requests */
function buildUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  let base = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:8000' : '')).trim().replace(/\/+$/, '');
  
  // If base ends with /api, remove it so /api is not duplicated
  if (base.endsWith('/api')) {
    base = base.slice(0, -4);
  }

  let cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!cleanPath.startsWith('/api/') && cleanPath !== '/api') {
    cleanPath = `/api${cleanPath}`;
  }

  if (!base) {
    return cleanPath;
  }

  return `${base}${cleanPath}`;
}

// ── In-Flight Deduplication & In-Memory SWR Caching ──────────────────────────

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

const _inFlightRequests = new Map<string, Promise<unknown>>();
const _apiCache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 15000; // 15 seconds fresh TTL

/** Invalidate API cache by prefix or clear all */
export function invalidateApiCache(prefix?: string) {
  if (!prefix) {
    _apiCache.clear();
  } else {
    for (const key of _apiCache.keys()) {
      if (key.includes(prefix)) {
        _apiCache.delete(key);
      }
    }
  }
}

// Invalidate on auth logout
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => invalidateApiCache());
}

/** Core fetch wrapper with in-flight deduplication, timeout protection, and auto cache invalidation. */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const isGet = !options.method || options.method.toUpperCase() === 'GET';
  const url = buildUrl(path);
  const cacheKey = `${options.method || 'GET'}:${url}`;

  // If GET request is already in flight, coalesce and return existing promise
  if (isGet && _inFlightRequests.has(cacheKey)) {
    return _inFlightRequests.get(cacheKey) as Promise<T>;
  }

  const fetchPromise = (async () => {
    const headers = buildHeaders(options.headers as Record<string, string>);

    // Don't set Content-Type for FormData — browser sets it with boundary
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    const timeoutMs = options.timeoutMs ?? 10000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        cache: 'no-store',
        ...options,
        signal: options.signal || controller.signal,
        headers,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiError(408, 'Request timed out. Please try again.');
      }
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
        throw new ApiError(503, 'Server connection unavailable. Please check your network or try again in a moment.');
      }
      throw new ApiError(500, msg);
    } finally {
      clearTimeout(timeoutId);
    }

    // 401 on protected requests (session expired) — don't trigger for login attempts
    const isAuthAttempt = path.includes('/auth/login') || path.includes('/auth/admin/login') || url.includes('/auth/login') || url.includes('/auth/admin/login');
    if (res.status === 401 && !isAuthAttempt) {
      localStorage.removeItem('civic_token');
      window.dispatchEvent(new CustomEvent('auth:logout'));
      throw new ApiError(401, 'Session expired. Please log in again.');
    }

    if (!res.ok) {
      let detail: unknown = null;
      let rawText = '';
      try {
        rawText = await res.text();
        detail = rawText ? JSON.parse(rawText) : null;
      } catch {
        detail = rawText || null;
      }
      let message =
        (typeof detail === 'object' && detail !== null && 'detail' in detail)
          ? String((detail as Record<string, unknown>)['detail'])
          : (typeof detail === 'string' && detail ? detail : '');
      if (!message) {
        message =
          res.status === 401 ? 'Incorrect email or password.' :
          res.status === 403 ? 'You are not authorized to perform this action.' :
          res.status === 404 ? 'Resource not found.' :
          res.status === 409 ? 'An account with this email already exists. Please log in.' :
          res.status >= 500  ? 'Server encountered an error. Please try again later.' :
          `Request failed with status ${res.status}`;
      }
      throw new ApiError(res.status, message, detail);
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    const data = (await res.json()) as T;

    // Cache successful GET responses
    if (isGet) {
      _apiCache.set(url, { data, timestamp: Date.now() });
    } else {
      // Mutations invalidate related cache keys
      invalidateApiCache('complaint');
      invalidateApiCache('admin');
      invalidateApiCache('overview');
      invalidateApiCache('analytics');
    }

    return data;
  })();

  if (isGet) {
    _inFlightRequests.set(cacheKey, fetchPromise);
    fetchPromise.finally(() => _inFlightRequests.delete(cacheKey));
  }

  return fetchPromise;
}

/** Convenience wrappers */
export const api = {
  get: <T>(path: string) =>
    apiFetch<T>(path, { method: 'GET' }),

  getCached: async <T>(path: string, options: { ttlMs?: number; forceRefresh?: boolean } = {}): Promise<T> => {
    const url = buildUrl(path);
    const ttl = options.ttlMs ?? DEFAULT_TTL_MS;
    const cached = _apiCache.get(url);

    if (!options.forceRefresh && cached && Date.now() - cached.timestamp < ttl) {
      return cached.data as T;
    }

    return apiFetch<T>(path, { method: 'GET' });
  },

  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),

  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: 'DELETE' }),

  upload: <T>(path: string, formData: FormData) =>
    apiFetch<T>(path, { method: 'POST', body: formData }),
};
