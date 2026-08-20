import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare, X, Send, Bot, User, Loader2,
  PlusCircle, Minimize2, RotateCcw,
  MapPin, CheckCircle, ChevronRight, Zap,
} from 'lucide-react';
import { getChatResponse, resetChatState } from '../services/aiService';
import type { ChatMessage } from '../types';
import { useNavigate, useLocation } from 'react-router-dom';
import EagleEyeLogo from './EagleEyeLogo';

// ── Types ──────────────────────────────────────────────────────────────────────
interface EnhancedMessage extends ChatMessage {
  quickReplies?: string[];
  analysisCard?: {
    category: string;
    priority: string;
    department: string;
    confidence: number;
  } | null;
  suggestComplaint?: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   'text-[#E10600] bg-[#E10600]/10 border-[#E10600]/20',
  MEDIUM: 'text-[#FFC400] bg-[#FFC400]/10 border-[#FFC400]/20',
  LOW:    'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20',
};

/** Render **bold** markdown and `code` inline */
function renderMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-bold text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="font-mono text-[#FFC400] bg-white/8 px-1.5 py-0.5 rounded text-[11px]">{part.slice(1, -1)}</code>;
    return <span key={i}>{part}</span>;
  });
}

// ── Welcome message ────────────────────────────────────────────────────────────
const WELCOME: EnhancedMessage = {
  id:          'welcome',
  role:        'assistant',
  content:     "Hi there! 👋 I'm **Civic AI**, your intelligent assistant for civic issues.\n\nI can help you with:",
  timestamp:   new Date().toISOString(),
  quickReplies: ['Report a problem', 'Track my complaint', 'How does this work?', 'Common issues'],
};

