import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  MapPin,
  Navigation,
  ExternalLink,
  AlertTriangle,
  Compass,
  Layers,
  Copy,
  Check,
  RotateCw,
  Maximize2,
} from 'lucide-react';
import type { Complaint } from '../types';
import type { Map as LeafletMap, Marker as LeafletMarker, LayerGroup } from 'leaflet';
import {
  validateCoordinates,
  formatCoordinatesDMS,
  getGoogleMapsUrl,
  getOpenStreetMapUrl,
  createTileLayerGroup,
  type MapTileMode,
} from '../utils/mapConfig';

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
  const tileGroupRef = useRef<LayerGroup | null>(null);
  const leafletLibRef = useRef<typeof import('leaflet') | null>(null);

  const [tileKey, setTileKey] = useState<MapTileMode>('dark');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Validate coordinates strictly
  const coordCheck = validateCoordinates(complaint.latitude, complaint.longitude);
  const { valid: hasValidCoords, latitude: lat, longitude: lng } = coordCheck;

  // Build custom pulsating SVG incident marker
  const buildIncidentMarker = useCallback(
    (L: typeof import('leaflet'), latitude: number, longitude: number) => {
      if (!mapRef.current) return;

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }

      const color = getMarkerColor(complaint.priority, complaint.status);
      const isActive = !['Resolved', 'Closed'].includes(complaint.status);
      const isCritical = complaint.priority === 'HIGH' || complaint.priority === 'CRITICAL';

      const size = isCritical ? 22 : 18;
      const svg = `
        <svg width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}" xmlns="http://www.w3.org/2000/svg">
          ${
            isActive
              ? `<circle cx="${size}" cy="${size}" r="${size - 2}" fill="${color}" opacity="0.3">
                  <animate attributeName="r" values="${size - 6};${size}" dur="1.8s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.6;0" dur="1.8s" repeatCount="indefinite"/>
                </circle>`
              : ''
          }
          <circle cx="${size}" cy="${size}" r="7.5" fill="${color}" stroke="#070707" stroke-width="2.5" filter="drop-shadow(0 0 6px ${color}80)"/>
          <circle cx="${size}" cy="${size}" r="3" fill="#FFFFFF" opacity="0.95"/>
        </svg>`;

      const customIcon = L.divIcon({
        html: svg,
        className: 'civic-incident-marker',
        iconSize: [size * 2, size * 2],
        iconAnchor: [size, size],
      });

      const marker = L.marker([latitude, longitude], { icon: customIcon }).addTo(mapRef.current);

      const dms = formatCoordinatesDMS(latitude, longitude, 5);
      const popupHtml = `
        <div style="background:#0D0D0D;color:#fff;border-radius:14px;padding:14px;font-family:Inter,-apple-system,sans-serif;min-width:240px;border:1px solid rgba(255,255,255,0.15);box-shadow:0 15px 40px rgba(0,0,0,0.8);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:6px;">
            <span style="font-family:monospace;font-size:11px;font-weight:800;color:#E10600;letter-spacing:0.5px;">${complaint.id}</span>
            <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:${color}20;color:${color};border:1px solid ${color}40;text-transform:uppercase;">
              ${complaint.priority}
            </span>
          </div>
          <p style="font-size:13px;font-weight:700;color:#ffffff;margin:0 0 6px 0;line-height:1.35;">${complaint.title || complaint.category}</p>
          <div style="font-size:11px;color:#d1d5db;margin:0 0 4px 0;display:flex;align-items:flex-start;gap:4px;">
            <span>📍</span>
            <span style="flex:1;">${complaint.location || 'Reported Location'}</span>
          </div>
          ${
            complaint.landmark
              ? `<div style="font-size:10px;color:#FFC400;margin:0 0 6px 0;display:flex;align-items:center;gap:4px;">
                  <span>🏛️</span>
                  <span><strong>Landmark:</strong> ${complaint.landmark}</span>
                </div>`
              : ''
          }
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);font-family:monospace;font-size:9.5px;color:#888;">
            <span>${dms}</span>
            <span style="color:#22C55E;font-weight:700;">${complaint.status}</span>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { closeButton: false, offset: [0, -10] });
      markerRef.current = marker;
    },
    [complaint],
  );

  // Initialize Leaflet Map
  useEffect(() => {
    if (!containerRef.current || !hasValidCoords || lat === null || lng === null) {
      setMapReady(false);
      return;
    }

    let isMounted = true;

    import('leaflet')
      .then((L) => {
        if (!isMounted || !containerRef.current) return;
        leafletLibRef.current = L;

        // Reset default leaflet icons
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (L.Icon.Default.prototype as any)._getIconUrl;

        // If map already exists, update view & marker
        if (mapRef.current) {
          mapRef.current.setView([lat, lng], 16);
          buildIncidentMarker(L, lat, lng);
          return;
        }

        const domNode = containerRef.current;
        if ((domNode as unknown as { _leaflet_id?: unknown })._leaflet_id) {
          delete (domNode as unknown as { _leaflet_id?: unknown })._leaflet_id;
        }

        const map = L.map(domNode, {
          center: [lat, lng],
          zoom: 16,
          zoomControl: false,
          attributionControl: false,
          fadeAnimation: true,
          zoomAnimation: true,
        });

        // Zoom control on top-right
        L.control.zoom({ position: 'topright' }).addTo(map);

        // Apply clean composite tile layer group (Base + Reference labels)
        const tileGroup = createTileLayerGroup(L, tileKey);
        tileGroup.addTo(map);
        tileGroupRef.current = tileGroup;

        mapRef.current = map;
        setMapReady(true);
        setMapError(null);

        buildIncidentMarker(L, lat, lng);

        // Re-invalidate size after layout computes
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize();
          }
        }, 150);
      })
      .catch((err) => {
        console.error('[ComplaintLocationMap] Error initializing Leaflet:', err);
        if (isMounted) {
          setMapError('Failed to initialize GIS engine. You can still navigate via external maps.');
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
        markerRef.current = null;
        tileGroupRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidCoords, lat, lng, complaint.id]);

  // Switch Tile Layer when tileKey changes
  useEffect(() => {
    if (!mapRef.current || !leafletLibRef.current) return;
    const L = leafletLibRef.current;

    if (tileGroupRef.current) {
      mapRef.current.removeLayer(tileGroupRef.current);
    }

    const newGroup = createTileLayerGroup(L, tileKey);
    newGroup.addTo(mapRef.current);
    tileGroupRef.current = newGroup;
  }, [tileKey]);

  // Recenter handler
  const handleRecenter = () => {
    if (mapRef.current && hasValidCoords && lat !== null && lng !== null) {
      mapRef.current.flyTo([lat, lng], 16, {
        duration: 1.0,
        easeLinearity: 0.25,
      });
      if (markerRef.current) {
        markerRef.current.openPopup();
      }
    }
  };

  const handleCopyCoords = () => {
    if (!hasValidCoords || lat === null || lng === null) return;
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card p-5 bg-[#0D0D0D] border-white/10 rounded-2xl space-y-4 relative overflow-hidden flex flex-col h-full shadow-2xl">
      {/* Top red telemetry speedline */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#E10600]/70 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/8">
        <div className="flex items-center gap-2">
          <span className="telemetry-chip-red flex items-center gap-1.5 font-mono text-[11px] font-bold">
            <span className="w-2 h-2 rounded-full bg-[#E10600] animate-pulse" />
            INCIDENT GEOLOCATION
          </span>
        </div>
        {hasValidCoords && lat !== null && lng !== null && (
          <span className="text-[11px] font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded-md border border-white/8">
            {formatCoordinatesDMS(lat, lng, 4)}
          </span>
        )}
      </div>

      {/* Map or Fallback Display */}
      {hasValidCoords && lat !== null && lng !== null ? (
        <div className="relative rounded-xl overflow-hidden border border-white/12 flex-1 min-h-[360px] sm:min-h-[420px] bg-[#070707]">
          {/* Map DOM Container */}
          <div ref={containerRef} className="w-full h-full" style={{ minHeight: 360 }} />

          {/* Map Controls: Tile Switcher */}
          <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1 bg-[#0F0F0F]/90 backdrop-blur-md border border-white/15 rounded-xl p-1 shadow-2xl">
            {(['dark', 'satellite', 'street'] as MapTileMode[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTileKey(key)}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all duration-150 ${
                  tileKey === key
                    ? 'bg-[#E10600] text-white shadow-md'
                    : 'text-white/50 hover:text-white hover:bg-white/8'
                }`}
              >
                {key === 'dark' ? 'Dark' : key === 'satellite' ? 'Satellite' : 'Street'}
              </button>
            ))}
          </div>

          {/* Recenter & External Tools Bar */}
          <div className="absolute bottom-3 right-3 z-[1000] flex items-center gap-2">
            <button
              type="button"
              onClick={handleRecenter}
              className="flex items-center gap-1.5 bg-[#0F0F0F]/95 hover:bg-[#1A1A1A] text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-white/15 backdrop-blur-md shadow-xl transition-all active:scale-95"
              title="Recenter Map on Incident Coordinates"
            >
              <Compass className="w-3.5 h-3.5 text-[#E10600]" />
              Recenter
            </button>
          </div>

          {/* Error Banner inside Map if any */}
          {mapError && (
            <div className="absolute inset-0 bg-[#070707]/90 backdrop-blur-sm z-[1001] flex flex-col items-center justify-center p-6 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-[#FFC400]" />
              <p className="text-xs text-white/80 font-mono max-w-xs">{mapError}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="btn-primary py-1 px-3 text-xs"
                >
                  <RotateCw className="w-3 h-3 mr-1" /> Retry
                </button>
                <a
                  href={getGoogleMapsUrl(lat, lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white/10 hover:bg-white/15 text-white text-xs px-3 py-1.5 rounded-xl border border-white/15 inline-flex items-center gap-1 font-bold"
                >
                  Open in Google Maps <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No Valid Coordinates Fallback */
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 flex flex-col items-center justify-center text-center space-y-3 flex-1 min-h-[320px]">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#FFC400]">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">GPS Coordinates Unavailable</p>
            <p className="text-xs text-white/40 mt-1 max-w-xs leading-relaxed">
              This report was submitted with textual location evidence only. The recorded municipal address is displayed below.
            </p>
          </div>
        </div>
      )}

      {/* Recorded Location Details Strip */}
      <div className="bg-[#121212] border border-white/8 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <MapPin className="w-4 h-4 text-[#E10600] flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-white/40 block">Recorded Location</span>
              <span className="text-[9px] font-mono text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 px-1.5 py-0.5 rounded">
                {hasValidCoords ? 'GPS VERIFIED' : 'TEXTUAL ADDRESS'}
              </span>
            </div>
            <p className="text-xs font-semibold text-white leading-snug break-words mt-0.5">
              {complaint.location || 'Location not specified in record'}
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

        {hasValidCoords && lat !== null && lng !== null && (
          <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-white/50">
                COORDS: {lat.toFixed(6)}, {lng.toFixed(6)}
              </span>
              <button
                type="button"
                onClick={handleCopyCoords}
                className="text-white/40 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
                title="Copy Coordinates"
              >
                {copied ? <Check className="w-3 h-3 text-[#22C55E]" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <a
                href={getOpenStreetMapUrl(lat, lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/60 hover:text-white transition-colors"
                title="Open in OpenStreetMap"
              >
                OSM <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href={getGoogleMapsUrl(lat, lng)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#E10600] hover:text-[#FF1A14] transition-colors"
                title="Open in Google Maps"
              >
                Google Maps <ExternalLink className="w-3 h-3" />
              </a>
            </div>
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
          background: #0D0D0D !important;
          border: 1px solid rgba(255,255,255,0.15) !important;
        }
        .civic-incident-marker {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
};

export default ComplaintLocationMap;
