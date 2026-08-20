/**
 * useLeafletMap.ts
 * Initialises a Leaflet map inside a container ref.
 * Returns the map instance so callers can add layers/markers.
 *
 * Dark tile layer: CartoDB Dark Matter (free, no API key, shows India perfectly)
 * Satellite tile layer: ESRI World Imagery (free, no API key)
 */

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';

export type TileStyle = 'dark' | 'satellite' | 'osm';

const TILES: Record<TileStyle, { url: string; attribution: string; maxZoom: number }> = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
};

interface UseLeafletMapOptions {
  center?: [number, number];
  zoom?: number;
  style?: TileStyle;
}

export function useLeafletMap(
  containerRef: React.RefObject<HTMLDivElement>,
  options: UseLeafletMapOptions = {},
) {
  const mapRef = useRef<LeafletMap | null>(null);

  const {
    center = [20.5937, 78.9629],  // India centre
    zoom   = 5,
    style  = 'dark',
  } = options;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamic import so Leaflet only loads when map is actually used
    import('leaflet').then((L) => {
      if (!containerRef.current || mapRef.current) return;

      // Fix default marker icons (Leaflet webpack issue)
      // @ts-expect-error _getIconUrl is internal
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current, {
        center,
        zoom,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
      });

      const tile = TILES[style];
      L.tileLayer(tile.url, {
        attribution: tile.attribution,
        maxZoom:     tile.maxZoom,
        subdomains:  style === 'osm' ? 'abc' : 'abcd',
      }).addTo(map);

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return mapRef;
}
