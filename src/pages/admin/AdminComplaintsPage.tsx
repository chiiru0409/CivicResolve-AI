import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronDown, X, Eye, MapPin } from 'lucide-react';
import PriorityBadge from '../../components/PriorityBadge';
import StatusBadge from '../../components/StatusBadge';
import { useAdminComplaints } from '../../hooks/useComplaints';
import { SkeletonTable } from '../../components/SkeletonCard';
import { formatDateTime, getCategoryEmoji, truncate } from '../../utils/helpers';

const CATS = ['All','Roads','Garbage','Drainage','Water','Streetlights','Infrastructure','Other'];
const PRIS = ['All','HIGH','MEDIUM','LOW'];
const STATS = ['All','Submitted','Routed','Assigned','In Progress','Resolved','Escalated'];

export default function AdminComplaintsPage() {
  const [search, setSearch]   = useState('');
  const [cat, setCat]         = useState('All');
  const [pri, setPri]         = useState('All');
  const [stat, setStat]       = useState('All');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('admin-search-input')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filters: Record<string,string> = {};
  if (search) filters.search   = search;
  if (cat !== 'All') filters.category = cat;
  if (pri !== 'All') filters.priority = pri;
  if (stat !== 'All') filters.status  = stat;

  const { complaints, total, loading } = useAdminComplaints(filters);
  const hasFilters = search || cat !== 'All' || pri !== 'All' || stat !== 'All';

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-black text-white">Complaint Management</h1>
        <p className="text-white/40 text-sm mt-0.5">{total} complaints total · {complaints.length} shown</p>
      </div>
      <div className="speed-line" />

      {/* Filters */}
      <div className="bg-[#111] border border-white/8 rounded-2xl p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            id="admin-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search complaints…"
            className="input-field pl-9 pr-14 py-2 text-sm"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 pointer-events-none">
            <kbd className="kbd-badge">/</kbd>
          </div>
        </div>
        {([['Category', CATS, cat, setCat, 'w-36'], ['Priority', PRIS, pri, setPri, 'w-32'], ['Status', STATS, stat, setStat, 'w-36']] as const).map(
          ([label, opts, val, setter, w]) => (
            <div key={label} className={`relative ${w}`}>
              <select value={val} onChange={(e) => setter(e.target.value)}
                className="input-field appearance-none pr-8 py-2 text-sm w-full">
                {opts.map((o) => <option key={o} value={o} className="bg-[#181818] text-white">{o === 'All' ? label : o}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            </div>
          )
        )}
        {hasFilters && (
          <button onClick={() => { setSearch(''); setCat('All'); setPri('All'); setStat('All'); }}
            className="flex items-center gap-1.5 text-sm text-white/40 hover:text-[#E10600] px-3 py-2 rounded-xl hover:bg-[#E10600]/5 transition-all">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {loading ? <SkeletonTable rows={6} /> : (
        <div className="bg-[#111] border border-white/8 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8 bg-white/5">
                  {['ID','Issue','Category','Source','Location','Priority','Status','Submitted','Action'].map((h) => (
                    <th key={h} className="text-left text-[11px] font-black text-white/40 uppercase tracking-wider px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {complaints.map((c) => {
                  const borderLeft = ['HIGH', 'CRITICAL'].includes(c.priority)
                    ? 'border-l-2 border-l-[#E10600]'
                    : c.priority === 'MEDIUM'
                    ? 'border-l-2 border-l-[#FFC400]'
                    : 'border-l-2 border-l-[#22C55E]';

                  return (
                    <tr key={c.id}
                      className={`hover:bg-white/6 transition-colors duration-100 ${borderLeft}`}>
                      <td className="px-4 py-3">
                        <span className="text-xs font-black font-mono text-[#E10600]">{c.id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base flex-shrink-0">{getCategoryEmoji(c.category)}</span>
                          <span className="text-sm font-semibold text-white">{truncate(String(c.title ?? ''), 38)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-white/50">{c.category}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          c.source === 'AI Call'
                            ? 'bg-[#FFC400]/10 text-[#FFC400] border-[#FFC400]/25'
                            : 'bg-white/5 text-white/40 border-white/10'
                        }`}>
                          {c.source === 'AI Call' ? '📞 AI Call' : '🌐 Web'}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-xs text-white/40">
                          <MapPin className="w-3 h-3 text-[#E10600]" />
                          <span>{truncate(String(c.location ?? ''), 22)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={c.priority} size="sm" /></td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} size="sm" /></td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-xs text-white/30">{formatDateTime(c.submittedAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/admin/complaints/${c.id}`}
                          className="flex items-center gap-1.5 text-xs font-bold text-[#E10600] hover:text-white bg-[#E10600]/10 hover:bg-[#E10600] px-2.5 py-1.5 rounded-lg transition-all">
                          <Eye className="w-3.5 h-3.5" /> View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {complaints.length === 0 && (
                  <tr><td colSpan={9} className="py-12 text-center text-white/40">No complaints match filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
