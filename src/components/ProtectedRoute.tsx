/**
 * ProtectedRoute.tsx
 *
 * Route guards — UX ONLY. Backend enforces real security.
 * These prevent unnecessary API calls and show the right page immediately.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface Props {
  children: React.ReactNode;
}

/** Requires a citizen or admin JWT. Redirects to /login if missing. */
export function CitizenRoute({ children }: Props) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

/** Requires an admin JWT. Redirects to /admin/login if missing or wrong role. */
export function AdminRoute({ children }: Props) {
  const { isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();
  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
