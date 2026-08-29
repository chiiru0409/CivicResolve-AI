/**
 * MapView.tsx — Interactive multi-complaint incident map with Google Maps-grade usability.
 *
 * Features:
 * - Google Maps-grade smooth mouse-wheel zoom, double-click zoom, touch/pinch zoom, pan, and drag
 * - Zero watermark, zero-API-key tile layers (Dark Tactical, Satellite, Street)
 * - Custom Google Maps-style Zoom In (+), Zoom Out (-), Locate Me (GPS), and Fit View controls
 * - Color-coded priority markers with pulsating beacon animations
 * - Live ResizeObserver for automatic map size invalidation on window/container resize
 * - Isolated wheel events (data-lenis-prevent) to prevent page scrolling during map zoom
 * - Incident drill-down card with live DMS coordinates and direct deep navigation links
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Map as LeafletMap, Marker as LeafletMarker, LayerGroup, Circle as LeafletCircle } from 'leaflet';
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
  Plus,
  Minus,
  Navigation,
  Loader2,
} from 'lucide-react';
import {
  validateCoordinates,
  formatCoordinatesDMS,
  getGoogleMapsUrl,
  createTileLayerGroup,
  GOOGLE_MAP_INTERACTION_OPTIONS,
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

function buildUserLocationIcon(L: typeof import('leaflet')) {
  const svg = `
    <div style="position:relative;width:32px;height:32px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:#38BDF8;opacity:0.35;animation:civicUserPulse 1.8s ease-out infinite;"></div>
      <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:#38BDF8;border:3px solid #ffffff;box-shadow:0 0 10px rgba(56,189,248,0.8);"></div>
    </div>`;
  return L.divIcon({
    html: svg,
    className: 'civic-user-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
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
  const userMarkerRef = useRef<LeafletMarker | null>(null);
  const userCircleRef = useRef<LeafletCircle | null>(null);
  const leafletLibRef = useRef<typeof import('leaflet') | null>(null);

  const [tileKey, setTileKey] = useState<MapTileMode>('dark');
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [filter, setFilter] = useState<'all' | 'HIGH' | 'MEDIUM' | 'LOW'>('all');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(zoom);

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
          ...GOOGLE_MAP_INTERACTION_OPTIONS,
          center,
          zoom,
        });

        // Track zoom level changes for interactive UI
        map.on('zoomend', () => {
          setCurrentZoom(Math.round(map.getZoom() * 10) / 10);
        });

        // Composite tile layer group
        const tileGroup = createTileLayerGroup(L, 'dark');
        tileGroup.addTo(map);
        tileGroupRef.current = tileGroup;

        mapRef.current = map;
        setMapReady(true);
        setMapError(null);

        // Immediate + staggered resize invalidation
        map.invalidateSize();
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
        userMarkerRef.current = null;
        userCircleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automatic ResizeObserver to ensure map never has layout/blank tile glitches
  useEffect(() => {
    if (!containerRef.current || !mapReady) return;

    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [mapReady]);

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

  // Zoom In / Out Handlers
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn(1);
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut(1);
    }
  };

  // Locate Me (Current GPS location)
  const handleLocateMe = () => {
    if (!navigator.geolocation || !mapRef.current || !leafletLibRef.current) return;
    setGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setGpsLoading(false);
        const map = mapRef.current;
        const L = leafletLibRef.current;
        if (!map || !L) return;

        // Clean up previous user markers
        if (userMarkerRef.current) userMarkerRef.current.remove();
        if (userCircleRef.current) userCircleRef.current.remove();

        const userIcon = buildUserLocationIcon(L);
        const userMarker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
        userMarkerRef.current = userMarker;

        if (accuracy && accuracy < 500) {
          const userCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#38BDF8',
            fillColor: '#38BDF8',
            fillOpacity: 0.12,
            weight: 1,
          }).addTo(map);
          userCircleRef.current = userCircle;
        }

        map.flyTo([lat, lng], 16, { duration: 1.2 });
      },
      () => {
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

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
      data-lenis-prevent="true"
      onWheel={(e) => e.stopPropagation()}
      className="relative w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#0A0A0A] select-none"
      style={{ height }}
    >
      {/* Map DOM container */}
      <div
        ref={containerRef}
        data-lenis-prevent="true"
        className="w-full h-full"
        style={{ minHeight: 400 }}
      />

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

      {/* Google-Maps-Style Floating Controls (Top Right) */}
      {mapReady && (
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2 items-end">
          {/* Map Layer Mode Switcher */}
          <div className="flex flex-col gap-1 bg-black/85 backdrop-blur-md border border-white/15 rounded-xl p-1.5 shadow-2xl">
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-white/40 font-bold uppercase tracking-wider font-mono">
              <Layers className="w-3 h-3" /> Map Mode
            </div>
            {(['dark', 'satellite', 'street'] as MapTileMode[]).map((key) => (
              <button
                key={key}
                onClick={() => setTileKey(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left uppercase font-mono ${
                  tileKey === key
                    ? 'bg-[#E10600] text-white shadow-md'
                    : 'text-white/50 hover:text-white hover:bg-white/8'
                }`}
              >
                {key === 'dark' ? 'Dark' : key === 'satellite' ? 'Satellite' : 'Street'}
              </button>
            ))}
          </div>

          {/* Navigation & Zoom Control Stack */}
          <div className="flex flex-col bg-black/85 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden shadow-2xl divide-y divide-white/10">
            {/* Zoom In */}
            <button
              onClick={handleZoomIn}
              className="p-2.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center active:scale-95"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* Zoom Out */}
            <button
              onClick={handleZoomOut}
              className="p-2.5 text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center active:scale-95"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Locate Me (GPS) */}
            <button
              onClick={handleLocateMe}
              disabled={gpsLoading}
              className={`p-2.5 transition-colors flex items-center justify-center active:scale-95 ${
                gpsLoading ? 'text-[#38BDF8] animate-pulse' : 'text-white/70 hover:text-[#38BDF8] hover:bg-white/10'
              }`}
              title="Your Location (GPS)"
              aria-label="Your Location"
            >
              {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            </button>

            {/* Fit View Bounds */}
            <button
              onClick={handleFitAll}
              className="p-2.5 text-white/70 hover:text-[#E10600] hover:bg-white/10 transition-colors flex items-center justify-center active:scale-95"
              title="Fit all markers in view"
              aria-label="Fit View"
            >
              <Compass className="w-4 h-4" />
            </button>
          </div>
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
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/50 hover:text-white transition-colors font-mono"
              >
                Google Maps <ExternalLink className="w-3 h-3" />
              </a>
              <Link
                to={
                  window.location.pathname.startsWith('/admin')
                    ? `/admin/complaints/${selected.id}`
                    : `/track?id=${selected.id}`
                }
                className="inline-flex items-center gap-1 text-xs font-bold text-[#E10600] hover:text-white hover:bg-[#E10600] px-3 py-1.5 rounded-lg bg-[#E10600]/10 transition-all font-mono"
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
          <div className="bg-black/80 backdrop-blur-md border border-white/15 rounded-full px-3 py-1.5 text-xs text-white/60 font-semibold shadow-lg font-mono">
            {withCoordsCount} mapped · {filteredCount} total
          </div>
          {missingCoordsCount > 0 && (
            <div className="bg-[#FFC400]/10 backdrop-blur-md border border-[#FFC400]/30 rounded-full px-3 py-1 text-[10px] text-[#FFC400] font-medium shadow-lg font-mono">
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
        @keyframes civicUserPulse {
          0%   { transform: scale(0.9); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .leaflet-control-attribution {
          background: rgba(0,0,0,0.7) !important;
          color: #777 !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a { color: #999 !important; }
        .civic-marker-div, .civic-user-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
};

export default MapView;
