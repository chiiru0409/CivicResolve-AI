import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Send, Loader2, AlertCircle, ArrowUpRight, Shield,
  Layers, MapPin, Clock, RefreshCw, Cpu
} from 'lucide-react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { buttonGestures, cardGestures } from '../utils/motion';

interface ActionProposal {
  action_type: string;
  complaint_id: string;
  target_value: string;
  officer_or_team?: string;
  reason: string;
  requires_confirmation: boolean;
}

interface DuplicateCluster {
  cluster_id: string;
  category: string;
  location: string;
  similarity_score: number;
  complaint_ids: string[];
  suggested_action: string;
}

interface AdminAIResponse {
  query: string;
  answer: string;
  suggested_actions?: string[];
  action_proposals?: ActionProposal[];
  duplicate_clusters?: DuplicateCluster[];
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
  { label: '🔍 Find Duplicate Reports', query: 'Find duplicate complaints and incident clusters' },
  { label: '🏢 Department Workloads', query: 'Which department has the most unresolved complaints?' },
  { label: '⏳ Overdue & Aging Reports', query: 'List longest unresolved complaints' },
  { label: '🗑️ Sanitation & Waste', query: 'Summarize garbage and sanitation complaints' },
];

export default function AdminAIAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      role: 'assistant',
      content: 'Operations Copilot ready. I have real-time access to the Neon PostgreSQL database, complaint triage models, and automated dispatch workflows. How can I assist your operations shift?',
      timestamp: 'Active Shift',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmedActions, setConfirmedActions] = useState<Set<string>>(new Set());

  const executeAction = async (proposal: ActionProposal) => {
    const actionKey = `${proposal.complaint_id}-${proposal.action_type}-${proposal.target_value}`;
    setActionLoading(actionKey);
    try {
      if (proposal.action_type === 'escalate_priority' || proposal.action_type === 'set_priority') {
        await api.patch(`/admin/complaints/${proposal.complaint_id}/priority`, {
          priority: proposal.target_value,
        });
      } else if (proposal.action_type === 'assign_department') {
        await api.patch(`/admin/complaints/${proposal.complaint_id}/assign`, {
          department: proposal.target_value,
          assigned_to: proposal.officer_or_team || 'Field Rapid Response Unit',
        });
      } else if (proposal.action_type === 'update_status') {
        await api.patch(`/admin/complaints/${proposal.complaint_id}/status`, {
          status: proposal.target_value,
          message: proposal.reason,
          updated_by: 'admin',
        });
      }
      setConfirmedActions((prev) => new Set([...prev, actionKey]));
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const executeQuery = async (q: string) => {
    if (!q.trim() || loading) return;

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
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#E10600]/60 to-transparent" />

      {/* Header */}
      <div className="px-5 py-4 border-b border-white/8 bg-[#111111]/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#E10600]/15 border border-[#E10600]/30 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-[#E10600]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-white font-black text-sm tracking-wide font-display">Admin AI Operations Copilot</h2>
              <span className="text-[10px] font-black bg-[#E10600]/20 text-[#E10600] border border-[#E10600]/30 px-2 py-0.5 rounded-full font-mono">
                CONTROLLED TOOLS
              </span>
            </div>
            <p className="text-xs text-white/40 font-sans">Grounded decision support & automated operational actions</p>
          </div>
        </div>
        <motion.button
          {...buttonGestures}
          onClick={() => setMessages([messages[0]])}
          title="Reset conversation"
          className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors text-xs flex items-center gap-1.5 font-mono"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </motion.button>
      </div>

      {/* Prompt Pills */}
      <div className="px-5 py-3 bg-[#0E0E0E] border-b border-white/6 flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <span className="text-[11px] text-white/30 font-semibold uppercase tracking-wider flex-shrink-0 flex items-center gap-1 font-mono">
          <Sparkles className="w-3 h-3 text-[#FFC400]" /> Quick Intel:
        </span>
        {PROMPT_PILLS.map((pill, idx) => (
          <motion.button
            key={idx}
            {...buttonGestures}
            onClick={() => void executeQuery(pill.query)}
            disabled={loading}
            className="text-xs text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors flex-shrink-0 disabled:opacity-40 font-mono"
          >
            {pill.label}
          </motion.button>
        ))}
      </div>

      {/* Conversation stream */}
      <div className="p-5 overflow-y-auto max-h-[480px] space-y-4 min-h-[220px]">
        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`rounded-2xl p-4 max-w-[88%] text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[#E10600] text-white font-sans rounded-tr-none'
                  : 'bg-[#151515] border border-white/10 text-white font-sans rounded-tl-none shadow-xl'
              }`}
            >
              {/* Main text message */}
              <p className="whitespace-pre-wrap">{m.content}</p>

              {/* Action proposals interactive cards */}
              {m.data?.action_proposals && m.data.action_proposals.length > 0 && (
                <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-black text-[#FFC400] font-mono">
                    <Shield className="w-3.5 h-3.5" />
                    <span>CONTROLLED OPERATIONS PROPOSALS ({m.data.action_proposals.length}):</span>
                  </div>
                  <div className="space-y-2">
                    {m.data.action_proposals.map((prop, idx) => {
                      const actionKey = `${prop.complaint_id}-${prop.action_type}-${prop.target_value}`;
                      const isDone = confirmedActions.has(actionKey);
                      const isExecuting = actionLoading === actionKey;

                      return (
                        <div key={idx} className="bg-black/50 border border-white/10 rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="text-xs font-bold text-white">{prop.complaint_id}</span>
                              <span className="text-[10px] font-bold text-white/40 uppercase">{prop.action_type.replace('_', ' ')}</span>
                            </div>
                            <p className="text-xs text-white/70 truncate mt-0.5 font-sans">{prop.reason}</p>
                          </div>

                          {isDone ? (
                            <span className="text-[10px] font-bold text-[#22C55E] bg-[#22C55E]/15 border border-[#22C55E]/30 px-2 py-1 rounded-lg font-mono">
                              ✓ Confirmed
                            </span>
                          ) : (
                            <motion.button
                              {...buttonGestures}
                              onClick={() => void executeAction(prop)}
                              disabled={isExecuting}
                              className="text-xs font-bold text-white bg-[#E10600] hover:bg-[#FF1A14] disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 flex-shrink-0 shadow-[0_0_12px_rgba(225,6,0,0.4)] font-mono"
                            >
                              {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Confirm Action'}
                            </motion.button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Related complaints interactive cards */}
              {m.data?.related_complaints && m.data.related_complaints.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                  <p className="text-[11px] font-black text-white/40 uppercase tracking-wider font-mono">Related Complaints In Queue:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {m.data.related_complaints.map((c) => (
                      <motion.div
                        key={c.id}
                        {...cardGestures}
                        onClick={() => navigate(`/admin/complaints?search=${encodeURIComponent(c.complaint_number || c.id)}`)}
                        className="bg-white/5 hover:bg-white/10 border border-white/8 hover:border-[#E10600]/40 rounded-xl p-2.5 transition-colors cursor-pointer flex items-center justify-between group"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-xs font-bold text-white group-hover:text-[#E10600] transition-colors">{c.complaint_number || c.id}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                              c.priority === 'CRITICAL' || c.priority === 'HIGH'
                                ? 'text-[#E10600] bg-[#E10600]/10 border-[#E10600]/30'
                                : 'text-[#FFC400] bg-[#FFC400]/10 border-[#FFC400]/30'
                            }`}>
                              {c.priority}
                            </span>
                            <span className="text-[11px] text-white/40 truncate">{c.category}</span>
                          </div>
                          <p className="text-xs text-white/80 truncate mt-0.5 font-sans">{c.title}</p>
                          <p className="text-[10px] text-white/40 truncate font-mono">📍 {c.location || 'Location not specified'}</p>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-white/30 group-hover:text-[#E10600] transition-colors flex-shrink-0" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested action buttons */}
              {m.data?.suggested_actions && m.data.suggested_actions.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-white/8 flex flex-wrap gap-1.5">
                  {m.data.suggested_actions.map((act, i) => (
                    <motion.button
                      key={i}
                      {...buttonGestures}
                      onClick={() => void executeQuery(`Action: ${act}`)}
                      className="text-[11px] font-semibold text-white/70 hover:text-white bg-white/6 hover:bg-white/12 border border-white/10 px-2.5 py-1 rounded-lg transition-colors font-mono"
                    >
                      ⚡ {act}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-[10px] text-white/20 mt-1 px-1 font-mono">{m.timestamp}</span>
          </motion.div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-white/40 bg-[#151515] border border-white/10 rounded-xl px-4 py-3 w-fit font-mono">
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
          placeholder="Ask operations intelligence (e.g. urgent complaints, duplicate clusters, department loads)…"
          disabled={loading}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#E10600]/50 transition-all font-sans"
        />
        <motion.button
          {...buttonGestures}
          type="submit"
          disabled={!input.trim() || loading}
          className="btn-primary px-4 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed glow-red-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </motion.button>
      </form>
    </div>
  );
}
