/**
 * MapView.tsx — Real interactive map using Leaflet + OpenStreetMap/CartoDB/ESRI.
 *
 * Shows India by default. Plots complaint markers with colour-coded priority.
 * Click a marker → popup with complaint details.
 * Toggle: Dark / Satellite / Street view.
 * No API key required — all tile providers are free.
 */

import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import L, { type Map as LeafletMap, type Marker as LeafletMarker, type TileLayer as LeafletTileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapMarker, Complaint } from '../types';
import PriorityBadge from './PriorityBadge';
import StatusBadge from './StatusBadge';
import { getCategoryEmoji } from '../utils/helpers';
import { X, MapPin, Layers, ArrowRight, AlertTriangle, RefreshCw } from 'lucide-react';

// Fix Leaflet default marker icons for Vite bundler
// @ts-expect-error internal
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Tile layer definitions ─────────────────────────────────────────────────────
const TILE_LAYERS = {
  dark: {
    label: 'Dark',
    url:   'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '© <a href="https://openstreetmap.org/copyright" style="color:#999">OSM</a> © <a href="https://carto.com/attributions" style="color:#999">CARTO</a>',
  },
  satellite: {
    label: 'Satellite',
    url:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
  },
  street: {
    label: 'Street',
    url:   'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://openstreetmap.org/copyright" style="color:#999">OpenStreetMap</a> contributors',
  },
} as const;

type TileKey = keyof typeof TILE_LAYERS;

function markerColor(priority: string, status: string): string {
  if (status === 'Resolved' || status === 'Closed') return '#22C55E';
  if (priority === 'HIGH' || priority === 'CRITICAL') return '#E10600';
  if (priority === 'MEDIUM') return '#FFC400';
  return '#E10600';
}

