import React, { useState } from 'react';
import {
  Sparkles, Send, Loader2, AlertCircle, ArrowUpRight, Shield,
  Layers, MapPin, Clock, RefreshCw, Cpu
} from 'lucide-react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';

interface AdminAIResponse {
  query: string;
  answer: string;
  suggested_actions?: string[];
  related_complaints?: Array<{
    id: string;
    complaint_number: string;
    title: string;
    category: string;
    priority: string;
    status: string;
    department: string;
    location: string;
    created_at: string;
  }>;
  category_insights?: Record<string, number>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  data?: AdminAIResponse;
  timestamp: string;
}

const PROMPT_PILLS = [
  { label: '🔴 Urgent Priority Cases', query: 'Show highest priority and urgent complaints' },
  { label: '🏢 Department Workloads', query: 'Which department has the most unresolved complaints?' },
  { label: '📍 Problem Hotspots', query: 'Show repeated problem areas and clusters' },
  { label: '⏳ Overdue & Aging Reports', query: 'List longest unresolved complaints' },
  { label: '🗑️ Sanitation & Waste', query: 'Summarize garbage and sanitation complaints' },
  { label: '🛣️ Road Infrastructure', query: 'Summarize roads and pothole issues' },
];

export default function AdminAIAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Civic Operations Intelligence Agent active. Ask about municipal workloads, urgent dispatches, geographic hotspots, or overdue complaints.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const executeQuery = async (queryText: string) => {
    const q = queryText.trim();
    if (!q || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post<AdminAIResponse>('/admin/ai/assistant', { query: q });
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.answer,
        data: res,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Unable to query AI Intelligence Copilot. Please check backend connection.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0C0C0C] border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-2xl relative">
      {/* Glow highlight */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600]/60 to-transparent" />

      {/* Header */}
      <div className="px-5 py-4 border-b border-white/8 bg-[#111111]/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#E10600]/15 border border-[#E10600]/30 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-[#E10600]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-black text-sm tracking-wide">Admin AI Operations Copilot</h2>
              <span className="text-[10px] font-black bg-[#E10600]/20 text-[#E10600] border border-[#E10600]/30 px-2 py-0.5 rounded-full">
                LIVE DB
              </span>
            </div>
            <p className="text-xs text-white/40">Grounded decision support & workload telemetry</p>
          </div>
        </div>
        <button
          onClick={() => setMessages([messages[0]])}
          title="Reset conversation"
          className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-all text-xs flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </div>

      {/* Prompt Pills */}
      <div className="px-5 py-3 bg-[#0E0E0E] border-b border-white/6 flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <span className="text-[11px] text-white/30 font-semibold uppercase tracking-wider flex-shrink-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[#FFC400]" /> Quick Intel:
        </span>
        {PROMPT_PILLS.map((pill, idx) => (
          <button
            key={idx}
            onClick={() => void executeQuery(pill.query)}
            disabled={loading}
            className="text-xs text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all flex-shrink-0 disabled:opacity-40"
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Messages Feed */}
      <div className="p-5 space-y-4 max-h-[420px] min-h-[220px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#222 transparent' }}>
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[#E10600] text-white font-medium rounded-tr-sm'
                  : 'bg-[#151515] border border-white/10 text-white/90 rounded-tl-sm shadow-md'
              }`}
            >
              <div className="whitespace-pre-line">{m.content}</div>

              {/* Related complaints interactive cards */}
              {m.data?.related_complaints && m.data.related_complaints.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                  <p className="text-[11px] font-black text-white/40 uppercase tracking-wider">Related Complaints In Queue:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {m.data.related_complaints.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => navigate(`/admin/complaints?search=${encodeURIComponent(c.complaint_number || c.id)}`)}
                        className="bg-white/5 hover:bg-white/10 border border-white/8 hover:border-[#E10600]/40 rounded-xl p-2.5 transition-all cursor-pointer flex items-center justify-between group"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-white group-hover:text-[#E10600] transition-colors">{c.complaint_number || c.id}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                              c.priority === 'CRITICAL' || c.priority === 'HIGH'
                                ? 'text-[#E10600] bg-[#E10600]/10 border-[#E10600]/30'
                                : 'text-[#FFC400] bg-[#FFC400]/10 border-[#FFC400]/30'
                            }`}>
                              {c.priority}
                            </span>
                            <span className="text-[11px] text-white/40 truncate">{c.category}</span>
                          </div>
                          <p className="text-xs text-white/80 truncate mt-0.5">{c.title}</p>
                          <p className="text-[10px] text-white/40 truncate">📍 {c.location || 'Location not specified'}</p>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-white/30 group-hover:text-[#E10600] transition-all flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested action buttons */}
              {m.data?.suggested_actions && m.data.suggested_actions.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-white/8 flex flex-wrap gap-1.5">
                  {m.data.suggested_actions.map((act, i) => (
                    <button
                      key={i}
                      onClick={() => void executeQuery(`Action: ${act}`)}
                      className="text-[11px] font-semibold text-white/70 hover:text-white bg-white/6 hover:bg-white/12 border border-white/10 px-2.5 py-1 rounded-lg transition-all"
                    >
                      ⚡ {act}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[10px] text-white/20 mt-1 px-1">{m.timestamp}</span>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-white/40 bg-[#151515] border border-white/10 rounded-xl px-4 py-3 w-fit">
            <Loader2 className="w-4 h-4 text-[#E10600] animate-spin" />
            Analyzing municipal database telemetry…
          </div>
        )}
      </div>

      {/* Input query form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void executeQuery(input);
        }}
        className="p-3 border-t border-white/8 bg-[#111111] flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask operations intelligence (e.g. urgent complaints, department loads, hotspots)…"
          disabled={loading}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#E10600]/50 transition-all"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="btn-primary px-4 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed glow-red-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
