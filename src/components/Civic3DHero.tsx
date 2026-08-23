import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, PhoneCall, ShieldAlert, Cpu, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const TOTAL_FRAMES = 160;
const FRAME_PATH = (idx: number) => `/frames/frame_${String(idx).padStart(3, '0')}.webp`;

interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  type: 'tower' | 'hub' | 'residential' | 'sensor';
  color: string;
}

interface IncidentNode {
  name: string;
  category: string;
  x: number;
  z: number;
  y: number;
  severity: number;
  status: 'detecting' | 'triaging' | 'dispatched' | 'resolved';
}

export const Civic3DHero: React.FC = () => {
  const { isAuthenticated, isCitizen } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadPercent, setLoadPercent] = useState(0);
  const [hasImageFrames, setHasImageFrames] = useState(false);

  // Reference for smooth animation frame loop
  const animFrameIdRef = useRef<number | null>(null);
  const scrollProgressRef = useRef(0);

  // 3D City building procedural data
  const buildingsRef = useRef<Building[]>([
    // Central Civic AI Core Tower
    { x: 0, z: 0, w: 70, d: 70, h: 220, type: 'tower', color: '#E10600' },
    // Municipal command centers
    { x: -90, z: -80, w: 60, d: 50, h: 140, type: 'hub', color: '#FFC400' },
    { x: 90, z: -80, w: 55, d: 55, h: 160, type: 'hub', color: '#E10600' },
    { x: -100, z: 80, w: 65, d: 60, h: 130, type: 'residential', color: '#3A3A3A' },
    { x: 100, z: 90, w: 60, d: 60, h: 170, type: 'tower', color: '#FFC400' },
    // Surrounding sector blocks
    { x: -180, z: -40, w: 45, d: 50, h: 110, type: 'sensor', color: '#2E2E2E' },
    { x: 180, z: -40, w: 50, d: 45, h: 120, type: 'sensor', color: '#2E2E2E' },
    { x: -170, z: 120, w: 55, d: 50, h: 95, type: 'residential', color: '#3A3A3A' },
    { x: 170, z: 130, w: 50, d: 55, h: 105, type: 'residential', color: '#3A3A3A' },
    { x: 0, z: -170, w: 80, d: 40, h: 150, type: 'hub', color: '#E10600' },
    { x: 0, z: 180, w: 75, d: 45, h: 135, type: 'sensor', color: '#2E2E2E' },
    // Outer telecom & sensor towers
    { x: -250, z: -150, w: 40, d: 40, h: 80, type: 'sensor', color: '#2E2E2E' },
    { x: 250, z: -150, w: 40, d: 40, h: 85, type: 'sensor', color: '#2E2E2E' },
    { x: -240, z: 180, w: 45, d: 45, h: 75, type: 'residential', color: '#2E2E2E' },
    { x: 240, z: 190, w: 40, d: 40, h: 90, type: 'sensor', color: '#2E2E2E' },
  ]);

  // Live Incident Beacons mapped on the city grid
  const incidentsRef = useRef<IncidentNode[]>([
    { name: 'Indiranagar Main', category: 'ROAD HAZARD / POTHOLE', x: -90, z: -80, y: 150, severity: 8, status: 'detecting' },
    { name: 'Sector 4 Water Main', category: 'HIGH-PRESSURE PIPE RUPTURE', x: 90, z: 90, y: 180, severity: 9, status: 'triaging' },
    { name: 'Metro Corridor 7', category: 'ELECTRICAL / STREETLIGHT FAULT', x: 0, z: -170, y: 160, severity: 7, status: 'dispatched' },
  ]);

  // 1. Preload image frames if available in public/frames
  useEffect(() => {
    let isCancelled = false;
    let loadedCount = 0;
    const loadedImages: HTMLImageElement[] = [];

    // Test first frame availability
    const testImg = new Image();
    testImg.src = FRAME_PATH(1);

    testImg.onload = () => {
      if (isCancelled) return;
      setHasImageFrames(true);

      // Preload remaining frames
      for (let i = 1; i <= TOTAL_FRAMES; i++) {
        const img = new Image();
        img.src = FRAME_PATH(i);
        img.onload = () => {
          if (isCancelled) return;
          loadedCount++;
          setLoadPercent(Math.round((loadedCount / TOTAL_FRAMES) * 100));
          if (loadedCount >= TOTAL_FRAMES * 0.8) {
            setImages(loadedImages);
            setIsLoaded(true);
          }
        };
        img.onerror = () => {
          if (isCancelled) return;
          loadedCount++;
          if (loadedCount >= TOTAL_FRAMES * 0.5) {
            setIsLoaded(true);
          }
        };
        loadedImages.push(img);
      }
    };

    testImg.onerror = () => {
      // Fall back directly to the high-performance procedural 3D city canvas engine
      if (isCancelled) return;
      setHasImageFrames(false);
      setIsLoaded(true);
      setLoadPercent(100);
    };

    return () => {
      isCancelled = true;
    };
  }, []);

  // 2. Procedural 3D Holographic Smart City Grid & AI Lidar HUD Renderer
  const renderProcedural3DCity = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number, scrubProgress: number) => {
    ctx.clearRect(0, 0, width, height);

    // Deep Obsidian Backdrop
    ctx.fillStyle = '#090909';
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height * 0.52;
    const baseScale = Math.min(width, height) / 950;

    // Camera rotation angle driven by scroll progress (360° continuous rotation)
    const angle = scrubProgress * Math.PI * 2 + Math.PI * 0.25;
    const pitch = 0.55; // Isometric tilt
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // 3D to 2D isometric projection helper
    const project = (x: number, y: number, z: number) => {
      const rx = x * cosA - z * sinA;
      const rz = x * sinA + z * cosA;
      const px = centerX + rx * baseScale * 1.5;
      const py = centerY + (rz * Math.sin(pitch) - y * Math.cos(pitch)) * baseScale * 1.5;
      const depth = rz;
      return { x: px, y: py, depth };
    };

    // ── 1. GROUND ISOMETRIC WIREFRAME GRID ──
    const gridSize = 420;
    const gridStep = 42;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';

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

    // ── 2. ROTATING RADAR LIDAR SCANNER CONE ──
    const scanRadius = 380;
    const scanAngle = (Date.now() * 0.0018) % (Math.PI * 2);
    ctx.save();
    ctx.beginPath();
    const radarCenter = project(0, 0, 0);
    const sweepEnd = project(Math.cos(scanAngle) * scanRadius, 0, Math.sin(scanAngle) * scanRadius);
    
    // Glowing radar sweep gradient
    const radarGrad = ctx.createRadialGradient(radarCenter.x, radarCenter.y, 10, radarCenter.x, radarCenter.y, scanRadius * baseScale);
    radarGrad.addColorStop(0, 'rgba(225, 6, 0, 0.12)');
    radarGrad.addColorStop(0.5, 'rgba(225, 6, 0, 0.03)');
    radarGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = radarGrad;
    ctx.arc(radarCenter.x, radarCenter.y, scanRadius * baseScale, 0, Math.PI * 2);
    ctx.fill();

    // Radar beam line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(225, 6, 0, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.moveTo(radarCenter.x, radarCenter.y);
    ctx.lineTo(sweepEnd.x, sweepEnd.y);
    ctx.stroke();
    ctx.restore();

    // ── 3. SORT BUILDINGS BY DEPTH FOR PAINTER'S ALGORITHM ──
    const buildings = buildingsRef.current.map((b) => {
      const p = project(b.x, 0, b.z);
      return { ...b, screenDepth: p.depth };
    });
    buildings.sort((a, b) => b.screenDepth - a.screenDepth);

    // ── 4. RENDER 3D BUILDINGS ──
    buildings.forEach((b) => {
      const halfW = b.w / 2;
      const halfD = b.d / 2;
      const h = b.h;

      // Bottom 4 vertices
      const b0 = project(b.x - halfW, 0, b.z - halfD);
      const b1 = project(b.x + halfW, 0, b.z - halfD);
      const b2 = project(b.x + halfW, 0, b.z + halfD);
      const b3 = project(b.x - halfW, 0, b.z + halfD);

      // Top 4 vertices
      const t0 = project(b.x - halfW, h, b.z - halfD);
      const t1 = project(b.x + halfW, h, b.z - halfD);
      const t2 = project(b.x + halfW, h, b.z + halfD);
      const t3 = project(b.x - halfW, h, b.z + halfD);

      // Building solid side opacity
      const isCore = b.type === 'tower' && b.x === 0;
      const wallFill = isCore
        ? 'rgba(225, 6, 0, 0.12)'
        : b.type === 'hub'
        ? 'rgba(255, 196, 0, 0.06)'
        : 'rgba(20, 20, 20, 0.75)';

      const wireColor = isCore
        ? 'rgba(225, 6, 0, 0.85)'
        : b.type === 'hub'
        ? 'rgba(255, 196, 0, 0.6)'
        : 'rgba(255, 255, 255, 0.15)';

      // Draw sides
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
        ctx.lineWidth = isCore ? 1.5 : 1;
        ctx.stroke();
      };

      // Render walls
      drawFace(b0, b1, t1, t0);
      drawFace(b1, b2, t2, t1);
      drawFace(b2, b3, t3, t2);
      drawFace(b3, b0, t0, t3);

      // Render roof
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.fillStyle = isCore ? 'rgba(225, 6, 0, 0.25)' : 'rgba(30, 30, 30, 0.85)';
      ctx.fill();
      ctx.strokeStyle = wireColor;
      ctx.stroke();

      // Rooftop Core Spire Beacon
      if (isCore) {
        const spireTop = project(b.x, h + 60, b.z);
        ctx.beginPath();
        ctx.moveTo((t0.x + t2.x) / 2, (t0.y + t2.y) / 2);
        ctx.lineTo(spireTop.x, spireTop.y);
        ctx.strokeStyle = '#E10600';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Pulsing Spire Light
        const pulseSize = 6 + Math.sin(Date.now() * 0.005) * 3;
        ctx.beginPath();
        ctx.arc(spireTop.x, spireTop.y, pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = '#E10600';
        ctx.shadowColor = '#E10600';
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    });

    // ── 5. AI NEURAL DATA CONDUITS & DATA STREAMS ──
    const streamPhase = (Date.now() * 0.003) % 1;
    ctx.lineWidth = 2;

    incidentsRef.current.forEach((inc, idx) => {
      const startP = project(inc.x, inc.y, inc.z);
      const coreP = project(0, 220, 0);

      // Line color based on scroll progression story
      let strokeColor = 'rgba(225, 6, 0, 0.4)';
      let beaconColor = '#E10600';
      let statusText = '01 — TRIAGE ACTIVE';

      if (scrubProgress > 0.6) {
        strokeColor = 'rgba(34, 197, 94, 0.6)';
        beaconColor = '#22C55E';
        statusText = '02 — ROUTED & VERIFIED';
      } else if (scrubProgress > 0.3) {
        strokeColor = 'rgba(255, 196, 0, 0.5)';
        beaconColor = '#FFC400';
        statusText = '01 — OPTICAL CLASSIFICATION';
      }

      // Connecting data conduit
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = strokeColor;
      ctx.moveTo(startP.x, startP.y);
      ctx.lineTo(coreP.x, coreP.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Traveling data packet
      const packetX = startP.x + (coreP.x - startP.x) * ((streamPhase + idx * 0.33) % 1);
      const packetY = startP.y + (coreP.y - startP.y) * ((streamPhase + idx * 0.33) % 1);
      ctx.beginPath();
      ctx.arc(packetX, packetY, 3, 0, Math.PI * 2);
      ctx.fillStyle = beaconColor;
      ctx.shadowColor = beaconColor;
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Incident Pinpoint HUD Reticle Callout
      const ringPulse = (Math.sin(Date.now() * 0.006 + idx) + 1) * 6 + 10;
      ctx.beginPath();
      ctx.arc(startP.x, startP.y, ringPulse, 0, Math.PI * 2);
      ctx.strokeStyle = beaconColor;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Pinpoint target crosshair
      ctx.beginPath();
      ctx.arc(startP.x, startP.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = beaconColor;
      ctx.fill();

      // Mini HUD Label over beacon
      if (width > 640) {
        ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        const tagW = 160;
        const tagH = 34;
        const tagX = startP.x + 16;
        const tagY = startP.y - 18;

        ctx.fillRect(tagX, tagY, tagW, tagH);
        ctx.strokeRect(tagX, tagY, tagW, tagH);

        // Leader line
        ctx.beginPath();
        ctx.moveTo(startP.x, startP.y);
        ctx.lineTo(tagX, tagY + tagH / 2);
        ctx.strokeStyle = beaconColor;
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText(`LOC: ${inc.name}`, tagX + 8, tagY + 13);
        ctx.fillStyle = beaconColor;
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText(statusText, tagX + 8, tagY + 26);
      }
    });

    // ── 6. LASER SCANLINE SWEEPING VERTICALLY ──
    const scanlineY = ((Date.now() * 0.12) % height);
    ctx.beginPath();
    ctx.moveTo(0, scanlineY);
    ctx.lineTo(width, scanlineY);
    ctx.strokeStyle = 'rgba(225, 6, 0, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

  }, []);

  // 3. Render Canvas (Image Sequence or Procedural 3D City Engine)
  const renderFrame = useCallback((index: number, scrubProgress: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;

    if (hasImageFrames && images[index - 1]) {
      const img = images[index - 1];
      const imgRatio = img.width / img.height;
      const canvasRatio = width / height;
      let drawWidth = width;
      let drawHeight = height;
      let offsetX = 0;
      let offsetY = 0;

      if (canvasRatio > imgRatio) {
        drawHeight = width / imgRatio;
        offsetY = (height - drawHeight) / 2;
      } else {
        drawWidth = height * imgRatio;
        offsetX = (width - drawWidth) / 2;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    } else {
      // High-performance procedural 3D smart city grid engine
      renderProcedural3DCity(ctx, width, height, scrubProgress);
    }
  }, [hasImageFrames, images, renderProcedural3DCity]);

  // 4. Continuous RAF animation loop for live pulsing beacons + scroll responsiveness
  useEffect(() => {
    let isRunning = true;

    const loop = () => {
      if (!isRunning) return;
      const currentProg = scrollProgressRef.current;
      const frameIdx = Math.min(
        TOTAL_FRAMES,
        Math.max(1, Math.floor(currentProg * (TOTAL_FRAMES - 1)) + 1)
      );
      renderFrame(frameIdx, currentProg);
      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    animFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [renderFrame]);

  // 5. Bind scroll progress to frame scrubbing & canvas resizing
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
  }, [isLoaded]);

  return (
    <div ref={containerRef} className="relative h-[400vh] bg-[#090909]">
      {/* Pinned 100dvh Viewport */}
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#090909]">
        
        {/* The 3D Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Cinematic Radial Obsidian Vignette Matching Brand Palette */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_50%,transparent_30%,rgba(9,9,9,0.7)_70%,rgba(9,9,9,0.98)_100%)]" />

        {/* ─── HUD CORNER RETICLES (CIVIC RED #E10600) ─── */}
        <div className="pointer-events-none absolute left-6 top-24 text-[#E10600] md:left-10 md:top-28 transition-transform duration-300">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M 2 24 L 2 2 L 24 2" />
          </svg>
        </div>

        <div className="pointer-events-none absolute right-6 top-24 text-[#E10600] md:right-10 md:top-28 transition-transform duration-300">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M 0 2 L 22 2 L 22 24" />
          </svg>
        </div>

        <div className="pointer-events-none absolute bottom-14 left-6 text-[#E10600] md:bottom-16 md:left-10 transition-transform duration-300">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M 2 0 L 2 22 L 24 22" />
          </svg>
        </div>

        <div className="pointer-events-none absolute bottom-14 right-6 text-[#E10600] md:bottom-16 md:right-10 transition-transform duration-300">
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

        {/* ─── SCROLL-SYNCHRONIZED STORY PHASES ─── */}
        
        {/* Phase 1: Hero (0% - 25% Scroll) */}
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-start gap-4 px-6 pb-24 md:px-12 md:pb-28 max-w-5xl"
          style={{
            opacity: progress < 0.28 ? Math.max(0, 1 - progress * 3.5) : 0,
            pointerEvents: progress < 0.25 ? 'auto' : 'none',
            transform: `translateY(${progress * 40}px)`,
            transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
          }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-[#E10600] backdrop-blur-md">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#E10600] shadow-[0_0_10px_#E10600] animate-pulse" />
            CIVIC RESOLVE AI // CORE ONLINE
          </span>

          <h1 className="font-sans text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white leading-[0.98]">
            Report. Resolve.<br />
            <span className="text-[#E10600]">Autonomous City AI.</span>
          </h1>

          <p className="max-w-[48ch] text-sm leading-relaxed text-white/60 md:text-base font-light">
            Citizen-powered neural platform detecting potholes, garbage, water leaks, and infrastructure failures in real-time. Scroll to scrub municipal telemetry diagnostics.
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
        </div>

        {/* Phase 2: AI Detection & Optical Triage Card (30% - 60% Scroll) */}
        <div
          className="pointer-events-none absolute right-6 top-1/2 z-20 hidden -translate-y-1/2 md:right-12 md:block max-w-[420px]"
          style={{
            opacity: progress >= 0.28 && progress <= 0.62 ? 1 : 0,
            transform: `translateY(${progress >= 0.28 && progress <= 0.62 ? '-50%' : progress < 0.28 ? '-40%' : '-60%'})`,
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div className="rounded-2xl border border-white/10 bg-[#121212]/90 p-6 backdrop-blur-xl shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#E10600] font-bold">
                01 — Optical Triage
              </span>
              <span className="text-[9px] font-mono bg-[#E10600]/15 text-[#E10600] border border-[#E10600]/30 px-2 py-0.5 rounded-full">
                ACTIVE SCAN
              </span>
            </div>
            
            <h3 className="text-xl font-bold tracking-tight text-white font-sans">
              Sub-second Multimodal Classification
            </h3>
            
            <p className="text-xs sm:text-sm leading-relaxed text-white/60 font-light">
              Computer vision scans images to detect damage severity, verify GPS coordinates, and prevent duplicate filings across municipal jurisdictions.
            </p>

            <div className="pt-2 grid grid-cols-2 gap-2 border-t border-white/8 font-mono text-[10px]">
              <div className="bg-white/4 p-2.5 rounded-lg">
                <span className="text-white/40 block uppercase">Confidence</span>
                <span className="text-white font-bold text-xs mt-0.5 block">99.4% SLA</span>
              </div>
              <div className="bg-white/4 p-2.5 rounded-lg">
                <span className="text-white/40 block uppercase">Geo-Precision</span>
                <span className="text-[#22C55E] font-bold text-xs mt-0.5 block">±1.2m GPS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 3: Authority Routing Card (65% - 90% Scroll) */}
        <div
          className="pointer-events-none absolute left-6 top-1/2 z-20 hidden -translate-y-1/2 md:left-12 md:block max-w-[420px]"
          style={{
            opacity: progress > 0.64 && progress <= 0.94 ? 1 : 0,
            transform: `translateY(${progress > 0.64 && progress <= 0.94 ? '-50%' : progress < 0.64 ? '-40%' : '-60%'})`,
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div className="rounded-2xl border border-white/10 bg-[#121212]/90 p-6 backdrop-blur-xl shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#FFC400] font-bold">
                02 — Automated Dispatch
              </span>
              <span className="text-[9px] font-mono bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30 px-2 py-0.5 rounded-full">
                SLA ASSIGNED
              </span>
            </div>

            <h3 className="text-xl font-bold tracking-tight text-white font-sans">
              Direct-to-Department Routing
            </h3>

            <p className="text-xs sm:text-sm leading-relaxed text-white/60 font-light">
              Complaints are matched against municipal jurisdiction boundaries and automatically forwarded to field response officers with pre-assigned resolution windows.
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
            </div>
          </div>
        </div>

        {/* ─── BOTTOM PROGRESS TIMELINE ─── */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
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

        {/* ─── PRELOADER BOOT SCREEN (If loading image sequence) ─── */}
        {!isLoaded && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-[#090909] px-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-[#E10600] backdrop-blur-md">
              <span className="inline-block h-2 w-2 rounded-full bg-[#E10600] shadow-[0_0_12px_#E10600] animate-pulse" />
              INITIALIZING CITY SENSORS // BOOTING
            </span>

            <div className="h-1 w-64 overflow-hidden rounded-full bg-white/10 md:w-80">
              <div
                className="h-full bg-[#E10600] transition-all duration-150"
                style={{ width: `${loadPercent}%` }}
              />
            </div>

            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">
              Loading 3D Frame Sequence · {loadPercent}%
            </p>
          </div>
        )}

      </div>
    </div>
  );
};

export default Civic3DHero;
