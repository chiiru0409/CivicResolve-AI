/**
 * MapView.tsx — Interactive multi-complaint incident map using Leaflet.
 *
 * Features:
 * - Plots real verified complaint coordinates from municipal database
 * - Zero watermark, zero-API-key tile layers (Dark Tactical, Satellite, Street)
 * - Color-coded priority markers with active beacon animations
 * - Incident drill-down popup & card with direct link to details
 * - Auto-fits bounds to current active filtered complaints
 * - Category and Priority filters
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Map as LeafletMap, Marker as LeafletMarker, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapMarker, Complaint } from '../types';
import PriorityBadge from './PriorityBadge';
import StatusBadge from './StatusBadge';
import { getCategoryEmoji } from '../utils/helpers';
import {
  X,
  MapPin,
  Layers,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Compass,
  ExternalLink,
} from 'lucide-react';
import {
  validateCoordinates,
  formatCoordinatesDMS,
  getGoogleMapsUrl,
  createTileLayerGroup,
  type MapTileMode,
} from '../utils/mapConfig';

function markerColor(priority: string, status: string): string {
  if (status === 'Resolved' || status === 'Closed') return '#22C55E';
  if (priority === 'HIGH' || priority === 'CRITICAL') return '#E10600';
  if (priority === 'MEDIUM') return '#FFC400';
  return '#22C55E';
}

function buildMarkerIcon(L: typeof import('leaflet'), color: string, pulse: boolean) {
  const size = pulse ? 18 : 14;
  const svg = `
    <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
      ${
        pulse
          ? `<circle cx="${size}" cy="${size}" r="${size - 1}" fill="${color}" opacity="0.3">
              <animate attributeName="r" values="${size - 5};${size}" dur="1.8s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite"/>
            </circle>`
          : ''
      }
      <circle cx="${size}" cy="${size}" r="${pulse ? 6.5 : 5.5}" fill="${color}" stroke="#070707" stroke-width="2.5" filter="drop-shadow(0 0 5px ${color}80)"/>
      <circle cx="${size}" cy="${size}" r="2.5" fill="white" opacity="0.95"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'civic-marker-div',
    iconSize: [size * 2, size * 2],
    iconAnchor: [size, size],
  });
}

interface MapViewProps {
  markers: MapMarker[];
  complaints: Complaint[];
  center?: [number, number];
  zoom?: number;
  height?: string;
}

const MapView: React.FC<MapViewProps> = ({
  markers,
  complaints,
  center = [17.385, 78.4867],
  zoom = 12,
  height = '100%',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tileGroupRef = useRef<LayerGroup | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const leafletLibRef = useRef<typeof import('leaflet') | null>(null);

  const [tileKey, setTileKey] = useState<MapTileMode>('dark');
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [filter, setFilter] = useState<'all' | 'HIGH' | 'MEDIUM' | 'LOW'>('all');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;

    import('leaflet')
      .then((L) => {
        if (!isMounted || !containerRef.current) return;
        leafletLibRef.current = L;

        // Reset default icons
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (L.Icon.Default.prototype as any)._getIconUrl;

        // Tear down any previous instance attached to DOM
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

        const map = L.map(domNode, {
          center,
          zoom,
          zoomControl: false,
          attributionControl: true,
          fadeAnimation: true,
          zoomAnimation: true,
        });

        L.control.zoom({ position: 'topright' }).addTo(map);

        // Composite tile layer group
        const tileGroup = createTileLayerGroup(L, 'dark');
        tileGroup.addTo(map);
        tileGroupRef.current = tileGroup;

        mapRef.current = map;
        setMapReady(true);
        setMapError(null);

        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize();
          }
        }, 150);
      })
      .catch((err) => {
        console.error('[MapView] Error initializing Leaflet:', err);
        if (isMounted) {
          setMapError('Failed to load GIS engine. Please reload the page.');
          setMapReady(false);
        }
      });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          // ignore
        }
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap tile layer when user changes style
  useEffect(() => {
    if (!mapRef.current || !leafletLibRef.current || !mapReady) return;
    const L = leafletLibRef.current;

    if (tileGroupRef.current) {
      mapRef.current.removeLayer(tileGroupRef.current);
    }

    const newGroup = createTileLayerGroup(L, tileKey);
    newGroup.addTo(mapRef.current);
    tileGroupRef.current = newGroup;
  }, [tileKey, mapReady]);

  // Plot verified complaint markers
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletLibRef.current;
    if (!map || !L || !mapReady) return;

    // Clear previous markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const filtered = markers.filter((m) => filter === 'all' || m.priority === filter);
    const bounds: [number, number][] = [];

    filtered.forEach((marker) => {
      const complaint = complaints.find((c) => c.id === marker.complaintId);
      if (!complaint) return;

      const validCheck = validateCoordinates(complaint.latitude, complaint.longitude);
      if (!validCheck.valid || validCheck.latitude === null || validCheck.longitude === null) {
        return;
      }

      const lat = validCheck.latitude;
      const lng = validCheck.longitude;
      bounds.push([lat, lng]);

      const color = markerColor(marker.priority, marker.status);
      const isActive = !['Resolved', 'Closed'].includes(marker.status);
      const icon = buildMarkerIcon(L, color, isActive);

      const m = L.marker([lat, lng], { icon })
        .addTo(map)
        .on('click', () => setSelected(complaint));

      markersRef.current.push(m);
    });

    // Auto-fit map bounds
    if (bounds.length > 1) {
      try {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
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
    if (!c) return false;
    return validateCoordinates(c.latitude, c.longitude).valid;
  }).length;
  const missingCoordsCount = filteredCount - withCoordsCount;

  const handleFitAll = () => {
    if (!mapRef.current) return;
    const validCoords = complaints
      .map((c) => validateCoordinates(c.latitude, c.longitude))
      .filter((v) => v.valid && v.latitude !== null && v.longitude !== null)
      .map((v) => [v.latitude!, v.longitude!] as [number, number]);

    if (validCoords.length > 1) {
      mapRef.current.fitBounds(validCoords, { padding: [40, 40], maxZoom: 15 });
    } else if (validCoords.length === 1) {
      mapRef.current.setView(validCoords[0], 14);
    }
  };

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#0A0A0A]"
      style={{ height }}
    >
      {/* Map DOM container */}
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: 400 }} />

      {/* Loading state */}
      {!mapReady && !mapError && (
        <div className="absolute inset-0 bg-[#0A0A0A] flex items-center justify-center z-[1001]">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#E10600]/30 border-t-[#E10600] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-white/40 text-xs font-mono">Initializing GIS Radar View…</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {mapError && (
        <div className="absolute inset-0 bg-[#0A0A0A] flex items-center justify-center z-[1001] p-6">
          <div className="text-center max-w-sm">
            <AlertTriangle className="w-8 h-8 text-[#E10600] mx-auto mb-2" />
            <p className="text-white font-bold text-sm mb-1">GIS Engine Error</p>
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

      {/* Priority Filter Bar */}
      {mapReady && (
        <div className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-1.5 max-w-[80vw]">
          {(['all', 'HIGH', 'MEDIUM', 'LOW'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all backdrop-blur-md ${
                filter === f
                  ? 'bg-[#E10600] text-white shadow-[0_0_12px_rgba(225,6,0,0.5)]'
                  : 'bg-black/75 text-white/60 hover:text-white border border-white/15'
              }`}
            >
              {f === 'all' ? `All (${markers.length})` : f}
            </button>
          ))}
        </div>
      )}

      {/* Tile Switcher & Controls */}
      {mapReady && (
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2 items-end" style={{ marginTop: 45 }}>
          <div className="flex flex-col gap-1 bg-black/80 backdrop-blur-md border border-white/15 rounded-xl p-1.5 shadow-2xl">
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-white/40 font-bold uppercase tracking-wider">
              <Layers className="w-3 h-3" /> Map Mode
            </div>
            {(['dark', 'satellite', 'street'] as MapTileMode[]).map((key) => (
              <button
                key={key}
                onClick={() => setTileKey(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left uppercase ${
                  tileKey === key
                    ? 'bg-[#E10600] text-white'
                    : 'text-white/50 hover:text-white hover:bg-white/8'
                }`}
              >
                {key === 'dark' ? 'Dark' : key === 'satellite' ? 'Satellite' : 'Street'}
              </button>
            ))}
          </div>

          <button
            onClick={handleFitAll}
            className="flex items-center gap-1.5 bg-black/80 hover:bg-black text-white text-xs font-bold px-3 py-2 rounded-xl border border-white/15 backdrop-blur-md shadow-xl transition-all"
            title="Fit all markers in view"
          >
            <Compass className="w-3.5 h-3.5 text-[#E10600]" /> Fit View
          </button>
        </div>
      )}

      {/* Selected Complaint Floating Detail Card */}
      {selected && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-sm"
          style={{ animation: 'slideUp .25s ease-out' }}
        >
          <div className="bg-[#111]/95 backdrop-blur-md border border-white/15 rounded-2xl p-4 shadow-[0_20px_60px_rgba(0,0,0,0.8)]">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600] to-transparent rounded-t-2xl" />
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-2">
                <span className="text-xl flex-shrink-0 mt-0.5">{getCategoryEmoji(selected.category)}</span>
                <div>
                  <p className="text-[11px] font-black font-mono text-[#E10600] mb-0.5">{selected.id}</p>
                  <p className="font-bold text-white text-sm leading-tight">{selected.title || selected.category}</p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-1 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <PriorityBadge priority={selected.priority} size="sm" />
              <StatusBadge status={selected.status} size="sm" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/60 mb-1">
              <MapPin className="w-3.5 h-3.5 text-[#E10600] flex-shrink-0" />
              <span className="truncate">{selected.location || 'Location specified in record'}</span>
            </div>
            {selected.landmark && (
              <p className="text-[11px] text-[#FFC400] pl-5 mb-1 font-medium truncate">
                🏛️ {selected.landmark}
              </p>
            )}
            <p className="text-xs text-white/40 pl-5">{selected.department || 'Municipal Operations'}</p>

            {selected.latitude && selected.longitude && (
              <p className="text-[10px] font-mono text-white/35 mt-1.5 pl-5">
                {formatCoordinatesDMS(selected.latitude, selected.longitude, 4)}
              </p>
            )}

            <div className="mt-3 pt-2.5 border-t border-white/8 flex items-center justify-between">
              <a
                href={
                  selected.latitude && selected.longitude
                    ? getGoogleMapsUrl(selected.latitude, selected.longitude)
                    : '#'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/50 hover:text-white transition-colors"
              >
                Google Maps <ExternalLink className="w-3 h-3" />
              </a>
              <Link
                to={
                  window.location.pathname.startsWith('/admin')
                    ? `/admin/complaints/${selected.id}`
                    : `/track?id=${selected.id}`
                }
                className="inline-flex items-center gap-1 text-xs font-bold text-[#E10600] hover:text-white hover:bg-[#E10600] px-3 py-1.5 rounded-lg bg-[#E10600]/10 transition-all"
              >
                View Incident <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Mapped Count Telemetry Badge */}
      {mapReady && (
        <div className="absolute bottom-4 right-4 z-[1000] flex flex-col items-end gap-1.5 pointer-events-none">
          <div className="bg-black/80 backdrop-blur-md border border-white/15 rounded-full px-3 py-1.5 text-xs text-white/60 font-semibold shadow-lg">
            {withCoordsCount} mapped · {filteredCount} total
          </div>
          {missingCoordsCount > 0 && (
            <div className="bg-[#FFC400]/10 backdrop-blur-md border border-[#FFC400]/30 rounded-full px-3 py-1 text-[10px] text-[#FFC400] font-medium shadow-lg">
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
        .leaflet-control-attribution {
          background: rgba(0,0,0,0.7) !important;
          color: #777 !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a { color: #999 !important; }
        .leaflet-control-zoom a {
          background: rgba(15,15,15,0.9) !important;
          color: #ccc !important;
          border-color: rgba(255,255,255,0.12) !important;
        }
        .leaflet-control-zoom a:hover {
          background: rgba(225,6,0,0.85) !important;
          color: white !important;
        }
        .civic-marker-div {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
};

export default MapView;
