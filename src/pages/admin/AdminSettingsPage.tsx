import React from 'react';
import { Info, Zap, Shield } from 'lucide-react';

export default function AdminSettingsPage() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-black text-white">Settings</h1>
        <p className="text-white/40 text-sm mt-0.5">System configuration</p>
      </div>
      <div className="speed-line" />
      <div className="bg-[#FFC400]/5 border border-[#FFC400]/15 rounded-2xl p-5 flex gap-3">
        <Info className="w-5 h-5 text-[#FFC400] flex-shrink-0 mt-0.5" />
        <p className="text-sm text-white/50">This is an SIH 2026 demo. Full settings configuration would be available here in production.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {[
          { label: 'AI Model',              value: 'CivicResolve AI Engine (Keyword NLP)', icon: '🤖' },
          { label: 'Escalation Thresholds', value: 'HIGH: 48h · MEDIUM: 96h · LOW: 168h', icon: '⏱️' },
          { label: 'Database',              value: 'SQLite · database/civic.db',            icon: '🗄️' },
          { label: 'Auth Method',           value: 'JWT HS256 · Citizen 24h · Admin 8h',   icon: '🔐' },
          { label: 'Backend',               value: 'FastAPI + Uvicorn · Port 8000',         icon: '⚡' },
          { label: 'Status',                value: 'All systems operational',               icon: '✅' },
        ].map((item) => (
          <div key={item.label} className="telemetry-card flex items-center gap-3">
            <span className="text-2xl">{item.icon}</span>
            <div>
              <p className="text-xs text-white/30 uppercase tracking-wide font-semibold">{item.label}</p>
              <p className="font-semibold text-white text-sm">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="card text-center py-8">
        <div className="w-12 h-12 bg-white/5 border border-white/8 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Shield className="w-6 h-6 text-white/50" />
        </div>
        <p className="font-black text-white mb-1">Default Admin Credentials</p>
        <p className="text-white/40 text-sm">admin@civicresolve.ai · admin123</p>
        <p className="text-[#FFC400]/60 text-xs mt-2">Change via ADMIN_EMAIL / ADMIN_PASSWORD environment variables before production.</p>
      </div>
    </div>
  );
}
