/**
 * useLeafletMap.ts
 * Initialises a Leaflet map inside a container ref.
 * Returns the map instance so callers can add layers/markers.
 *
 * Uses zero-watermark, high-availability composite tile layers.
 */

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { createTileLayerGroup, type MapTileMode } from '../utils/mapConfig';

export type TileStyle = MapTileMode;

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
    center = [20.5937, 78.9629], // India centre
    zoom = 5,
    style = 'dark',
  } = options;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let isMounted = true;

    // Dynamic import so Leaflet only loads when map is actually used
    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current || mapRef.current) return;

      // Fix default marker icons
      // @ts-expect-error _getIconUrl is internal
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const domNode = containerRef.current;
      if ((domNode as unknown as { _leaflet_id?: unknown })._leaflet_id) {
        delete (domNode as unknown as { _leaflet_id?: unknown })._leaflet_id;
      }

      const map = L.map(domNode, {
        center,
        zoom,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
      });

      const tileGroup = createTileLayerGroup(L, style);
      tileGroup.addTo(map);

      mapRef.current = map;
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return mapRef;
}
