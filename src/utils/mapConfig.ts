/**
 * mapConfig.ts — Production GIS and Map configuration for CivicResolve AI.
 * 
 * Provides:
 * - High-availability, zero-watermark, zero-API-key tile layer configurations (Dark Tactical, Photorealistic Satellite, OpenStreetMap Street)
 * - Base + Reference composite layers for crystal-clear labels and road networks
 * - Strict coordinate validation and normalization routines
 * - Human-readable and DMS coordinate formatters
 * - Deep navigation link generators (Google Maps, OpenStreetMap, Directions)
 */

import type L from 'leaflet';

export type MapTileMode = 'dark' | 'satellite' | 'street';

export interface TileLayerDef {
  label: string;
  base: {
    url: string;
    attribution: string;
    maxZoom: number;
    subdomains?: string;
  };
  reference?: {
    url: string;
    attribution: string;
    maxZoom: number;
    subdomains?: string;
  };
}

export const DEFAULT_MAP_MODE: MapTileMode = 'street';

export const MAP_TILE_CONFIG: Record<MapTileMode, TileLayerDef> = {
  street: {
    label: 'Street Network',
    base: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
      subdomains: 'abc',
    },
  },
  dark: {
    label: 'Dark Tactical',
    base: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      attribution: '© Esri, HERE, Garmin, OpenStreetMap',
      maxZoom: 19,
    },
    reference: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      attribution: '',
      maxZoom: 19,
    },
  },
  satellite: {
    label: 'Satellite Imagery',
    base: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles © Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    },
    reference: {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      attribution: '',
      maxZoom: 19,
    },
  },
};

/**
 * Standard Google-Maps-grade Leaflet map interaction configuration options.
 */
export const GOOGLE_MAP_INTERACTION_OPTIONS: L.MapOptions = {
  zoomControl: false,       // custom modern controls placed explicitly
  attributionControl: true,
  fadeAnimation: true,
  zoomAnimation: true,
  scrollWheelZoom: true,
  wheelDebounceTime: 40,
  wheelPxPerZoomLevel: 60,
  doubleClickZoom: true,
  touchZoom: true,
  dragging: true,
  boxZoom: true,
  keyboard: true,
  zoomSnap: 0.5,
  zoomDelta: 0.5,
  trackResize: true,
};

/**
 * Strict geographic coordinate validation.
 * Verifies that latitude is in [-90, 90], longitude is in [-180, 180],
 * neither is NaN or null/undefined, and (0,0) is excluded as absent coordinates.
 */
export function validateCoordinates(
  lat: number | string | null | undefined,
  lng: number | string | null | undefined,
): { valid: boolean; latitude: number | null; longitude: number | null; reason?: string } {
  if (lat == null || lng == null || lat === '' || lng === '') {
    return { valid: false, latitude: null, longitude: null, reason: 'Coordinates absent' };
  }

  const parsedLat = typeof lat === 'number' ? lat : parseFloat(String(lat).trim());
  const parsedLng = typeof lng === 'number' ? lng : parseFloat(String(lng).trim());

  if (isNaN(parsedLat) || isNaN(parsedLng)) {
    return { valid: false, latitude: null, longitude: null, reason: 'Coordinates contain non-numeric characters' };
  }

  if (parsedLat === 0 && parsedLng === 0) {
    return { valid: false, latitude: null, longitude: null, reason: 'Coordinates set to null origin (0,0)' };
  }

  // Detect inadvertent lat/lng inversion if latitude exceeds 90 but longitude is <= 90
  if (Math.abs(parsedLat) > 90 && Math.abs(parsedLng) <= 90) {
    if (Math.abs(parsedLng) <= 90 && Math.abs(parsedLat) <= 180) {
      // Reversed coordinates detected
      return {
        valid: true,
        latitude: parsedLng,
        longitude: parsedLat,
        reason: 'Auto-corrected inverted lat/long',
      };
    }
  }

  if (parsedLat < -90 || parsedLat > 90) {
    return { valid: false, latitude: null, longitude: null, reason: `Latitude ${parsedLat} outside [-90, 90]` };
  }

  if (parsedLng < -180 || parsedLng > 180) {
    return { valid: false, latitude: null, longitude: null, reason: `Longitude ${parsedLng} outside [-180, 180]` };
  }

  return { valid: true, latitude: parsedLat, longitude: parsedLng };
}

/**
 * Format latitude/longitude into human-readable DMS notation.
 * e.g., 12.657702°N, 77.447495°E
 */
export function formatCoordinatesDMS(lat: number, lng: number, precision: number = 4): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(precision)}°${latDir}, ${Math.abs(lng).toFixed(precision)}°${lngDir}`;
}

/**
 * Calculate Haversine distance in kilometers between two geographic coordinates.
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * External navigation URL builders
 */
export function getGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function getGoogleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function getOpenStreetMapUrl(lat: number, lng: number, zoom: number = 17): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
}

/**
 * Instantiates the Leaflet base and reference tile layers for a given mode.
 */
export function createTileLayerGroup(
  leaflet: typeof import('leaflet'),
  mode: MapTileMode = DEFAULT_MAP_MODE,
): L.LayerGroup {
  const cfg = MAP_TILE_CONFIG[mode] || MAP_TILE_CONFIG.street;
  const group = leaflet.layerGroup();

  const baseLayer = leaflet.tileLayer(cfg.base.url, {
    attribution: cfg.base.attribution,
    maxZoom: cfg.base.maxZoom,
    subdomains: cfg.base.subdomains || 'abc',
    crossOrigin: true,
    keepBuffer: 4,
    updateWhenIdle: false,
    updateWhenZooming: false,
  });
  group.addLayer(baseLayer);

  if (cfg.reference) {
    const refLayer = leaflet.tileLayer(cfg.reference.url, {
      attribution: cfg.reference.attribution,
      maxZoom: cfg.reference.maxZoom,
      subdomains: cfg.reference.subdomains || 'abc',
      crossOrigin: true,
      keepBuffer: 4,
      updateWhenIdle: false,
      updateWhenZooming: false,
    });
    group.addLayer(refLayer);
  }

  return group;
}

// ── Geocoding cache ────────────────────────────────────────────────────────────
const _GEO_CACHE = new Map<string, string>();
const NOM_BASE = 'https://nominatim.openstreetmap.org';

/**
 * Reverse geocode latitude and longitude to address.
 */
export async function reverseGeocodeAddress(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (_GEO_CACHE.has(key)) return _GEO_CACHE.get(key)!;

  try {
    const res = await fetch(
      `${NOM_BASE}/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'CivicResolveAI/1.0' } }
    );
    if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const data = await res.json();
    const d = data.address ?? {};
    const parts = [
      d.road || d.pedestrian || d.footway,
      d.neighbourhood || d.suburb || d.village,
      d.city || d.town || d.county,
      d.state,
    ].filter(Boolean);
    const result = parts.length > 0 ? parts.join(', ') : data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    _GEO_CACHE.set(key, result);
    return result;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}
