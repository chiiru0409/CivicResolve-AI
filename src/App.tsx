import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CitizenRoute } from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import AIChat from './components/AIChat';
import DemoBanner from './components/DemoBanner';
import EagleEyeLogo from './components/EagleEyeLogo';

// ── Citizen pages ───────────────────────────────────────────
const LandingPage        = lazy(() => import('./pages/LandingPage'));
const RegisterPage       = lazy(() => import('./pages/RegisterPage'));
const LoginPage          = lazy(() => import('./pages/LoginPage'));
const CitizenDashboard   = lazy(() => import('./pages/CitizenDashboardPage'));
const ReportIssuePage    = lazy(() => import('./pages/ReportIssuePage'));
const AIAnalysisPage     = lazy(() => import('./pages/AIAnalysisPage'));
const SuccessPage        = lazy(() => import('./pages/SuccessPage'));
const MyComplaintsPage   = lazy(() => import('./pages/MyComplaintsPage'));
const TrackComplaintPage = lazy(() => import('./pages/TrackComplaintPage'));
const ProfilePage        = lazy(() => import('./pages/ProfilePage'));
const HowItWorksPage     = lazy(() => import('./pages/HowItWorksPage'));
const VoiceCallPage      = lazy(() => import('./pages/VoiceCallPage'));

// ── Admin pages ─────────────────────────────────────────────
const AdminLoginPage     = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminLayout        = lazy(() => import('./pages/admin/AdminLayout'));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070707]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 bg-[#141414] border border-white/12 rounded-2xl flex items-center justify-center p-2 shadow-lg">
          <EagleEyeLogo size={36} />
        </div>
        <p className="text-sm text-white/40 font-medium">Loading…</p>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#070707] pt-16">
      <div className="text-center px-4">
        <p className="text-8xl font-black text-[#E10600] mb-4">404</p>
        <h1 className="text-2xl font-black text-white mb-2">Page Not Found</h1>
        <p className="text-white/50 mb-6">The page you're looking for doesn't exist.</p>
        <a href="/" className="btn-primary inline-flex">Go to Home</a>
      </div>
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <>
      {!isAdmin && <DemoBanner />}
      {!isAdmin && <Navbar />}

      <main id="main-content">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public */}
            <Route path="/"             element={<LandingPage />} />
            <Route path="/register"     element={<RegisterPage />} />
            <Route path="/login"        element={<LoginPage />} />
            <Route path="/track"        element={<TrackComplaintPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/call"         element={<VoiceCallPage />} />

            {/* Citizen protected */}
            <Route path="/dashboard"      element={<CitizenRoute><CitizenDashboard /></CitizenRoute>} />
            <Route path="/report"         element={<CitizenRoute><ReportIssuePage /></CitizenRoute>} />
            <Route path="/analyze"        element={<CitizenRoute><AIAnalysisPage /></CitizenRoute>} />
            <Route path="/success/:id"    element={<CitizenRoute><SuccessPage /></CitizenRoute>} />
            <Route path="/my-complaints"  element={<CitizenRoute><MyComplaintsPage /></CitizenRoute>} />
            <Route path="/profile"        element={<CitizenRoute><ProfilePage /></CitizenRoute>} />

            {/* Admin — AdminLayout handles its own AdminRoute guard */}
            <Route path="/admin/login"  element={<AdminLoginPage />} />
            <Route path="/admin/*"      element={<AdminLayout />} />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>

      {!isAdmin && <AIChat />}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppShell />
      </Router>
    </AuthProvider>
  );
}

export default App;
