import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowRight, Mail, Lock, Shield } from 'lucide-react';
import { login } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { useToast, ToastContainer } from '../components/Toast';
import PageTransition from '../components/PageTransition';
import EagleEyeLogo from '../components/EagleEyeLogo';

export default function LoginPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { onLoginSuccess } = useAuth();
  const { toasts, addToast, dismissToast } = useToast();

  const from = (location.state as { from?: string })?.from ?? '/dashboard';
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await login(cleanEmail, password);
      onLoginSuccess(res);
      addToast(`Welcome back, ${res.full_name || 'Citizen'}!`, 'success');
      setTimeout(() => navigate(from, { replace: true }), 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid email or password.';
      setError(msg);
      setPassword(''); // Clear password field on failed attempt
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageTransition>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-[#141414] border border-white/12 rounded-2xl mb-4 p-2 shadow-lg">
              <EagleEyeLogo size={36} />
            </div>
            <h1 className="text-2xl font-black text-white">Welcome Back</h1>
            <p className="text-white/50 text-sm mt-1">Sign in to your CivicResolve account.</p>
          </div>

          <form onSubmit={handleSubmit} className="card space-y-4" noValidate>
            {error && (
              <div className="bg-[#E10600]/10 border border-[#E10600]/30 text-[#E10600] text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="you@email.com"
                  autoComplete="username email"
                  autoFocus
                  className="input-field pl-10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  id="login-password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Your password"
                  autoComplete="current-password"
                  className="input-field pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="btn-primary w-full justify-center py-3.5 glow-red-sm">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Signing in…</> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
            </button>

            <p className="text-center text-sm text-white/40">
              New citizen?{' '}
              <Link to="/register" className="text-[#E10600] hover:text-[#FF1A14] font-semibold transition-colors">Create account</Link>
            </p>

            <div className="border-t border-white/8 pt-4 text-center">
              <Link to="/admin/login" className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors">
                <Shield className="w-3.5 h-3.5" /> Authority / Admin login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </PageTransition>
  );
}
