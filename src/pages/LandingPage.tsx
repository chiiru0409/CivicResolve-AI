import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle, MapPin, Brain,
  Zap, ChevronRight, Shield, AlertCircle,
  BarChart3, Globe,
} from 'lucide-react';
import HeroMap from '../components/HeroMap';
import { useAuth } from '../hooks/useAuth';
import { useScrollReveal, useCounter } from '../hooks/useScrollReveal';
import EagleEyeLogo from '../components/EagleEyeLogo';

/* ── Animated counter stat ─────────────────────────────────── */
const CounterStat: React.FC<{ value: number; suffix?: string; label: string; color: string; delay: number }> = ({
  value, suffix = '', label, color, delay,
}) => {
  const numRef = useCounter(value, 1600);
  return (
    <div className="text-center reveal" style={{ transitionDelay: `${delay}ms` }}>
      <p className={`text-4xl sm:text-5xl font-black tabular-nums ${color}`}>
        <span ref={numRef as React.RefObject<HTMLSpanElement>}>0</span>{suffix}
      </p>
      <p className="text-sm text-white/50 font-medium mt-1">{label}</p>
    </div>
  );
};

/* ── Data ──────────────────────────────────────────────────── */
const CATEGORIES = [
  { icon: '🛣️', label: 'Roads',          gradient: 'from-red-500/10' },
  { icon: '🗑️', label: 'Garbage',        gradient: 'from-orange-500/10' },
  { icon: '🌊', label: 'Drainage',       gradient: 'from-blue-500/10' },
  { icon: '💧', label: 'Water',          gradient: 'from-cyan-500/10' },
  { icon: '💡', label: 'Streetlights',   gradient: 'from-yellow-500/10' },
  { icon: '🏗️', label: 'Infrastructure', gradient: 'from-purple-500/10' },
];

const FEATURES = [
  { icon: <Brain className="w-5 h-5 text-[#FFC400]" />,    title: 'AI Classification', desc: 'NLP identifies the exact problem category from plain text descriptions.', delay: 0 },
  { icon: <Zap className="w-5 h-5 text-[#E10600]" />,      title: 'Smart Priority',    desc: 'Severity engine assigns HIGH, MEDIUM, or LOW in milliseconds.', delay: 100 },
  { icon: <MapPin className="w-5 h-5 text-white/60" />,    title: 'Auto Routing',      desc: 'Complaint auto-routed to the correct department and zone team.', delay: 200 },
  { icon: <Globe className="w-5 h-5 text-blue-400" />,     title: 'Live Tracking',     desc: 'Real-time status timeline from submission to resolution.', delay: 300 },
  { icon: <AlertCircle className="w-5 h-5 text-[#E10600]"/>, title: 'Auto Escalation', desc: 'Overdue complaints automatically escalate to senior authorities.', delay: 400 },
  { icon: <BarChart3 className="w-5 h-5 text-[#FFC400]" />, title: 'Civic Analytics', desc: 'Hotspot detection and recurring pattern recommendations.', delay: 500 },
];

/* ── Interactive Hero AI Live Simulator ─────────────────────── */
const SAMPLE_ISSUES = [
  {
    id: 1,
    button: '💧 Water Main Leak',
    input: 'Large water main burst flooding MG Road near Metro Station. Vehicles cannot pass and clean water is being wasted for 4 hours.',
    location: 'MG Road, Zone 2',
    category: 'Water',
    priority: 'HIGH',
    dept: 'Water Supply & Sewerage Board',
    confidence: 98,
    eta: '2–4 Hours',
  },
  {
    id: 2,
    button: '💡 Broken Streetlight',
    input: 'Streetlight pole collapsed after heavy winds on 5th Cross Ring Road. Live wires hanging dangerously over the pedestrian pathway.',
    location: 'Ring Road, Sector 4',
    category: 'Streetlights',
    priority: 'CRITICAL',
    dept: 'Electrical & Power Infrastructure',
    confidence: 96,
    eta: '1–2 Hours',
  },
  {
    id: 3,
    button: '🗑️ Garbage Dump',
    input: 'Overflowing garbage bin blocking Government Primary School entrance. Stray animals spreading waste on public road for 3 days.',
    location: 'School Road, Ward 12',
    category: 'Garbage',
    priority: 'HIGH',
    dept: 'Solid Waste Management Dept',
    confidence: 95,
    eta: '4–6 Hours',
  },
];

