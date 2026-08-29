import React, { useRef, useEffect, useState } from 'react';
import { getPublicMapIncidents } from '../services/complaintService';
import { getCategoryEmoji } from '../utils/helpers';
import { createTileLayerGroup, validateCoordinates } from '../utils/mapConfig';

interface MapIncident {
  id: string;
  complaint_number: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  latitude: number;
  longitude: number;
  location?: string;
  department?: string;
  created_at: string;
}

const HeroMap: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerGroupRef = useRef<import('leaflet').LayerGroup | null>(null);
  const leafletLibRef = useRef<typeof import('leaflet') | null>(null);
  const [ready, setReady] = useState(false);
  const [incidents, setIncidents] = useState<MapIncident[]>([]);

  // Fetch incidents in parallel with map initialization
  useEffect(() => {
    let isMounted = true;
    getPublicMapIncidents()
      .then((data) => {
        if (isMounted) {
          setIncidents(data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Initialize Leaflet map and STREET tile layer immediately on mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;
      leafletLibRef.current = L;

      // Reset default icons
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;

      const domNode = containerRef.current;
      if ((domNode as unknown as { _leaflet_id?: unknown })._leaflet_id) {
        delete (domNode as unknown as { _leaflet_id?: unknown })._leaflet_id;
      }

      const map = L.map(domNode, {
        center: [17.385, 78.4867],
        zoom: 11,
        zoomControl: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        dragging: true,
        attributionControl: false,
      });

      // Default STREET mode composite layer
      const tileGroup = createTileLayerGroup(L, 'street');
      tileGroup.addTo(map);

      const markerGroup = L.layerGroup().addTo(map);
      markerGroupRef.current = markerGroup;

      mapRef.current = map;
      setReady(true);

      map.invalidateSize();
      setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 100);
    });

    return () => {
      isMounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
      markerGroupRef.current = null;
    };
  }, []);

  // Plot/update incident markers reactively when incidents data arrives
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletLibRef.current;
    const markerGroup = markerGroupRef.current;
    if (!map || !L || !markerGroup) return;

    markerGroup.clearLayers();

    const validList = incidents.filter((p) => validateCoordinates(p.latitude, p.longitude).valid);
    if (validList.length === 0) return;

    validList.forEach((pin, i) => {
      const priorityColor =
        pin.priority === 'CRITICAL' || pin.priority === 'HIGH'
          ? '#E10600'
          : pin.priority === 'MEDIUM'
          ? '#FFC400'
          : '#22C55E';

      const isPulse = pin.priority === 'HIGH' || pin.priority === 'CRITICAL';
      const html = `
        <div style="position:relative;width:32px;height:32px;animation:heroMarkerIn 0.5s ease-out ${i * 0.08}s both">
          ${
            isPulse
              ? `<div style="position:absolute;inset:0;border-radius:50%;background:${priorityColor};opacity:0.25;animation:heroBeacon 2s ease-out ${i * 0.2}s infinite"></div>`
              : ''
          }
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:${priorityColor};border:2px solid #0A0A0A;box-shadow:0 0 8px ${priorityColor}70;"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:5px;height:5px;border-radius:50%;background:white;opacity:0.95;"></div>
        </div>`;

      const icon = L.divIcon({
        html,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([pin.latitude, pin.longitude], { icon });
      marker.bindTooltip(
        `<div style="background:#0D0D0D;border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:8px 12px;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 10px 25px rgba(0,0,0,0.7);">
          ${getCategoryEmoji(pin.category)} ${pin.title || pin.category} — ${pin.location || pin.complaint_number}
        </div>`,
        { permanent: false, direction: 'top', offset: [0, -10], opacity: 1 }
      );
      markerGroup.addLayer(marker);
    });

    if (validList.length > 1) {
      const bounds = validList.map((p) => [p.latitude, p.longitude] as [number, number]);
      try {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      } catch {
        // ignore
      }
    } else if (validList.length === 1) {
      map.setView([validList[0].latitude, validList[0].longitude], 13);
    }
  }, [incidents, ready]);

  return (
    <div
      data-lenis-prevent="true"
      onWheel={(e) => e.stopPropagation()}
      className="relative w-full h-full min-h-[340px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#0A0A0A] select-none"
    >
      {/* Leaflet container */}
      <div ref={containerRef} data-lenis-prevent="true" className="w-full h-full" />

      {/* Loading state */}
      {!ready && (
        <div className="absolute inset-0 bg-[#0A0A0A] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#E10600]/20 border-t-[#E10600] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-white/30 text-xs font-mono">Initializing Municipal Telemetry Radar…</p>
          </div>
        </div>
      )}

      {/* Live radar badge */}
      {ready && (
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 bg-black/80 backdrop-blur-md border border-white/10 rounded-full px-3.5 py-1.5 shadow-lg">
          <div className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
          <span className="text-[10px] text-white/70 font-mono font-bold tracking-wider">LIVE MUNICIPAL RADAR</span>
        </div>
      )}

      {/* Incident count */}
      {ready && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-black/80 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5 shadow-lg">
          <span className="text-[10px] text-white/60 font-semibold font-mono">
            {incidents.length > 0
              ? `${incidents.length} active mapped incident${incidents.length > 1 ? 's' : ''}`
              : '0 active incidents mapped'}
          </span>
        </div>
      )}

      <style>{`
        @keyframes heroMarkerIn {
          from { opacity: 0; transform: scale(0.3); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes heroBeacon {
          0%   { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(3); opacity: 0; }
        }
        .leaflet-control-attribution { display: none !important; }
        .leaflet-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
      `}</style>
    </div>
  );
};

export default HeroMap;
