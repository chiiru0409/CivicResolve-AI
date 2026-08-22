/**
 * authService.ts — Production Auth API calls and JWT session management.
 *
 * All authentication is backed permanently by the backend SQLite / Postgres database.
 * Real bcrypt password verification and cryptographically signed JWT tokens.
 */

import { api } from './api';

const TOKEN_KEY = 'civic_token';

// ── Token payload shape (mirrors backend JWT claims) ──────────────────────────
export interface TokenPayload {
  sub: string;
  email: string;
  role: 'citizen' | 'admin';
  full_name: string;
  exp: number;
  iat: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: string;
  user_id: number;
  full_name: string;
  email: string;
}

export interface UserOut {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  created_at: string;
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export function decodeToken(token: string): TokenPayload | null {
  try {
    const b64 = token.split('.')[1];
    if (!b64) return null;
    const json = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as TokenPayload;
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearToken();
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): TokenPayload | null {
  const token = getStoredToken();
  if (!token) return null;
  return decodeToken(token);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getStoredUser() !== null;
}

export function isAdminUser(): boolean {
  return getStoredUser()?.role === 'admin';
}

// ── Register ──────────────────────────────────────────────────────────────────

export async function register(data: {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<TokenResponse> {
  const cleanEmail = data.email.trim().toLowerCase();
  const res = await api.post<TokenResponse>('/auth/register', {
    full_name: data.full_name.trim(),
    email: cleanEmail,
    phone: data.phone?.trim() ?? '',
    password: data.password,
  });
  if (res && res.access_token) {
    storeToken(res.access_token);
    return res;
  }
  throw new Error('Invalid registration response from server.');
}

// ── Citizen Login ─────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<TokenResponse> {
  const cleanEmail = email.trim().toLowerCase();
  const res = await api.post<TokenResponse>('/auth/login', { email: cleanEmail, password });
  if (res && res.access_token) {
    storeToken(res.access_token);
    return res;
  }
  throw new Error('Invalid authentication response from server.');
}

// ── Admin Login ───────────────────────────────────────────────────────────────

export async function adminLogin(email: string, password: string): Promise<TokenResponse> {
  const cleanEmail = email.trim().toLowerCase();
  const res = await api.post<TokenResponse>('/auth/admin/login', { email: cleanEmail, password });
  if (res && res.access_token) {
    storeToken(res.access_token);
    return res;
  }
  throw new Error('Invalid authentication response from server.');
}

// ── Logout ────────────────────────────────────────────────────────────────────

export function logout(): void {
  clearToken();
}

// ── Get profile ───────────────────────────────────────────────────────────────

export async function getMe(): Promise<UserOut> {
  return await api.get<UserOut>('/auth/me');
}

// ── Update profile ────────────────────────────────────────────────────────────

export async function updateProfile(data: {
  full_name?: string;
  phone?: string;
}): Promise<UserOut> {
  return await api.put<UserOut>('/auth/profile', data);
}
