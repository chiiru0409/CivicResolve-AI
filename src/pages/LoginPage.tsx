import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Eye, EyeOff, Loader2, ArrowRight, Mail, Lock, Shield } from 'lucide-react';
import { login } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { useToast, ToastContainer } from '../components/Toast';
import PageTransition from '../components/PageTransition';
import EagleEyeLogo from '../components/EagleEyeLogo';
import { buttonGestures } from '../utils/motion';

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
    const cleanEmail = email.trim().toLowerCase();
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
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md"
        >

          <div className="text-center mb-8">
            <motion.div
              whileHover={{ rotate: 5, scale: 1.05 }}
              className="inline-flex items-center justify-center w-14 h-14 bg-[#141414] border border-white/12 rounded-2xl mb-4 p-2 shadow-lg shadow-[#E10600]/10"
            >
              <EagleEyeLogo size={36} />
            </motion.div>
            <h1 className="text-2xl font-black text-white font-display">Welcome Back</h1>
            <p className="text-white/50 text-sm mt-1 font-sans">Sign in to your CivicResolve account.</p>
          </div>

          <form onSubmit={handleSubmit} className="card space-y-4 shadow-2xl" noValidate>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#E10600]/10 border border-[#E10600]/30 text-[#E10600] text-sm px-4 py-3 rounded-xl font-medium"
              >
                {error}
              </motion.div>
            )}

            <div>
              <label htmlFor="login-email" className="label font-mono">Email</label>
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
                  className="input-field pl-10 font-mono"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="label font-mono">Password</label>
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
                  className="input-field pl-10 pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <motion.button
              {...buttonGestures}
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3.5 glow-red-sm font-display font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>

            <p className="text-center text-sm text-white/40 font-sans">
              New citizen?{' '}
              <Link to="/register" className="text-[#E10600] hover:text-[#FF1A14] font-semibold transition-colors font-mono">Create account</Link>
            </p>

            <div className="border-t border-white/8 pt-4 text-center">
              <Link to="/admin/login" className="inline-flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors font-mono">
                <Shield className="w-3.5 h-3.5" /> Authority / Admin login
              </Link>
            </div>
          </form>
        </motion.div>
      </div>
    </PageTransition>
  );
}
