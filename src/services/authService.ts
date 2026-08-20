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
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
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
  phone: string;
  password: string;
}): Promise<TokenResponse> {
  // Try backend first
  if (isBackendAvailable()) {
    try {
      const res = await api.post<TokenResponse>('/auth/register', data);
      if (res && res.access_token) {
        storeToken(res.access_token);
        return res;
      }
      throw new Error('Invalid registration response from server.');
    } catch (err) {
      // If backend is unreachable (network error), fall through to demo mode
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('fetch') && !msg.includes('network') && !msg.includes('Failed to fetch')) {
        throw err; // Real error (e.g. 409 duplicate email) — re-throw
      }
    }
  }

  // Demo fallback
  const users = getDemoUsers();
  if (users.find((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
    throw new Error('An account with this email already exists.');
  }
  const newUser: DemoUser = {
    id:         Date.now(),
    full_name:  data.full_name,
    email:      data.email,
    phone:      data.phone ?? '',
    password:   data.password,
    role:       'citizen',
    created_at: new Date().toISOString(),
  };
  users.push(newUser);
  saveDemoUsers(users);
  const token = buildDemoToken(newUser);
  storeToken(token);
  return buildTokenResponse(newUser, token);
}

// ── Citizen Login ─────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<TokenResponse> {
  const cleanEmail = email.trim().toLowerCase();
  if (isBackendAvailable()) {
    try {
      const res = await api.post<TokenResponse>('/auth/login', { email: cleanEmail, password });
      if (res && res.access_token) {
        storeToken(res.access_token);
        return res;
      }
      throw new Error('Invalid authentication response from server.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('fetch') && !msg.includes('network') && !msg.includes('Failed to fetch')) {
        throw err;
      }
    }
  }

  // Demo fallback
  const users = getDemoUsers();
  const user  = users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (!user || user.password !== password) {
    throw new Error('Incorrect email or password.');
  }
  if (user.role === 'admin') {
    throw new Error('Please use the Authority login page for admin access.');
  }
  const token = buildDemoToken(user);
  storeToken(token);
  return buildTokenResponse(user, token);
}

// ── Admin Login ───────────────────────────────────────────────────────────────

export async function adminLogin(email: string, password: string): Promise<TokenResponse> {
  const cleanEmail = email.trim().toLowerCase();
  if (isBackendAvailable()) {
    try {
      const res = await api.post<TokenResponse>('/auth/admin/login', { email: cleanEmail, password });
      if (res && res.access_token) {
        storeToken(res.access_token);
        return res;
      }
      throw new Error('Invalid authentication response from server.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('fetch') && !msg.includes('network') && !msg.includes('Failed to fetch')) {
        throw err;
      }
    }
  }

  // Demo fallback — only admin@civicresolve.ai / admin123
  const users = getDemoUsers();
  const user  = users.find((u) => u.email.toLowerCase() === cleanEmail);
  if (!user || user.password !== password) {
    throw new Error('Incorrect credentials.');
  }
  if (user.role !== 'admin') {
    throw new Error('Not an authority account.');
  }
  const token = buildDemoToken(user);
  storeToken(token);
  return buildTokenResponse(user, token);
}

// ── Logout ────────────────────────────────────────────────────────────────────

export function logout(): void {
  clearToken();
}

// ── Get profile ───────────────────────────────────────────────────────────────

export async function getMe(): Promise<UserOut> {
  if (isBackendAvailable()) {
    try {
      return await api.get<UserOut>('/auth/me');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('fetch') && !msg.includes('network') && !msg.includes('Failed')) {
        throw err;
      }
    }
  }

  // Demo fallback — read from token
  const payload = getStoredUser();
  if (!payload) throw new Error('Not authenticated.');
  const users = getDemoUsers();
  const user  = users.find((u) => String(u.id) === payload.sub);
  return {
    id:         user?.id ?? Number(payload.sub),
    full_name:  user?.full_name ?? payload.full_name,
    email:      user?.email     ?? payload.email,
    phone:      user?.phone     ?? null,
    role:       user?.role      ?? payload.role,
    created_at: user?.created_at ?? new Date().toISOString(),
  };
}

// ── Update profile ────────────────────────────────────────────────────────────

export async function updateProfile(data: {
  full_name?: string;
  phone?: string;
}): Promise<UserOut> {
  if (isBackendAvailable()) {
    try {
      return await api.put<UserOut>('/auth/profile', data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('fetch') && !msg.includes('network') && !msg.includes('Failed')) {
        throw err;
      }
    }
  }

  // Demo fallback
  const payload = getStoredUser();
  if (!payload) throw new Error('Not authenticated.');
  const users = getDemoUsers();
  const idx   = users.findIndex((u) => String(u.id) === payload.sub);
  if (idx >= 0) {
    if (data.full_name) users[idx].full_name = data.full_name;
    if (data.phone !== undefined) users[idx].phone = data.phone;
    saveDemoUsers(users);
    return {
      id:         users[idx].id,
      full_name:  users[idx].full_name,
      email:      users[idx].email,
      phone:      users[idx].phone || null,
      role:       users[idx].role,
      created_at: users[idx].created_at,
    };
  }
  throw new Error('User not found.');
}
