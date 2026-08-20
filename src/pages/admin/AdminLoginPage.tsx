import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, Mail, Lock, Eye, EyeOff, Zap } from 'lucide-react';
import { adminLogin } from '../../services/authService';
import { useAuth } from '../../hooks/useAuth';
import { useToast, ToastContainer } from '../../components/Toast';
import EagleEyeLogo from '../../components/EagleEyeLogo';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { onLoginSuccess } = useAuth();
  const { toasts, addToast, dismissToast } = useToast();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Please enter admin email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await adminLogin(cleanEmail, password);
      onLoginSuccess(res);
      addToast(`Welcome, Officer ${res.full_name || 'Admin'}!`, 'success');
      setTimeout(() => navigate('/admin', { replace: true }), 600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid admin credentials.';
      setError(msg);
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#141414] border border-white/12 rounded-2xl mb-4 p-2 shadow-lg">
            <EagleEyeLogo size={36} />
          </div>
          <h1 className="text-2xl font-black text-white">Civic Command Center</h1>
          <p className="text-white/40 text-sm mt-1">Authority access — restricted</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4" noValidate>
          {/* Top accent */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent rounded-t-2xl" />

          {error && (
            <div className="bg-[#E10600]/10 border border-[#E10600]/30 text-[#E10600] text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="admin-email" className="label">Authority Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                id="admin-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError('');
                }}
                placeholder="admin@civicresolve.ai"
                autoComplete="username email"
                autoFocus
                className="input-field pl-10"
              />
            </div>
          </div>

          <div>
            <label htmlFor="admin-password" className="label">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                id="admin-password"
                name="password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Authority password"
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
            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-3.5 rounded-xl transition-all">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Authenticating…</> : <>Enter Command Center <ArrowRight className="w-4 h-4" /></>}
          </button>

          <div className="bg-white/5 border border-white/8 rounded-xl px-4 py-3">
            <p className="text-xs text-white/30 font-semibold mb-1 flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-[#FFC400]" /> Demo credentials
            </p>
            <p className="text-xs text-white/40 font-mono">admin@civicresolve.ai / admin123</p>
          </div>
        </form>
      </div>
    </div>
  );
}
