import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, ChevronDown, X, Eye, MapPin, Sparkles,
  AlertTriangle, Shield, Clock, CheckCircle, ArrowUpRight, Loader2
} from 'lucide-react';
import PriorityBadge from '../../components/PriorityBadge';
import StatusBadge from '../../components/StatusBadge';
import { useAdminComplaints } from '../../hooks/useComplaints';
import { SkeletonTable } from '../../components/SkeletonCard';
import { formatDateTime, getCategoryEmoji, truncate } from '../../utils/helpers';
import { api } from '../../services/api';

const CATS = ['All', 'Roads', 'Garbage', 'Drainage', 'Water', 'Streetlights', 'Infrastructure', 'Other'];
const PRIS = ['All', 'HIGH', 'MEDIUM', 'LOW'];
const STATS = ['All', 'Submitted', 'AI_Analysis', 'Routed', 'Assigned', 'In Progress', 'Inspection', 'Resolved', 'Closed', 'Escalated'];

interface AIAnalysis {
  complaint_id: string;
  title: string;
  category: string;
  subcategory?: string;
  priority: string;
  severity: number;
  department: string;
  assigned_team?: string;
  location?: string;
  risk_assessment: string;
  urgency_reasoning: string;
  recommended_action: string;
  estimated_response: string;
  similar_reports_count: number;
  similar_reports: Array<{
    id: string;
    complaint_number: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    location: string;
    created_at: string;
  }>;
  ai_confidence: number;
}

