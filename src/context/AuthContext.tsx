import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import {
  decodeToken, getStoredToken, storeToken, clearToken,
  type TokenPayload, type TokenResponse,
} from '../services/authService';

// ── Context shape ─────────────────────────────────────────────────────────────
export interface AuthContextValue {
  user: TokenPayload | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isCitizen: boolean;
  /** Call after a successful login/register API response */
  onLoginSuccess: (res: TokenResponse) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  isCitizen: false,
  onLoginSuccess: () => undefined,
  logout: () => undefined,
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<TokenPayload | null>(() => {
    // On first render: read token from localStorage and check expiry
    const token = getStoredToken();
    if (!token) return null;
    const payload = decodeToken(token);
    if (!payload) {
      clearToken(); // expired or malformed — clear it
      return null;
    }
    return payload;
  });

  // Listen for 401 events fired by api.ts
  useEffect(() => {
    const handle = () => {
      clearToken();
      setUser(null);
    };
    window.addEventListener('auth:logout', handle);
    return () => window.removeEventListener('auth:logout', handle);
  }, []);

  const onLoginSuccess = useCallback((res: TokenResponse | { access_token?: string } | string) => {
    if (!res) return;
    let token = '';
    if (typeof res === 'string') {
      token = res;
    } else if (typeof res === 'object' && res && 'access_token' in res && res.access_token) {
      token = res.access_token;
    }
    if (token) {
      storeToken(token);
      const payload = decodeToken(token);
      setUser(payload);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isAdmin:   user?.role === 'admin',
      isCitizen: user?.role === 'citizen',
      onLoginSuccess,
      logout,
    }),
    [user, onLoginSuccess, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
