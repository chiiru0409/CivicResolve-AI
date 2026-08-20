/**
 * LocationPicker.tsx
 *
 * Zomato/Swiggy-style location selection for complaint reporting.
 *
 * Features:
 * - Use Current Location (GPS) → map centres on device position
 * - Address search using Nominatim (OpenStreetMap, free, no API key)
 * - Interactive Leaflet map with draggable pin
 * - Reverse geocoding when pin is dragged (Nominatim)
 * - Displays human-readable address, NEVER raw lat/lng to the citizen
 * - Stores lat/lng internally and passes to parent via onConfirm
 * - Confirm Location button
 *
 * Parent receives: { address, latitude, longitude, accuracy? }
 * Parent does NOT receive a form with lat/lng fields.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Navigation, Search, MapPin, CheckCircle, Loader2, X, AlertCircle } from 'lucide-react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface PickedLocation {
  address:   string;
  latitude:  number;
  longitude: number;
  accuracy?: number;
}

interface LocationPickerProps {
  onConfirm:     (location: PickedLocation) => void;
  onCancel?:     () => void;
  initialLocation?: PickedLocation;
}

// ── Nominatim helpers (OpenStreetMap geocoding — free, no API key) ─────────────
const NOM_BASE = 'https://nominatim.openstreetmap.org';

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `${NOM_BASE}/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const data = await res.json();
    // Build a clean readable address
    const d = data.address ?? {};
    const parts = [
      d.road || d.pedestrian || d.footway,
      d.neighbourhood || d.suburb || d.village,
      d.city || d.town || d.county,
      d.state,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

async function searchAddress(query: string): Promise<Array<{ display_name: string; lat: string; lon: string }>> {
  try {
    const res = await fetch(
      `${NOM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in&accept-language=en`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
const LocationPicker: React.FC<LocationPickerProps> = ({
  onConfirm,
  onCancel,
  initialLocation,
}) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<LeafletMap | null>(null);
  const markerRef     = useRef<LeafletMarker | null>(null);
  const leafletRef    = useRef<typeof import('leaflet') | null>(null);

  // Default centre: India / Hyderabad
  const DEFAULT_LAT = initialLocation?.latitude  ?? 17.3850;
  const DEFAULT_LNG = initialLocation?.longitude ?? 78.4867;
  const DEFAULT_ZOOM = initialLocation ? 15 : 12;

  const [mapReady,    setMapReady]    = useState(false);
  const [address,     setAddress]     = useState(initialLocation?.address ?? '');
  const [latitude,    setLatitude]    = useState(initialLocation?.latitude  ?? DEFAULT_LAT);
  const [longitude,   setLongitude]   = useState(initialLocation?.longitude ?? DEFAULT_LNG);
  const [accuracy,    setAccuracy]    = useState<number | undefined>(initialLocation?.accuracy);
  const [confirmed,   setConfirmed]   = useState(false);

  const [gpsLoading,  setGpsLoading]  = useState(false);
  const [gpsError,    setGpsError]    = useState('');
  const [revLoading,  setRevLoading]  = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults,   setShowResults]   = useState(false);

  // ── Move marker + reverse geocode ────────────────────────────────────────────
  const moveMarkerTo = useCallback(async (lat: number, lng: number, skipRev = false) => {
    setLatitude(lat);
    setLongitude(lng);
    setConfirmed(false);

    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.panTo([lat, lng]);
    }

    if (!skipRev) {
      setRevLoading(true);
      const addr = await reverseGeocode(lat, lng);
      setAddress(addr);
      setRevLoading(false);
    }
  }, []);

  // ── Initialise Leaflet map ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;

      const map = L.map(containerRef.current!, {
        center: [DEFAULT_LAT, DEFAULT_LNG],
        zoom:   DEFAULT_ZOOM,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      // CartoDB Dark Matter tile
      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { subdomains: 'abcd', maxZoom: 19 }
      ).addTo(map);

      // Custom draggable pin
      const pinHtml = `
        <div style="position:relative;width:36px;height:36px;cursor:grab">
          <div style="position:absolute;inset:0;border-radius:50%;background:#E10600;opacity:0.2;animation:pinPulse 2s ease-out infinite"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
            width:18px;height:18px;border-radius:50%;background:#E10600;
            border:3px solid white;box-shadow:0 2px 8px rgba(225,6,0,0.5)"></div>
        </div>`;
      const pinIcon = L.divIcon({ html: pinHtml, className: '', iconSize: [36, 36], iconAnchor: [18, 18] });

      const marker = L.marker([DEFAULT_LAT, DEFAULT_LNG], {
        icon:      pinIcon,
        draggable: true,
      }).addTo(map);

      // On drag end → reverse geocode the new position
      marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        await moveMarkerTo(pos.lat, pos.lng);
      });

      // Click on map → move pin
      map.on('click', async (e) => {
        await moveMarkerTo(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current    = map;
      markerRef.current = marker;
      leafletRef.current = L;
      setMapReady(true);

      // Reverse geocode initial position
      reverseGeocode(DEFAULT_LAT, DEFAULT_LNG).then(setAddress);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── GPS ───────────────────────────────────────────────────────────────────────
  const handleGps = () => {
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
        setAccuracy(acc);
        setGpsLoading(false);
        if (mapRef.current) mapRef.current.setView([lat, lng], 17);
        await moveMarkerTo(lat, lng);
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(
          err.code === 1 ? 'Location permission denied. Allow location access in your browser settings.' :
          err.code === 2 ? 'Location unavailable. Try searching for your area.' :
          'Location request timed out. Try again.'
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // ── Address search ────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setShowResults(true);
    const results = await searchAddress(searchQuery);
    setSearchResults(results);
    setSearchLoading(false);
  };

  const handleSelectResult = async (result: { display_name: string; lat: string; lon: string }) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setShowResults(false);
    setSearchQuery('');
    if (mapRef.current) mapRef.current.setView([lat, lng], 16);
    await moveMarkerTo(lat, lng);
  };

  // ── Confirm ───────────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm({ address, latitude, longitude, accuracy });
  };

  const accuracyOk = !accuracy || accuracy <= 100;

  return (
    <div className="flex flex-col gap-3">

      {/* ── GPS button ──────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleGps}
        disabled={gpsLoading}
        className={`w-full flex items-center justify-center gap-2 font-semibold py-3 rounded-xl border transition-all ${
          gpsLoading
            ? 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed'
            : 'bg-[#E10600]/10 hover:bg-[#E10600]/20 border-[#E10600]/30 text-[#E10600]'
        }`}
      >
        {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
        {gpsLoading ? 'Detecting your location…' : 'Use Current Location (GPS)'}
      </button>

      {/* GPS error */}
      {gpsError && (
        <div className="flex items-start gap-2 bg-[#E10600]/10 border border-[#E10600]/25 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-[#E10600] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#E10600]">{gpsError}</p>
        </div>
      )}

      {/* ── Address search ───────────────────────────────────────────────── */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSearch(); }}}
              placeholder="Search area, landmark, street…"
              className="input-field pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={searchLoading || !searchQuery.trim()}
            className="px-4 py-3 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 text-white/60 hover:text-white transition-all disabled:opacity-40 text-sm font-semibold flex-shrink-0"
          >
            {searchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </button>
        </div>

        {/* Search results dropdown */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-[2000] bg-[#1a1a1a] border border-white/12 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.6)] overflow-hidden">
            {searchResults.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => void handleSelectResult(r)}
                className="w-full flex items-start gap-2.5 px-4 py-3 hover:bg-white/6 transition-colors border-b border-white/8 last:border-0 text-left"
              >
                <MapPin className="w-3.5 h-3.5 text-[#E10600] flex-shrink-0 mt-0.5" />
                <span className="text-sm text-white/70 line-clamp-2">{r.display_name}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowResults(false)}
              className="w-full px-4 py-2 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {showResults && !searchLoading && searchResults.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-[2000] bg-[#1a1a1a] border border-white/12 rounded-xl px-4 py-3">
            <p className="text-sm text-white/40">No results found. Try a different search term.</p>
          </div>
        )}
      </div>

      {/* ── Leaflet map ──────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden border border-white/10" style={{ height: 280 }}>
        <div ref={containerRef} className="w-full h-full" />

        {/* Loading overlay */}
        {!mapReady && (
          <div className="absolute inset-0 bg-[#111] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[#E10600]/20 border-t-[#E10600] rounded-full animate-spin" />
          </div>
        )}

        {/* Hint overlay */}
        {mapReady && !confirmed && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-black/70 backdrop-blur-sm border border-white/12 rounded-full px-4 py-2">
            <p className="text-[11px] text-white/60 font-medium whitespace-nowrap">
              Drag the pin or click on the map to adjust
            </p>
          </div>
        )}
      </div>

      {/* ── Selected address display ────────────────────────────────────── */}
      <div className={`rounded-xl border px-4 py-3.5 transition-all ${
        confirmed
          ? 'bg-[#22C55E]/8 border-[#22C55E]/25'
          : 'bg-white/4 border-white/10'
      }`}>
        <div className="flex items-start gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
            confirmed ? 'bg-[#22C55E]/15' : 'bg-[#E10600]/10'
          }`}>
            {confirmed
              ? <CheckCircle className="w-4 h-4 text-[#22C55E]" />
              : <MapPin className="w-4 h-4 text-[#E10600]" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-wider mb-1 ${
              confirmed ? 'text-[#22C55E]' : 'text-[#E10600]'
            }`}>
              {confirmed ? '✓ Location Confirmed' : '📍 Selected Location'}
            </p>
            {revLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin text-white/40" />
                <span className="text-xs text-white/40">Getting address…</span>
              </div>
            ) : (
              <p className="text-sm font-semibold text-white leading-snug">{address || 'Locating…'}</p>
            )}
            {accuracy && (
              <p className={`text-[10px] mt-1 ${accuracyOk ? 'text-[#22C55E]' : 'text-[#FFC400]'}`}>
                {accuracyOk
                  ? `GPS accuracy ±${Math.round(accuracy)}m`
                  : `⚠ Low GPS accuracy ±${Math.round(accuracy)}m — consider adjusting the pin`
                }
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center justify-center gap-2 flex-1 py-3 rounded-xl border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-all font-semibold text-sm"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!address || revLoading}
          className="btn-primary flex-1 justify-center py-3 text-sm font-bold disabled:bg-white/8 disabled:text-white/30 disabled:pointer-events-none shadow-sm hover:shadow active:scale-[0.98] transition-all duration-150"
        >
          <CheckCircle className="w-4 h-4" />
          Confirm Location
        </button>
      </div>

      <style>{`
        @keyframes pinPulse {
          0%   { transform: scale(1); opacity: 0.4; }
          100% { transform: scale(3); opacity: 0; }
        }
        .leaflet-control-attribution { display: none !important; }
      `}</style>
    </div>
  );
};

export default LocationPicker;
