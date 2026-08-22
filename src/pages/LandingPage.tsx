import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle, MapPin, Brain,
  Zap, ChevronRight, Shield, AlertCircle,
  BarChart3, Globe, Sparkles, ChevronDown,
  Layers, CheckSquare, Activity, PhoneCall
} from 'lucide-react';
import HeroMap from '../components/HeroMap';
import { useAuth } from '../hooks/useAuth';
import { useScrollReveal, useCounter } from '../hooks/useScrollReveal';
import EagleEyeLogo from '../components/EagleEyeLogo';

/* ── Counter Stat Component ─────────────────────────────────── */
const CounterStat: React.FC<{ value: number; suffix?: string; label: string; color: string; delay: number }> = ({
  value, suffix = '', label, color, delay,
}) => {
  const numRef = useCounter(value, 1600);
  return (
    <div className="text-center reveal" style={{ transitionDelay: `${delay}ms` }}>
      <p className={`text-4xl sm:text-5xl lg:text-6xl font-black tabular-nums tracking-tight ${color}`}>
        <span ref={numRef as React.RefObject<HTMLSpanElement>}>0</span>{suffix}
      </p>
      <p className="text-xs sm:text-sm text-white/50 font-medium uppercase tracking-wider mt-2">{label}</p>
    </div>
  );
};

/* ── Interactive Live AI Simulator ─────────────────────────── */
const SAMPLE_ISSUES = [
  {
    id: 1,
    button: '💧 Water Main Burst',
    input: 'Large underground water pipe ruptured on 4th Main Road near Metro Pillar 42. High-pressure clean drinking water is flooding the street.',
    location: '4th Main Road, Zone 2',
    category: 'Water',
    priority: 'HIGH',
    dept: 'Water Supply & Sewerage Board',
    confidence: 99,
    eta: '2–4 Hours',
  },
  {
    id: 2,
    button: '💡 Live Wire Hazard',
    input: 'Storm caused heavy streetlight pole to collapse across the central pedestrian walkway. Exposed wires sparking near school gate.',
    location: 'Ring Road, Sector 4',
    category: 'Streetlights',
    priority: 'CRITICAL',
    dept: 'Electrical & Power Infrastructure',
    confidence: 97,
    eta: '1–2 Hours',
  },
  {
    id: 3,
    button: '🗑️ Garbage Accumulation',
    input: 'Unattended solid waste dump overflowing into drainage canal for 4 days. Strong odor and hazardous blockage in neighborhood.',
    location: 'Market Road, Ward 12',
    category: 'Garbage',
    priority: 'HIGH',
    dept: 'Solid Waste Management Dept',
    confidence: 95,
    eta: '4–6 Hours',
  },
];

