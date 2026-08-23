import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, MapPin, PhoneCall, ShieldAlert, Cpu, Sparkles,
  CheckCircle2, AlertTriangle, Radio, Activity, Zap, Layers,
  Compass, Eye, Crosshair, Terminal, Clock, ShieldCheck, Check
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const TOTAL_FRAMES = 160;

interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  type: 'tower' | 'hub' | 'residential' | 'sensor';
  color: string;
}

export const Civic3DHero: React.FC = () => {
  const { isAuthenticated, isCitizen } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [progress, setProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(1);
  const [isLoaded, setIsLoaded] = useState(true);
  const [loadPercent, setLoadPercent] = useState(100);

  // Scanner dynamic metrics
  const [activeHazardIndex, setActiveHazardIndex] = useState(0);
  const [liveConfidence, setLiveConfidence] = useState(99.4);
  const [flowStep, setFlowStep] = useState(1);

  // Reference for smooth animation frame loop
  const animFrameIdRef = useRef<number | null>(null);
  const scrollProgressRef = useRef(0);

  // 3D City building procedural data for background atmosphere
  const buildingsRef = useRef<Building[]>([
    { x: 0, z: 0, w: 75, d: 75, h: 230, type: 'tower', color: '#E10600' },
    { x: -95, z: -85, w: 60, d: 50, h: 145, type: 'hub', color: '#FFC400' },
    { x: 95, z: -85, w: 55, d: 55, h: 165, type: 'hub', color: '#E10600' },
    { x: -105, z: 85, w: 65, d: 60, h: 135, type: 'residential', color: '#3A3A3A' },
    { x: 105, z: 95, w: 60, d: 60, h: 175, type: 'tower', color: '#FFC400' },
    { x: -190, z: -45, w: 45, d: 50, h: 115, type: 'sensor', color: '#2E2E2E' },
    { x: 190, z: -45, w: 50, d: 45, h: 125, type: 'sensor', color: '#2E2E2E' },
    { x: -175, z: 125, w: 55, d: 50, h: 100, type: 'residential', color: '#3A3A3A' },
    { x: 175, z: 135, w: 50, d: 55, h: 110, type: 'residential', color: '#3A3A3A' },
    { x: 0, z: -175, w: 85, d: 40, h: 155, type: 'hub', color: '#E10600' },
    { x: 0, z: 185, w: 80, d: 45, h: 140, type: 'sensor', color: '#2E2E2E' },
    { x: -260, z: -155, w: 40, d: 40, h: 85, type: 'sensor', color: '#2E2E2E' },
    { x: 260, z: -155, w: 40, d: 40, h: 90, type: 'sensor', color: '#2E2E2E' },
    { x: -250, z: 185, w: 45, d: 45, h: 80, type: 'residential', color: '#2E2E2E' },
    { x: 250, z: 195, w: 40, d: 40, h: 95, type: 'sensor', color: '#2E2E2E' },
  ]);

  // Optical Triage hazards data
  const hazards = [
    {
      id: '01',
      title: 'SEVERE ROAD CAVITATION / CRATER',
      category: 'ROADS & TARMAC',
      severity: '8.5 / 10',
      area: '1.4 m²',
      confidence: '99.4%',
      coords: '12.9716° N, 77.5946° E',
      landmark: 'Indiranagar 100ft Rd, Pillar 42',
      color: '#E10600',
      status: 'HAZARD CONFIRMED',
      box: { top: '24%', left: '18%', width: '160px', height: '110px' },
    },
    {
      id: '02',
      title: 'HIGH-PRESSURE WATER MAIN BURST',
      category: 'WATER UTILITIES',
      severity: '9.2 / 10',
      area: '4.8 m²',
      confidence: '97.8%',
      coords: '12.9752° N, 77.6010° E',
      landmark: 'Sector 4 Outer Ring Junction',
      color: '#FFC400',
      status: 'FLOODING IMMINENT',
      box: { top: '52%', left: '56%', width: '175px', height: '125px' },
    },
    {
      id: '03',
      title: 'EXPOSED 440V STREETLIGHT CABLE',
      category: 'ELECTRICAL INFRA',
      severity: '9.8 / 10',
      area: '0.8 m²',
      confidence: '98.9%',
      coords: '12.9698° N, 77.5890° E',
      landmark: 'MG Road Metro Gate 3',
      color: '#E10600',
      status: 'CRITICAL ARREST',
      box: { top: '32%', left: '68%', width: '150px', height: '105px' },
    },
  ];

  // Cycling timer for scanner highlights
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveHazardIndex((prev) => (prev + 1) % hazards.length);
      setFlowStep((prev) => (prev % 5) + 1);
      setLiveConfidence((prev) => +(98.5 + Math.random() * 1.3).toFixed(1));
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  // 1. Procedural 3D Background Civic Neural Grid & Holographic Wireframes
  const renderBackgroundCanvas = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, scrubProgress: number) => {
    ctx.clearRect(0, 0, width, height);

    // Deep Obsidian Backdrop
    ctx.fillStyle = '#090909';
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height * 0.52;
    const baseScale = Math.min(width, height) / 950;

    // 360° Camera rotation driven by scroll progress
    const angle = scrubProgress * Math.PI * 2 + Math.PI * 0.25;
    const pitch = 0.55;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const project = (x: number, y: number, z: number) => {
      const rx = x * cosA - z * sinA;
      const rz = x * sinA + z * cosA;
      const px = centerX + rx * baseScale * 1.45;
      const py = centerY + (rz * Math.sin(pitch) - y * Math.cos(pitch)) * baseScale * 1.45;
      const depth = rz;
      return { x: px, y: py, depth };
    };

    // Ground Wireframe Grid
    const gridSize = 450;
    const gridStep = 45;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';

    for (let gx = -gridSize; gx <= gridSize; gx += gridStep) {
      const p1 = project(gx, 0, -gridSize);
      const p2 = project(gx, 0, gridSize);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let gz = -gridSize; gz <= gridSize; gz += gridStep) {
      const p1 = project(-gridSize, 0, gz);
      const p2 = project(gridSize, 0, gz);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Rotating Radar Sweep
    const scanRadius = 380;
    const scanAngle = (Date.now() * 0.0014) % (Math.PI * 2);
    ctx.save();
    ctx.beginPath();
    const radarCenter = project(0, 0, 0);
    const sweepEnd = project(Math.cos(scanAngle) * scanRadius, 0, Math.sin(scanAngle) * scanRadius);

    const radarGrad = ctx.createRadialGradient(radarCenter.x, radarCenter.y, 10, radarCenter.x, radarCenter.y, scanRadius * baseScale);
    radarGrad.addColorStop(0, 'rgba(225, 6, 0, 0.08)');
    radarGrad.addColorStop(0.5, 'rgba(225, 6, 0, 0.02)');
    radarGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = radarGrad;
    ctx.arc(radarCenter.x, radarCenter.y, scanRadius * baseScale, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(225, 6, 0, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.moveTo(radarCenter.x, radarCenter.y);
    ctx.lineTo(sweepEnd.x, sweepEnd.y);
    ctx.stroke();
    ctx.restore();

    // 3D Buildings
    const sorted = buildingsRef.current.map((b) => {
      const p = project(b.x, 0, b.z);
      return { ...b, screenDepth: p.depth };
    }).sort((a, b) => b.screenDepth - a.screenDepth);

    sorted.forEach((b) => {
      const halfW = b.w / 2;
      const halfD = b.d / 2;
      const h = b.h;

      const b0 = project(b.x - halfW, 0, b.z - halfD);
      const b1 = project(b.x + halfW, 0, b.z - halfD);
      const b2 = project(b.x + halfW, 0, b.z + halfD);
      const b3 = project(b.x - halfW, 0, b.z + halfD);

      const t0 = project(b.x - halfW, h, b.z - halfD);
      const t1 = project(b.x + halfW, h, b.z - halfD);
      const t2 = project(b.x + halfW, h, b.z + halfD);
      const t3 = project(b.x - halfW, h, b.z + halfD);

      const isCore = b.type === 'tower' && b.x === 0;
      const wallFill = isCore ? 'rgba(225, 6, 0, 0.08)' : 'rgba(18, 18, 18, 0.6)';
      const wireColor = isCore ? 'rgba(225, 6, 0, 0.5)' : b.type === 'hub' ? 'rgba(255, 196, 0, 0.3)' : 'rgba(255, 255, 255, 0.08)';

      const drawFace = (p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) => {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fillStyle = wallFill;
        ctx.fill();
        ctx.strokeStyle = wireColor;
        ctx.lineWidth = 1;
        ctx.stroke();
      };

      drawFace(b0, b1, t1, t0);
      drawFace(b1, b2, t2, t1);
      drawFace(b2, b3, t3, t2);
      drawFace(b3, b0, t0, t3);

      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.fillStyle = isCore ? 'rgba(225, 6, 0, 0.15)' : 'rgba(24, 24, 24, 0.7)';
      ctx.fill();
      ctx.strokeStyle = wireColor;
      ctx.stroke();

      if (isCore) {
        const spireTop = project(b.x, h + 50, b.z);
        ctx.beginPath();
        ctx.moveTo((t0.x + t2.x) / 2, (t0.y + t2.y) / 2);
        ctx.lineTo(spireTop.x, spireTop.y);
        ctx.strokeStyle = 'rgba(225, 6, 0, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const pulseSize = 4 + Math.sin(Date.now() * 0.005) * 2;
        ctx.beginPath();
        ctx.arc(spireTop.x, spireTop.y, pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = '#E10600';
        ctx.shadowColor = '#E10600';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // Faint laser scanline
    const scanlineY = ((Date.now() * 0.1) % height);
    ctx.beginPath();
    ctx.moveTo(0, scanlineY);
    ctx.lineTo(width, scanlineY);
    ctx.strokeStyle = 'rgba(225, 6, 0, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, []);

  // Continuous loop for background canvas
  useEffect(() => {
    let isRunning = true;
    const loop = () => {
      if (!isRunning) return;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderBackgroundCanvas(ctx, canvas.width, canvas.height, scrollProgressRef.current);
        }
      }
      animFrameIdRef.current = requestAnimationFrame(loop);
    };
    animFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [renderBackgroundCanvas]);

  // Scroll listener & resize
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scrollableHeight = rect.height - window.innerHeight;
      const scrolled = -rect.top;
      const rawProgress = Math.max(0, Math.min(1, scrolled / Math.max(1, scrollableHeight)));

      scrollProgressRef.current = rawProgress;
      setProgress(rawProgress);

      const frameIndex = Math.min(
        TOTAL_FRAMES,
        Math.max(1, Math.floor(rawProgress * (TOTAL_FRAMES - 1)) + 1)
      );
      setCurrentFrame(frameIndex);
    };

    const handleResize = () => {
      if (!canvasRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvasRef.current.width = window.innerWidth * dpr;
      canvasRef.current.height = window.innerHeight * dpr;
      handleScroll();
    };

    handleResize();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const activeHazard = hazards[activeHazardIndex];

  return (
    <div ref={containerRef} className="relative h-[480vh] bg-[#090909]">
      {/* Sticky 100dvh Viewport Container */}
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#090909]">
        
        {/* Background 3D Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full object-cover pointer-events-none opacity-65"
        />

        {/* Cinematic Radial Obsidian Vignette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_50%,transparent_35%,rgba(9,9,9,0.75)_75%,rgba(9,9,9,0.98)_100%)]" />

        {/* ─── HUD CORNER RETICLES (#E10600) ─── */}
        <div className="pointer-events-none absolute left-6 top-24 text-[#E10600] md:left-10 md:top-28">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M 2 24 L 2 2 L 24 2" />
          </svg>
        </div>
        <div className="pointer-events-none absolute right-6 top-24 text-[#E10600] md:right-10 md:top-28">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M 0 2 L 22 2 L 22 24" />
          </svg>
        </div>
        <div className="pointer-events-none absolute bottom-14 left-6 text-[#E10600] md:bottom-16 md:left-10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M 2 0 L 2 22 L 24 22" />
          </svg>
        </div>
        <div className="pointer-events-none absolute bottom-14 right-6 text-[#E10600] md:bottom-16 md:right-10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M 0 22 L 22 22 L 22 0" />
          </svg>
        </div>

        {/* ─── LIVE TELEMETRY HEADER ─── */}
        <div className="pointer-events-none absolute left-6 top-20 z-10 flex items-center gap-2.5 md:left-10 md:top-24">
          <div className="h-px w-8 bg-[#E10600]/80" />
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/50">
            Civic Neural Grid // Live Link
          </span>
        </div>
        <div className="pointer-events-none absolute right-6 top-20 z-10 flex items-center gap-3 md:right-10 md:top-24">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/50 hidden sm:inline">
            AI Optical Vision
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#E10600] font-bold">
            99.8% Online
          </span>
          <span className="inline-block h-2 w-2 rounded-full bg-[#E10600] shadow-[0_0_10px_#E10600] animate-pulse" />
        </div>

        {/* ═════════════════════════════════════════════════════════════════════
            PHASE 1 (0% - 26% Scroll): CORE ONLINE & HOLOGRAPHIC CITY NEXUS
        ═════════════════════════════════════════════════════════════════════ */}
        <div
          className="absolute inset-0 z-20 flex items-center px-6 md:px-12 pointer-events-none"
          style={{
            opacity: progress < 0.26 ? Math.max(0, 1 - progress * 3.8) : 0,
            transform: `translateY(${progress * 50}px)`,
            transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
            pointerEvents: progress < 0.24 ? 'auto' : 'none',
          }}
        >
          <div className="mx-auto max-w-[1400px] w-full grid lg:grid-cols-12 gap-10 items-center">
            
            {/* Left Hero Narrative */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-[#E10600] backdrop-blur-md">
                <span className="inline-block h-2 w-2 rounded-full bg-[#E10600] shadow-[0_0_10px_#E10600] animate-pulse" />
                CIVIC RESOLVE AI // CORE ONLINE
              </div>

              <h1 className="font-sans text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-white leading-[0.98]">
                Report. Resolve.<br />
                <span className="text-[#E10600]">Autonomous City AI.</span>
              </h1>

              <p className="max-w-[48ch] text-sm leading-relaxed text-white/60 md:text-base font-light">
                Citizen-powered neural platform detecting potholes, garbage, water leaks, and electrical hazards in real-time. Scroll to scrub municipal telemetry diagnostics.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {isAuthenticated && isCitizen ? (
                  <Link to="/dashboard" className="btn-primary glow-red text-sm px-6 py-3">
                    Open Citizen Dashboard <ArrowRight className="w-4 h-4" />
                  </Link>
                ) : (
                  <>
                    <Link to="/register" className="btn-primary glow-red text-sm px-6 py-3">
                      Start as Citizen <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link to="/track" className="btn-secondary text-sm px-5 py-3">
                      <MapPin className="w-4 h-4 text-[#FFC400]" /> Track Complaint
                    </Link>
                  </>
                )}
                <Link to="/call" className="btn-ghost text-xs text-white/70 hover:text-white flex items-center gap-2 border border-white/10 px-4 py-3 rounded-xl">
                  <PhoneCall className="w-4 h-4 text-[#22C55E]" /> AI Helpline
                </Link>
              </div>

              {/* Mini telemetry stats badge */}
              <div className="flex flex-wrap gap-4 pt-4 border-t border-white/8 font-mono text-[11px] text-white/50">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                  Active Nodes: <span className="text-white font-bold">14,280</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FFC400]" />
                  Latency: <span className="text-[#FFC400] font-bold">0.042s</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#E10600]" />
                  Mesh Status: <span className="text-white font-bold">100% ONLINE</span>
                </div>
              </div>
            </div>

            {/* Right Center: Holographic Command Nexus Graphic */}
            <div className="lg:col-span-5 hidden lg:block">
              <div className="relative rounded-3xl border border-white/10 bg-[#121212]/85 p-6 backdrop-blur-xl shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-white/8 pb-3">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-[#E10600] animate-pulse" />
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                      AUTONOMOUS CIVIC RADAR
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2 py-0.5 rounded-full">
                    SCANNING ACTIVE
                  </span>
                </div>

                {/* Radar Grid Graphic */}
                <div className="relative h-48 rounded-2xl bg-[#090909] border border-white/8 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 grid-bg opacity-30" />
                  
                  {/* Concentric rings */}
                  <div className="absolute w-40 h-40 rounded-full border border-white/10" />
                  <div className="absolute w-28 h-28 rounded-full border border-[#E10600]/20" />
                  <div className="absolute w-16 h-16 rounded-full border border-[#E10600]/40 animate-ping opacity-20" />
                  
                  {/* Center core indicator */}
                  <div className="relative z-10 flex flex-col items-center gap-1">
                    <div className="w-5 h-5 rounded-full bg-[#E10600] flex items-center justify-center text-white shadow-[0_0_15px_#E10600]">
                      <Cpu className="w-3 h-3" />
                    </div>
                    <span className="font-mono text-[9px] text-[#FFC400] tracking-widest uppercase">
                      CORE MATRIX
                    </span>
                  </div>

                  {/* Incident dots */}
                  <div className="absolute top-8 left-12 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#E10600] shadow-[0_0_8px_#E10600]" />
                    <span className="font-mono text-[8px] text-white/50">#CR-42 (SEV 8)</span>
                  </div>
                  <div className="absolute bottom-8 right-14 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#FFC400] shadow-[0_0_8px_#FFC400]" />
                    <span className="font-mono text-[8px] text-white/50">#CR-88 (WATER)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                  <div className="bg-white/4 p-2.5 rounded-xl border border-white/6">
                    <span className="text-white/40 block uppercase">Sector Coordinates</span>
                    <span className="text-white font-bold block mt-0.5">12.9716°N, 77.5946°E</span>
                  </div>
                  <div className="bg-white/4 p-2.5 rounded-xl border border-white/6">
                    <span className="text-white/40 block uppercase">Dispatch Mode</span>
                    <span className="text-[#22C55E] font-bold block mt-0.5">AUTONOMOUS TIER 1</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════
            PHASE 2 (28% - 58% Scroll): SECTION 01 — OPTICAL TRIAGE
            Center: Large AI Computer-Vision Scanner
            Side (Right): Existing Information Card
        ═════════════════════════════════════════════════════════════════════ */}
        <div
          className="absolute inset-0 z-20 flex items-center px-6 md:px-12 pointer-events-none"
          style={{
            opacity: progress >= 0.27 && progress <= 0.58 ? 1 : 0,
            transform: `translateY(${progress >= 0.27 && progress <= 0.58 ? '0px' : progress < 0.27 ? '40px' : '-40px'})`,
            transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: progress >= 0.27 && progress <= 0.58 ? 'auto' : 'none',
          }}
        >
          <div className="mx-auto max-w-[1400px] w-full grid lg:grid-cols-12 gap-8 items-center">
            
            {/* CENTER (Col 8): Large Animated AI Computer-Vision Scanning Experience */}
            <div className="lg:col-span-8 space-y-4">
              <div className="relative rounded-3xl border border-white/12 bg-[#0D0D0D]/90 p-5 md:p-6 backdrop-blur-2xl shadow-2xl overflow-hidden">
                
                {/* Scanner Header HUD Bar */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#E10600] animate-ping" />
                    <span className="font-mono text-xs font-black tracking-widest text-white uppercase">
                      AI COMPUTER VISION // MULTISPECTRAL SCANNER
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[10px]">
                    <span className="text-white/40 hidden sm:inline">RESOLUTION: 4K @ 60 FPS</span>
                    <span className="text-[#FFC400] font-bold bg-[#FFC400]/10 border border-[#FFC400]/25 px-2 py-0.5 rounded-full">
                      CONFIDENCE: {liveConfidence}%
                    </span>
                  </div>
                </div>

                {/* Main Scanning Viewport */}
                <div className="relative h-[260px] sm:h-[300px] rounded-2xl bg-[#070707] border border-white/10 overflow-hidden">
                  {/* Background urban grid texture */}
                  <div className="absolute inset-0 grid-bg opacity-40" />
                  
                  {/* Sweeping Laser Scanline */}
                  <div
                    className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#E10600] to-transparent shadow-[0_0_12px_#E10600]"
                    style={{
                      animation: 'scanLine 2.8s ease-in-out infinite',
                    }}
                  />

                  {/* Corner Crosshairs within the Scanner */}
                  <div className="absolute top-3 left-3 text-white/30 font-mono text-[9px]">
                    [CAM-04 · OPTICAL INTAKE]
                  </div>
                  <div className="absolute top-3 right-3 text-white/30 font-mono text-[9px]">
                    GPS: {activeHazard.coords}
                  </div>
                  <div className="absolute bottom-3 left-3 text-white/30 font-mono text-[9px]">
                    FRAME: #{String(currentFrame).padStart(3, '0')} // EDGE-MODEL: ViT-B16
                  </div>
                  <div className="absolute bottom-3 right-3 text-[#22C55E] font-mono text-[9px] flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-3 h-3" /> NO DUPLICATE DETECTED
                  </div>

                  {/* Dynamic Detection Bounding Box */}
                  <div
                    className="absolute rounded-xl border-2 transition-all duration-500 shadow-2xl p-2.5 flex flex-col justify-between"
                    style={{
                      borderColor: activeHazard.color,
                      boxShadow: `0 0 20px ${activeHazard.color}30, inset 0 0 15px ${activeHazard.color}15`,
                      ...activeHazard.box,
                    }}
                  >
                    {/* Bounding Box Corner Brackets */}
                    <div className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2" style={{ borderColor: activeHazard.color }} />
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2" style={{ borderColor: activeHazard.color }} />
                    <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2" style={{ borderColor: activeHazard.color }} />
                    <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2" style={{ borderColor: activeHazard.color }} />

                    {/* Tag Header */}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[8px] font-black tracking-widest text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: activeHazard.color }}>
                        TARGET #{activeHazard.id}
                      </span>
                      <span className="font-mono text-[8px] font-bold text-white/90">
                        {activeHazard.confidence}
                      </span>
                    </div>

                    {/* Tag Body */}
                    <div className="mt-auto">
                      <p className="font-mono text-[9px] font-black text-white leading-tight truncate">
                        {activeHazard.title}
                      </p>
                      <p className="font-mono text-[8px] text-white/60">
                        SEV: {activeHazard.severity} · {activeHazard.area}
                      </p>
                    </div>
                  </div>

                  {/* Passive Secondary Bounding Boxes */}
                  <div className="absolute top-10 right-14 w-28 h-20 rounded-lg border border-dashed border-white/20 p-2 pointer-events-none hidden sm:block opacity-60">
                    <span className="font-mono text-[7px] text-white/40 block">SECTOR 4A · VERIFIED ROAD</span>
                    <span className="font-mono text-[7px] text-[#22C55E] block mt-1">STATUS: STABLE</span>
                  </div>
                </div>

                {/* Scanner Telemetry Footer Bar */}
                <div className="grid grid-cols-3 gap-3 pt-3 font-mono text-[10px]">
                  <div className="bg-white/4 p-2.5 rounded-xl border border-white/6 flex items-center gap-2">
                    <Crosshair className="w-4 h-4 text-[#E10600] shrink-0" />
                    <div>
                      <span className="text-white/40 block uppercase">Target Incident</span>
                      <span className="text-white font-bold truncate block">{activeHazard.landmark}</span>
                    </div>
                  </div>
                  <div className="bg-white/4 p-2.5 rounded-xl border border-white/6 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#FFC400] shrink-0" />
                    <div>
                      <span className="text-white/40 block uppercase">Severity Rating</span>
                      <span className="text-[#FFC400] font-bold block">{activeHazard.severity}</span>
                    </div>
                  </div>
                  <div className="bg-white/4 p-2.5 rounded-xl border border-white/6 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#22C55E] shrink-0" />
                    <div>
                      <span className="text-white/40 block uppercase">Triage Gate</span>
                      <span className="text-[#22C55E] font-bold block">VERIFIED & ROUTED</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* SIDE (Col 4): Existing Information Card */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-3xl border border-white/10 bg-[#121212]/90 p-6 backdrop-blur-xl shadow-2xl space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#E10600] font-bold">
                    01 — Optical Triage
                  </span>
                  <span className="text-[9px] font-mono bg-[#E10600]/15 text-[#E10600] border border-[#E10600]/30 px-2 py-0.5 rounded-full font-bold">
                    ACTIVE SCAN
                  </span>
                </div>
                
                <h3 className="text-xl font-bold tracking-tight text-white font-sans">
                  Sub-second Multimodal Classification
                </h3>
                
                <p className="text-xs sm:text-sm leading-relaxed text-white/60 font-light">
                  Computer vision scans citizen photos and voice telemetry to detect damage severity, verify exact GPS coordinates, and prevent duplicate filings across municipal jurisdictions.
                </p>

                <div className="pt-2 grid grid-cols-2 gap-2.5 border-t border-white/8 font-mono text-[10px]">
                  <div className="bg-white/4 p-3 rounded-xl border border-white/6">
                    <span className="text-white/40 block uppercase">Confidence</span>
                    <span className="text-white font-bold text-xs mt-0.5 block">99.4% SLA</span>
                  </div>
                  <div className="bg-white/4 p-3 rounded-xl border border-white/6">
                    <span className="text-white/40 block uppercase">Geo-Precision</span>
                    <span className="text-[#22C55E] font-bold text-xs mt-0.5 block">±1.2m GPS</span>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between font-mono text-[10px] text-white/40">
                  <span>LATENCY: &lt; 20ms</span>
                  <span className="text-[#22C55E]">STATUS: OPTIMAL</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════
            PHASE 3 (60% - 84% Scroll): SECTION 02 — AUTOMATED DISPATCH & ROUTING FLOW
            Center: Large Autonomous Dispatch Network Flow
            Side (Left): Existing Information Card
        ═════════════════════════════════════════════════════════════════════ */}
        <div
          className="absolute inset-0 z-20 flex items-center px-6 md:px-12 pointer-events-none"
          style={{
            opacity: progress >= 0.59 && progress <= 0.84 ? 1 : 0,
            transform: `translateY(${progress >= 0.59 && progress <= 0.84 ? '0px' : progress < 0.59 ? '40px' : '-40px'})`,
            transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: progress >= 0.59 && progress <= 0.84 ? 'auto' : 'none',
          }}
        >
          <div className="mx-auto max-w-[1400px] w-full grid lg:grid-cols-12 gap-8 items-center">
            
            {/* SIDE (Col 4): Existing Information Card */}
            <div className="lg:col-span-4 space-y-4 order-2 lg:order-1">
              <div className="rounded-3xl border border-white/10 bg-[#121212]/90 p-6 backdrop-blur-xl shadow-2xl space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#FFC400] font-bold">
                    02 — Automated Dispatch
                  </span>
                  <span className="text-[9px] font-mono bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30 px-2 py-0.5 rounded-full font-bold">
                    SLA ASSIGNED
                  </span>
                </div>

                <h3 className="text-xl font-bold tracking-tight text-white font-sans">
                  Direct-to-Department Routing
                </h3>

                <p className="text-xs sm:text-sm leading-relaxed text-white/60 font-light">
                  Complaints are matched against municipal ward jurisdiction boundaries and automatically forwarded to field response officers with pre-assigned resolution windows.
                </p>

                <div className="pt-2 space-y-2 border-t border-white/8 font-mono text-[10px]">
                  <div className="flex items-center justify-between text-white/70">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" /> Ward Boundary Match
                    </span>
                    <span className="text-[#22C55E] font-bold">VERIFIED</span>
                  </div>
                  <div className="flex items-center justify-between text-white/70">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" /> Emergency Escalation
                    </span>
                    <span className="text-[#FFC400] font-bold">TIER 1 (2.4h)</span>
                  </div>
                  <div className="flex items-center justify-between text-white/70">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" /> Crew En Route
                    </span>
                    <span className="text-white font-bold">UNIT #QRF-4</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CENTER (Col 8): Large Animated Autonomous Dispatch Network Flow */}
            <div className="lg:col-span-8 space-y-4 order-1 lg:order-2">
              <div className="relative rounded-3xl border border-white/12 bg-[#0D0D0D]/90 p-5 md:p-6 backdrop-blur-2xl shadow-2xl space-y-5">
                
                {/* Header Status Bar */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[#FFC400]" />
                    <span className="font-mono text-xs font-black tracking-widest text-white uppercase">
                      AUTONOMOUS DISPATCH PIPELINE & NETWORK ROUTING
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2.5 py-0.5 rounded-full font-bold">
                    DISPATCH LATENCY: 0.042s
                  </span>
                </div>

                {/* 5-Stage Network Routing Nodes Diagram */}
                <div className="relative py-4">
                  {/* Connecting Progress Track */}
                  <div className="hidden md:block absolute top-1/2 left-8 right-8 h-1 bg-white/10 -translate-y-1/2 z-0 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#E10600] via-[#FFC400] to-[#22C55E] transition-all duration-700"
                      style={{ width: `${((flowStep - 1) / 4) * 100}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative z-10">
                    {[
                      { id: 1, label: 'INCIDENT INTAKE', desc: 'Case #CR-9842', sub: 'Photo + GPS Tagged', color: '#E10600' },
                      { id: 2, label: 'AI CLASSIFIER', desc: 'ResNet Vision ViT', sub: 'Severity: 9/10', color: '#FFC400' },
                      { id: 3, label: 'MUNICIPAL DEPT', desc: 'BBMP Roads & Water', sub: 'Ward 12 Gateway', color: '#FFC400' },
                      { id: 4, label: 'FIELD TEAM', desc: 'Unit #QRF-DELTA-4', sub: 'ETA: 14 Min En Route', color: '#22C55E' },
                      { id: 5, label: 'SLA LOCK', desc: 'Window: 2.4h', sub: 'Action Matrix Active', color: '#22C55E' },
                    ].map((step) => {
                      const isActive = flowStep === step.id;
                      const isPassed = flowStep > step.id;

                      return (
                        <div
                          key={step.id}
                          className={`rounded-2xl p-3.5 transition-all duration-300 border ${
                            isActive
                              ? 'bg-[#181818] border-[#E10600] shadow-[0_0_20px_rgba(225,6,0,0.35)] scale-105'
                              : isPassed
                              ? 'bg-[#121212] border-[#22C55E]/40 text-white/80'
                              : 'bg-[#0E0E0E] border-white/8 text-white/40'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono text-[9px] font-black tracking-wider text-white/50">
                              0{step.id}
                            </span>
                            {isPassed ? (
                              <Check className="w-3.5 h-3.5 text-[#22C55E]" />
                            ) : isActive ? (
                              <span className="w-2 h-2 rounded-full bg-[#E10600] animate-ping" />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                            )}
                          </div>
                          <p className="font-mono text-[10px] font-black text-white truncate">
                            {step.label}
                          </p>
                          <p className="font-mono text-[9px] text-[#FFC400] truncate mt-0.5">
                            {step.desc}
                          </p>
                          <p className="font-mono text-[8px] text-white/40 truncate">
                            {step.sub}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Telemetry Output HUD Bar */}
                <div className="bg-[#090909] p-3.5 rounded-2xl border border-white/8 grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[10px]">
                  <div>
                    <span className="text-white/40 block">CASE ID:</span>
                    <span className="text-white font-bold">#CR-2026-9842</span>
                  </div>
                  <div>
                    <span className="text-white/40 block">DISPATCH UNIT:</span>
                    <span className="text-[#22C55E] font-bold">QRF-DELTA-04</span>
                  </div>
                  <div>
                    <span className="text-white/40 block">JURISDICTION:</span>
                    <span className="text-white font-bold">WARD 12 (BBMP)</span>
                  </div>
                  <div>
                    <span className="text-white/40 block">SLA COUNTDOWN:</span>
                    <span className="text-[#FFC400] font-bold">02:18:40 REMAINING</span>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════
            PHASE 4 (86% - 100% Scroll): SECTION 03 — RESOLUTION & VERIFICATION LIFECYCLE
            Center: Large Incident Lifecycle & Verification Matrix
            Side (Right): Supporting Verification Intelligence Card
        ═════════════════════════════════════════════════════════════════════ */}
        <div
          className="absolute inset-0 z-20 flex items-center px-6 md:px-12 pointer-events-none"
          style={{
            opacity: progress >= 0.85 ? 1 : 0,
            transform: `translateY(${progress >= 0.85 ? '0px' : '40px'})`,
            transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: progress >= 0.85 ? 'auto' : 'none',
          }}
        >
          <div className="mx-auto max-w-[1400px] w-full grid lg:grid-cols-12 gap-8 items-center">
            
            {/* CENTER (Col 8): Large Animated Incident Lifecycle & Verification Matrix */}
            <div className="lg:col-span-8 space-y-4">
              <div className="relative rounded-3xl border border-white/12 bg-[#0D0D0D]/90 p-5 md:p-6 backdrop-blur-2xl shadow-2xl space-y-5">
                
                {/* Header Bar */}
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#22C55E]" />
                    <span className="font-mono text-xs font-black tracking-widest text-white uppercase">
                      INCIDENT LIFECYCLE & VERIFICATION MATRIX
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-2.5 py-0.5 rounded-full font-bold">
                    STATUS: RESOLVED // AUDITED
                  </span>
                </div>

                {/* 5-Step Progressive Lifecycle Timeline */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-[10px]">
                  {[
                    { title: 'REPORTED', time: 'T+00:00', sub: 'Citizen Intake', color: '#E10600' },
                    { title: 'AI VERIFIED', time: 'T+00:02', sub: 'Computer Vision', color: '#FFC400' },
                    { title: 'ASSIGNED', time: 'T+00:15', sub: 'Dept Matched', color: '#FFC400' },
                    { title: 'IN PROGRESS', time: 'T+01:20', sub: 'Crew On-Site', color: '#22C55E' },
                    { title: 'RESOLVED', time: 'T+02:18', sub: 'Citizen Sign-Off', color: '#22C55E' },
                  ].map((step, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-white/10 bg-[#121212] p-3 space-y-1.5 relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-white/40">{step.time}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" />
                      </div>
                      <p className="font-black text-white text-xs truncate">{step.title}</p>
                      <p className="text-[9px] text-white/50 truncate">{step.sub}</p>
                      <div className="h-0.5 w-full bg-[#22C55E]/40 mt-1 rounded-full" />
                    </div>
                  ))}
                </div>

                {/* Verification Proof & Audit Telemetry */}
                <div className="grid sm:grid-cols-3 gap-3 font-mono text-[10px]">
                  <div className="bg-white/4 p-3.5 rounded-2xl border border-white/6 space-y-1">
                    <span className="text-white/40 block uppercase">Audit Validation</span>
                    <span className="text-[#22C55E] font-bold text-xs block">100% COMPLIANT</span>
                    <span className="text-white/50 text-[9px] block">Cryptographic hash: #7F9A2C</span>
                  </div>
                  <div className="bg-white/4 p-3.5 rounded-2xl border border-white/6 space-y-1">
                    <span className="text-white/40 block uppercase">Citizen Feedback</span>
                    <span className="text-[#FFC400] font-bold text-xs block">★★★★★ 5.0 / 5.0</span>
                    <span className="text-white/50 text-[9px] block">Verified by Indiranagar Resident</span>
                  </div>
                  <div className="bg-white/4 p-3.5 rounded-2xl border border-white/6 space-y-1">
                    <span className="text-white/40 block uppercase">SLA Window Close</span>
                    <span className="text-white font-bold text-xs block">2.3h (Under 2.4h Max)</span>
                    <span className="text-[#22C55E] text-[9px] block">Zero SLA Breach</span>
                  </div>
                </div>

              </div>
            </div>

            {/* SIDE (Col 4): Supporting Verification Card */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-3xl border border-white/10 bg-[#121212]/90 p-6 backdrop-blur-xl shadow-2xl space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#22C55E] font-bold">
                    03 — Verification & Audit
                  </span>
                  <span className="text-[9px] font-mono bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30 px-2 py-0.5 rounded-full font-bold">
                    LEDGER SEALED
                  </span>
                </div>

                <h3 className="text-xl font-bold tracking-tight text-white font-sans">
                  Cryptographic Resolution Closeout
                </h3>

                <p className="text-xs sm:text-sm leading-relaxed text-white/60 font-light">
                  Every work order is sealed with post-resolution photo proof, citizen confirmation tokens, and municipal supervisor timestamps for full transparency.
                </p>

                <div className="pt-2 space-y-2 border-t border-white/8 font-mono text-[10px]">
                  <div className="flex items-center justify-between text-white/70">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" /> Before/After Match
                    </span>
                    <span className="text-[#22C55E] font-bold">VERIFIED</span>
                  </div>
                  <div className="flex items-center justify-between text-white/70">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" /> Citizen Token Close
                    </span>
                    <span className="text-[#22C55E] font-bold">APPROVED</span>
                  </div>
                </div>

                <div className="pt-2">
                  <Link to="/track" className="btn-secondary text-xs w-full justify-center py-2.5">
                    Track Live Ticket ID →
                  </Link>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ─── BOTTOM PROGRESS TIMELINE ─── */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
          <div className="mx-6 mb-3 h-0.5 bg-white/10 md:mx-10 overflow-hidden rounded-full">
            <div
              className="h-full origin-left bg-[#E10600] shadow-[0_0_10px_#E10600]"
              style={{ transform: `scaleX(${progress})`, transition: 'transform 60ms linear' }}
            />
          </div>

          <div className="mx-6 flex items-center justify-between pb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40 md:mx-10">
            <span>SEQ {String(currentFrame).padStart(3, '0')} / {TOTAL_FRAMES}</span>
            <span className="hidden sm:inline">CIVIC RESOLVE // TELEMETRY</span>
            <span className="flex items-center gap-1 text-[#E10600]">
              Scroll ↓
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Civic3DHero;
