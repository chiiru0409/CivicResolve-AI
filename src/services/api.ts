/**
 * api.ts — Central fetch wrapper for CivicResolve AI backend.
 *
 * Rules:
 * - All API calls go through apiFetch() — never use raw fetch in components.
 * - Base URL is read from VITE_API_BASE_URL environment variable.
 * - If VITE_API_BASE_URL is not set, isBackendAvailable() returns false
 *   and callers fall back to localStorage.
 * - Every request attaches Authorization: Bearer <token> if a token exists.
 * - 401 responses clear the token and dispatch a custom 'auth:logout' event
 *   so AuthContext can react without a direct import cycle.
 */

const BASE_URL = (import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:8000' : '')).replace(/\/$/, '');

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

function normalizePath(path: string): string {
  if (path.startsWith('/api/') || path === '/api') return path;
  return `/api${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Core fetch wrapper. Throws ApiError on non-2xx responses. */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const normalizedPath = normalizePath(path);
  const url = `${BASE_URL}${normalizedPath}`;
  const headers = buildHeaders(options.headers as Record<string, string>);

  // Don't set Content-Type for FormData — browser sets it with boundary
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
      throw new ApiError(503, 'Server connection unavailable. Please check your network or try again in a moment.');
    }
    throw new ApiError(500, msg);
  }

  // 401 on protected requests (session expired) — don't trigger for login attempts
  const isAuthAttempt = normalizedPath.includes('/auth/login') || normalizedPath.includes('/auth/admin/login');
  if (res.status === 401 && !isAuthAttempt) {
    localStorage.removeItem('civic_token');
    window.dispatchEvent(new CustomEvent('auth:logout'));
    throw new ApiError(401, 'Session expired. Please log in again.');
  }

  if (!res.ok) {
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    let message =
      (typeof detail === 'object' && detail !== null && 'detail' in detail)
        ? String((detail as Record<string, unknown>)['detail'])
        : '';
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

  return res.json() as Promise<T>;
}

/** Convenience wrappers */
export const api = {
  get: <T>(path: string) =>
    apiFetch<T>(path, { method: 'GET' }),

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
