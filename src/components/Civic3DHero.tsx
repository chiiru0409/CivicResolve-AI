import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, MapPin, PhoneCall, Cpu,
  CheckCircle2, Activity, Zap,
  Crosshair, ShieldCheck, Check
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getMineComplaints } from '../services/complaintService';
import type { Complaint } from '../types';

const TOTAL_FRAMES = 160;

// ── 3D Geometry Types ────────────────────────────────────────────────────────
interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  type: 'tower' | 'hub' | 'civic_hall' | 'transit_hub' | 'residential' | 'sensor' | 'utility' | 'commercial';
  color: string;
  roofDetails?: 'spire' | 'dome' | 'colonnade' | 'canopy' | 'helipad' | 'tiered';
}

interface RoadSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
  hasDashedLine?: boolean;
}

interface CivicPlaza {
  x: number;
  z: number;
  w: number;
  d: number;
  type: 'plaza' | 'park' | 'station';
}

interface CitizenFigure {
  id: string;
  x: number;
  z: number;
  height: number;
  posture: 'walking' | 'standing' | 'group' | 'waiting' | 'sitting' | 'parent_child' | 'wheelchair' | 'commuter';
  heading: number;
  speed: number;
  pathLength: number;
  pathAxis: 'x' | 'z';
  originX: number;
  originZ: number;
  hasTelemetryPing?: boolean;
  pingColor?: string;
  pingLabel?: string;
  groupCount?: number;
}

interface LightNode {
  x: number;
  z: number;
  h: number;
  color: string;
  radius: number;
}

