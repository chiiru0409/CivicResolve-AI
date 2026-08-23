import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle, MapPin, Brain,
  Zap, Shield,
  PhoneCall, Camera, Cpu, Radio, CheckCircle2,
  Layers
} from 'lucide-react';
import HeroMap from '../components/HeroMap';
import { useAuth } from '../hooks/useAuth';
import { useScrollReveal, useCounter } from '../hooks/useScrollReveal';
import EagleEyeLogo from '../components/EagleEyeLogo';
import Civic3DHero from '../components/Civic3DHero';
import CivicTelemetryGrid from '../components/CivicTelemetryGrid';

/* ── Counter Stat Component ─────────────────────────────────── */
const CounterStat: React.FC<{ value: number; suffix?: string; label: string; color: string; delay: number }> = ({
  value, suffix = '', label, color, delay,
}) => {
  const numRef = useCounter(value, 1600);
  return (
    <div className="text-center reveal" style={{ transitionDelay: `${delay}ms` }}>
      <p className={`text-4xl sm:text-5xl lg:text-6xl font-black tabular-nums tracking-tight font-display ${color}`}>
        <span ref={numRef as React.RefObject<HTMLSpanElement>}>0</span>{suffix}
      </p>
      <p className="text-xs sm:text-sm text-white/50 font-semibold uppercase tracking-wider mt-2 font-mono">{label}</p>
    </div>
  );
};

/* ── Interactive Flow Network Component ─────────────────────── */
const AI_PIPELINE_NODES = [
  { id: 1, label: 'Citizen Intake', sub: 'Voice, Camera, Web', icon: Radio, color: 'text-white', border: 'border-white/20' },
  { id: 2, label: 'Neural Classifier', sub: 'NLP & Geo-Tagging', icon: Brain, color: 'text-[#FFC400]', border: 'border-[#FFC400]/40' },
  { id: 3, label: 'SLA Prioritization', sub: 'Emergency Triage', icon: Zap, color: 'text-[#E10600]', border: 'border-[#E10600]/40' },
  { id: 4, label: 'Field Authority', sub: 'Municipal Dispatch', icon: Shield, color: 'text-[#22C55E]', border: 'border-[#22C55E]/40' },
  { id: 5, label: 'Resolution Close', sub: 'Citizen Verified', icon: CheckCircle2, color: 'text-white', border: 'border-white/30' },
];

