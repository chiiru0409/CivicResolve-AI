import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Loader2, ArrowRight, Mail, Lock, Eye, EyeOff, Zap, Shield } from 'lucide-react';
import { adminLogin } from '../../services/authService';
import { useAuth } from '../../hooks/useAuth';
import { useToast, ToastContainer } from '../../components/Toast';
import EagleEyeLogo from '../../components/EagleEyeLogo';
import PageTransition from '../../components/PageTransition';
import { buttonGestures } from '../../utils/motion';

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
    const cleanEmail = email.trim().toLowerCase();
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
    <PageTransition>
      <div className="min-h-screen bg-[#070707] flex items-center justify-center px-4">
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <motion.div
              whileHover={{ rotate: 5, scale: 1.05 }}
              className="inline-flex items-center justify-center w-14 h-14 bg-[#141414] border border-white/12 rounded-2xl mb-4 p-2 shadow-lg shadow-[#E10600]/15"
            >
              <EagleEyeLogo size={36} />
            </motion.div>
            <h1 className="text-2xl font-black text-white font-display">Civic Command Center</h1>
            <p className="text-white/40 text-sm mt-1 font-mono">Authority access — restricted</p>
          </div>

          <form onSubmit={handleSubmit} className="card space-y-4 shadow-2xl relative" noValidate>
            {/* Top accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#E10600] to-transparent rounded-t-2xl" />

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
              <label htmlFor="admin-email" className="label font-mono">Authority Email</label>
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
                  className="input-field pl-10 font-mono"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="label font-mono">Password</label>
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
              className="w-full flex items-center justify-center gap-2 bg-[#E10600] hover:bg-[#FF1A14] text-white font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-[#E10600]/20 font-display"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating…</span>
                </>
              ) : (
                <>
                  <span>Enter Command Center</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </PageTransition>
  );
}
