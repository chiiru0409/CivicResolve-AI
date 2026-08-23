import React, { useEffect, useState, useCallback } from 'react';
import { Building2, Phone, Users, MapPin, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import type { Department } from '../../types';
import SkeletonCard from '../../components/SkeletonCard';

export default function AdminDepartmentsPage() {
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDepartments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Department[]>('/admin/departments');
      setDepts(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load municipal departments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Municipal Departments</h1>
          <p className="text-white/40 text-sm mt-0.5">Authoritative municipal operational divisions and zone jurisdiction</p>
        </div>
        <button
          onClick={() => void loadDepartments()}
          disabled={loading}
          className="flex items-center gap-2 text-xs font-semibold text-white/80 bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 rounded-xl transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#E10600]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="speed-line" />

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
          <SkeletonCard lines={6} />
        </div>
      ) : error ? (
        <div className="card text-center py-16 bg-[#111] border-white/10 rounded-3xl space-y-4 shadow-xl">
          <AlertTriangle className="w-10 h-10 text-[#FFC400] mx-auto" />
          <p className="text-xl font-bold text-white">Unable to Load Department Hierarchy</p>
          <p className="text-white/50 text-sm max-w-md mx-auto">{error}</p>
          <button
            onClick={() => void loadDepartments()}
            className="btn-primary py-2 px-4 text-xs font-bold inline-flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
          </button>
        </div>
      ) : depts.length === 0 ? (
        <div className="card text-center py-16 bg-[#111] border-white/10 rounded-3xl space-y-2">
          <Building2 className="w-10 h-10 text-white/20 mx-auto" />
          <p className="text-white font-bold">No Departments Configured</p>
          <p className="text-white/40 text-xs">Municipal department hierarchy will be auto-seeded from database.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {depts.map((d) => (
            <div key={d.id} className="card hover:border-white/15 transition-all">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#E10600]/10 border border-[#E10600]/15">
                  <Building2 className="w-5 h-5 text-[#E10600]" />
                </div>
                <div>
                  <h3 className="font-black text-white leading-tight">{d.name}</h3>
                  <p className="text-xs text-white/40 mt-0.5">{d.shortName}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {d.categories.map((cat) => (
                  <span key={cat} className="text-xs bg-white/5 border border-white/8 text-white/50 px-2.5 py-1 rounded-full">{cat}</span>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-white/50">
                  <Users className="w-4 h-4 text-[#FFC400] flex-shrink-0" />
                  <span><strong className="text-white">{d.head}</strong> · Head</span>
                </div>
                <div className="flex items-center gap-2 text-white/50">
                  <Phone className="w-4 h-4 text-[#FFC400] flex-shrink-0" />
                  <span>{d.contact}</span>
                </div>
                <div className="flex items-start gap-2 text-white/50">
                  <MapPin className="w-4 h-4 text-[#E10600] mt-0.5 flex-shrink-0" />
                  <span>{d.zones.join(', ')}</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-white/8">
                <p className="text-xs font-bold text-white/30 mb-2 uppercase tracking-wider">Teams</p>
                <div className="flex flex-wrap gap-1.5">
                  {d.teams.map((t) => (
                    <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-[#E10600]/10 border border-[#E10600]/15 text-[#E10600] font-semibold">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