// Build a custom circle SVG marker for Leaflet
function buildIcon(color: string, pulse: boolean) {
  const size = pulse ? 18 : 14;
  const svg = `
    <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
      ${pulse ? `<circle cx="${size}" cy="${size}" r="${size - 1}" fill="${color}" opacity="0.3">
        <animate attributeName="r" values="${size - 5};${size}" dur="1.8s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite"/>
      </circle>` : ''}
      <circle cx="${size}" cy="${size}" r="${pulse ? 6 : 5}" fill="${color}" stroke="#111" stroke-width="2"/>
      <circle cx="${size}" cy="${size}" r="2.5" fill="white" opacity="0.95"/>
    </svg>`;
  return L.divIcon({
    html:       svg,
    className:  '',
    iconSize:   [size * 2, size * 2],
    iconAnchor: [size, size],
  });
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface MapViewProps {
  markers:    MapMarker[];
  complaints: Complaint[];
  center?:    [number, number];
  zoom?:      number;
  height?:    string;
}

// ── Component ──────────────────────────────────────────────────────────────────
const MapView: React.FC<MapViewProps> = ({
  markers,
  complaints,
  center = [17.3850, 78.4867],
  zoom   = 12,
  height = '100%',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<LeafletMap | null>(null);
  const tileRef      = useRef<LeafletTileLayer | null>(null);
  const markersRef   = useRef<LeafletMarker[]>([]);
  const [tileKey, setTileKey]   = useState<TileKey>('dark');
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [filter, setFilter]     = useState<'all' | 'HIGH' | 'MEDIUM' | 'LOW'>('all');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // ── Initialise map ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // Tear down any existing Leaflet map on this container
    if (mapRef.current) {
      try {
        mapRef.current.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
    }

    const domNode = containerRef.current;
    if ((domNode as unknown as { _leaflet_id?: unknown })._leaflet_id) {
      delete (domNode as unknown as { _leaflet_id?: unknown })._leaflet_id;
    }

    try {
      const map = L.map(domNode, {
        center,
        zoom,
        zoomControl: false,
        attributionControl: true,
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      tileRef.current = L.tileLayer(TILE_LAYERS.dark.url, {
        attribution: TILE_LAYERS.dark.attribution,
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      mapRef.current = map;
      setMapReady(true);
      setMapError(null);

      // Force tile invalidation after container size calculates
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 100);
    } catch (err) {
      console.error('[MapView] Failed to initialize Leaflet:', err);
      setMapError('Failed to load map interface. Please check browser permissions or reload.');
      setMapReady(false);
    }

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // ignore
        }
        mapRef.current = null;
      }
      if (domNode && (domNode as unknown as { _leaflet_id?: unknown })._leaflet_id) {
        delete (domNode as unknown as { _leaflet_id?: unknown })._leaflet_id;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Swap tile layer when user changes style ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    if (tileRef.current) {
      mapRef.current.removeLayer(tileRef.current);
    }
    tileRef.current = L.tileLayer(TILE_LAYERS[tileKey].url, {
      attribution: TILE_LAYERS[tileKey].attribution,
      maxZoom: 19,
      subdomains: tileKey === 'street' ? 'abc' : 'abcd',
    }).addTo(mapRef.current);
  }, [tileKey, mapReady]);

  // ── Plot complaint markers ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const filtered = markers.filter((m) => filter === 'all' || m.priority === filter);

    const bounds: [number, number][] = [];

    filtered.forEach((marker) => {
      const complaint = complaints.find((c) => c.id === marker.complaintId);
      if (!complaint || complaint.latitude == null || complaint.longitude == null) return;

      const lat = Number(complaint.latitude);
      const lng = Number(complaint.longitude);
      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      bounds.push([lat, lng]);

      const color = markerColor(marker.priority, marker.status);
      const isActive = !['Resolved', 'Closed'].includes(marker.status);
      const icon = buildIcon(color, isActive);

      const m = L.marker([lat, lng], { icon })
        .addTo(map)
        .on('click', () => setSelected(complaint));

      markersRef.current.push(m);
    });

    // Auto-fit map bounds
    if (bounds.length > 1) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } catch {
        // ignore
      }
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }
  }, [markers, complaints, filter, mapReady]);

  const filteredCount = markers.filter((m) => filter === 'all' || m.priority === filter).length;
  const withCoordsCount = markers.filter((m) => {
    if (filter !== 'all' && m.priority !== filter) return false;
    const c = complaints.find((x) => x.id === m.complaintId);
    return c?.latitude != null && c?.longitude != null && !isNaN(Number(c.latitude)) && !isNaN(Number(c.longitude)) && (Number(c.latitude) !== 0 || Number(c.longitude) !== 0);
  }).length;
  const missingCoordsCount = filteredCount - withCoordsCount;

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-white/10" style={{ height }}>

      {/* ── Leaflet container ───────────────────────────────────────── */}
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: 400 }} />

      {/* ── Loading state ────────────────────────────────────────────── */}
      {!mapReady && !mapError && (
        <div className="absolute inset-0 bg-[#111] flex items-center justify-center z-[1001]">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#E10600]/30 border-t-[#E10600] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-white/40 text-sm">Loading map…</p>
          </div>
        </div>
      )}

      {/* ── Error state ──────────────────────────────────────────────── */}
      {mapError && (
        <div className="absolute inset-0 bg-[#111] flex items-center justify-center z-[1001] p-6">
          <div className="text-center max-w-sm">
            <AlertTriangle className="w-8 h-8 text-[#E10600] mx-auto mb-2" />
            <p className="text-white font-bold text-sm mb-1">Map Loading Issue</p>
            <p className="text-white/40 text-xs mb-4">{mapError}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 bg-[#E10600] text-white text-xs font-bold px-3.5 py-2 rounded-xl hover:bg-[#FF1A14] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reload Page
            </button>
          </div>
        </div>
      )}

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      {mapReady && (
        <div className="absolute top-3 left-3 z-[1000] flex gap-1.5">
          {(['all', 'HIGH', 'MEDIUM', 'LOW'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all backdrop-blur-sm ${
                filter === f
                  ? 'bg-[#E10600] text-white shadow-[0_0_10px_rgba(225,6,0,0.4)]'
                  : 'bg-black/60 text-white/60 hover:text-white border border-white/15'
              }`}>
              {f === 'all' ? `All (${markers.length})` : f}
            </button>
          ))}
        </div>
      )}

      {/* ── Tile switcher ─────────────────────────────────────────────── */}
      {mapReady && (
        <div className="absolute top-3 right-3 z-[1000]" style={{ marginTop: 40 }}>
          <div className="flex flex-col gap-1 bg-black/70 backdrop-blur-sm border border-white/15 rounded-xl p-1.5">
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-white/40 font-bold uppercase tracking-wider">
              <Layers className="w-3 h-3" /> Layer
            </div>
            {(Object.keys(TILE_LAYERS) as TileKey[]).map((key) => (
              <button key={key} onClick={() => setTileKey(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left ${
                  tileKey === key
                    ? 'bg-[#E10600] text-white'
                    : 'text-white/50 hover:text-white hover:bg-white/8'
                }`}>
                {TILE_LAYERS[key].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Selected complaint popup ──────────────────────────────────── */}
      {selected && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] w-72 sm:w-80"
          style={{ animation: 'slideUp .25s ease-out' }}>
          <div className="bg-[#111]/95 backdrop-blur-md border border-white/15 rounded-2xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600] to-transparent rounded-t-2xl" />
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-2">
                <span className="text-xl flex-shrink-0 mt-0.5">{getCategoryEmoji(selected.category)}</span>
                <div>
                  <p className="text-[11px] font-black font-mono text-[#E10600] mb-0.5">{selected.id}</p>
                  <p className="font-bold text-white text-sm leading-tight">{selected.title}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)}
                className="p-1 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <PriorityBadge priority={selected.priority} size="sm" />
              <StatusBadge   status={selected.status}   size="sm" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/50 mb-1">
              <MapPin className="w-3 h-3 text-[#E10600] flex-shrink-0" />
              {selected.location}
            </div>
            <p className="text-xs text-white/40">{selected.department}</p>
            {selected.latitude && (
              <p className="text-[10px] font-mono text-white/25 mt-1">
                {selected.latitude.toFixed(4)}°N, {selected.longitude?.toFixed(4)}°E
              </p>
            )}
            <div className="mt-3 pt-2.5 border-t border-white/8 flex items-center justify-between">
              <span className="text-[11px] text-white/40">{selected.category}</span>
              <Link
                to={window.location.pathname.startsWith('/admin') ? `/admin/complaints/${selected.id}` : `/track?id=${selected.id}`}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#E10600] hover:text-white hover:bg-[#E10600] px-2.5 py-1.5 rounded-lg bg-[#E10600]/10 transition-all"
              >
                View Details <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Marker count badge ────────────────────────────────────────── */}
      {mapReady && (
        <div className="absolute bottom-4 right-4 z-[1000] flex flex-col items-end gap-1.5">
          <div className="bg-black/70 backdrop-blur-sm border border-white/15 rounded-full px-3 py-1.5 text-xs text-white/50 font-semibold">
            {withCoordsCount} mapped · {filteredCount} total
          </div>
          {missingCoordsCount > 0 && (
            <div className="bg-[#FFC400]/10 backdrop-blur-sm border border-[#FFC400]/25 rounded-full px-3 py-1 text-[10px] text-[#FFC400] font-medium">
              {missingCoordsCount} without GPS coordinates
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity:0; transform: translateX(-50%) translateY(10px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }
        /* Override Leaflet attribution style for dark theme */
        .leaflet-control-attribution {
          background: rgba(0,0,0,0.6) !important;
          color: #666 !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a { color: #888 !important; }
        .leaflet-control-zoom a {
          background: rgba(17,17,17,0.9) !important;
          color: #ccc !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(225,6,0,0.8) !important;
          color: white !important;
        }
      `}</style>
    </div>
  );
};

export default MapView;