const HeroAISimulator: React.FC = () => {
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const [isSimulating, setIsSimulating] = React.useState(false);
  const current = SAMPLE_ISSUES[selectedIdx];

  const handleSelect = (idx: number) => {
    if (idx === selectedIdx && !isSimulating) return;
    setSelectedIdx(idx);
    setIsSimulating(true);
    setTimeout(() => setIsSimulating(false), 700);
  };

  return (
    <div className="card p-5 sm:p-6 bg-[#0D0D0D] border-white/10 rounded-2xl relative overflow-hidden">
      {/* Top red speed line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600]/60 to-transparent" />

      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className="telemetry-chip-red inline-flex items-center gap-1.5 text-[10px] font-bold text-white bg-[#E10600]/10 px-2 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E10600] animate-pulse" />
            LIVE AI ROUTING ENGINE
          </span>
        </div>
        <span className="text-[10px] font-mono text-white/40 hidden sm:inline">ENGINE: LOCAL LLM</span>
      </div>

      {/* Sample selector pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {SAMPLE_ISSUES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => handleSelect(i)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 flex-shrink-0 ${
              selectedIdx === i
                ? 'bg-[#E10600] text-white shadow-sm'
                : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/8'
            }`}
          >
            {s.button}
          </button>
        ))}
      </div>

      {/* Sample input prompt */}
      <div className="bg-[#141414] border border-white/8 rounded-xl p-3.5 mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono uppercase text-white/40">Citizen Input Telemetry</span>
          <span className="text-[10px] font-mono text-white/30">{current.location}</span>
        </div>
        <p className="text-xs text-white/80 leading-relaxed font-sans italic">
          "{current.input}"
        </p>
      </div>

      {/* Simulation state vs output */}
      {isSimulating ? (
        <div className="py-6 flex flex-col items-center justify-center gap-2">
          <div className="w-6 h-6 border-2 border-[#E10600]/20 border-t-[#E10600] rounded-full animate-spin" />
          <p className="text-[11px] font-mono text-[#FFC400] animate-pulse">CLASSIFYING ISSUE & DISPATCHING...</p>
        </div>
      ) : (
        <div className="space-y-2.5 animate-fadeIn">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/4 border border-white/8 rounded-lg p-2 text-center">
              <span className="text-[9px] font-mono uppercase text-white/40 block">Category</span>
              <span className="text-xs font-bold text-white mt-0.5 block">{current.category}</span>
            </div>
            <div className="bg-white/4 border border-white/8 rounded-lg p-2 text-center">
              <span className="text-[9px] font-mono uppercase text-white/40 block">Priority</span>
              <span className={`text-xs font-bold mt-0.5 block ${
                current.priority === 'CRITICAL' ? 'text-[#E10600]' : 'text-[#FFC400]'
              }`}>
                {current.priority}
              </span>
            </div>
            <div className="bg-white/4 border border-white/8 rounded-lg p-2 text-center">
              <span className="text-[9px] font-mono uppercase text-white/40 block">Confidence</span>
              <span className="text-xs font-bold text-[#22C55E] mt-0.5 block">{current.confidence}%</span>
            </div>
          </div>

          <div className="bg-white/4 border border-white/8 rounded-xl p-3 flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <span className="text-[9px] font-mono uppercase text-white/40 block">Target Authority</span>
              <span className="text-xs font-semibold text-white truncate block mt-0.5">{current.dept}</span>
            </div>
            <span className="text-[10px] font-mono text-[#FFC400] bg-[#FFC400]/10 border border-[#FFC400]/25 px-2 py-0.5 rounded flex-shrink-0">
              ETA: {current.eta}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════
   LANDING PAGE
═══════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { isAuthenticated, isCitizen } = useAuth();
  const pageRef = useScrollReveal() as React.RefObject<HTMLDivElement>;

  return (
    <div ref={pageRef} className="min-h-screen bg-[#070707] text-white overflow-x-hidden">

      {/* ══════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════ */}
      <section className="relative min-h-screen flex items-center pt-16 pb-20 px-4 sm:px-6 overflow-hidden">

        {/* Animated background grid */}
        <div className="absolute inset-0 grid-bg opacity-30" />

        {/* Ambient glows */}
        <div className="ambient-glow-red w-[700px] h-[700px] -top-32 -left-32 opacity-25" />
        <div className="ambient-glow-yellow w-[500px] h-[500px] top-1/2 right-0 opacity-20" />

        {/* Diagonal speed lines */}
        <div className="absolute inset-0 speed-lines-bg opacity-15" />

        {/* Top red line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600]/40 to-transparent" />

        <div className="relative max-w-7xl mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* ── Left: Copy ────────────────────────────── */}
            <div>
              {/* Badge */}
              <div className="hero-badge inline-flex items-center gap-2 bg-white/5 border border-[#FFC400]/30 text-[#FFC400] text-xs font-bold px-4 py-2 rounded-full mb-8 tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FFC400] animate-pulse" />
                SMART INDIA HACKATHON 2026 · AI CIVIC PLATFORM
              </div>

              {/* Headline — each word animates separately */}
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-none mb-6 tracking-tight"
                  style={{ perspective: '600px' }}>
                <span className="hero-word-1 block text-white">Report.</span>
                <span className="hero-word-2 block text-[#E10600]">
                  Resolve.
                </span>
                <span className="hero-word-3 block text-white">Improve.</span>
              </h1>

              <p className="hero-sub text-lg text-white/60 leading-relaxed mb-8 max-w-lg">
                A citizen-powered AI platform that intelligently identifies public issues,
                routes them to the responsible authority, and tracks them until resolution.
              </p>

              {/* CTAs */}
              <div className="hero-cta flex flex-wrap gap-3 mb-10">
                {isAuthenticated && isCitizen ? (
                  <Link to="/dashboard"
                    className="group relative btn-primary-lg overflow-hidden">
                    Go to Dashboard
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                ) : (
                  <>
                    <Link to="/register"
                      className="group relative btn-primary-lg overflow-hidden">
                      Get Started Free
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                    <Link to="/track" className="btn-secondary text-base py-3.5 px-6">
                      <MapPin className="w-5 h-5" /> Track Complaint
                    </Link>
                  </>
                )}
              </div>

              {/* Workflow chips */}
              <div className="hero-chips flex flex-wrap items-center gap-2">
                {[
                  { step: '01', icon: '📝', label: 'Report',   desc: 'Text+Photo+GPS' },
                  { step: '02', icon: '🤖', label: 'AI',       desc: 'Classify+Route' },
                  { step: '03', icon: '⚡', label: 'Dispatch', desc: 'Right Dept.' },
                  { step: '04', icon: '✅', label: 'Resolve',  desc: 'Live Updates' },
                ].map((w, i) => (
                  <React.Fragment key={i}>
                    <div className="flex items-center gap-2 bg-white/5 border border-white/8 hover:border-[#E10600]/30 hover:bg-[#E10600]/5 rounded-xl px-3 py-2 transition-all duration-150 cursor-default">
                      <span>{w.icon}</span>
                      <div>
                        <p className="text-[10px] font-black text-white/40 leading-none">{w.step}</p>
                        <p className="text-xs font-bold text-white leading-tight">{w.label}</p>
                        <p className="text-[10px] text-white/40">{w.desc}</p>
                      </div>
                    </div>
                    {i < 3 && <ChevronRight className="w-3.5 h-3.5 text-[#E10600]/40 flex-shrink-0" />}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* ── Right: Live Simulator ─────────────────── */}
            <div className="hero-map relative space-y-4">
              <HeroAISimulator />
              <div className="relative h-[220px] rounded-2xl overflow-hidden border border-white/8">
                <HeroMap />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#070707] to-transparent" />
      </section>

      {/* ══════════════════════════════════════════════════
          STATS BAR
      ══════════════════════════════════════════════════ */}
      <section className="relative border-y border-white/8 bg-[#0D0D0D] py-12 overflow-hidden">
        <div className="absolute inset-0 speed-lines-bg opacity-15" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <CounterStat value={1284} label="Issues Reported"    color="text-white"       delay={0} />
            <CounterStat value={947}  label="Issues Resolved"    color="text-[#22C55E]"   delay={100} />
            <CounterStat value={94}   suffix="%" label="AI Accuracy"  color="text-[#FFC400]"   delay={200} />
            <CounterStat value={2}    suffix="h" label="Avg. Response" color="text-white"       delay={300} />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          CATEGORIES
      ══════════════════════════════════════════════════ */}
      <section className="py-24 px-4 sm:px-6 bg-[#070707]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14 reveal">
            <div className="inline-flex mb-3">
              <span className="telemetry-chip-red">[ 01 · INCIDENT COVERAGE ]</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white">Every Civic Problem, Solved</h2>
            <p className="text-white/40 mt-3 max-w-lg mx-auto">
              Our AI handles every type of civic complaint and routes it to the responsible team automatically.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {CATEGORIES.map((cat, i) => (
              <Link key={cat.label}
                to={isAuthenticated ? '/report' : '/register'}
                className={`reveal delay-${(i + 1) * 100} group flex flex-col items-center gap-3 p-5 rounded-2xl border border-white/8 bg-gradient-to-br ${cat.gradient} to-transparent hover:border-[#E10600]/40 hover:-translate-y-0.5 transition-all duration-150 cursor-pointer`}
                style={{ transitionDelay: `${i * 40}ms` }}
              >
                <span className="text-3xl group-hover:scale-110 transition-transform duration-150">{cat.icon}</span>
                <p className="text-xs font-bold text-white/70 group-hover:text-white transition-colors text-center">{cat.label}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════════ */}
      <section className="py-24 px-4 sm:px-6 bg-[#0D0D0D] border-t border-white/8 relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-14 reveal">
            <div className="inline-flex mb-3">
              <span className="telemetry-chip-yellow">[ 02 · INTELLIGENCE PIPELINE ]</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white">From Report to Resolution</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <div key={f.title}
                className="reveal group p-6 rounded-2xl border border-white/8 bg-[#111]/80 hover:border-[#E10600]/30 hover:bg-[#E10600]/5 hover:-translate-y-0.5 transition-all duration-150"
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/8 group-hover:border-[#E10600]/30 flex items-center justify-center mb-5 group-hover:scale-105 transition-all duration-150">
                  {f.icon}
                </div>
                <h3 className="font-black text-white mb-2 group-hover:text-[#E10600] transition-colors">{f.title}</h3>
                <p className="text-sm text-white/50 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          DEMO FLOW
      ══════════════════════════════════════════════════ */}
      <section className="py-24 px-4 sm:px-6 bg-[#070707]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14 reveal">
            <p className="text-[#E10600] text-xs font-black tracking-widest uppercase mb-3">Live Demo Flow</p>
            <h2 className="text-3xl sm:text-4xl font-black text-white">See It In Action</h2>
          </div>

          {/* Vertical timeline */}
          <div className="relative">
            {/* Connector line */}
            <div className="absolute left-6 top-6 bottom-6 w-px bg-gradient-to-b from-[#E10600] via-[#FFC400] to-[#22C55E] opacity-30" />

            {[
              { icon: '👤', step: '01', title: 'Citizen Registers & Logs In',           desc: 'Creates a free account at /register',                             color: 'border-[#E10600]/30 bg-[#E10600]/5' },
              { icon: '📝', step: '02', title: 'Reports a Civic Issue',                  desc: 'Types the problem, uploads a photo, shares GPS location',         color: 'border-[#FFC400]/20 bg-[#FFC400]/5' },
              { icon: '🤖', step: '03', title: 'AI Analyzes Instantly',                  desc: 'Classifies category, calculates priority, routes to department',  color: 'border-white/10 bg-white/5' },
              { icon: '🎫', step: '04', title: 'Unique ID Generated',                   desc: 'e.g. CR-2026-537718 — saved permanently to civic.db',              color: 'border-[#FFC400]/20 bg-[#FFC400]/5' },
              { icon: '🏛️', step: '05', title: 'Admin Sees It Immediately',              desc: 'Appears in /admin/complaints — assigns team, updates status',     color: 'border-[#E10600]/30 bg-[#E10600]/5' },
              { icon: '✅', step: '06', title: 'Citizen Tracks Resolution',              desc: 'Status timeline updates in real-time at /track',                   color: 'border-[#22C55E]/30 bg-[#22C55E]/5' },
            ].map((item, i) => (
              <div key={i} className={`reveal relative pl-16 mb-5 last:mb-0`}
                style={{ transitionDelay: `${i * 60}ms` }}>
                {/* Step dot */}
                <div className="absolute left-0 w-12 h-12 rounded-2xl border flex items-center justify-center text-xl flex-shrink-0 bg-[#0D0D0D] z-10">
                  {item.icon}
                </div>
                <div className={`p-4 rounded-2xl border ${item.color} transition-all duration-150 hover:border-white/20`}>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-[10px] font-black text-white/30 tracking-widest">{item.step}</span>
                    <p className="font-bold text-white">{item.title}</p>
                  </div>
                  <p className="text-sm text-white/50 ml-8">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          CTA
      ══════════════════════════════════════════════════ */}
      <section className="py-24 px-4 sm:px-6 bg-[#0D0D0D] border-t border-white/8">
        <div className="max-w-3xl mx-auto text-center reveal">
          <div className="relative bg-[#111] border border-white/8 rounded-3xl p-12 overflow-hidden glow-card">
            {/* Decorative elements */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600] to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FFC400]/30 to-transparent" />
            <div className="absolute -top-20 -right-20 w-60 h-60 ambient-glow-red opacity-50" />
            <div className="absolute -bottom-20 -left-20 w-60 h-60 ambient-glow-yellow opacity-30" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 bg-[#E10600]/10 border border-[#E10600]/20 text-[#E10600] text-xs font-bold px-4 py-2 rounded-full mb-6">
                <Zap className="w-3.5 h-3.5" />
                Ready to get started?
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
                Report a Problem.<br />
                <span className="text-[#E10600]">Let AI Handle the Rest.</span>
              </h2>
              <p className="text-white/50 text-lg mb-8 max-w-xl mx-auto">
                Join thousands of citizens making their city better. Register free — no complicated setup required.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {isAuthenticated ? (
                  <Link to="/report" className="btn-primary-lg justify-center">
                    Report an Issue <ArrowRight className="w-5 h-5" />
                  </Link>
                ) : (
                  <>
                    <Link to="/register" className="btn-primary-lg justify-center">
                      Register Free <ArrowRight className="w-5 h-5" />
                    </Link>
                    <Link to="/login" className="btn-secondary justify-center text-base py-4 px-8">
                      Sign In
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════ */}
      <footer className="border-t border-white/8 bg-[#070707] py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#141414] border border-white/12 rounded-xl flex items-center justify-center p-1 shadow-md">
                <EagleEyeLogo size={24} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-black text-white">CIVIC</span>
                <span className="font-black text-[#E10600]">RESOLVE</span>
                <span className="font-black text-[#FFC400] text-xs ml-0.5">AI</span>
              </div>
              <span className="text-[10px] bg-[#E10600]/10 border border-[#E10600]/20 text-[#E10600] px-2 py-0.5 rounded-full font-bold">SIH 2026</span>
            </div>
            <p className="text-xs text-white/30 text-center">
              Built for Smart India Hackathon 2026 · AI-powered civic engagement platform
            </p>
            <div className="flex items-center gap-5 text-xs text-white/40">
              <Link to="/how-it-works" className="hover:text-white transition-colors">How It Works</Link>
              <Link to="/track"        className="hover:text-white transition-colors">Track</Link>
              <Link to="/register"     className="hover:text-white transition-colors">Register</Link>
              <Link to="/admin/login"  className="hover:text-white/70 transition-colors flex items-center gap-1">
                <Shield className="w-3 h-3" /> Authority
              </Link>
            </div>
          </div>
          <div className="speed-line opacity-40" />
        </div>
      </footer>
    </div>
  );
}