const InteractivePipelineNetwork: React.FC = () => {
  const [activeStep, setActiveStep] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev % 5) + 1);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full py-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 relative">
        {/* Continuous Data line for desktop */}
        <div className="hidden md:block absolute top-1/2 left-8 right-8 h-0.5 bg-white/10 -translate-y-1/2 z-0">
          <div
            className="h-full bg-gradient-to-r from-[#E10600] via-[#FFC400] to-[#22C55E] transition-all duration-700"
            style={{ width: `${((activeStep - 1) / 4) * 100}%` }}
          />
        </div>

        {AI_PIPELINE_NODES.map((node) => {
          const Icon = node.icon;
          const isActive = activeStep === node.id;
          const isPassed = activeStep > node.id;

          return (
            <button
              key={node.id}
              onClick={() => setActiveStep(node.id)}
              className={`relative z-10 flex flex-row md:flex-col items-center gap-3 p-3.5 rounded-2xl w-full md:w-44 transition-all duration-300 ${
                isActive
                  ? 'bg-[#151515] border-2 border-[#E10600] shadow-[0_0_25px_rgba(225,6,0,0.35)] scale-105'
                  : isPassed
                  ? 'bg-[#101010] border border-[#22C55E]/30 text-white/80'
                  : 'bg-[#0E0E0E] border border-white/8 text-white/40 hover:border-white/20'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-[#E10600] text-white node-glow-pulse'
                    : isPassed
                    ? 'bg-[#22C55E]/20 text-[#22C55E]'
                    : 'bg-white/5 text-white/40'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-left md:text-center min-w-0">
                <p className="text-xs font-bold text-white truncate font-display">{node.label}</p>
                <p className="text-[10px] text-white/40 font-mono truncate">{node.sub}</p>
              </div>
              {isActive && (
                <span className="hidden md:block absolute -top-2 px-2 py-0.5 rounded-full bg-[#E10600] text-[9px] font-black tracking-widest uppercase text-white shadow-md">
                  ACTIVE
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ── Interactive Live AI Simulator ─────────────────────────── */
const SAMPLE_ISSUES = [
  {
    id: 1,
    button: '💧 Water Main Rupture',
    input: 'Large underground water pipe ruptured on 4th Main Road near Metro Pillar 42. High-pressure clean drinking water is flooding the street.',
    location: '4th Main Road, Ward 12, Indiranagar',
    category: 'Water',
    priority: 'HIGH',
    dept: 'Water Supply & Sewerage Board',
    confidence: 99,
    eta: '2–4 Hours',
    severity: 9,
  },
  {
    id: 2,
    button: '⚡ Live Sparking Wire',
    input: 'Storm caused heavy streetlight pole to collapse across the central pedestrian walkway. Exposed wires sparking near school gate.',
    location: 'Ring Road, Sector 4, Outer Ring',
    category: 'Streetlights',
    priority: 'CRITICAL',
    dept: 'Electrical & Power Infrastructure',
    confidence: 97,
    eta: '1–2 Hours',
    severity: 10,
  },
  {
    id: 3,
    button: '🗑️ Garbage Overflow',
    input: 'Unattended solid waste dump overflowing into drainage canal for 4 days. Strong odor and hazardous blockage in neighborhood.',
    location: 'Market Road, Ward 12, Commercial Hub',
    category: 'Garbage',
    priority: 'HIGH',
    dept: 'Solid Waste Management Dept',
    confidence: 95,
    eta: '4–6 Hours',
    severity: 7,
  },
  {
    id: 4,
    button: '🛣️ Hazardous Deep Pothole',
    input: 'Massive crater pothole on fast-moving arterial road near college bus stop. Vehicles swerving dangerously into oncoming traffic.',
    location: 'MG Road, Metro Pillar 45',
    category: 'Roads',
    priority: 'HIGH',
    dept: 'Municipal Roads & Infrastructure',
    confidence: 94,
    eta: '24 Hours',
    severity: 8,
  },
];

const HeroAISimulator: React.FC = () => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [customText, setCustomText] = useState('');
  const current = SAMPLE_ISSUES[selectedIdx];

  const handleSelect = (idx: number) => {
    if (idx === selectedIdx && !isSimulating) return;
    setSelectedIdx(idx);
    setIsSimulating(true);
    setTimeout(() => setIsSimulating(false), 550);
  };

  return (
    <div className="glass-panel-luxury p-6 sm:p-7 rounded-3xl relative overflow-hidden shadow-2xl cyber-border-red">
      {/* Glowing Radar Background */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-radial-gradient from-[#E10600]/10 to-transparent pointer-events-none" />

      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 mb-5 pb-3 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#E10600]/15 border border-[#E10600]/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-[#E10600]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white tracking-wide font-display">CIVIC AI INTELLIGENCE PANEL</span>
              <span className="text-[9px] font-black bg-[#E10600]/20 text-[#E10600] border border-[#E10600]/30 px-2 py-0.5 rounded-full uppercase">
                ● ANALYZING INCIDENT
              </span>
            </div>
            <span className="text-[10px] font-mono text-white/40">REAL-TIME MULTIMODAL INFERENCE</span>
          </div>
        </div>
        <span className="text-xs font-mono text-[#FFC400] hidden sm:block">99.4% SLA</span>
      </div>

      {/* Sample selector pills */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {SAMPLE_ISSUES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => handleSelect(i)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-150 flex-shrink-0 font-display ${
              selectedIdx === i
                ? 'bg-[#E10600] text-white shadow-[0_0_15px_rgba(225,6,0,0.4)]'
                : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/8'
            }`}
          >
            {s.button}
          </button>
        ))}
      </div>

      {/* Input query container */}
      <div className="bg-[#111111] border border-white/10 rounded-2xl p-4 mb-4 relative overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase text-white/40 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FFC400]" />
            CITIZEN REPORT INPUT
          </span>
          <span className="text-[10px] font-mono text-[#FFC400]">📍 {current.location}</span>
        </div>
        <p className="text-xs sm:text-sm text-white/90 leading-relaxed font-sans italic">
          "{current.input}"
        </p>
      </div>

      {/* Output card with progressive checklist */}
      {isSimulating ? (
        <div className="py-10 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-[#E10600]/20 border-t-[#E10600] rounded-full animate-spin" />
          <p className="text-xs font-mono text-[#FFC400] animate-pulse">EXTRACTING GEO-SPATIAL FEATURES & CLASSIFYING HAZARD...</p>
        </div>
      ) : (
        <div className="space-y-3.5 animate-fadeIn">
          {/* Metadata Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
              <span className="text-[10px] font-mono uppercase text-white/40 block">CATEGORY</span>
              <span className="text-xs sm:text-sm font-black text-white mt-0.5 block font-display">{current.category}</span>
            </div>
            <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
              <span className="text-[10px] font-mono uppercase text-white/40 block">PRIORITY</span>
              <span className={`text-xs sm:text-sm font-black mt-0.5 block font-display ${
                current.priority === 'CRITICAL' ? 'text-[#E10600]' : 'text-[#FFC400]'
              }`}>
                {current.priority} (SEV: {current.severity}/10)
              </span>
            </div>
            <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
              <span className="text-[10px] font-mono uppercase text-white/40 block">CONFIDENCE</span>
              <span className="text-xs sm:text-sm font-black text-[#22C55E] mt-0.5 block font-mono">{current.confidence}%</span>
            </div>
          </div>

          {/* Department Match & SLA */}
          <div className="bg-white/4 border border-white/8 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-mono uppercase text-white/40 block">ASSIGNED MUNICIPAL AUTHORITY</span>
              <span className="text-xs sm:text-sm font-bold text-white truncate block mt-0.5 font-display">{current.dept}</span>
            </div>
            <span className="text-xs font-mono font-bold text-[#FFC400] bg-[#FFC400]/10 border border-[#FFC400]/25 px-3 py-1.5 rounded-xl flex-shrink-0 self-start sm:self-center">
              DISPATCH SLA: {current.eta}
            </span>
          </div>

          {/* AI Verification Checklist */}
          <div className="pt-2 grid grid-cols-3 gap-2 text-[11px] font-medium text-white/70">
            <div className="flex items-center gap-1.5 text-[#22C55E]">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Location Verified</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#22C55E]">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Hazard Rated</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#22C55E]">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Team Alerted</span>
            </div>
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
        <div className="cinematic-progress-bar h-28 rounded-full">
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

      {/* ── 3D Interactive Sticky-Canvas HUD Hero (Scroll Scrubber) ── */}
      <Civic3DHero />

      {/* ── Technical Diagnostics Matrix (Systems Nominal) ── */}
      <CivicTelemetryGrid />

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
                <span>01 / 06 · CIVIC INTELLIGENCE PLATFORM</span>
              </div>

              <h1 className="oversized-heading text-white">
                CIVIC<br />
                <span className="text-[#E10600]">RESOLVE</span><br />
                <span className="text-white/40">AI.</span>
              </h1>

              <div className="space-y-1">
                <p className="font-display font-black text-2xl sm:text-3xl text-white tracking-wide">
                  REPORT. UNDERSTAND. RESOLVE.
                </p>
                <p className="text-base sm:text-lg text-white/60 leading-relaxed max-w-2xl font-light">
                  An autonomous civic resolution network. Transforming unstructured citizen reports into verified, high-priority work orders routed to municipal field operations in under 2 seconds.
                </p>
              </div>

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
                  <p className="text-[11px] text-white/40 uppercase font-mono">Classification SLA</p>
                </div>
                <div>
                  <p className="font-mono text-xl font-bold text-[#22C55E]">2.4 hrs</p>
                  <p className="text-[11px] text-white/40 uppercase font-mono">Avg Response</p>
                </div>
                <div>
                  <p className="font-mono text-xl font-bold text-[#FFC400]">Strict</p>
                  <p className="text-[11px] text-white/40 uppercase font-mono">Role Isolation</p>
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

          {/* Animated AI Pipeline Flow Node Diagram */}
          <div className="mt-14 pt-10 border-t border-white/8">
            <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-3 text-center md:text-left">
              AUTONOMOUS CIVIC RESOLUTION PIPELINE
            </p>
            <InteractivePipelineNetwork />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION 02: MULTIMODAL INGESTION & SCANNING
      ══════════════════════════════════════════════════ */}
      <section id="section-02" className="relative py-28 px-4 sm:px-6 lg:px-12 bg-[#0A0A0A] border-b border-white/8">
        <div className="giant-watermark top-8 right-6">SCAN</div>
        <div className="max-w-7xl mx-auto relative">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
            <div>
              <div className="inline-flex section-counter-badge mb-3">
                02 / 06 · MULTIMODAL INGESTION
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight font-display">
                Report via Voice, Camera, or Text.<br />
                <span className="text-[#E10600]">AI Underwriters Handle The Rest.</span>
              </h2>
            </div>
            <p className="text-sm text-white/50 max-w-md font-light leading-relaxed">
              Citizens are not municipal bureaucrats. CivicResolve accepts spoken dialect, messy photo evidence, and rough descriptions, standardizing every report into actionable city telemetry.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            <div className="glass-card-interactive p-7 rounded-3xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#22C55E]/15 border border-[#22C55E]/30 flex items-center justify-center text-[#22C55E]">
                <PhoneCall className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white font-display">Voice AI Helpline</h3>
              <p className="text-xs text-white/60 leading-relaxed font-light">
                Call the automated hotline. The agent transcribes spoken complaints in real-time, asks clarifying questions about landmark location, and files the report instantly.
              </p>
              <div className="pt-2 text-xs font-mono text-[#22C55E] font-bold">Latency: &lt; 800ms per turn</div>
            </div>

            <div className="glass-card-interactive p-7 rounded-3xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FFC400]/15 border border-[#FFC400]/30 flex items-center justify-center text-[#FFC400]">
                <Camera className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white font-display">Camera Evidence Analysis</h3>
              <p className="text-xs text-white/60 leading-relaxed font-light">
                Upload photos of broken asphalt or leaking pipelines. AI extracts severity, verifies visual damage, and cross-references location metadata.
              </p>
              <div className="pt-2 text-xs font-mono text-[#FFC400] font-bold">Vision Tagging: Active</div>
            </div>

            <div className="glass-card-interactive p-7 rounded-3xl space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#E10600]/15 border border-[#E10600]/30 flex items-center justify-center text-[#E10600]">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white font-display">Precision Geo-Tagging</h3>
              <p className="text-xs text-white/60 leading-relaxed font-light">
                Automatic GPS extraction with landmark verification pins every ticket to its exact municipal ward and road segment for field crew navigation.
              </p>
              <div className="pt-2 text-xs font-mono text-[#E10600] font-bold">Accuracy: ± 5 meters</div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION 03: NEURAL DUPLICATE CLUSTERING
      ══════════════════════════════════════════════════ */}
      <section id="section-03" className="relative py-28 px-4 sm:px-6 lg:px-12 bg-[#070707] border-b border-white/8 overflow-hidden">
        <div className="giant-watermark top-8 left-6">HOTSPOT</div>
        <div className="max-w-7xl mx-auto relative">
          
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex section-counter-badge">
                03 / 06 · SPATIAL DUPLICATE CLUSTERING
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight font-display">
                No Duplicate Dispatches.<br />
                <span className="text-[#FFC400]">Intelligent Incident Consolidation.</span>
              </h2>
              <p className="text-base text-white/60 font-light leading-relaxed">
                When 10 citizens report the same water pipe burst or storm drain collapse within 150 meters, CivicResolve AI automatically clusters them into a single primary operational work order.
              </p>

              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-[#FFC400]/15 text-[#FFC400] flex items-center justify-center font-bold text-xs">91%</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white">Cluster #CL-WATER-10TH</p>
                    <p className="text-[11px] text-white/40 truncate">3 reports combined · 10th Cross, Indiranagar · Single Crew Dispatched</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-white/4 border border-white/8 rounded-2xl p-3.5">
                  <span className="w-8 h-8 rounded-xl bg-[#E10600]/15 text-[#E10600] flex items-center justify-center font-bold text-xs">96%</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white">Cluster #CL-ROADS-MG</p>
                    <p className="text-[11px] text-white/40 truncate">2 reports combined · MG Road Metro Pillar 45 · Emergency Tarmac Team</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="glass-panel-luxury p-6 rounded-3xl cyber-border-gold space-y-4">
                <div className="flex items-center justify-between border-b border-white/8 pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#FFC400]" />
                    <span className="text-xs font-bold text-white font-display">AI Duplicate Detection Engine</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#22C55E]">CORRELATION: HIGH</span>
                </div>
                <div className="bg-[#111] p-4 rounded-2xl border border-white/8 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">Radius Constraint:</span>
                    <span className="font-mono text-white">150 meters</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">NLP Semantic Match:</span>
                    <span className="font-mono text-[#22C55E]">94.8% Match</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">Action:</span>
                    <span className="font-mono text-[#FFC400]">Auto-Consolidate & Notify All Citizens</span>
                  </div>
                </div>
                <p className="text-xs text-white/40 leading-relaxed italic">
                  Prevents multiple field inspection teams from arriving at the same pothole or garbage dump, reducing municipal fuel and overtime overhead by up to 40%.
                </p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION 04: STRICT CITIZEN VS ADMIN ISOLATION
      ══════════════════════════════════════════════════ */}
      <section id="section-04" className="relative py-28 px-4 sm:px-6 lg:px-12 bg-[#0A0A0A] border-b border-white/8">
        <div className="giant-watermark bottom-6 left-6">SECURITY</div>
        <div className="max-w-7xl mx-auto relative">
          
          <div className="max-w-2xl mb-16">
            <div className="inline-flex section-counter-badge mb-3">
              04 / 06 · ZERO DATA LEAKAGE ARCHITECTURE
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight font-display">
              Strict Citizen & Admin Isolation.
            </h2>
            <p className="text-white/50 text-sm mt-3 leading-relaxed font-light">
              Designed with strict cryptographic role boundaries. Citizens only ever view their own complaints, while administrators receive high-level operations intelligence and controlled tools.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Citizen Column */}
            <div className="glass-panel-luxury p-8 rounded-3xl space-y-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#22C55E]" />
              <div className="flex items-center justify-between">
                <span className="telemetry-chip-green text-xs font-bold px-3 py-1">CITIZEN PORTAL</span>
                <span className="text-xs font-mono text-white/30">PUBLIC / SECURE</span>
              </div>
              <h3 className="text-2xl font-black text-white font-display">Citizen Experience</h3>
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
            <div className="glass-panel-luxury p-8 rounded-3xl space-y-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#E10600]" />
              <div className="flex items-center justify-between">
                <span className="telemetry-chip-red text-xs font-bold px-3 py-1">AUTHORITY COMMAND CENTER</span>
                <span className="text-xs font-mono text-white/30">ADMIN ACCESS ONLY</span>
              </div>
              <h3 className="text-2xl font-black text-white font-display">Operations Control</h3>
              <ul className="space-y-3.5 text-sm text-white/70">
                <li className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-[#E10600] flex-shrink-0" />
                  <span>AI Daily Civic Brief with real-time incident cluster detection</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-[#E10600] flex-shrink-0" />
                  <span>Integrated Admin AI Operations Copilot with 1-click execution</span>
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
          SECTION 05: LIVE TELEMETRY & METRICS
      ══════════════════════════════════════════════════ */}
      <section id="section-05" className="relative py-28 px-4 sm:px-6 lg:px-12 bg-[#070707] border-b border-white/8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex section-counter-badge mb-3">
              05 / 06 · LIVE TELEMETRY
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight font-display">
              Municipal Scale Telemetry
            </h2>
            <p className="text-white/40 mt-3 max-w-xl mx-auto text-sm font-light">
              Real-time monitoring across municipal zones, emergency infrastructure repairs, and citizen resolution benchmarks.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-8 border-y border-white/8 bg-[#0D0D0D] rounded-3xl p-8 shadow-2xl">
            <CounterStat value={1842} label="Complaints Processed" color="text-white" delay={0} />
            <CounterStat value={1520} label="Successfully Resolved" color="text-[#22C55E]" delay={100} />
            <CounterStat value={98} suffix="%" label="AI Routing Accuracy" color="text-[#FFC400]" delay={200} />
            <CounterStat value={2} suffix="h" label="Average First Action" color="text-white" delay={300} />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          SECTION 06: CALL TO ACTION
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
              <span className="text-white font-display">CIVIC</span>
              <span className="text-[#E10600] font-display">RESOLVE</span>
              <span className="text-[#FFC400] text-xs ml-0.5 font-mono">AI</span>
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
