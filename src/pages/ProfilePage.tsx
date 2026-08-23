import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Mail, Phone, LogOut, Loader2, CheckCircle, Edit2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getMe, updateProfile } from '../services/authService';
import { useNavigate } from 'react-router-dom';
import { useToast, ToastContainer } from '../components/Toast';
import PageTransition from '../components/PageTransition';
import { useCitizenComplaints } from '../hooks/useComplaints';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import AnimatedNumber from '../components/AnimatedNumber';
import { buttonGestures, cardGestures } from '../utils/motion';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toasts, addToast, dismissToast } = useToast();
  const { complaints } = useCitizenComplaints();
  const [profile, setProfile] = useState({ full_name: user?.full_name ?? '', phone: '' });
  const [editing, setEditing]  = useState(false);
  const [saving, setSaving]    = useState(false);

  useEffect(() => {
    getMe().then((p) => setProfile({ full_name: p.full_name, phone: p.phone ?? '' })).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({ full_name: profile.full_name, phone: profile.phone });
      setEditing(false);
      addToast('Profile updated!', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Update failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/'); };

  const resolved = complaints.filter((c) => ['Resolved','Closed'].includes(c.status)).length;

  return (
    <PageTransition className="min-h-screen bg-[#070707] pt-20 pb-12 px-4 sm:px-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="max-w-lg mx-auto space-y-4">

        <h1 className="text-2xl font-black text-white mb-6 font-display">My Profile</h1>

        {/* Avatar card */}
        <motion.div {...cardGestures} className="card flex items-center gap-4 shadow-xl">
          <div className="w-14 h-14 bg-[#E10600]/10 border border-[#E10600]/20 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md">
            <span className="text-2xl font-black text-[#E10600] font-display">
              {profile.full_name?.charAt(0).toUpperCase() ?? 'C'}
            </span>
          </div>
          <div>
            <p className="font-black text-white text-lg font-display">{profile.full_name}</p>
            <p className="text-sm text-white/50 font-mono">{user?.email}</p>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/20 px-2 py-0.5 rounded-full uppercase tracking-wide font-mono">
              Citizen
            </span>
          </div>
        </motion.div>

        {/* Stats */}
        <StaggerContainer className="grid grid-cols-3 gap-3">
          {[
            { label: 'Reported',  value: complaints.length, color: 'text-white' },
            { label: 'Active',    value: complaints.length - resolved, color: 'text-[#FFC400]' },
            { label: 'Resolved',  value: resolved, color: 'text-[#22C55E]' },
          ].map((s) => (
            <StaggerItem key={s.label}>
              <motion.div {...cardGestures} className="telemetry-card text-center h-full">
                <p className={`text-2xl font-black tabular-nums font-display ${s.color}`}>
                  <AnimatedNumber value={s.value} />
                </p>
                <p className="text-xs text-white/50 mt-0.5 font-mono">{s.label}</p>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Edit form */}
        <div className="card space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-white font-display">Account Details</h2>
            {!editing && (
              <motion.button
                {...buttonGestures}
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-sm text-[#E10600] hover:text-[#FF1A14] font-semibold transition-colors font-mono"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </motion.button>
            )}
          </div>

          <div>
            <label className="label flex items-center gap-1.5 font-mono"><User className="w-3.5 h-3.5" />Full Name</label>
            {editing ? (
              <input value={profile.full_name} onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
                className="input-field font-sans" />
            ) : (
              <p className="text-white font-medium py-3 px-4 bg-[#242424] border border-white/8 rounded-xl font-display">{profile.full_name}</p>
            )}
          </div>

          <div>
            <label className="label flex items-center gap-1.5 font-mono"><Mail className="w-3.5 h-3.5" />Email</label>
            <p className="text-white/50 font-medium py-3 px-4 bg-[#1a1a1a] border border-white/5 rounded-xl text-sm font-mono">
              {user?.email} <span className="text-white/30">(cannot change)</span>
            </p>
          </div>

          <div>
            <label className="label flex items-center gap-1.5 font-mono"><Phone className="w-3.5 h-3.5" />Phone</label>
            {editing ? (
              <input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+91 98765 43210" className="input-field font-mono" />
            ) : (
              <p className="text-white font-medium py-3 px-4 bg-[#242424] border border-white/8 rounded-xl font-mono">
                {profile.phone || <span className="text-white/30">Not added</span>}
              </p>
            )}
          </div>

          {editing && (
            <div className="flex gap-3">
              <motion.button
                {...buttonGestures}
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex-1 justify-center py-3 font-display font-bold"
              >
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : <><CheckCircle className="w-4 h-4" />Save Changes</>}
              </motion.button>
              <motion.button {...buttonGestures} onClick={() => setEditing(false)} className="btn-secondary px-5 font-mono">
                Cancel
              </motion.button>
            </div>
          )}
        </div>

        {/* Logout */}
        <motion.button
          {...buttonGestures}
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-white/8 text-white/50 hover:text-white hover:border-[#E10600]/30 hover:bg-[#E10600]/5 transition-colors font-semibold text-sm font-display"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </motion.button>
      </div>
    </PageTransition>
  );
}
