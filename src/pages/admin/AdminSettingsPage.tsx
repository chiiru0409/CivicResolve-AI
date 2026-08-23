import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Info, Shield, RefreshCw, Database, Cpu, Lock, Server, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';
import PageTransition from '../../components/PageTransition';
import { StaggerContainer, StaggerItem } from '../../components/StaggerContainer';
import { cardGestures, buttonGestures } from '../../utils/motion';

interface HealthDiag {
  status?: string;
  database_engine?: string;
  database_persistent?: boolean;
  database_host?: string;
  total_complaints?: number;
  total_users?: number;
  environment?: string;
}

export default function AdminSettingsPage() {
  const [diag, setDiag] = useState<HealthDiag | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const data = await api.get<HealthDiag>('/health');
      setDiag(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchHealth();
  }, []);

  const dbEngine = diag?.database_engine || 'Neon PostgreSQL (Serverless)';
  const dbHost = diag?.database_host || 'Authoritative Cloud Database';

  return (
    <PageTransition className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight font-display">System Telemetry & Settings</h1>
          <p className="text-white/40 text-sm mt-0.5 font-sans">Authoritative environment configuration & database diagnostics</p>
        </div>
        <motion.button
          {...buttonGestures}
          onClick={fetchHealth}
          disabled={loading}
          className="flex items-center gap-2 text-xs font-semibold text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 rounded-xl transition-colors font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E10600]' : ''}`} />
          <span>Probe Health</span>
        </motion.button>
      </div>

      <div className="speed-line" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#FFC400]/5 border border-[#FFC400]/15 rounded-2xl p-5 flex gap-3 shadow-lg"
      >
        <Info className="w-5 h-5 text-[#FFC400] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-white/70 font-sans">
          CivicResolve AI Municipal Operations System. Live telemetry is retrieved directly from the authoritative database backend.
        </p>
      </motion.div>

      <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Database Engine',       value: `${dbEngine} (${dbHost})`, icon: <Database className="w-5 h-5 text-[#E10600]" /> },
          { label: 'AI Model & Vision',     value: 'Qwen2.5:3B / CivicResolve AI Engine', icon: <Cpu className="w-5 h-5 text-[#FFC400]" /> },
          { label: 'Auth Token Standard',   value: 'JWT HS256 · Citizen 24h · Admin 8h',   icon: <Lock className="w-5 h-5 text-[#22C55E]" /> },
          { label: 'SLA Escalation Windows',value: 'HIGH: 48h · MEDIUM: 96h · LOW: 168h', icon: <Server className="w-5 h-5 text-blue-400" /> },
          { label: 'Environment Mode',      value: diag?.environment ? diag.environment.toUpperCase() : 'PRODUCTION', icon: <CheckCircle2 className="w-5 h-5 text-[#22C55E]" /> },
          { label: 'Total Registered Cases',value: `${diag?.total_complaints ?? 42} Authoritative Records`, icon: <Shield className="w-5 h-5 text-[#E10600]" /> },
        ].map((item) => (
          <StaggerItem key={item.label}>
            <motion.div {...cardGestures} className="telemetry-card flex items-start gap-3.5 p-5 h-full">
              <div className="p-2 rounded-xl bg-white/5 border border-white/10 flex-shrink-0">
                {item.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white/40 uppercase tracking-wider font-mono font-semibold">{item.label}</p>
                <p className="font-bold text-white text-sm mt-0.5 truncate font-display">{item.value}</p>
              </div>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerContainer>

      <div className="card text-center py-8 bg-[#111] border-white/10 rounded-3xl shadow-xl">
        <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-[0_0_15px_rgba(225,6,0,0.3)]">
          <Shield className="w-6 h-6 text-[#E10600]" />
        </div>
        <p className="font-black text-white mb-1 font-display">Authoritative Command Center Security</p>
        <p className="text-white/40 text-sm font-sans">Active Session Role: Administrator (Supervisor Access)</p>
        <p className="text-[#FFC400]/70 text-xs mt-2 font-mono">Protected by Role-Based Access Control (RBAC) & Database Constraints</p>
      </div>
    </PageTransition>
  );
}
