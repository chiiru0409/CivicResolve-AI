import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Search, Filter, ArrowRight, MapPin } from 'lucide-react';
import { useCitizenComplaints } from '../hooks/useComplaints';
import PriorityBadge from '../components/PriorityBadge';
import StatusBadge from '../components/StatusBadge';
import PageTransition from '../components/PageTransition';
import SkeletonCard from '../components/SkeletonCard';
import { formatDate, getCategoryEmoji, truncate } from '../utils/helpers';
import type { Complaint } from '../types';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import { cardGestures, buttonGestures } from '../utils/motion';

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
    <PageTransition className="min-h-screen bg-[#070707] pt-20 pb-12 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white font-display">My Complaints</h1>
            <p className="text-white/50 text-sm mt-0.5 font-mono">{complaints.length} total complaint{complaints.length !== 1 ? 's' : ''}</p>
          </div>
          <Link to="/report">
            <motion.div {...buttonGestures} className="btn-primary flex items-center gap-1.5 font-mono">
              <Plus className="w-4 h-4" />
              <span>New</span>
            </motion.div>
          </Link>
        </div>

        {/* Tabs + search */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="flex bg-[#111] border border-white/8 rounded-xl p-1 gap-0.5 relative">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-colors font-mono z-10 ${
                  tab === t.key ? 'text-white' : 'text-white/40 hover:text-white'
                }`}
              >
                {tab === t.key && (
                  <motion.div
                    layoutId="active-complaints-tab"
                    className="absolute inset-0 bg-[#E10600] rounded-lg shadow-md shadow-[#E10600]/20 -z-10"
                    transition={{ type: 'spring', damping: 24, stiffness: 300 }}
                  />
                )}
                <span>{t.label}</span>
                <span className={`ml-1.5 text-xs ${tab === t.key ? 'text-white/80' : 'text-white/25'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search complaints…"
              className="input-field pl-9 py-2 text-sm font-sans"
            />
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">{[0,1,2,3].map((i) => <SkeletonCard key={i} lines={2} />)}</div>
        ) : error ? (
          <div className="card text-center py-12">
            <p className="text-white/50 font-mono">{error}</p>
            <button onClick={refetch} className="btn-secondary mt-4 font-mono">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center py-16">
            <p className="text-3xl mb-3">📋</p>
            <p className="text-white/50 font-medium font-sans">{search ? 'No complaints match your search.' : 'No complaints yet.'}</p>
            {!search && (
              <Link to="/report" className="inline-block mt-5">
                <motion.div {...buttonGestures} className="btn-primary inline-flex items-center gap-2 font-display">
                  <Plus className="w-4 h-4" />
                  <span>Report an Issue</span>
                </motion.div>
              </Link>
            )}
          </div>
        ) : (
          <StaggerContainer className="space-y-3">
            {filtered.map((c: Complaint) => {
              const borderLeft = ['HIGH', 'CRITICAL'].includes(c.priority)
                ? 'border-l-2 border-l-[#E10600]'
                : c.priority === 'MEDIUM'
                ? 'border-l-2 border-l-[#FFC400]'
                : 'border-l-2 border-l-[#22C55E]';

              return (
                <StaggerItem key={c.id}>
                  <Link to={`/track?id=${c.id}`}>
                    <motion.div
                      {...cardGestures}
                      className={`card hover:border-white/20 transition-colors flex items-center gap-4 group ${borderLeft}`}
                    >
                      <span className="text-2xl flex-shrink-0">{getCategoryEmoji(c.category)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate font-display">{truncate(c.title, 55)}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-white/40 font-mono">
                          <span className="text-[#E10600] font-bold">{c.id}</span>
                          {c.location && <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 flex-shrink-0" />{c.location.split(',')[0]}</span>}
                          <span>{formatDate(c.submittedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <PriorityBadge priority={c.priority} size="sm" />
                        <StatusBadge status={c.status} size="sm" />
                      </div>
                      <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/60 flex-shrink-0 transition-colors" />
                    </motion.div>
                  </Link>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        )}
      </div>
    </PageTransition>
  );
}