export const Civic3DHero: React.FC = () => {
  const { isAuthenticated, isCitizen } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [progress, setProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(1);

  // Scanner dynamic metrics
  const [activeHazardIndex, setActiveHazardIndex] = useState(0);
  const [liveConfidence, setLiveConfidence] = useState(99.4);
  const [flowStep, setFlowStep] = useState(1);

  // Real-time complaints data
  const [latestComplaint, setLatestComplaint] = useState<Complaint | null>(null);

  // Reference for smooth animation frame loop & mouse parallax
  const animFrameIdRef = useRef<number | null>(null);
  const scrollProgressRef = useRef(0);
  const mousePosRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  // ── 3D City Infrastructure (Municipal Dome, Halls, Transit, Residential, Commercial) ─
  const buildingsRef = useRef<Building[]>([
    // Central Core Command Matrix Tower
    { x: 0, z: 0, w: 75, d: 75, h: 235, type: 'tower', color: '#E10600', roofDetails: 'spire' },
    
    // Grand Municipal Civic Hall with Colonnade (North-West)
    { x: -95, z: -85, w: 72, d: 58, h: 145, type: 'civic_hall', color: '#FFC400', roofDetails: 'dome' },
    
    // Emergency Operations & Dispatch Depot (North-East)
    { x: 95, z: -85, w: 62, d: 55, h: 165, type: 'hub', color: '#E10600', roofDetails: 'helipad' },
    
    // Public Transit & Metro Interchange Hub (South-West)
    { x: -105, z: 85, w: 75, d: 65, h: 110, type: 'transit_hub', color: '#3A3A3A', roofDetails: 'canopy' },
    
    // Commercial Financial & Tech Nexus (South-East)
    { x: 105, z: 95, w: 65, d: 65, h: 180, type: 'commercial', color: '#FFC400', roofDetails: 'tiered' },
    
    // Water & Utilities Plant (West)
    { x: -190, z: -45, w: 52, d: 55, h: 120, type: 'utility', color: '#2E2E2E' },
    
    // Power & Grid Station (East)
    { x: 190, z: -45, w: 55, d: 52, h: 130, type: 'utility', color: '#2E2E2E' },
    
    // Residential Quarter 1 (South-West mid)
    { x: -175, z: 125, w: 60, d: 55, h: 105, type: 'residential', color: '#3A3A3A', roofDetails: 'tiered' },
    
    // Residential Quarter 2 (South-East mid)
    { x: 175, z: 135, w: 55, d: 60, h: 115, type: 'residential', color: '#3A3A3A', roofDetails: 'tiered' },
    
    // Municipal Services Annex (North Far)
    { x: 0, z: -175, w: 90, d: 45, h: 155, type: 'civic_hall', color: '#E10600', roofDetails: 'colonnade' },
    
    // Smart Sensor Hub (South Far)
    { x: 0, z: 185, w: 85, d: 50, h: 140, type: 'sensor', color: '#2E2E2E' },
    
    // Outer Grid Towers
    { x: -260, z: -155, w: 45, d: 45, h: 90, type: 'residential', color: '#252525' },
    { x: 260, z: -155, w: 45, d: 45, h: 95, type: 'commercial', color: '#252525' },
    { x: -250, z: 185, w: 50, d: 50, h: 85, type: 'residential', color: '#252525' },
    { x: 250, z: 195, w: 45, d: 45, h: 100, type: 'sensor', color: '#252525' },
    { x: -310, z: 20, w: 40, d: 40, h: 75, type: 'residential', color: '#202020' },
    { x: 310, z: 20, w: 40, d: 40, h: 80, type: 'commercial', color: '#202020' },
  ]);

  // ── Road Infrastructure Network ───────────────────────────────────────────
  const roadsRef = useRef<RoadSegment[]>([
    // Main North-South Civic Boulevard
    { x1: 0, z1: -420, x2: 0, z2: 420, width: 36, hasDashedLine: true },
    // East-West Arterial Avenue
    { x1: -420, z1: 0, x2: 420, z2: 0, width: 36, hasDashedLine: true },
    // North Perimeter Road
    { x1: -380, z1: -130, x2: 380, z2: -130, width: 22, hasDashedLine: true },
    // South Perimeter Road
    { x1: -380, z1: 140, x2: 380, z2: 140, width: 22, hasDashedLine: true },
    // West Cross Connector
    { x1: -140, z1: -380, x2: -140, z2: 380, width: 22, hasDashedLine: true },
    // East Cross Connector
    { x1: 140, z1: -380, x2: 140, z2: 380, width: 22, hasDashedLine: true },
  ]);

  // ── Public Plazas & Pedestrian Squares ─────────────────────────────────────
  const plazasRef = useRef<CivicPlaza[]>([
    // Central Civic Square (around core command matrix)
    { x: 0, z: 0, w: 140, d: 140, type: 'plaza' },
    // Municipal Hall Forecourt (North-West)
    { x: -95, z: -40, w: 65, d: 38, type: 'plaza' },
    // Transit Hub Passenger Concourse (South-West)
    { x: -105, z: 45, w: 70, d: 38, type: 'station' },
    // Commercial Tech Plaza (South-East)
    { x: 105, z: 50, w: 65, d: 38, type: 'plaza' },
  ]);

  // ── Smart Sensor Nodes & Streetlights ──────────────────────────────────────
  const lightNodesRef = useRef<LightNode[]>([
    { x: -45, z: -45, h: 22, color: '#22C55E', radius: 35 },
    { x: 45, z: -45, h: 22, color: '#E10600', radius: 35 },
    { x: -45, z: 45, h: 22, color: '#FFC400', radius: 35 },
    { x: 45, z: 45, h: 22, color: '#22C55E', radius: 35 },
    { x: 0, z: -100, h: 20, color: '#E10600', radius: 30 },
    { x: 0, z: 100, h: 20, color: '#FFC400', radius: 30 },
    { x: -100, z: 0, h: 20, color: '#22C55E', radius: 30 },
    { x: 100, z: 0, h: 20, color: '#E10600', radius: 30 },
  ]);

  // ── Diverse 3D Civilian Silhouettes & Public Groups Across City ───────────
  const citizensRef = useRef<CitizenFigure[]>([
    // 1. Parent holding hand with Child (Walking along Central Plaza promenade)
    {
      id: 'cit-parent-child',
      x: -18,
      z: -18,
      originX: -18,
      originZ: -18,
      height: 15.5,
      posture: 'parent_child',
      heading: 0.2,
      speed: 0.35,
      pathLength: 75,
      pathAxis: 'x',
      hasTelemetryPing: true,
      pingColor: '#22C55E',
      pingLabel: 'PUBLIC PROTECTION',
    },
    // 2. Citizen in Wheelchair with Companion (Accessibility representation near Municipal Hall)
    {
      id: 'cit-wheelchair-1',
      x: -75,
      z: -38,
      originX: -75,
      originZ: -38,
      height: 14,
      posture: 'wheelchair',
      heading: 0.1,
      speed: 0.3,
      pathLength: 60,
      pathAxis: 'x',
      hasTelemetryPing: true,
      pingColor: '#FFC400',
      pingLabel: 'ACCESSIBLE CORRIDOR',
    },
    // 3. Citizen Sitting on Plaza Bench (Resting / looking at civic matrix)
    {
      id: 'cit-bench-1',
      x: 35,
      z: -26,
      originX: 35,
      originZ: -26,
      height: 13.5,
      posture: 'sitting',
      heading: -0.4,
      speed: 0,
      pathLength: 0,
      pathAxis: 'x',
    },
    // 4. Small Group of 3 Citizens Conversing in Central Square
    {
      id: 'cit-group-1',
      x: -32,
      z: 22,
      originX: -32,
      originZ: 22,
      height: 15,
      posture: 'group',
      groupCount: 3,
      heading: 0.8,
      speed: 0,
      pathLength: 0,
      pathAxis: 'x',
      hasTelemetryPing: true,
      pingColor: '#22C55E',
      pingLabel: 'COMMUNITY VOICE',
    },
    // 5. Commuter with Bag walking towards Transit Concourse
    {
      id: 'cit-commuter-1',
      x: -85,
      z: 50,
      originX: -85,
      originZ: 50,
      height: 15.5,
      posture: 'commuter',
      heading: Math.PI / 2,
      speed: 0.45,
      pathLength: 80,
      pathAxis: 'z',
      hasTelemetryPing: true,
      pingColor: '#FFC400',
      pingLabel: 'TRANSIT GATE',
    },
    // 6. Pedestrians Waiting at Crosswalk
    {
      id: 'cit-wait-crosswalk',
      x: 18,
      z: 42,
      originX: 18,
      originZ: 42,
      height: 15,
      posture: 'waiting',
      heading: -Math.PI / 2,
      speed: 0,
      pathLength: 0,
      pathAxis: 'z',
    },
    // 7. Pedestrian Walking along East Arterial Sidewalk
    {
      id: 'cit-walk-east',
      x: 70,
      z: 14,
      originX: 70,
      originZ: 14,
      height: 14.8,
      posture: 'walking',
      heading: 0,
      speed: 0.48,
      pathLength: 95,
      pathAxis: 'x',
    },
    // 8. Standing Citizen using mobile civic app (East Tech Plaza)
    {
      id: 'cit-stand-app',
      x: 95,
      z: 55,
      originX: 95,
      originZ: 55,
      height: 15,
      posture: 'standing',
      heading: -1.4,
      speed: 0,
      pathLength: 0,
      pathAxis: 'x',
      hasTelemetryPing: true,
      pingColor: '#E10600',
      pingLabel: 'ACTIVE REPORT',
    },
    // 9. Two Citizens Conversing near Residential Quarter (South)
    {
      id: 'cit-group-res',
      x: -160,
      z: 120,
      originX: -160,
      originZ: 120,
      height: 14.5,
      posture: 'group',
      groupCount: 2,
      heading: 1.5,
      speed: 0,
      pathLength: 0,
      pathAxis: 'x',
    },
    // 10. Pedestrian Walking near Utility Center (West)
    {
      id: 'cit-walk-west',
      x: -170,
      z: -30,
      originX: -170,
      originZ: -30,
      height: 14.5,
      posture: 'walking',
      heading: Math.PI,
      speed: 0.4,
      pathLength: 70,
      pathAxis: 'x',
    },
  ]);

  // Optical Triage hazards data (fallback + dynamic seed)
  const defaultHazards = [
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
      setActiveHazardIndex((prev) => (prev + 1) % defaultHazards.length);
      setFlowStep((prev) => (prev % 5) + 1);
      setLiveConfidence((prev) => +(98.5 + Math.random() * 1.3).toFixed(1));
    }, 2800);
    return () => clearInterval(timer);
  }, [defaultHazards.length]);

  // Real-time complaints state sync
  const fetchActiveComplaints = useCallback(async () => {
    if (typeof window === 'undefined' || !localStorage.getItem('civic_token')) return;
    try {
      const mine = await getMineComplaints();
      if (mine && mine.length > 0) {
        setLatestComplaint(mine[0]);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchActiveComplaints();
    const handleUpdate = () => void fetchActiveComplaints();
    window.addEventListener('complaints:updated', handleUpdate);
    return () => window.removeEventListener('complaints:updated', handleUpdate);
  }, [fetchActiveComplaints]);

  // Mouse parallax tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const normX = (e.clientX / window.innerWidth - 0.5) * 2;
      const normY = (e.clientY / window.innerHeight - 0.5) * 2;
      mousePosRef.current.targetX = normX;
      mousePosRef.current.targetY = normY;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // ── Procedural 3D Canvas Rendering Engine ─────────────────────────────────
  const renderBackgroundCanvas = useCallback((
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scrubProgress: number,
    timeMs: number
  ) => {
    ctx.clearRect(0, 0, width, height);

    // Deep Obsidian Backdrop
    ctx.fillStyle = '#090909';
    ctx.fillRect(0, 0, width, height);

    // Smooth mouse parallax interpolation
    mousePosRef.current.x += (mousePosRef.current.targetX - mousePosRef.current.x) * 0.05;
    mousePosRef.current.y += (mousePosRef.current.targetY - mousePosRef.current.y) * 0.05;

    const mouseOffsetX = mousePosRef.current.x * 24;
    const mouseOffsetY = mousePosRef.current.y * 16;

    const centerX = width / 2 + mouseOffsetX;
    const centerY = height * 0.52 + mouseOffsetY;
    const baseScale = Math.min(width, height) / 950;

    // 360° Camera rotation driven by scroll progress + slight dynamic breathing
    const angle = scrubProgress * Math.PI * 2 + Math.PI * 0.25 + (mousePosRef.current.x * 0.04);
    const pitch = 0.55 + (mousePosRef.current.y * 0.03);
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

    // 1. Ground Wireframe Grid
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

    // 2. Render 3D Arterial Roads & Lane Markings
    roadsRef.current.forEach((road) => {
      const halfW = road.width / 2;
      const isNS = Math.abs(road.x1 - road.x2) < Math.abs(road.z1 - road.z2);

      let p0, p1, p2, p3;
      if (isNS) {
        p0 = project(road.x1 - halfW, 0.2, road.z1);
        p1 = project(road.x1 + halfW, 0.2, road.z1);
        p2 = project(road.x2 + halfW, 0.2, road.z2);
        p3 = project(road.x2 - halfW, 0.2, road.z2);
      } else {
        p0 = project(road.x1, 0.2, road.z1 - halfW);
        p1 = project(road.x2, 0.2, road.z2 - halfW);
        p2 = project(road.x2, 0.2, road.z2 + halfW);
        p3 = project(road.x1, 0.2, road.z1 + halfW);
      }

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(14, 14, 16, 0.65)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Dashed Centerline
      if (road.hasDashedLine) {
        ctx.beginPath();
        const start = project(road.x1, 0.4, road.z1);
        const end = project(road.x2, 0.4, road.z2);
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = 'rgba(255, 196, 0, 0.15)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // 3. Render Public Plazas & Pedestrian Squares
    plazasRef.current.forEach((plaza) => {
      const halfW = plaza.w / 2;
      const halfD = plaza.d / 2;
      const p0 = project(plaza.x - halfW, 0.3, plaza.z - halfD);
      const p1 = project(plaza.x + halfW, 0.3, plaza.z - halfD);
      const p2 = project(plaza.x + halfW, 0.3, plaza.z + halfD);
      const p3 = project(plaza.x - halfW, 0.3, plaza.z + halfD);

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fillStyle = plaza.type === 'station' ? 'rgba(34, 197, 94, 0.03)' : 'rgba(255, 255, 255, 0.02)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // 4. Rotating Radar Sweep
    const scanRadius = 380;
    const scanAngle = (timeMs * 0.0014) % (Math.PI * 2);
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

    // 5. Update Citizen Positions & Animate Walk Cycles
    citizensRef.current.forEach((cit) => {
      if ((cit.posture === 'walking' || cit.posture === 'parent_child' || cit.posture === 'commuter' || cit.posture === 'wheelchair') && cit.pathLength > 0) {
        const t = (timeMs * 0.001 * cit.speed) % 2;
        const progressVal = t < 1 ? t : 2 - t; // back and forth
        if (cit.pathAxis === 'x') {
          cit.x = cit.originX + (progressVal - 0.5) * cit.pathLength;
        } else {
          cit.z = cit.originZ + (progressVal - 0.5) * cit.pathLength;
        }
      }
    });

    // 6. Collect & Depth-Sort All 3D Scene Elements (Buildings, Citizens, Light Poles)
    type RenderItem = 
      | { kind: 'building'; data: Building; depth: number }
      | { kind: 'citizen'; data: CitizenFigure; depth: number }
      | { kind: 'light'; data: LightNode; depth: number };

    const sceneItems: RenderItem[] = [];

    buildingsRef.current.forEach((b) => {
      const p = project(b.x, 0, b.z);
      sceneItems.push({ kind: 'building', data: b, depth: p.depth });
    });

    citizensRef.current.forEach((c) => {
      const p = project(c.x, 0, c.z);
      sceneItems.push({ kind: 'citizen', data: c, depth: p.depth });
    });

    lightNodesRef.current.forEach((l) => {
      const p = project(l.x, 0, l.z);
      sceneItems.push({ kind: 'light', data: l, depth: p.depth });
    });

    // Sort from back to front (largest depth to smallest)
    sceneItems.sort((a, b) => b.depth - a.depth);

    // 7. Render All Scene Items
    sceneItems.forEach((item) => {
      // ── BUILDINGS ──
      if (item.kind === 'building') {
        const b = item.data;
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
        const isCivic = b.type === 'civic_hall';
        const isTransit = b.type === 'transit_hub';

        const wallFill = isCore
          ? 'rgba(225, 6, 0, 0.08)'
          : isCivic
          ? 'rgba(255, 196, 0, 0.04)'
          : isTransit
          ? 'rgba(34, 197, 94, 0.04)'
          : 'rgba(16, 16, 18, 0.65)';

        const wireColor = isCore
          ? 'rgba(225, 6, 0, 0.5)'
          : b.type === 'hub' || b.type === 'civic_hall'
          ? 'rgba(255, 196, 0, 0.3)'
          : isTransit
          ? 'rgba(34, 197, 94, 0.3)'
          : 'rgba(255, 255, 255, 0.08)';

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

        // Roof Slab
        ctx.beginPath();
        ctx.moveTo(t0.x, t0.y);
        ctx.lineTo(t1.x, t1.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.lineTo(t3.x, t3.y);
        ctx.closePath();
        ctx.fillStyle = isCore ? 'rgba(225, 6, 0, 0.16)' : 'rgba(22, 22, 26, 0.75)';
        ctx.fill();
        ctx.strokeStyle = wireColor;
        ctx.stroke();

        // Architectural Details
        if (isCore) {
          const spireTop = project(b.x, h + 50, b.z);
          ctx.beginPath();
          ctx.moveTo((t0.x + t2.x) / 2, (t0.y + t2.y) / 2);
          ctx.lineTo(spireTop.x, spireTop.y);
          ctx.strokeStyle = 'rgba(225, 6, 0, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          const pulseSize = 4 + Math.sin(timeMs * 0.005) * 2;
          ctx.beginPath();
          ctx.arc(spireTop.x, spireTop.y, pulseSize, 0, Math.PI * 2);
          ctx.fillStyle = '#E10600';
          ctx.shadowColor = '#E10600';
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (b.roofDetails === 'dome') {
          // Architectural Municipal Dome
          const domeCenter = project(b.x, h, b.z);
          const domeApex = project(b.x, h + 24, b.z);
          const domeRadius = (b.w * 0.28) * baseScale;

          ctx.beginPath();
          ctx.arc(domeCenter.x, domeCenter.y, domeRadius, Math.PI, 0);
          ctx.fillStyle = 'rgba(255, 196, 0, 0.08)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 196, 0, 0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Dome finial
          ctx.beginPath();
          ctx.moveTo(domeCenter.x, domeCenter.y - domeRadius);
          ctx.lineTo(domeApex.x, domeApex.y);
          ctx.strokeStyle = 'rgba(255, 196, 0, 0.6)';
          ctx.stroke();
        }
      }

      // ── SMART SENSOR LIGHT POLES ──
      else if (item.kind === 'light') {
        const l = item.data;
        const pBase = project(l.x, 0, l.z);
        const pTop = project(l.x, l.h, l.z);

        // Ground illumination pool
        ctx.beginPath();
        ctx.ellipse(pBase.x, pBase.y, l.radius * baseScale, l.radius * baseScale * 0.45, 0, 0, Math.PI * 2);
        ctx.fillStyle = `${l.color}08`;
        ctx.fill();

        // Pole line
        ctx.beginPath();
        ctx.moveTo(pBase.x, pBase.y);
        ctx.lineTo(pTop.x, pTop.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Sensor light beacon
        ctx.beginPath();
        ctx.arc(pTop.x, pTop.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = l.color;
        ctx.fill();
      }

      // ── SUBTLE 3D CITIZEN SILHOUETTES & GROUPS ──
      else if (item.kind === 'citizen') {
        const c = item.data;
        const pBase = project(c.x, 0, c.z);
        const pHead = project(c.x, c.height, c.z);

        const screenH = Math.max(8, pBase.y - pHead.y);
        const screenW = screenH * 0.38;

        // Ground Contact Shadow
        ctx.beginPath();
        ctx.ellipse(pBase.x, pBase.y, screenW * 1.25, screenW * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fill();

        // Silhouette color (dark, low-contrast, atmospheric)
        const citizenAlpha = 0.22;
        ctx.fillStyle = `rgba(220, 225, 235, ${citizenAlpha})`;
        ctx.strokeStyle = `rgba(255, 255, 255, 0.08)`;
        ctx.lineWidth = 0.75;

        // Render based on posture
        if (c.posture === 'parent_child') {
          // Parent + Child walking holding hands
          const parentX = pBase.x - screenW * 0.4;
          const childX = pBase.x + screenW * 0.45;
          const childH = screenH * 0.65;
          const childHeadY = pBase.y - childH;

          // Parent Head & Body
          ctx.beginPath();
          ctx.arc(parentX, pHead.y + screenH * 0.14, screenH * 0.11, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(parentX - screenW * 0.35, pHead.y + screenH * 0.25);
          ctx.lineTo(parentX + screenW * 0.35, pHead.y + screenH * 0.25);
          ctx.lineTo(parentX + screenW * 0.25, pHead.y + screenH * 0.6);
          ctx.lineTo(parentX + screenW * 0.25, pBase.y);
          ctx.lineTo(parentX + screenW * 0.05, pBase.y);
          ctx.lineTo(parentX, pHead.y + screenH * 0.65);
          ctx.lineTo(parentX - screenW * 0.05, pBase.y);
          ctx.lineTo(parentX - screenW * 0.25, pBase.y);
          ctx.lineTo(parentX - screenW * 0.25, pHead.y + screenH * 0.6);
          ctx.closePath();
          ctx.fill();

          // Child Head & Body
          ctx.beginPath();
          ctx.arc(childX, childHeadY + childH * 0.15, childH * 0.13, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(childX - screenW * 0.25, childHeadY + childH * 0.28);
          ctx.lineTo(childX + screenW * 0.25, childHeadY + childH * 0.28);
          ctx.lineTo(childX + screenW * 0.2, pBase.y);
          ctx.lineTo(childX - screenW * 0.2, pBase.y);
          ctx.closePath();
          ctx.fill();

          // Holding hands link
          ctx.beginPath();
          ctx.moveTo(parentX + screenW * 0.2, pHead.y + screenH * 0.5);
          ctx.lineTo(childX - screenW * 0.15, childHeadY + childH * 0.45);
          ctx.strokeStyle = `rgba(220, 225, 235, ${citizenAlpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        } else if (c.posture === 'wheelchair') {
          // Citizen in wheelchair with companion
          const chairX = pBase.x - screenW * 0.3;
          const compX = pBase.x + screenW * 0.5;

          // Wheelchair wheel
          ctx.beginPath();
          ctx.arc(chairX, pBase.y - screenH * 0.25, screenH * 0.22, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 196, 0, 0.4)`;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Seated Person Head & Body
          ctx.beginPath();
          ctx.arc(chairX, pHead.y + screenH * 0.22, screenH * 0.11, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(chairX - screenW * 0.25, pHead.y + screenH * 0.35);
          ctx.lineTo(chairX + screenW * 0.25, pHead.y + screenH * 0.35);
          ctx.lineTo(chairX + screenW * 0.25, pBase.y - screenH * 0.2);
          ctx.lineTo(chairX - screenW * 0.25, pBase.y - screenH * 0.2);
          ctx.closePath();
          ctx.fill();

          // Standing Companion
          ctx.beginPath();
          ctx.arc(compX, pHead.y + screenH * 0.14, screenH * 0.11, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(compX - screenW * 0.3, pHead.y + screenH * 0.25);
          ctx.lineTo(compX + screenW * 0.3, pHead.y + screenH * 0.25);
          ctx.lineTo(compX + screenW * 0.2, pBase.y);
          ctx.lineTo(compX - screenW * 0.2, pBase.y);
          ctx.closePath();
          ctx.fill();
        } else if (c.posture === 'group') {
          const count = c.groupCount || 2;
          for (let i = 0; i < count; i++) {
            const offsetDist = (i - (count - 1) / 2) * (screenW * 1.2);
            const figBaseX = pBase.x + offsetDist;
            const figBaseY = pBase.y + (i === 1 ? -1 : 1);
            const figHeadY = figBaseY - screenH;

            // Head
            ctx.beginPath();
            ctx.arc(figBaseX, figHeadY + screenH * 0.14, screenH * 0.11, 0, Math.PI * 2);
            ctx.fill();

            // Torso & Legs
            ctx.beginPath();
            ctx.moveTo(figBaseX - screenW * 0.45, figHeadY + screenH * 0.25);
            ctx.lineTo(figBaseX + screenW * 0.45, figHeadY + screenH * 0.25);
            ctx.lineTo(figBaseX + screenW * 0.35, figHeadY + screenH * 0.6);
            ctx.lineTo(figBaseX + screenW * 0.4, figBaseY);
            ctx.lineTo(figBaseX + screenW * 0.1, figBaseY);
            ctx.lineTo(figBaseX, figHeadY + screenH * 0.65);
            ctx.lineTo(figBaseX - screenW * 0.1, figBaseY);
            ctx.lineTo(figBaseX - screenW * 0.4, figBaseY);
            ctx.lineTo(figBaseX - screenW * 0.35, figHeadY + screenH * 0.6);
            ctx.closePath();
            ctx.fill();
          }
        } else if (c.posture === 'walking' || c.posture === 'commuter') {
          const walkCycle = Math.sin(timeMs * 0.006 * (c.speed * 2.5) + Number(c.id.charCodeAt(c.id.length - 1))) * 0.35;

          // Head
          ctx.beginPath();
          ctx.arc(pBase.x, pHead.y + screenH * 0.14, screenH * 0.11, 0, Math.PI * 2);
          ctx.fill();

          // Torso
          ctx.beginPath();
          ctx.moveTo(pBase.x - screenW * 0.45, pHead.y + screenH * 0.25);
          ctx.lineTo(pBase.x + screenW * 0.45, pHead.y + screenH * 0.25);
          ctx.lineTo(pBase.x + screenW * 0.3, pHead.y + screenH * 0.6);
          ctx.lineTo(pBase.x - screenW * 0.3, pHead.y + screenH * 0.6);
          ctx.closePath();
          ctx.fill();

          // Walking Legs (Dynamic swing)
          const leg1X = pBase.x + (walkCycle * screenW * 0.9);
          const leg2X = pBase.x - (walkCycle * screenW * 0.9);

          ctx.beginPath();
          ctx.moveTo(pBase.x - screenW * 0.15, pHead.y + screenH * 0.6);
          ctx.lineTo(leg1X, pBase.y);
          ctx.lineTo(leg1X + screenW * 0.2, pBase.y);
          ctx.lineTo(pBase.x + screenW * 0.05, pHead.y + screenH * 0.6);
          ctx.closePath();
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(pBase.x + screenW * 0.05, pHead.y + screenH * 0.6);
          ctx.lineTo(leg2X, pBase.y);
          ctx.lineTo(leg2X - screenW * 0.2, pBase.y);
          ctx.lineTo(pBase.x + screenW * 0.25, pHead.y + screenH * 0.6);
          ctx.closePath();
          ctx.fill();

          // Commuter bag shoulder strap
          if (c.posture === 'commuter') {
            ctx.beginPath();
            ctx.moveTo(pBase.x - screenW * 0.4, pHead.y + screenH * 0.28);
            ctx.lineTo(pBase.x + screenW * 0.35, pHead.y + screenH * 0.55);
            ctx.strokeStyle = 'rgba(255, 196, 0, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        } else if (c.posture === 'sitting') {
          // Sitting figure on plaza bench
          ctx.beginPath();
          ctx.arc(pBase.x, pHead.y + screenH * 0.14, screenH * 0.11, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(pBase.x - screenW * 0.4, pHead.y + screenH * 0.25);
          ctx.lineTo(pBase.x + screenW * 0.4, pHead.y + screenH * 0.25);
          ctx.lineTo(pBase.x + screenW * 0.3, pHead.y + screenH * 0.55);
          ctx.lineTo(pBase.x + screenW * 0.7, pHead.y + screenH * 0.55); // lap
          ctx.lineTo(pBase.x + screenW * 0.7, pBase.y);
          ctx.lineTo(pBase.x + screenW * 0.4, pBase.y);
          ctx.lineTo(pBase.x + screenW * 0.4, pHead.y + screenH * 0.68);
          ctx.lineTo(pBase.x - screenW * 0.3, pHead.y + screenH * 0.68);
          ctx.closePath();
          ctx.fill();
        } else {
          // Standing / Waiting upright figure
          ctx.beginPath();
          ctx.arc(pBase.x, pHead.y + screenH * 0.14, screenH * 0.11, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(pBase.x - screenW * 0.45, pHead.y + screenH * 0.25);
          ctx.lineTo(pBase.x + screenW * 0.45, pHead.y + screenH * 0.25);
          ctx.lineTo(pBase.x + screenW * 0.35, pHead.y + screenH * 0.6);
          ctx.lineTo(pBase.x + screenW * 0.35, pBase.y);
          ctx.lineTo(pBase.x + screenW * 0.1, pBase.y);
          ctx.lineTo(pBase.x, pHead.y + screenH * 0.65);
          ctx.lineTo(pBase.x - screenW * 0.1, pBase.y);
          ctx.lineTo(pBase.x - screenW * 0.35, pBase.y);
          ctx.lineTo(pBase.x - screenW * 0.35, pHead.y + screenH * 0.6);
          ctx.closePath();
          ctx.fill();
        }

        // Faint Neural Telemetry Ping over active citizen clusters ("CivicResolve AI is serving the citizens")
        if (c.hasTelemetryPing) {
          const pingY = pHead.y - 6;
          const pingColor = c.pingColor || '#22C55E';
          const pingPulse = Math.sin(timeMs * 0.005 + Number(c.id.charCodeAt(c.id.length - 1))) * 0.5 + 0.5;

          ctx.beginPath();
          ctx.arc(pBase.x, pingY, 1.8 + pingPulse * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = pingColor;
          ctx.shadowColor = pingColor;
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Faint vertical beacon line connecting citizen to civic neural grid
          ctx.beginPath();
          ctx.moveTo(pBase.x, pingY + 2);
          ctx.lineTo(pBase.x, pHead.y + screenH * 0.08);
          ctx.strokeStyle = `${pingColor}40`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    });

    // 8. Faint laser scanline
    const scanlineY = ((timeMs * 0.08) % height);
    ctx.beginPath();
    ctx.moveTo(0, scanlineY);
    ctx.lineTo(width, scanlineY);
    ctx.strokeStyle = 'rgba(225, 6, 0, 0.09)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }, []);

  // Continuous animation loop for background canvas
  useEffect(() => {
    let isRunning = true;
    const loop = (time: number) => {
      if (!isRunning) return;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderBackgroundCanvas(ctx, canvas.width, canvas.height, scrollProgressRef.current, time);
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

  const activeHazard = defaultHazards[activeHazardIndex];

  // Dynamic Case ID & Department values from live state or active hazard
  const activeCaseId = latestComplaint?.complaintNumber || latestComplaint?.id || '#CR-2026-9842';
  const activeDept = latestComplaint?.department || 'BBMP Roads & Water';
  const activeLocation = latestComplaint?.location || activeHazard.landmark;

  return (
    <div ref={containerRef} className="relative h-[480vh] bg-[#090909]">
      {/* Sticky 100dvh Viewport Container */}
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#090909]">
        
        {/* Background 3D Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full object-cover pointer-events-none opacity-70"
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
                    <span className="w-2.5 h-2.5 rounded-full bg-[#E10600] animate-ping" />
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
                      <span className="text-white font-bold truncate block">{activeLocation}</span>
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
                      { id: 1, label: 'INCIDENT INTAKE', desc: activeCaseId, sub: 'Photo + GPS Tagged', color: '#E10600' },
                      { id: 2, label: 'AI CLASSIFIER', desc: 'ResNet Vision ViT', sub: 'Severity: 9/10', color: '#FFC400' },
                      { id: 3, label: 'MUNICIPAL DEPT', desc: activeDept, sub: 'Ward 12 Gateway', color: '#FFC400' },
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
                    <span className="text-white font-bold">{activeCaseId}</span>
                  </div>
                  <div>
                    <span className="text-white/40 block">DISPATCH UNIT:</span>
                    <span className="text-[#22C55E] font-bold">QRF-DELTA-04</span>
                  </div>
                  <div>
                    <span className="text-white/40 block">JURISDICTION:</span>
                    <span className="text-white font-bold truncate block">{activeDept}</span>
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
                    <span className="text-[#FFC400] font-bold text-xs block">
                      {latestComplaint?.citizenRating ? `★★★★★ ${latestComplaint.citizenRating}.0 / 5.0` : '★★★★★ 5.0 / 5.0'}
                    </span>
                    <span className="text-white/50 text-[9px] block">
                      {latestComplaint?.citizenFeedback ? `"${latestComplaint.citizenFeedback}"` : 'Verified by Indiranagar Resident'}
                    </span>
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
