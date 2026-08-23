import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Eye, EyeOff, Loader2, ArrowRight, User, Mail, Phone, Lock } from 'lucide-react';
import { register } from '../services/authService';
import { useAuth } from '../hooks/useAuth';
import { useToast, ToastContainer } from '../components/Toast';
import PageTransition from '../components/PageTransition';
import EagleEyeLogo from '../components/EagleEyeLogo';
import { buttonGestures } from '../utils/motion';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { onLoginSuccess } = useAuth();
  const { toasts, addToast, dismissToast } = useToast();

  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.full_name.trim().length < 2) e.full_name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email.';
    if (form.password.length < 6) e.password = 'Password must be at least 6 characters.';
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await register({
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
      });
      onLoginSuccess(res);
      addToast('Account created! Welcome to CivicResolve.', 'success');
      setTimeout(() => navigate('/dashboard'), 800);
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'Registration failed.';
      const isDuplicate = msg.includes('EMAIL_ALREADY_REGISTERED') || msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('already registered');
      if (isDuplicate) {
        msg = 'Account already exists. This email is already registered. Please sign in.';
        addToast(msg, 'warning');
      } else {
        addToast(msg, 'error');
      }
      setServerError(msg);
    } finally {
      setLoading(false);
    }
  };

  const field = (key: keyof typeof form, val: string) => {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: '' }));
    if (serverError) setServerError('');
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

          {/* Brand */}
          <div className="text-center mb-8">
            <motion.div
              whileHover={{ rotate: 5, scale: 1.05 }}
              className="inline-flex items-center justify-center w-14 h-14 bg-[#141414] border border-white/12 rounded-2xl mb-4 p-2 shadow-lg shadow-[#E10600]/10"
            >
              <EagleEyeLogo size={36} />
            </motion.div>
            <h1 className="text-2xl font-black text-white font-display">Create Account</h1>
            <p className="text-white/50 text-sm mt-1 font-sans">Join CivicResolve AI — report issues, track resolutions.</p>
          </div>

          <form onSubmit={handleSubmit} className="card space-y-4 shadow-2xl" noValidate>
            {serverError && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-[#E10600]/10 border border-[#E10600]/30 rounded-2xl text-sm text-[#E10600] flex flex-col gap-2 font-medium"
              >
                <p className="font-semibold text-white/90">{serverError}</p>
                {(serverError.toLowerCase().includes('already') || serverError.toLowerCase().includes('sign in')) && (
                  <Link
                    to="/login"
                    className="btn-primary py-2 px-3 text-xs font-bold justify-center text-center mt-1 font-mono"
                  >
                    Go to Sign In →
                  </Link>
                )}
              </motion.div>
            )}
            {/* Full name */}
            <div>
              <label className="label font-mono">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input value={form.full_name} onChange={(e) => field('full_name', e.target.value)}
                  placeholder="Your full name" autoComplete="name"
                  className={`input-field pl-10 ${errors.full_name ? 'border-[#E10600]' : ''}`} />
              </div>
              {errors.full_name && <p className="text-xs text-[#E10600] mt-1 font-mono">{errors.full_name}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="label font-mono">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input type="email" value={form.email} onChange={(e) => field('email', e.target.value)}
                  placeholder="you@email.com" autoComplete="email"
                  className={`input-field pl-10 font-mono ${errors.email ? 'border-[#E10600]' : ''}`} />
              </div>
              {errors.email && <p className="text-xs text-[#E10600] mt-1 font-mono">{errors.email}</p>}
            </div>

            {/* Phone */}
            <div>
              <label className="label font-mono">Phone <span className="text-white/30 font-normal">(optional)</span></label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input type="tel" value={form.phone} onChange={(e) => field('phone', e.target.value)}
                  placeholder="+91 98765 43210" autoComplete="tel"
                  className="input-field pl-10 font-mono" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="label font-mono">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input type={showPw ? 'text' : 'password'} value={form.password}
                  onChange={(e) => field('password', e.target.value)}
                  placeholder="Min. 6 characters" autoComplete="new-password"
                  className={`input-field pl-10 pr-10 font-mono ${errors.password ? 'border-[#E10600]' : ''}`} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-[#E10600] mt-1 font-mono">{errors.password}</p>}
            </div>

            {/* Confirm */}
            <div>
              <label className="label font-mono">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input type={showPw ? 'text' : 'password'} value={form.confirm}
                  onChange={(e) => field('confirm', e.target.value)}
                  placeholder="Repeat password" autoComplete="new-password"
                  className={`input-field pl-10 ${errors.confirm ? 'border-[#E10600]' : ''}`} />
              </div>
              {errors.confirm && <p className="text-xs text-[#E10600] mt-1 font-mono">{errors.confirm}</p>}
            </div>

            <motion.button
              {...buttonGestures}
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3.5 glow-red-sm mt-2 font-display font-bold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating account…</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>

            <p className="text-center text-sm text-white/40 font-sans">
              Already have an account?{' '}
              <Link to="/login" className="text-[#E10600] hover:text-[#FF1A14] font-semibold transition-colors font-mono">Sign in</Link>
            </p>
          </form>
        </motion.div>
      </div>
    </PageTransition>
  );
}
