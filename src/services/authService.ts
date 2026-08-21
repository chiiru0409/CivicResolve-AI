/**
 * authService.ts — Auth API calls and token management.
 *
 * Two-layer auth:
 * 1. API layer  — calls FastAPI when VITE_API_BASE_URL is set and reachable.
 * 2. Demo layer — localStorage fallback when backend is not running.
 *
 * Backend is always the authority when available.
 * Demo mode is for local development / SIH demonstration without a running server.
 */

import { api, isBackendAvailable } from './api';

const TOKEN_KEY  = 'civic_token';
const USERS_KEY  = 'civic_demo_users';

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

// ── Demo user store (localStorage) ────────────────────────────────────────────
interface DemoUser {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  password: string;   // plain — demo only, never send to a real server
  role: 'citizen' | 'admin';
  created_at: string;
}

function getDemoUsers(): DemoUser[] {
  try {
    const stored = localStorage.getItem(USERS_KEY);
    const users: DemoUser[] = stored ? (JSON.parse(stored) as DemoUser[]) : [];
    // Ensure default admin always exists and has valid password
    let admin = users.find((u) => u.role === 'admin' || u.email.toLowerCase() === 'admin@civicresolve.ai');
    if (!admin) {
      admin = {
        id: 1,
        full_name: 'CivicResolve Admin',
        email: 'admin@civicresolve.ai',
        phone: '',
        password: 'admin123',
        role: 'admin',
        created_at: new Date().toISOString(),
      };
      users.push(admin);
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } else {
      admin.email = 'admin@civicresolve.ai';
      admin.password = 'admin123';
      admin.role = 'admin';
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
    return users;
  } catch {
    return [
      {
        id: 1,
        full_name: 'CivicResolve Admin',
        email: 'admin@civicresolve.ai',
        phone: '',
        password: 'admin123',
        role: 'admin',
        created_at: new Date().toISOString(),
      },
    ];
  }
}

function saveDemoUsers(users: DemoUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/** Build a fake JWT-shaped token for demo mode.
 *  Not cryptographically signed — purely for UI/UX flow. */
function buildDemoToken(user: DemoUser): string {
  const now    = Math.floor(Date.now() / 1000);
  const expiry = now + (user.role === 'admin' ? 8 * 3600 : 24 * 3600);
  const header  = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      sub:       String(user.id),
      email:     user.email,
      role:      user.role,
      full_name: user.full_name,
      iat:       now,
      exp:       expiry,
    }),
  );
  // Fake signature — not verifiable, only used client-side for UX
  const sig = btoa('demo-signature');
  return `${header}.${payload}.${sig}`;
}

function buildTokenResponse(user: DemoUser, token: string): TokenResponse {
  return {
    access_token: token,
    token_type:   'bearer',
    role:         user.role,
    user_id:      user.id,
    full_name:    user.full_name,
    email:        user.email,
  };
}

// ── Token helpers ─────────────────────────────────────────────────────────────

export function decodeToken(token: string): TokenPayload | null {
  try {
    const b64     = token.split('.')[1];
    if (!b64) return null;
    const json    = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
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
  localStorage.removeItem('civicresolve_complaints');
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

