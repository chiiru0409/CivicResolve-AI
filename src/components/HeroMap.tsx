import React, { useRef, useEffect, useState } from 'react';

interface Pin {
  lat: number;
  lng: number;
  city: string;
  category: string;
  label: string;
  priority: string;
}

const DEMO_PINS: Pin[] = [
  { lat: 28.6139, lng: 77.2090, city: 'Delhi',     category: '🛣️', label: 'Road Damage',    priority: '#E10600' },
  { lat: 19.0760, lng: 72.8777, city: 'Mumbai',    category: '🗑️', label: 'Garbage',        priority: '#FFC400' },
  { lat: 13.0827, lng: 80.2707, city: 'Chennai',   category: '🌊', label: 'Drainage',       priority: '#E10600' },
  { lat: 22.5726, lng: 88.3639, city: 'Kolkata',   category: '💡', label: 'Streetlight',    priority: '#FFC400' },
  { lat: 17.3850, lng: 78.4867, city: 'Hyderabad', category: '💧', label: 'Water Leak',     priority: '#E10600' },
  { lat: 12.9716, lng: 77.5946, city: 'Bengaluru', category: '🏗️', label: 'Infrastructure', priority: '#22C55E' },
  { lat: 23.0225, lng: 72.5714, city: 'Ahmedabad', category: '🛣️', label: 'Pothole',        priority: '#FFC400' },
  { lat: 26.9124, lng: 75.7873, city: 'Jaipur',    category: '🗑️', label: 'Waste',          priority: '#22C55E' },
];

const HeroMap: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return;

      // Fix default icons
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;

      const map = L.map(containerRef.current, {
        center:             [22.5, 82.0],
        zoom:               5,
        zoomControl:        false,
        scrollWheelZoom:    false,
        doubleClickZoom:    false,
        touchZoom:          false,
        dragging:           true,
        attributionControl: false,
      });

      // CartoDB Dark Matter — free, no API key
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { subdomains: 'abcd', maxZoom: 19 }
      ).addTo(map);

      // Plot complaint pins
      DEMO_PINS.forEach((pin, i) => {
        const isPulse = pin.priority === '#E10600';
        const html = `
          <div style="position:relative;width:32px;height:32px;animation:heroMarkerIn 0.5s ease-out ${i * 0.15}s both">
            ${isPulse
              ? `<div style="position:absolute;inset:0;border-radius:50%;background:${pin.priority};opacity:0.25;animation:heroBeacon 2s ease-out ${i * 0.3}s infinite"></div>`
              : ''
            }
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:${pin.priority};border:2px solid #111;box-shadow:0 0 8px ${pin.priority}60;"></div>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:5px;height:5px;border-radius:50%;background:white;opacity:0.9;"></div>
          </div>`;

        const icon = L.divIcon({
          html,
          className: '',
          iconSize:  [32, 32],
          iconAnchor:[16, 16],
        });

        L.marker([pin.lat, pin.lng], { icon })
          .addTo(map)
          .bindTooltip(
            `<div style="background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:6px 10px;color:#fff;font-size:11px;font-weight:600;white-space:nowrap">
              ${pin.category} ${pin.label} — ${pin.city}
            </div>`,
            { permanent: false, direction: 'top', offset: [0, -10], opacity: 1 }
          );
      });

      mapRef.current = map;
      setReady(true);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full min-h-[340px] rounded-2xl overflow-hidden border border-white/10">

      {/* Leaflet container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading state */}
      {!ready && (
        <div className="absolute inset-0 bg-[#0D0D0D] flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-2 border-[#E10600]/20 border-t-[#E10600] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-white/30 text-xs">Loading India map…</p>
          </div>
        </div>
      )}

      {/* Live badge */}
      {ready && (
        <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 bg-black/70 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
          <span className="text-[10px] text-white/60 font-bold tracking-wider">LIVE MAP · INDIA</span>
        </div>
      )}

      {/* Complaint count */}
      {ready && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-black/70 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
          <span className="text-[10px] text-white/50 font-semibold">{DEMO_PINS.length} active complaints</span>
        </div>
      )}

      {/* Attribution */}
      {ready && (
        <div className="absolute bottom-3 right-3 z-[1000]">
          <span className="text-[9px] text-white/20">© OSM · CARTO</span>
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