export default function AdminComplaintsPage() {
  const [search, setSearch]   = useState('');
  const [cat, setCat]         = useState('All');
  const [pri, setPri]         = useState('All');
  const [stat, setStat]       = useState('All');

  // AI Diagnostic Modal state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        document.getElementById('admin-search-input')?.focus();
      }
      if (e.key === 'Escape' && selectedId) {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId]);

  const openAIDiagnostic = async (id: string) => {
    setSelectedId(id);
    setAnalysis(null);
    setAnalysisLoading(true);
    try {
      const data = await api.get<AIAnalysis>(`/admin/ai/analysis/${encodeURIComponent(id)}`);
      setAnalysis(data);
    } catch (err) {
      console.warn('AI analysis load failed:', err);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const filters: Record<string, string> = {};
  if (search) filters.search   = search;
  if (cat !== 'All') filters.category = cat;
  if (pri !== 'All') filters.priority = pri;
  if (stat !== 'All') filters.status  = stat;

  const { complaints, total, loading, error, refetch } = useAdminComplaints(filters);
  const hasFilters = search || cat !== 'All' || pri !== 'All' || stat !== 'All';

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-mono text-[#FFC400] bg-[#FFC400]/10 border border-[#FFC400]/25 px-3 py-1 rounded-full mb-2 uppercase tracking-wider">
          <Shield className="w-3.5 h-3.5" />
          <span>Incident Queue & Triage</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">Complaint Management</h1>
        <p className="text-white/40 text-sm mt-0.5">{total} complaints in system · {complaints.length} matched active filter</p>
      </div>

      <div className="speed-line" />

      {/* Filters */}
      <div className="bg-[#111] border border-white/8 rounded-2xl p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            id="admin-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search complaint ID, issue title, or location…"
            className="input-field pl-10 pr-14 py-2.5 text-sm"
          />
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1 pointer-events-none">
            <kbd className="kbd-badge">/</kbd>
          </div>
        </div>
        {([['Category', CATS, cat, setCat, 'w-36'], ['Priority', PRIS, pri, setPri, 'w-32'], ['Status', STATS, stat, setStat, 'w-36']] as const).map(
          ([label, opts, val, setter, w]) => (
            <div key={label} className={`relative ${w}`}>
              <select value={val} onChange={(e) => setter(e.target.value)}
                className="input-field appearance-none pr-8 py-2.5 text-sm w-full">
                {opts.map((o) => <option key={o} value={o} className="bg-[#181818] text-white">{o === 'All' ? label : o}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            </div>
          )
        )}
        {hasFilters && (
          <button onClick={() => { setSearch(''); setCat('All'); setPri('All'); setStat('All'); }}
            className="flex items-center gap-1.5 text-sm text-white/40 hover:text-[#E10600] px-3.5 py-2.5 rounded-xl hover:bg-[#E10600]/5 transition-all">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={6} />
      ) : error ? (
        <div className="card text-center py-16 bg-[#111] border-white/10 rounded-3xl space-y-4 shadow-xl">
          <p className="text-xl font-bold text-white">Unable to Load Incidents</p>
          <p className="text-white/50 text-sm max-w-md mx-auto">{error}</p>
          <button onClick={() => void refetch()} className="btn-primary py-2.5 px-5 text-sm font-semibold mx-auto inline-flex items-center gap-2">
            Retry Connection
          </button>
        </div>
      ) : (
        <div className="bg-[#0E0E0E] border border-white/8 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/8 bg-white/4">
                  {['ID', 'Issue', 'Category', 'Source', 'Location', 'Priority', 'Status', 'Submitted', 'Actions'].map((h) => (
                    <th key={h} className="text-left text-[11px] font-black text-white/40 uppercase tracking-wider px-4 py-3.5 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {complaints.map((c) => {
                  const borderLeft = ['HIGH', 'CRITICAL'].includes(c.priority)
                    ? 'border-l-4 border-l-[#E10600]'
                    : c.priority === 'MEDIUM'
                    ? 'border-l-4 border-l-[#FFC400]'
                    : 'border-l-4 border-l-[#22C55E]';

                  return (
                    <tr key={c.id} className={`hover:bg-white/4 transition-colors duration-100 ${borderLeft}`}>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-black font-mono text-[#E10600]">{c.id}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base flex-shrink-0 p-1 bg-white/5 rounded-lg">{getCategoryEmoji(c.category)}</span>
                          <span className="text-sm font-semibold text-white">{truncate(String(c.title || c.description || 'Civic Incident'), 36)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="text-xs text-white/60 font-medium">{c.category}</span>
                      </td>
                      <td className="px-4 py-3.5 hidden sm:table-cell">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          c.source === 'AI Call'
                            ? 'bg-[#FFC400]/10 text-[#FFC400] border-[#FFC400]/25'
                            : 'bg-white/5 text-white/40 border-white/10'
                        }`}>
                          {c.source === 'AI Call' ? '📞 AI Call' : '🌐 Web'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-xs text-white/50">
                          <MapPin className="w-3 h-3 text-[#E10600]" />
                          <span>{truncate(String(c.location ?? ''), 24)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><PriorityBadge priority={c.priority} size="sm" /></td>
                      <td className="px-4 py-3.5"><StatusBadge status={c.status} size="sm" /></td>
                      <td className="px-4 py-3.5 hidden xl:table-cell">
                        <span className="text-xs text-white/30">{formatDateTime(c.submittedAt)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => void openAIDiagnostic(c.id)}
                            title="AI Diagnostic Analysis"
                            className="flex items-center gap-1 text-xs font-bold text-[#FFC400] hover:text-white bg-[#FFC400]/10 hover:bg-[#FFC400]/20 border border-[#FFC400]/30 px-2 py-1.5 rounded-lg transition-all"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">AI Inspect</span>
                          </button>
                          <Link
                            to={`/admin/complaints/${c.id}`}
                            className="flex items-center gap-1 text-xs font-bold text-[#E10600] hover:text-white bg-[#E10600]/10 hover:bg-[#E10600] px-2.5 py-1.5 rounded-lg transition-all"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">View</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {complaints.length === 0 && (
                  <tr><td colSpan={9} className="py-16 text-center text-white/40 text-sm">No complaints match active filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── AI Diagnostic Slide-Over Modal ─────────────────────────── */}
      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#111111] border border-white/12 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#E10600] via-[#FFC400] to-[#22C55E]" />
            
            {/* Modal Header */}
            <div className="p-6 border-b border-white/8 flex items-center justify-between bg-[#151515]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#FFC400]/15 border border-[#FFC400]/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-[#FFC400]" />
                </div>
                <div>
                  <h3 className="font-black text-white text-base">AI Incident Diagnostic</h3>
                  <p className="font-mono text-xs text-[#FFC400]">{selectedId}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/8 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {analysisLoading ? (
                <div className="py-16 text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-[#E10600] animate-spin mx-auto" />
                  <p className="text-sm text-white/50">Synthesizing deep AI diagnostic telemetry…</p>
                </div>
              ) : analysis ? (
                <>
                  <div className="bg-[#181818] border border-white/8 rounded-2xl p-4 space-y-1">
                    <p className="text-xs text-white/40 font-mono uppercase">Incident Title</p>
                    <p className="text-sm font-bold text-white">{analysis.title}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/5 border border-white/8 rounded-2xl p-3 text-center">
                      <span className="text-[10px] font-mono uppercase text-white/40">Category</span>
                      <p className="text-xs font-bold text-white mt-1">{analysis.category}</p>
                    </div>
                    <div className="bg-white/5 border border-white/8 rounded-2xl p-3 text-center">
                      <span className="text-[10px] font-mono uppercase text-white/40">Severity</span>
                      <p className="text-xs font-bold text-[#E10600] mt-1">{analysis.severity} / 10</p>
                    </div>
                    <div className="bg-white/5 border border-white/8 rounded-2xl p-3 text-center">
                      <span className="text-[10px] font-mono uppercase text-white/40">Confidence</span>
                      <p className="text-xs font-bold text-[#22C55E] mt-1">{analysis.ai_confidence}%</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-white/3 border border-white/6 rounded-2xl p-4 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#E10600]">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Risk Assessment</span>
                      </div>
                      <p className="text-xs text-white/80 leading-relaxed">{analysis.risk_assessment}</p>
                    </div>

                    <div className="bg-white/3 border border-white/6 rounded-2xl p-4 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#FFC400]">
                        <Clock className="w-4 h-4" />
                        <span>Recommended Operational Action</span>
                      </div>
                      <p className="text-xs text-white/80 leading-relaxed">{analysis.recommended_action}</p>
                    </div>
                  </div>

                  {analysis.similar_reports && analysis.similar_reports.length > 0 && (
                    <div className="border-t border-white/8 pt-4 space-y-2">
                      <p className="text-[11px] font-mono uppercase text-white/40">Similar Reports in Vicinity ({analysis.similar_reports_count})</p>
                      <div className="space-y-1.5">
                        {analysis.similar_reports.map((s) => (
                          <div key={s.id} className="text-xs text-white/60 bg-white/4 border border-white/6 rounded-xl p-2.5 flex items-center justify-between">
                            <span>{s.complaint_number || s.id} — {s.title}</span>
                            <span className="font-mono text-[10px] text-[#FFC400]">{s.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-12 text-center text-white/40 text-sm">
                  Failed to load diagnostic telemetry.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/8 bg-[#151515] flex justify-end gap-2">
              <button
                onClick={() => setSelectedId(null)}
                className="btn-secondary text-xs py-2 px-4"
              >
                Close
              </button>
              {selectedId && (
                <Link
                  to={`/admin/complaints/${selectedId}`}
                  className="btn-primary text-xs py-2 px-4 glow-red-sm"
                >
                  Open Full Detail Record <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
