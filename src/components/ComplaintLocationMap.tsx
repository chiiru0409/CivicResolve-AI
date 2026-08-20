import React, { useRef, useEffect, useState } from 'react';
import { MapPin, Navigation, Layers, ExternalLink, AlertTriangle, Compass } from 'lucide-react';
import type { Complaint } from '../types';
import PriorityBadge from './PriorityBadge';
import StatusBadge from './StatusBadge';
import { getCategoryEmoji } from '../utils/helpers';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';

const TILE_LAYERS = {
  dark: {
    label: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© OSM © CARTO',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
  },
  street: {
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
  },
} as const;

type TileKey = keyof typeof TILE_LAYERS;

interface ComplaintLocationMapProps {
  complaint: Complaint;
}

function getMarkerColor(priority: string, status: string): string {
  if (status === 'Resolved' || status === 'Closed') return '#22C55E';
  if (priority === 'HIGH' || priority === 'CRITICAL') return '#E10600';
  if (priority === 'MEDIUM') return '#FFC400';
  return '#22C55E';
}

const ComplaintLocationMap: React.FC<ComplaintLocationMapProps> = ({ complaint }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const tileRef = useRef<import('leaflet').TileLayer | null>(null);
  const leafletLibRef = useRef<typeof import('leaflet') | null>(null);

  const [tileKey, setTileKey] = useState<TileKey>('dark');
  const [mapReady, setMapReady] = useState(false);

  const lat = complaint.latitude != null ? Number(complaint.latitude) : null;
  const lng = complaint.longitude != null ? Number(complaint.longitude) : null;

  const hasValidCoords =
    lat !== null &&
    lng !== null &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    (lat !== 0 || lng !== 0);

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || !hasValidCoords) return;

    import('leaflet').then((L) => {
      if (!containerRef.current) return;
      leafletLibRef.current = L;

      // Reset default leaflet icons
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;

      // If map already exists, just update view
      if (mapRef.current) {
        mapRef.current.setView([lat!, lng!], 16);
        updateMarker(L, lat!, lng!);
        return;
      }

      const map = L.map(containerRef.current, {
        center: [lat!, lng!],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
      });

      // Zoom control on top-right
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Tile layer
      tileRef.current = L.tileLayer(TILE_LAYERS[tileKey].url, {
        maxZoom: 19,
        subdomains: tileKey === 'street' ? 'abc' : 'abcd',
      }).addTo(map);

      mapRef.current = map;
      setMapReady(true);

      updateMarker(L, lat!, lng!);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidCoords, complaint.id]);

  // Update marker and popup when coordinates or complaint properties change
  const updateMarker = (L: typeof import('leaflet'), latitude: number, longitude: number) => {
    if (!mapRef.current) return;

    if (markerRef.current) {
      markerRef.current.remove();
    }

    const color = getMarkerColor(complaint.priority, complaint.status);
    const isActive = !['Resolved', 'Closed'].includes(complaint.status);

    // Custom pulsing SVG icon
    const size = 18;
    const svg = `
      <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
        ${isActive ? `
          <circle cx="${size}" cy="${size}" r="${size - 2}" fill="${color}" opacity="0.3">
            <animate attributeName="r" values="${size - 6};${size}" dur="1.8s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.6;0" dur="1.8s" repeatCount="indefinite"/>
          </circle>` : ''}
        <circle cx="${size}" cy="${size}" r="7" fill="${color}" stroke="#111" stroke-width="2.5"/>
        <circle cx="${size}" cy="${size}" r="3" fill="#FFFFFF" opacity="0.95"/>
      </svg>`;

    const customIcon = L.divIcon({
      html: svg,
      className: '',
      iconSize: [size * 2, size * 2],
      iconAnchor: [size, size],
    });

    const marker = L.marker([latitude, longitude], { icon: customIcon }).addTo(mapRef.current);

    // Popup content with real complaint metadata
    const popupHtml = `
      <div style="background:#111;color:#fff;border-radius:12px;padding:12px;font-family:Inter,sans-serif;min-width:220px;border:1px solid rgba(255,255,255,0.12);box-shadow:0 10px 30px rgba(0,0,0,0.6);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-family:monospace;font-size:11px;font-weight:800;color:#E10600;">${complaint.id}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:${color}20;color:${color};border:1px solid ${color}40;">${complaint.priority}</span>
        </div>
        <p style="font-size:12px;font-weight:700;color:#fff;margin:0 0 6px 0;line-height:1.3;">${complaint.title}</p>
        <p style="font-size:11px;color:#aaa;margin:0 0 4px 0;">📍 ${complaint.location}</p>
        ${complaint.landmark ? `<p style="font-size:10px;color:#FFC400;margin:0 0 6px 0;">🏛️ Landmark: ${complaint.landmark}</p>` : ''}
        <div style="font-family:monospace;font-size:9px;color:#666;border-top:1px solid rgba(255,255,255,0.08);padding-top:6px;margin-top:6px;">
          GPS: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, { closeButton: false, offset: [0, -10] });
    markerRef.current = marker;
  };

  // Switch Tile Layer
  useEffect(() => {
    if (!mapRef.current || !leafletLibRef.current) return;
    if (tileRef.current) {
      mapRef.current.removeLayer(tileRef.current);
    }
    tileRef.current = leafletLibRef.current.tileLayer(TILE_LAYERS[tileKey].url, {
      maxZoom: 19,
      subdomains: tileKey === 'street' ? 'abc' : 'abcd',
    }).addTo(mapRef.current);
  }, [tileKey]);

  const handleRecenter = () => {
    if (mapRef.current && hasValidCoords) {
      mapRef.current.setView([lat!, lng!], 16, { animate: true });
      if (markerRef.current) {
        markerRef.current.openPopup();
      }
    }
  };

  return (
    <div className="card p-5 bg-[#0D0D0D] border-white/10 rounded-2xl space-y-4 relative overflow-hidden flex flex-col h-full">
      {/* Top red speedline */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600]/60 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className="telemetry-chip-red">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E10600] animate-pulse" />
            INCIDENT GEOLOCATION
          </span>
        </div>
        {hasValidCoords && (
          <span className="text-[11px] font-mono text-white/40">
            {lat!.toFixed(4)}°N, {lng!.toFixed(4)}°E
          </span>
        )}
      </div>

      {/* Map or Fallback */}
      {hasValidCoords ? (
        <div className="relative rounded-xl overflow-hidden border border-white/10 flex-1 min-h-[360px] sm:min-h-[420px]">
          <div ref={containerRef} className="w-full h-full" style={{ minHeight: 360 }} />

          {/* Map Controls Overlay */}
          <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 bg-[#111]/80 backdrop-blur-md border border-white/12 rounded-xl p-1 shadow-lg">
            {(Object.keys(TILE_LAYERS) as TileKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTileKey(key)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                  tileKey === key
                    ? 'bg-[#E10600] text-white shadow-sm'
                    : 'text-white/50 hover:text-white hover:bg-white/8'
                }`}
              >
                {TILE_LAYERS[key].label}
              </button>
            ))}
          </div>

          {/* Recenter Button */}
          <button
            type="button"
            onClick={handleRecenter}
            className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5 bg-[#111]/90 hover:bg-[#181818] text-white text-xs font-semibold px-3 py-1.5 rounded-xl border border-white/15 backdrop-blur-md shadow-lg transition-all"
            title="Recenter Map on Complaint"
          >
            <Compass className="w-3.5 h-3.5 text-[#E10600]" />
            Recenter
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 flex flex-col items-center justify-center text-center space-y-3 flex-1 min-h-[300px]">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#FFC400]">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">GPS Coordinates Unavailable</p>
            <p className="text-xs text-white/40 mt-1 max-w-xs">
              This complaint was submitted without map coordinates. The recorded textual address is displayed below.
            </p>
          </div>
        </div>
      )}

      {/* Location Details Strip */}
      <div className="bg-[#141414] border border-white/8 rounded-xl p-3.5 space-y-2">
        <div className="flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-[#E10600] flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-mono uppercase text-white/40 block">Recorded Location</span>
            <p className="text-xs font-semibold text-white leading-snug break-words">
              {complaint.location || 'Location not specified'}
            </p>
          </div>
        </div>

        {complaint.landmark && (
          <div className="flex items-start gap-2.5 pt-2 border-t border-white/5">
            <Navigation className="w-3.5 h-3.5 text-[#FFC400] flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-mono uppercase text-white/40 block">Landmark Reference</span>
              <p className="text-xs text-[#FFC400] font-medium leading-snug">
                {complaint.landmark}
              </p>
            </div>
          </div>
        )}

        {hasValidCoords && (
          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <span className="text-[10px] font-mono text-white/40">
              COORDS: {lat!.toFixed(6)}, {lng!.toFixed(6)}
            </span>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#E10600] hover:text-[#FF1A14] transition-colors"
            >
              Google Maps <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      <style>{`
        .leaflet-popup-content-wrapper {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .leaflet-popup-tip {
          background: #111 !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
        }
      `}</style>
    </div>
  );
};

export default ComplaintLocationMap;
