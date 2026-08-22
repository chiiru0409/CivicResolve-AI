import React, { useEffect, useState } from 'react';
import { Building2, Phone, Users, MapPin } from 'lucide-react';
import { api } from '../../services/api';
import type { Department } from '../../types';

export default function AdminDepartmentsPage() {
  const [depts, setDepts] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Department[]>('/admin/departments')
      .then(setDepts)
      .catch((err) => console.warn('Could not load departments:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-black text-white">Departments</h1>
        <p className="text-white/40 text-sm mt-0.5">All municipal departments and their zones</p>
      </div>
      <div className="speed-line" />
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
    </div>
  );
}
