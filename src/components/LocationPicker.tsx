/**
 * LocationPicker.tsx
 *
 * Citizen location selection for complaint reporting with Google-Maps-grade interactivity.
 *
 * Features:
 * - Use Current Location (GPS) → map centres on device position with precision beacon
 * - Interactive Leaflet map with smooth wheel zoom, touch pinch, and draggable precision pin
 * - Zero watermark, zero-API-key tile layers (Dark Tactical, Satellite, Street)
 * - Real-time Reverse geocoding (Nominatim OpenStreetMap)
 * - Address search with live suggestions and instant flyTo animation
 * - Wheel event isolation (data-lenis-prevent) to prevent page scrolling while zooming
 * - Live ResizeObserver to ensure map container never renders partial tiles
 * - Clear GPS accuracy status indicator
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Navigation,
  Search,
  MapPin,
  CheckCircle,
  Loader2,
  X,
  AlertCircle,
  Plus,
  Minus,
} from 'lucide-react';
import type { Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import {
  validateCoordinates,
  createTileLayerGroup,
  GOOGLE_MAP_INTERACTION_OPTIONS,
  reverseGeocodeAddress,
} from '../utils/mapConfig';

export interface PickedLocation {
  address: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}

interface LocationPickerProps {
  onConfirm: (location: PickedLocation) => void;
  onCancel?: () => void;
  initialLocation?: PickedLocation;
}

const NOM_BASE = 'https://nominatim.openstreetmap.org';

async function searchAddress(query: string): Promise<Array<{ display_name: string; lat: string; lon: string }>> {
  try {
    const res = await fetch(
      `${NOM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in&accept-language=en`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'CivicResolveAI/1.0' } }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

const LocationPicker: React.FC<LocationPickerProps> = ({
  onConfirm,
  onCancel,
  initialLocation,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);

  const DEFAULT_LAT = initialLocation?.latitude ?? 17.385;
  const DEFAULT_LNG = initialLocation?.longitude ?? 78.4867;
  const DEFAULT_ZOOM = initialLocation ? 16 : 12;

  const [mapReady, setMapReady] = useState(false);
  const [address, setAddress] = useState(initialLocation?.address ?? '');
  const [latitude, setLatitude] = useState(initialLocation?.latitude ?? DEFAULT_LAT);
  const [longitude, setLongitude] = useState(initialLocation?.longitude ?? DEFAULT_LNG);
  const [accuracy, setAccuracy] = useState<number | undefined>(initialLocation?.accuracy);
  const [confirmed, setConfirmed] = useState(false);

  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [revLoading, setRevLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Move marker + reverse geocode
  const moveMarkerTo = useCallback(async (lat: number, lng: number, skipRev = false) => {
    const coordCheck = validateCoordinates(lat, lng);
    if (!coordCheck.valid || coordCheck.latitude === null || coordCheck.longitude === null) {
      return;
    }

    const cleanLat = coordCheck.latitude;
    const cleanLng = coordCheck.longitude;

    setLatitude(cleanLat);
    setLongitude(cleanLng);
    setConfirmed(false);

    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([cleanLat, cleanLng]);
      mapRef.current.panTo([cleanLat, cleanLng]);
    }

    if (!skipRev) {
      setRevLoading(true);
      const addr = await reverseGeocodeAddress(cleanLat, cleanLng);
      setAddress(addr);
      setRevLoading(false);
    }
  }, []);

  // Initialise Leaflet map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;

      const domNode = containerRef.current;
      if ((domNode as unknown as { _leaflet_id?: unknown })._leaflet_id) {
        delete (domNode as unknown as { _leaflet_id?: unknown })._leaflet_id;
      }

      const map = L.map(domNode, {
        ...GOOGLE_MAP_INTERACTION_OPTIONS,
        center: [DEFAULT_LAT, DEFAULT_LNG],
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
      });

      // Add zero-watermark dark tactical composite layer
      const tileGroup = createTileLayerGroup(L, 'dark');
      tileGroup.addTo(map);

      // Custom draggable glowing pin
      const pinHtml = `
        <div style="position:relative;width:38px;height:38px;cursor:grab">
          <div style="position:absolute;inset:0;border-radius:50%;background:#E10600;opacity:0.25;animation:pinPulse 2s ease-out infinite"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
            width:18px;height:18px;border-radius:50%;background:#E10600;
            border:3px solid white;box-shadow:0 3px 12px rgba(225,6,0,0.6)"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
            width:4px;height:4px;border-radius:50%;background:white"></div>
        </div>`;
      const pinIcon = L.divIcon({ html: pinHtml, className: '', iconSize: [38, 38], iconAnchor: [19, 19] });

      const marker = L.marker([DEFAULT_LAT, DEFAULT_LNG], {
        icon: pinIcon,
        draggable: true,
      }).addTo(map);

      // On drag end → reverse geocode
      marker.on('dragend', async () => {
        const pos = marker.getLatLng();
        await moveMarkerTo(pos.lat, pos.lng);
      });

      // Click on map → move pin
      map.on('click', async (e) => {
        await moveMarkerTo(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      leafletRef.current = L;
      setMapReady(true);

      map.invalidateSize();
      setTimeout(() => {
        if (mapRef.current) mapRef.current.invalidateSize();
      }, 150);

      // Reverse geocode initial position if needed
      if (!initialLocation?.address) {
        reverseGeocodeAddress(DEFAULT_LAT, DEFAULT_LNG).then(setAddress);
      }
    });

    return () => {
      isMounted = false;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ResizeObserver for clean rendering
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

  // GPS handler
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
        if (mapRef.current) mapRef.current.flyTo([lat, lng], 17, { duration: 1.2 });
        await moveMarkerTo(lat, lng);
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(
          err.code === 1
            ? 'Location permission denied. Please allow location access in your browser settings.'
            : err.code === 2
            ? 'Location unavailable. Try searching for your area or landmark below.'
            : 'Location request timed out. Please try again.'
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Address search
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
    if (mapRef.current) mapRef.current.flyTo([lat, lng], 16, { duration: 1.2 });
    await moveMarkerTo(lat, lng);
  };

  // Zoom handlers
  const handleZoomIn = () => {
    if (mapRef.current) mapRef.current.zoomIn(1);
  };

  const handleZoomOut = () => {
    if (mapRef.current) mapRef.current.zoomOut(1);
  };

  // Confirm
  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm({ address, latitude, longitude, accuracy });
  };

  const accuracyOk = !accuracy || accuracy <= 100;

  return (
    <div className="flex flex-col gap-3 select-none">
      {/* GPS button */}
      <button
        type="button"
        onClick={handleGps}
        disabled={gpsLoading}
        className={`w-full flex items-center justify-center gap-2 font-bold py-3 rounded-xl border transition-all ${
          gpsLoading
            ? 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed'
            : 'bg-[#E10600]/10 hover:bg-[#E10600]/20 border-[#E10600]/30 text-[#E10600] active:scale-[0.99]'
        }`}
      >
        {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
        {gpsLoading ? 'Detecting high-precision GPS…' : 'Use Current Device Location (GPS)'}
      </button>

      {/* GPS error */}
      {gpsError && (
        <div className="flex items-start gap-2 bg-[#E10600]/10 border border-[#E10600]/25 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-[#E10600] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#E10600]">{gpsError}</p>
        </div>
      )}

      {/* Address search */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSearch();
                }
              }}
              placeholder="Search area, landmark, street, building…"
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
          <div className="absolute top-full left-0 right-0 mt-1 z-[2000] bg-[#1a1a1a] border border-white/12 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.7)] overflow-hidden">
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
              className="w-full px-4 py-2 text-xs text-white/30 hover:text-white/60 transition-colors text-center"
            >
              Close Results
            </button>
          </div>
        )}

        {showResults && !searchLoading && searchResults.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 z-[2000] bg-[#1a1a1a] border border-white/12 rounded-xl px-4 py-3 shadow-xl">
            <p className="text-sm text-white/40">No matching landmarks found. Try dragging the pin on the map.</p>
          </div>
        )}
      </div>

      {/* Leaflet map */}
      <div
        data-lenis-prevent="true"
        onWheel={(e) => e.stopPropagation()}
        className="relative rounded-2xl overflow-hidden border border-white/10 shadow-lg bg-[#0D0D0D]"
        style={{ height: 280 }}
      >
        <div
          ref={containerRef}
          data-lenis-prevent="true"
          className="w-full h-full"
        />

        {/* Floating Zoom Controls (Top Right) */}
        {mapReady && (
          <div className="absolute top-3 right-3 z-[1000] flex flex-col bg-black/85 backdrop-blur-md border border-white/15 rounded-xl overflow-hidden shadow-xl divide-y divide-white/10">
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center active:scale-95"
              title="Zoom In"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center active:scale-95"
              title="Zoom Out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Loading overlay */}
        {!mapReady && (
          <div className="absolute inset-0 bg-[#0D0D0D] flex items-center justify-center z-[1001]">
            <div className="w-8 h-8 border-2 border-[#E10600]/20 border-t-[#E10600] rounded-full animate-spin" />
          </div>
        )}

        {/* Pin adjust hint overlay */}
        {mapReady && !confirmed && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] bg-black/80 backdrop-blur-sm border border-white/15 rounded-full px-4 py-1.5 shadow-md pointer-events-none">
            <p className="text-[11px] text-white/70 font-medium whitespace-nowrap">
              Drag pin or tap map to fine-tune exact incident spot
            </p>
          </div>
        )}
      </div>

      {/* Selected address display */}
      <div
        className={`rounded-xl border px-4 py-3.5 transition-all ${
          confirmed
            ? 'bg-[#22C55E]/8 border-[#22C55E]/25'
            : 'bg-white/4 border-white/10'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
              confirmed ? 'bg-[#22C55E]/15' : 'bg-[#E10600]/10'
            }`}
          >
            {confirmed ? (
              <CheckCircle className="w-4 h-4 text-[#22C55E]" />
            ) : (
              <MapPin className="w-4 h-4 text-[#E10600]" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-[10px] font-black uppercase tracking-wider mb-1 ${
                confirmed ? 'text-[#22C55E]' : 'text-[#E10600]'
              }`}
            >
              {confirmed ? '✓ Geolocation Confirmed' : '📍 Selected Incident Location'}
            </p>
            {revLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin text-white/40" />
                <span className="text-xs text-white/40">Resolving street address…</span>
              </div>
            ) : (
              <p className="text-sm font-semibold text-white leading-snug">{address || 'Locating…'}</p>
            )}
            {accuracy && (
              <p className={`text-[10px] mt-1 ${accuracyOk ? 'text-[#22C55E]' : 'text-[#FFC400]'}`}>
                {accuracyOk
                  ? `GPS precision ±${Math.round(accuracy)}m`
                  : `⚠ Low GPS accuracy ±${Math.round(accuracy)}m — adjust pin for best accuracy`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
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
          className="btn-primary flex-1 justify-center py-3 text-sm font-bold disabled:bg-white/8 disabled:text-white/30 disabled:pointer-events-none shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-150"
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
