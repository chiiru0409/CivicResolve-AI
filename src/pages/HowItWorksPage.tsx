import React from 'react';
import { motion } from 'motion/react';
import { Brain, ArrowDown, Code2, GitBranch, CheckCircle, Zap } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import { StaggerContainer, StaggerItem } from '../components/StaggerContainer';
import { cardGestures } from '../utils/motion';

const pipeline = [
  { step: '01', icon: '👤', color: 'border-blue-500/30 bg-blue-500/5',    badge: 'bg-blue-500/10 text-blue-400',    label: 'Citizens Report',    desc: 'Citizens submit text descriptions, photos, and location data about civic issues they encounter.' },
  { step: '02', icon: '📥', color: 'border-civic-yellow/30 bg-civic-yellow/5', badge: 'bg-civic-yellow/10 text-civic-yellow', label: 'Multimodal Input',   desc: 'System accepts Text + Image + Location simultaneously for comprehensive issue understanding.' },
  { step: '03', icon: '🧠', color: 'border-civic-red/30 bg-civic-red/5',   badge: 'bg-civic-red/10 text-civic-red',  label: 'AI Understanding',  desc: 'LLM + Vision Model analyzes the complaint, extracting key information and context.' },
  { step: '04', icon: '🏷️', color: 'border-civic-yellow/30 bg-civic-yellow/5', badge: 'bg-civic-yellow/10 text-civic-yellow', label: 'Classification',    desc: 'Issues classified into: Roads, Garbage, Water, Drainage, Streetlight, or Infrastructure.' },
  { step: '05', icon: '⚡', color: 'border-civic-red/30 bg-civic-red/5',   badge: 'bg-civic-red/10 text-civic-red',  label: 'Priority Engine',   desc: 'AI determines urgency: LOW, MEDIUM, or HIGH based on safety risk and public impact.' },
  { step: '06', icon: '🏢', color: 'border-civic-yellow/30 bg-civic-yellow/5', badge: 'bg-civic-yellow/10 text-civic-yellow', label: 'Authority Router',  desc: 'Complaint automatically routed to the correct Municipal Department and zone team.' },
  { step: '07', icon: '🎫', color: 'border-civic-success/30 bg-civic-success/5', badge: 'bg-civic-success/10 text-civic-success', label: 'Ticket Engine',    desc: 'Unique CR-YYYY-XXXXXX ID generated. Status tracking enabled with real-time timeline.' },
  { step: '08', icon: '🚨', color: 'border-civic-red/30 bg-civic-red/5',   badge: 'bg-civic-red/10 text-civic-red',  label: 'Escalation Agent', desc: 'Unresolved complaints are automatically escalated with reminders to senior authorities.' },
  { step: '09', icon: '📊', color: 'border-blue-500/30 bg-blue-500/5',     badge: 'bg-blue-500/10 text-blue-400',    label: 'Analytics Agent',  desc: 'AI detects recurring civic issues and generates actionable recommendations for prevention.' },
];

