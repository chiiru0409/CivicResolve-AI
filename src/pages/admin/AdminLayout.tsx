import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Menu, Bell, LogOut } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { AdminRoute } from '../../components/ProtectedRoute';
import NotificationPanel from '../../components/NotificationPanel';
import EagleEyeLogo from '../../components/EagleEyeLogo';
import ErrorBoundary from '../../components/ErrorBoundary';

// Admin pages (lazy load inline)
import AdminOverviewPage     from './AdminOverviewPage';
import AdminComplaintsPage   from './AdminComplaintsPage';
import AdminComplaintDetailPage from './AdminComplaintDetailPage';
import AdminMapPage          from './AdminMapPage';
import AdminAnalyticsPage    from './AdminAnalyticsPage';
import AdminDepartmentsPage  from './AdminDepartmentsPage';
import AdminEscalationsPage  from './AdminEscalationsPage';
import AdminSettingsPage     from './AdminSettingsPage';

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen]     = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const unread = 0;

  const handleLogout = () => { logout(); navigate('/admin/login', { replace: true }); };

  return (
    <AdminRoute>
      <div className="flex h-screen bg-[#090909] overflow-hidden">
        <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top bar */}
          <header className="flex-shrink-0 bg-[#0D0D0D] border-b border-white/8 h-14 flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl hover:bg-white/5 text-white/50 hover:text-white transition-colors">
                <Menu className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <EagleEyeLogo size={18} />
                <span className="font-bold text-white text-sm hidden sm:block">Civic Command Center</span>
                <span className="hidden sm:block w-1 h-1 rounded-full bg-white/20" />
                <span className="hidden sm:block text-xs text-white/40">Authority Dashboard</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button onClick={() => setNotifOpen(!notifOpen)}
                  className="p-2.5 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all relative">
                  <Bell className="w-5 h-5" />
                  {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#E10600] rounded-full border border-[#090909] animate-pulse" />}
                </button>
                {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-black">
                  {user?.full_name?.charAt(0).toUpperCase() ?? 'A'}
                </div>
                <span className="text-sm font-semibold text-white hidden sm:block">
                  {user?.full_name?.split(' ')[0] ?? 'Admin'}
                </span>
              </div>
              <button onClick={handleLogout}
                className="p-2.5 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-all">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto bg-[#090909]">
            <ErrorBoundary fallbackTitle="Admin Section Error" fallbackMessage="An unexpected error occurred loading this administrative module.">
              <Routes>
                <Route index                  element={<AdminOverviewPage />} />
                <Route path="overview"        element={<AdminOverviewPage />} />
                <Route path="complaints"      element={<AdminComplaintsPage />} />
                <Route path="complaints/:id"  element={<AdminComplaintDetailPage />} />
                <Route path="map"             element={<AdminMapPage />} />
                <Route path="analytics"       element={<AdminAnalyticsPage />} />
                <Route path="departments"     element={<AdminDepartmentsPage />} />
                <Route path="escalations"     element={<AdminEscalationsPage />} />
                <Route path="settings"        element={<AdminSettingsPage />} />
                <Route path="*"               element={<Navigate to="/admin" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </AdminRoute>
  );
}
