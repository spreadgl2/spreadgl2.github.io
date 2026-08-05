import type { Map as MapLibreMap } from 'maplibre-gl';
import { create } from 'zustand';

interface MapStore {
  mapInstance: MapLibreMap | null;
  setMapInstance: (m: MapLibreMap | null) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  mapInstance: null,
  setMapInstance: (mapInstance) => set({ mapInstance }),
}));