const techStack = [
  { label: 'Frontend',   tech: 'React 18 + TypeScript + Vite + Motion',   color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  { label: 'Backend',    tech: 'FastAPI + Python + REST API',     color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30' },
  { label: 'Database',   tech: 'Neon PostgreSQL (Persistent Cloud DB)', color: 'text-civic-success bg-civic-success/10 border-civic-success/30' },
  { label: 'AI Engine',  tech: 'Local LLM + Vision Underwriting', color: 'text-civic-red bg-civic-red/10 border-civic-red/30' },
  { label: 'Routing',    tech: 'React Router v6',                 color: 'text-civic-yellow bg-civic-yellow/10 border-civic-yellow/30' },
  { label: 'Maps',       tech: 'Leaflet + OpenStreetMap GIS',     color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/30' },
];

const futureIntegrations = [
  { name: 'Google ADK',       icon: '🌐', desc: 'Agent Development Kit for orchestrating AI agents' },
  { name: 'LangGraph',        icon: '🔗', desc: 'Multi-agent graph for complex complaint workflows' },
  { name: 'LangChain',        icon: '⛓️', desc: 'LLM chains for nuanced complaint understanding' },
  { name: 'Vision Models',    icon: '👁️', desc: 'Gemini Vision / GPT-4V for real image analysis' },
  { name: 'GIS / Maps APIs',  icon: '🗺️', desc: 'Real-time geospatial complaint mapping' },
  { name: 'Supabase',         icon: '🏛️', desc: 'PostgreSQL + Auth + Realtime + Storage' },
  { name: 'Push Notifications',icon: '🔔', desc: 'SMS, Email, Push alerts for citizens' },
  { name: 'IoT Sensors',      icon: '📡', desc: 'Smart city sensor data for proactive detection' },
];

const HowItWorksPage: React.FC = () => (
  <PageTransition className="min-h-screen bg-civic-black pt-20 pb-16">
    <div className="max-w-4xl mx-auto px-4 sm:px-6">

      {/* Header */}
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 bg-civic-red/10 border border-civic-red/30 text-civic-red text-sm font-bold px-4 py-2 rounded-full mb-5 font-mono shadow-[0_0_12px_rgba(225,6,0,0.15)]">
          <Brain className="w-4 h-4" />
          AI Architecture
        </div>
        <h1 className="text-4xl sm:text-5xl font-black text-civic-text mb-4 font-display">
          How <span className="text-civic-red">CivicResolve</span> AI Works
        </h1>
        <p className="text-lg text-civic-muted max-w-2xl mx-auto font-sans">
          A multi-agent AI system that transforms citizen reports into resolved civic actions
          through intelligent classification, routing, and escalation.
        </p>
      </div>

      {/* Pipeline */}
      <StaggerContainer className="space-y-2 mb-16">
        {pipeline.map((step, i) => (
          <StaggerItem key={step.step}>
            <motion.div
              {...cardGestures}
              className={`flex gap-4 items-start p-5 rounded-2xl border ${step.color} transition-colors hover:border-white/20`}
            >
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-xl bg-civic-elevated border border-civic-border flex items-center justify-center text-2xl">
                  {step.icon}
                </div>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border font-mono ${step.badge}`}>{step.step}</span>
              </div>
              <div className="flex-1">
                <h3 className="font-black text-civic-text text-base font-display">{step.label}</h3>
                <p className="text-civic-muted text-sm mt-1 leading-relaxed font-sans">{step.desc}</p>
              </div>
            </motion.div>
            {i < pipeline.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="w-4 h-4 text-civic-border" />
              </div>
            )}
          </StaggerItem>
        ))}
      </StaggerContainer>

      {/* Tech stack */}
      <div className="card mb-6 shadow-xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-civic-elevated border border-civic-border rounded-xl flex items-center justify-center">
            <Code2 className="w-5 h-5 text-civic-yellow" />
          </div>
          <div>
            <h2 className="text-xl font-black text-civic-text font-display">Current Tech Stack</h2>
            <p className="text-sm text-civic-muted font-sans">Production architecture with authoritative Neon PostgreSQL backend</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {techStack.map((item) => (
            <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-civic-elevated border border-civic-border font-mono">
              <span className={`text-xs font-black px-2 py-1 rounded-lg border ${item.color}`}>{item.label}</span>
              <span className="text-sm text-civic-muted">{item.tech}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Future integrations */}
      <div className="relative bg-civic-surface border border-civic-red/20 rounded-2xl p-8 overflow-hidden shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-civic-red to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-civic-red/10 border border-civic-red/30 rounded-xl flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-civic-red" />
            </div>
            <div>
              <h2 className="text-xl font-black text-civic-text font-display">Production Integrations</h2>
              <p className="text-sm text-civic-muted font-sans">Ready for real API connections & live agent workflows</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {futureIntegrations.map((item) => (
              <div key={item.name} className="flex items-start gap-3 bg-civic-elevated/50 hover:bg-civic-elevated rounded-xl p-4 transition-colors border border-civic-border">
                <span className="text-2xl flex-shrink-0">{item.icon}</span>
                <div>
                  <p className="font-bold text-civic-text text-sm font-display">{item.name}</p>
                  <p className="text-civic-muted text-xs mt-0.5 font-sans">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-5 border-t border-civic-border">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-civic-success" />
              <p className="text-sm text-civic-muted font-sans">
                All mock service functions are structured for direct API replacement — zero architectural refactoring required.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageTransition>
);

export default HowItWorksPage;
