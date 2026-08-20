import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Filter, ArrowRight, MapPin } from 'lucide-react';
import { useCitizenComplaints } from '../hooks/useComplaints';
import PriorityBadge from '../components/PriorityBadge';
import StatusBadge from '../components/StatusBadge';
import PageTransition from '../components/PageTransition';
import SkeletonCard from '../components/SkeletonCard';
import { formatDate, getCategoryEmoji, truncate } from '../utils/helpers';
import type { Complaint } from '../types';

type Tab = 'all' | 'active' | 'resolved';

export default function MyComplaintsPage() {
  const { complaints, loading, error, refetch } = useCitizenComplaints();
  const [search, setSearch] = useState('');
  const [tab, setTab]       = useState<Tab>('all');

  const filtered = complaints.filter((c) => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase());
    const matchTab    = tab === 'all' ? true :
                        tab === 'active'   ? !['Resolved','Closed'].includes(c.status) :
                        ['Resolved','Closed'].includes(c.status);
    return matchSearch && matchTab;
  });

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all',      label: 'All',      count: complaints.length },
    { key: 'active',   label: 'Active',   count: complaints.filter((c) => !['Resolved','Closed'].includes(c.status)).length },
    { key: 'resolved', label: 'Resolved', count: complaints.filter((c) => ['Resolved','Closed'].includes(c.status)).length },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen bg-[#070707] pt-20 pb-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white">My Complaints</h1>
              <p className="text-white/50 text-sm mt-0.5">{complaints.length} total complaint{complaints.length !== 1 ? 's' : ''}</p>
            </div>
            <Link to="/report" className="btn-primary">
              <Plus className="w-4 h-4" /> New
            </Link>
          </div>

          {/* Tabs + search */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex bg-[#111] border border-white/8 rounded-xl p-1 gap-0.5">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    tab === t.key ? 'bg-[#E10600] text-white' : 'text-white/40 hover:text-white'
                  }`}>
                  {t.label}
                  <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-white/70' : 'text-white/25'}`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search complaints…" className="input-field pl-9 py-2 text-sm" />
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-3">{[0,1,2,3].map((i) => <SkeletonCard key={i} lines={2} />)}</div>
          ) : error ? (
            <div className="card text-center py-12">
              <p className="text-white/50">{error}</p>
              <button onClick={refetch} className="btn-secondary mt-4">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="card text-center py-16">
              <p className="text-3xl mb-3">📋</p>
              <p className="text-white/50 font-medium">{search ? 'No complaints match your search.' : 'No complaints yet.'}</p>
              {!search && (
                <Link to="/report" className="btn-primary mt-5 inline-flex">
                  <Plus className="w-4 h-4" /> Report an Issue
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((c: Complaint) => {
                const borderLeft = ['HIGH', 'CRITICAL'].includes(c.priority)
                  ? 'border-l-2 border-l-[#E10600]'
                  : c.priority === 'MEDIUM'
                  ? 'border-l-2 border-l-[#FFC400]'
                  : 'border-l-2 border-l-[#22C55E]';

                return (
                  <Link key={c.id} to={`/track?id=${c.id}`}
                    className={`card hover:border-white/20 transition-all flex items-center gap-4 group ${borderLeft}`}>
                    <span className="text-2xl flex-shrink-0">{getCategoryEmoji(c.category)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">{truncate(c.title, 55)}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-white/40">
                        <span className="font-mono text-[#E10600] font-bold">{c.id}</span>
                        {c.location && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 flex-shrink-0" />{c.location.split(',')[0]}</span>}
                        <span>{formatDate(c.submittedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <PriorityBadge priority={c.priority} size="sm" />
                      <StatusBadge status={c.status} size="sm" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/60 flex-shrink-0 transition-colors" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