const HeroAISimulator: React.FC = () => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const current = SAMPLE_ISSUES[selectedIdx];

  const handleSelect = (idx: number) => {
    if (idx === selectedIdx && !isSimulating) return;
    setSelectedIdx(idx);
    setIsSimulating(true);
    setTimeout(() => setIsSimulating(false), 600);
  };

  return (
    <div className="card p-6 bg-[#0E0E0E] border-white/12 rounded-3xl relative overflow-hidden shadow-2xl">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600] to-transparent" />

      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className="telemetry-chip-red inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-[#E10600]/10 px-2.5 py-1 rounded-md">
            <span className="w-2 h-2 rounded-full bg-[#E10600] animate-pulse" />
            LIVE AI ROUTING ENGINE
          </span>
        </div>
        <span className="text-[11px] font-mono text-white/40">GROUNDED TELEMETRY</span>
      </div>

      {/* Sample selector pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {SAMPLE_ISSUES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => handleSelect(i)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 flex-shrink-0 ${
              selectedIdx === i
                ? 'bg-[#E10600] text-white shadow-lg glow-red-sm'
                : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/8'
            }`}
          >
            {s.button}
          </button>
        ))}
      </div>

      {/* Input query container */}
      <div className="bg-[#141414] border border-white/8 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase text-white/40">Citizen Input Telemetry</span>
          <span className="text-[10px] font-mono text-[#FFC400]">📍 {current.location}</span>
        </div>
        <p className="text-xs text-white/90 leading-relaxed font-sans italic">
          "{current.input}"
        </p>
      </div>

      {/* Output card */}
      {isSimulating ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2">
          <div className="w-6 h-6 border-2 border-[#E10600]/20 border-t-[#E10600] rounded-full animate-spin" />
          <p className="text-xs font-mono text-[#FFC400] animate-pulse">EVALUATING HAZARD & INITIATING DISPATCH...</p>
        </div>
      ) : (
        <div className="space-y-3 animate-fadeIn">
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white/4 border border-white/8 rounded-xl p-2.5 text-center">
              <span className="text-[10px] font-mono uppercase text-white/40 block">Category</span>
              <span className="text-xs font-bold text-white mt-1 block">{current.category}</span>
            </div>
            <div className="bg-white/4 border border-white/8 rounded-xl p-2.5 text-center">
              <span className="text-[10px] font-mono uppercase text-white/40 block">Priority</span>
              <span className={`text-xs font-bold mt-1 block ${
                current.priority === 'CRITICAL' ? 'text-[#E10600]' : 'text-[#FFC400]'
              }`}>
                {current.priority}
              </span>
            </div>
            <div className="bg-white/4 border border-white/8 rounded-xl p-2.5 text-center">
              <span className="text-[10px] font-mono uppercase text-white/40 block">Confidence</span>
              <span className="text-xs font-bold text-[#22C55E] mt-1 block">{current.confidence}%</span>
            </div>
          </div>

          <div className="bg-white/4 border border-white/8 rounded-2xl p-3.5 flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-3">
              <span className="text-[10px] font-mono uppercase text-white/40 block">Assigned Municipal Authority</span>
              <span className="text-xs font-semibold text-white truncate block mt-0.5">{current.dept}</span>
            </div>
            <span className="text-xs font-mono text-[#FFC400] bg-[#FFC400]/10 border border-[#FFC400]/25 px-2.5 py-1 rounded-lg flex-shrink-0">
              SLA: {current.eta}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Main Landing Page ─────────────────────────────────────── */
export default function LandingPage() {
  const { isAuthenticated, isCitizen } = useAuth();
  const pageRef = useScrollReveal() as React.RefObject<HTMLDivElement>;
  const [activeSection, setActiveSection] = useState(1);

  // Scroll tracking to update section counter
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const current = Math.min(6, Math.max(1, Math.floor((scrollY + windowHeight / 3) / windowHeight) + 1));
      setActiveSection(current);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={pageRef} className="min-h-screen bg-[#070707] text-white relative selection:bg-[#E10600] selection:text-white">

      {/* ── Fixed Cinematic Section Tracker (Left Desktop) ──────────────── */}
      <div className="cinematic-track hidden lg:flex flex-col items-center gap-4">
        <span className="font-mono text-xs font-black text-white/40">
          0{activeSection} <span className="text-white/20">/ 06</span>
        </span>
        <div className="cinematic-progress-bar h-24 rounded-full">
          <div
            className="cinematic-progress-fill rounded-full"
            style={{ height: `${(activeSection / 6) * 100}%` }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((sec) => (
            <button
              key={sec}
              onClick={() => {
                const el = document.getElementById(`section-0${sec}`);
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                activeSection === sec ? 'bg-[#E10600] scale-150 glow-red-sm' : 'bg-white/20 hover:bg-white/40'
              }`}
              aria-label={`Jump to Section 0${sec}`}
            />
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          SECTION 01: THE CIVIC INTELLIGENCE ENGINE (HERO)
      ══════════════════════════════════════════════════ */}
      <section id="section-01" className="relative min-h-screen flex items-center pt-24 pb-20 px-4 sm:px-6 lg:px-12 overflow-hidden border-b border-white/8">
        <div className="giant-watermark top-12 left-6">CIVIC</div>
        <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
        <div className="ambient-glow-red w-[600px] h-[600px] -top-32 -left-32 opacity-25" />
        <div className="ambient-glow-yellow w-[500px] h-[500px] top-1/2 right-0 opacity-20" />

        <div className="relative max-w-7xl mx-auto w-full">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            
            {/* Left Narrative */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2.5 section-counter-badge">
                <span className="w-2 h-2 rounded-full bg-[#E10600] animate-pulse" />
                <span>01 / 06 · THE CIVIC INTELLIGENCE ENGINE</span>
              </div>

              <h1 className="oversized-heading text-white">
                REPORT.<br />
                <span className="gradient-text-red">RESOLVE.</span><br />
                TRANSFORM.
              </h1>

              <p className="text-lg sm:text-xl text-white/60 leading-relaxed max-w-2xl font-light">
                An autonomous municipal resolution engine. Transforming messy citizen reports into verified, prioritized work orders routed directly to municipal field teams in under 2 seconds.
              </p>

              {/* Action CTAs */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                {isAuthenticated && isCitizen ? (
                  <Link to="/dashboard" className="btn-primary-lg glow-red shadow-xl text-base px-8 py-4">
                    Open Citizen Dashboard <ArrowRight className="w-5 h-5" />
                  </Link>
                ) : (
                  <>
                    <Link to="/register" className="btn-primary-lg glow-red shadow-xl text-base px-8 py-4">
                      Start as Citizen <ArrowRight className="w-5 h-5" />
                    </Link>
                    <Link to="/track" className="btn-secondary text-base px-7 py-4">
                      <MapPin className="w-5 h-5 text-[#FFC400]" /> Track Complaint ID
                    </Link>
                  </>
                )}
                <Link to="/call" className="btn-ghost text-xs text-white/60 hover:text-white flex items-center gap-2 border border-white/10 px-4 py-3.5 rounded-xl">
                  <PhoneCall className="w-4 h-4 text-[#22C55E]" /> AI Helpline Simulator
                </Link>
              </div>

              {/* Operational Proof Points */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/8 max-w-lg">
                <div>
                  <p className="font-mono text-xl font-bold text-white">99.2%</p>
                  <p className="text-[11px] text-white/40 uppercase">Classification SLA</p>
                </div>
                <div>
                  <p className="font-mono text-xl font-bold text-[#22C55E]">2.4 hrs</p>
                  <p className="text-[11px] text-white/40 uppercase">Avg Response</p>
                </div>
                <div>
                  <p className="font-mono text-xl font-bold text-[#FFC400]">Strict</p>
                  <p className="text-[11px] text-white/40 uppercase">Role Isolation</p>
                </div>
              </div>
            </div>

            {/* Right Interactive Simulator */}
            <div className="lg:col-span-5 space-y-4">
              <HeroAISimulator />
              <div className="h-[220px] rounded-3xl overflow-hidden border border-white/10 relative shadow-2xl">
                <HeroMap />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION 02: AUTONOMOUS RESOLUTION PIPELINE
      ══════════════════════════════════════════════════ */}
      <section id="section-02" className="relative py-28 px-4 sm:px-6 lg:px-12 bg-[#0A0A0A] border-b border-white/8">
        <div className="giant-watermark top-8 right-6">PIPELINE</div>
        <div className="max-w-7xl mx-auto relative">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div>
              <div className="inline-flex section-counter-badge mb-3">
                02 / 06 · INTELLIGENCE PIPELINE
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                From Multimodal Report<br />to Verified Municipal Closeout.
              </h2>
            </div>
            <p className="text-sm text-white/50 max-w-md">
              Every complaint triggers a deterministic lifecycle pipeline ensuring accountability, priority SLA escalation, and zero lost tickets.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                step: '01',
                title: 'Problem Ingestion',
                subtitle: 'Web, Voice Call, or AI Chat',
                desc: 'Citizen describes issue naturally with photo and GPS location accuracy.',
                color: 'border-[#E10600]/30 hover:border-[#E10600]',
              },
              {
                step: '02',
                title: 'Multi-Model NLP',
                subtitle: 'Local LLM + Fallback',
                desc: 'Identifies category (Roads, Water, Garbage), severity rating (1-10), and target ward.',
                color: 'border-[#FFC400]/30 hover:border-[#FFC400]',
              },
              {
                step: '03',
                title: 'Authority Routing',
                subtitle: 'Instant Work Order',
                desc: 'Auto-routed to the specific Department Head and on-duty field inspection crew.',
                color: 'border-[#22C55E]/30 hover:border-[#22C55E]',
              },
              {
                step: '04',
                title: 'Verified Resolution',
                subtitle: 'Real-time Citizen Tracking',
                desc: 'Field team uploads status update and photo. Citizen receives live resolution notice.',
                color: 'border-white/20 hover:border-white/40',
              },
            ].map((card, i) => (
              <div
                key={i}
                className={`card p-6 bg-[#111111] border ${card.color} rounded-2xl flex flex-col justify-between transition-all duration-200 group hover:-translate-y-1 shadow-lg`}
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <span className="font-mono text-3xl font-black text-white/20 group-hover:text-white transition-colors">{card.step}</span>
                    <span className="w-2 h-2 rounded-full bg-white/20 group-hover:bg-[#E10600] transition-colors" />
                  </div>
                  <h3 className="font-black text-lg text-white mb-1">{card.title}</h3>
                  <p className="text-xs font-semibold text-[#FFC400] mb-3">{card.subtitle}</p>
                  <p className="text-xs text-white/50 leading-relaxed">{card.desc}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-white/6 flex items-center gap-1 text-[11px] font-bold text-white/40 group-hover:text-white transition-colors">
                  <span>Explore Architecture</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION 03: LIVE RESOLUTION TELEMETRY
      ══════════════════════════════════════════════════ */}
      <section id="section-03" className="relative py-24 px-4 sm:px-6 lg:px-12 bg-[#070707] border-b border-white/8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex section-counter-badge mb-3">
              03 / 06 · LIVE TELEMETRY
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Municipal Operations at Scale
            </h2>
            <p className="text-white/40 mt-3 max-w-xl mx-auto text-sm">
              Real-time telemetry across municipal zones, emergency infrastructure repairs, and citizen engagement.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-8 border-y border-white/8 bg-[#0D0D0D] rounded-3xl p-8">
            <CounterStat value={1842} label="Complaints Processed" color="text-white" delay={0} />
            <CounterStat value={1520} label="Successfully Resolved" color="text-[#22C55E]" delay={100} />
            <CounterStat value={98} suffix="%" label="AI Routing Accuracy" color="text-[#FFC400]" delay={200} />
            <CounterStat value={2} suffix="h" label="Average First Action" color="text-white" delay={300} />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION 04: STRICT CITIZEN VS ADMIN ISOLATION
      ══════════════════════════════════════════════════ */}
      <section id="section-04" className="relative py-28 px-4 sm:px-6 lg:px-12 bg-[#0A0A0A] border-b border-white/8">
        <div className="giant-watermark bottom-6 left-6">SEPARATION</div>
        <div className="max-w-7xl mx-auto relative">
          
          <div className="max-w-2xl mb-16">
            <div className="inline-flex section-counter-badge mb-3">
              04 / 06 · ZERO DATA LEAKAGE ARCHITECTURE
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Strict Citizen & Admin Isolation
            </h2>
            <p className="text-white/50 text-sm mt-3 leading-relaxed">
              Designed from the ground up with military-grade role isolation. Citizens only ever view their own complaints, while administrators receive high-level intelligence and operational controls.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Citizen Column */}
            <div className="card p-8 bg-[#111111] border border-white/12 rounded-3xl space-y-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#22C55E]" />
              <div className="flex items-center justify-between">
                <span className="telemetry-chip-green text-xs font-bold px-3 py-1">CITIZEN PORTAL</span>
                <span className="text-xs font-mono text-white/30">PUBLIC / SECURE</span>
              </div>
              <h3 className="text-2xl font-black text-white">Citizen Experience</h3>
              <ul className="space-y-3.5 text-sm text-white/70">
                <li className="flex items-center gap-2.5">
                  <CheckCircle className="w-4 h-4 text-[#22C55E] flex-shrink-0" />
                  <span>Submit complaints with text, camera upload, and GPS location</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle className="w-4 h-4 text-[#22C55E] flex-shrink-0" />
                  <span>View strictly their own reports on their personal dashboard</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle className="w-4 h-4 text-[#22C55E] flex-shrink-0" />
                  <span>Track status timeline in real-time with unique Complaint ID</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle className="w-4 h-4 text-[#22C55E] flex-shrink-0" />
                  <span>Engage with 24/7 AI Citizen Assistant & Voice Helpline</span>
                </li>
              </ul>
              <div className="pt-4 border-t border-white/8">
                <Link to="/register" className="btn-secondary w-full justify-center py-3">
                  Register as Citizen →
                </Link>
              </div>
            </div>

            {/* Admin Column */}
            <div className="card p-8 bg-[#111111] border border-white/12 rounded-3xl space-y-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#E10600]" />
              <div className="flex items-center justify-between">
                <span className="telemetry-chip-red text-xs font-bold px-3 py-1">AUTHORITY COMMAND CENTER</span>
                <span className="text-xs font-mono text-white/30">ADMIN ACCESS ONLY</span>
              </div>
              <h3 className="text-2xl font-black text-white">Operations Control</h3>
              <ul className="space-y-3.5 text-sm text-white/70">
                <li className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-[#E10600] flex-shrink-0" />
                  <span>AI Daily Civic Brief with real-time incident cluster detection</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-[#E10600] flex-shrink-0" />
                  <span>Integrated Admin AI Operations Copilot for decision support</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-[#E10600] flex-shrink-0" />
                  <span>Priority dispatch queue, team assignment, and status updates</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-[#E10600] flex-shrink-0" />
                  <span>Interactive geospatial map view with emergency hotspot clustering</span>
                </li>
              </ul>
              <div className="pt-4 border-t border-white/8">
                <Link to="/admin/login" className="btn-primary w-full justify-center py-3 glow-red-sm">
                  Access Admin Operations →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION 05: MUNICIPAL CATEGORY COVERAGE
      ══════════════════════════════════════════════════ */}
      <section id="section-05" className="relative py-28 px-4 sm:px-6 lg:px-12 bg-[#070707] border-b border-white/8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex section-counter-badge mb-3">
              05 / 06 · MUNICIPAL CATEGORIES
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              Full Spectrum Infrastructure Coverage
            </h2>
            <p className="text-white/40 mt-3 max-w-xl mx-auto text-sm">
              Trained on extensive civic taxonomy to route complaints accurately across departments.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: '🛣️', label: 'Roads', desc: 'Potholes, cracks, resurfacing' },
              { icon: '🗑️', label: 'Garbage', desc: 'Overflows, dumps, sanitation' },
              { icon: '🌊', label: 'Drainage', desc: 'Clogged drains, floods' },
              { icon: '💧', label: 'Water', desc: 'Pipeline leaks, contamination' },
              { icon: '💡', label: 'Streetlights', desc: 'Dark zones, live wires' },
              { icon: '🏗️', label: 'Infrastructure', desc: 'Encroachments, signage' },
            ].map((cat, i) => (
              <div
                key={cat.label}
                className="card p-5 bg-[#0E0E0E] border-white/8 hover:border-[#E10600]/40 rounded-2xl flex flex-col items-center text-center transition-all duration-200 hover:-translate-y-1 group cursor-default"
              >
                <span className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-200">{cat.icon}</span>
                <p className="text-sm font-bold text-white mb-1">{cat.label}</p>
                <p className="text-[11px] text-white/40">{cat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION 06: DISPATCH & ENGAGEMENT (ACTION)
      ══════════════════════════════════════════════════ */}
      <section id="section-06" className="relative py-32 px-4 sm:px-6 lg:px-12 bg-[#0A0A0A] overflow-hidden">
        <div className="ambient-glow-red w-[600px] h-[600px] top-0 right-0 opacity-20" />
        <div className="ambient-glow-yellow w-[500px] h-[500px] bottom-0 left-0 opacity-15" />
        
        <div className="max-w-4xl mx-auto text-center relative z-10 space-y-8">
          <div className="inline-flex section-counter-badge mb-2">
            06 / 06 · INITIATE CIVIC RESOLUTION
          </div>

          <h2 className="oversized-heading text-white">
            TRANSFORM YOUR<br />
            <span className="gradient-text-red">MUNICIPALITY TODAY.</span>
          </h2>

          <p className="text-lg text-white/60 max-w-xl mx-auto font-light leading-relaxed">
            Report a civic concern in seconds. Let artificial intelligence classify, prioritize, and coordinate resolution with your city authorities.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            {isAuthenticated ? (
              <Link to="/report" className="btn-primary-lg glow-red shadow-2xl text-base px-8 py-4 w-full sm:w-auto">
                File a Complaint <ArrowRight className="w-5 h-5" />
              </Link>
            ) : (
              <>
                <Link to="/register" className="btn-primary-lg glow-red shadow-2xl text-base px-8 py-4 w-full sm:w-auto">
                  Create Citizen Account <ArrowRight className="w-5 h-5" />
                </Link>
                <Link to="/login" className="btn-secondary text-base px-8 py-4 w-full sm:w-auto">
                  Sign In to Portal
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════ */}
      <footer className="border-t border-white/8 bg-[#070707] py-12 px-4 sm:px-6 lg:px-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#141414] border border-white/12 rounded-xl flex items-center justify-center p-1 shadow-md">
              <EagleEyeLogo size={24} />
            </div>
            <div className="flex items-baseline gap-1 font-black">
              <span className="text-white">CIVIC</span>
              <span className="text-[#E10600]">RESOLVE</span>
              <span className="text-[#FFC400] text-xs ml-0.5">AI</span>
            </div>
            <span className="text-[10px] bg-[#E10600]/15 text-[#E10600] border border-[#E10600]/30 px-2 py-0.5 rounded-full font-bold">
              SIH 2026
            </span>
          </div>

          <p className="text-xs text-white/40 text-center">
            CivicResolve AI · Public Sector Municipal Intelligence Platform
          </p>

          <div className="flex items-center gap-6 text-xs text-white/50">
            <Link to="/how-it-works" className="hover:text-white transition-colors">Pipeline</Link>
            <Link to="/track" className="hover:text-white transition-colors">Track ID</Link>
            <Link to="/register" className="hover:text-white transition-colors">Citizen</Link>
            <Link to="/admin/login" className="hover:text-white flex items-center gap-1 text-[#E10600]">
              <Shield className="w-3.5 h-3.5" /> Authority
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