// ── Component ──────────────────────────────────────────────────────────────────
const AIChat: React.FC = () => {
  const [open, setOpen]           = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages]   = useState<EnhancedMessage[]>([WELCOME]);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const navigate       = useNavigate();
  const location       = useLocation();

  // Don't show on admin pages
  const isAdmin = location.pathname.startsWith('/admin');

  // Scroll to bottom on new messages or loading state
  useEffect(() => {
    if (open && !minimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, open, minimized]);

  // Focus input when opened
  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, minimized]);

  // Count unread when closed
  useEffect(() => {
    if (!open) setUnreadCount((n) => n + 0); // reset on open below
  }, [messages]);

  const handleOpen = () => {
    setOpen(true);
    setMinimized(false);
    setUnreadCount(0);
  };

  const handleReset = useCallback(() => {
    resetChatState();
    setMessages([WELCOME]);
    setInput('');
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: EnhancedMessage = {
      id:        Date.now().toString(),
      role:      'user',
      content:   trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res     = await getChatResponse(trimmed, history);

      // Handle quick-reply shortcut: go to track page
      if (trimmed.toLowerCase().includes('go to track') || (trimmed.toUpperCase().startsWith('TRACK CR-'))) {
        const idMatch = trimmed.match(/CR-\d{4}-\d{4,8}/i);
        if (idMatch) {
          navigate(`/track?id=${idMatch[0].toUpperCase()}`);
          setOpen(false);
          return;
        }
        navigate('/track');
        setOpen(false);
        return;
      }

      const botMsg: EnhancedMessage = {
        id:             (Date.now() + 1).toString(),
        role:           'assistant',
        content:        res.message,
        timestamp:      new Date().toISOString(),
        quickReplies:   res.quickReplies,
        analysisCard:   res.analysisCard,
        suggestComplaint: res.suggestComplaint,
      };
      setMessages((prev) => [...prev, botMsg]);

      if (!open) setUnreadCount((n) => n + 1);
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => [...prev, {
        id:        (Date.now() + 1).toString(),
        role:      'assistant',
        content:   'Unable to connect right now. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, navigate, open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };


  const handleQuickReply = (reply: string) => {
    if (reply === 'File Complaint' || reply === 'Report a problem' || reply === 'Report a new issue' || reply === 'Report another issue') {
      navigate('/report');
      setOpen(false);
      return;
    }
    if (reply === 'Go to Track page' || reply === 'Track a complaint') {
      navigate('/track');
      setOpen(false);
      return;
    }
    void sendMessage(reply);
  };

  if (isAdmin) return null;

  return (
    <>
      {/* ── Floating trigger button ──────────────────────────── */}
      <button
        onClick={handleOpen}
        aria-label="Open Civic AI Chat"
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.5)] ${
          open
            ? 'opacity-0 pointer-events-none scale-75'
            : 'opacity-100 scale-100 bg-[#E10600] hover:bg-[#C90000] hover:scale-110'
        }`}
        style={{ boxShadow: open ? 'none' : '0 0 0 0 rgba(225,6,0,0), 0 4px 20px rgba(0,0,0,0.4)' }}
      >
        <MessageSquare className="w-6 h-6 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#FFC400] rounded-full border-2 border-[#090909] text-[#090909] text-[10px] flex items-center justify-center font-black">
            {unreadCount}
          </span>
        )}
        {/* Ping ring */}
        {!open && (
          <span className="absolute inset-0 rounded-2xl bg-[#E10600]/30 animate-ping pointer-events-none" />
        )}
      </button>

      {/* ── Chat panel ───────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.7)] border border-white/10"
          style={{
            width: 'min(380px, calc(100vw - 24px))',
            height: minimized ? 'auto' : 'min(560px, calc(100vh - 100px))',
            background: '#111',
            animation: 'chatSlideUp 0.25s ease-out',
          }}
        >
          {/* Top accent */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[#E10600] to-transparent flex-shrink-0" />

          {/* ── Header ───────────────────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-[#0D0D0D] flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-9 h-9 bg-[#141414] border border-white/12 rounded-xl flex items-center justify-center p-1">
                  <EagleEyeLogo size={22} />
                </div>
                {/* Online dot */}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#22C55E] border-2 border-[#0D0D0D] rounded-full" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-white font-black text-sm leading-none">Civic AI</p>
                  <span className="text-[9px] font-black bg-[#FFC400]/15 text-[#FFC400] border border-[#FFC400]/20 px-1.5 py-0.5 rounded-full">BETA</span>
                </div>
                <p className="text-white/40 text-[11px] mt-0.5">Always online · Instant response</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleReset}
                title="Reset conversation"
                className="p-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setMinimized(!minimized)}
                title={minimized ? 'Expand' : 'Minimize'}
                className="p-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-all"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close"
                className="p-2 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── Messages ─────────────────────────────────────── */}
          {!minimized && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#2E2E2E transparent' }}>

                {messages.map((msg, msgIdx) => (
                  <div key={msg.id}>
                    {/* Message bubble */}
                    <div className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>

                      {/* Avatar */}
                      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${
                        msg.role === 'assistant'
                          ? 'bg-[#E10600]/15 border border-[#E10600]/25'
                          : 'bg-white/8 border border-white/15'
                      }`}>
                        {msg.role === 'assistant'
                          ? <Bot  className="w-3.5 h-3.5 text-[#E10600]" />
                          : <User className="w-3.5 h-3.5 text-white/60" />
                        }
                      </div>

                      {/* Bubble */}
                      <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                        <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          msg.role === 'assistant'
                            ? 'bg-white/6 border border-white/8 text-white/80 rounded-tl-sm'
                            : 'bg-[#E10600] text-white rounded-tr-sm'
                        }`}
                          style={{ wordBreak: 'break-word' }}
                        >
                          {msg.content.split('\n').map((line, i) => (
                            <React.Fragment key={i}>
                              {renderMarkdown(line)}
                              {i < msg.content.split('\n').length - 1 && <br />}
                            </React.Fragment>
                          ))}
                        </div>

                        {/* Timestamp */}
                        <p className="text-[10px] text-white/20 px-1">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    {/* Analysis card */}
                    {msg.analysisCard && (
                      <div className="ml-9 mt-2 bg-[#0D0D0D] border border-white/10 rounded-xl p-3.5 relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFC400]/40 to-transparent" />
                        <div className="flex items-center gap-2 mb-3">
                          <Zap className="w-3.5 h-3.5 text-[#FFC400]" />
                          <span className="text-[11px] font-black text-[#FFC400] uppercase tracking-wider">AI Classification</span>
                          <span className="ml-auto text-[10px] font-bold text-[#FFC400] bg-[#FFC400]/10 border border-[#FFC400]/20 px-2 py-0.5 rounded-full">
                            {msg.analysisCard.confidence}% sure
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-white/40">Category</span>
                            <span className="text-white font-semibold">{msg.analysisCard.category}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-white/40">Priority</span>
                            <span className={`font-bold px-2 py-0.5 rounded-full border text-[10px] ${PRIORITY_COLORS[msg.analysisCard.priority] ?? PRIORITY_COLORS.LOW}`}>
                              {msg.analysisCard.priority}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs gap-2">
                            <span className="text-white/40 flex-shrink-0">Department</span>
                            <span className="text-white/80 font-medium text-right">{msg.analysisCard.department}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* File complaint CTA */}
                    {msg.suggestComplaint && !msg.analysisCard && (
                      <div className="ml-9 mt-2">
                        <button
                          onClick={() => { navigate('/report'); setOpen(false); }}
                          className="flex items-center gap-2 bg-[#E10600] hover:bg-[#C90000] text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all w-full justify-center"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          File Official Complaint
                          <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                        </button>
                      </div>
                    )}

                    {/* File complaint CTA with analysis card */}
                    {msg.suggestComplaint && msg.analysisCard && (
                      <div className="ml-9 mt-2 flex gap-2">
                        <button
                          onClick={() => { navigate('/report'); setOpen(false); }}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-[#E10600] hover:bg-[#C90000] text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-all"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          File Complaint
                        </button>
                        <button
                          onClick={() => { navigate('/track'); setOpen(false); }}
                          className="flex items-center justify-center gap-1.5 bg-white/8 hover:bg-white/12 border border-white/10 text-white/60 hover:text-white text-xs font-semibold px-3 py-2.5 rounded-xl transition-all"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          Track
                        </button>
                      </div>
                    )}

                    {/* Quick replies — only show on last assistant message */}
                    {msg.role === 'assistant' && msg.quickReplies && msgIdx === messages.length - 1 && !loading && (
                      <div className="ml-9 mt-2 flex flex-wrap gap-1.5">
                        {msg.quickReplies.map((reply) => (
                          <button
                            key={reply}
                            onClick={() => handleQuickReply(reply)}
                            className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-white/12 text-white/60 hover:text-white hover:border-[#E10600]/40 hover:bg-[#E10600]/8 transition-all bg-white/5"
                          >
                            {reply}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                  <div className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-[#E10600]/15 border border-[#E10600]/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-[#E10600]" />
                    </div>
                    <div className="bg-white/6 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-white/40 typing-dot" />
                      <div className="w-2 h-2 rounded-full bg-white/40 typing-dot" />
                      <div className="w-2 h-2 rounded-full bg-white/40 typing-dot" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* ── Input bar ──────────────────────────────────── */}
              <div className="flex-shrink-0 border-t border-white/8 p-3 bg-[#0D0D0D]">
                <div className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe your civic issue…"
                      disabled={loading}
                      maxLength={500}
                      rows={1}
                      className="w-full bg-white/6 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#E10600]/50 focus:border-[#E10600]/40 transition-all resize-none max-h-24 overflow-y-auto"
                    />
                  </div>
                  <button
                    onClick={() => void sendMessage(input)}
                    disabled={!input.trim() || loading}
                    aria-label="Send message"
                    className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-[#E10600] hover:bg-[#C90000] disabled:bg-white/8"
                  >
                    {loading
                      ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                      : <Send    className="w-4 h-4 text-white" />
                    }
                  </button>
                </div>
                <p className="text-[10px] text-white/20 mt-2 text-center">
                  Civic AI · Municipal Resolution Assistant
                </p>
              </div>
            </>
          )}

          {/* Minimized footer */}
          {minimized && (
            <div
              className="px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => setMinimized(false)}
            >
              <Zap className="w-4 h-4 text-[#E10600]" />
              <span className="text-sm font-semibold text-white/70">Civic AI — Click to expand</span>
              <div className="ml-auto w-2 h-2 bg-[#22C55E] rounded-full animate-pulse" />
            </div>
          )}
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </>
  );
};

export default AIChat;
