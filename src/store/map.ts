import type maplibregl from 'maplibre-gl';
import { create } from 'zustand';

interface MapStore {
  mapInstance: maplibregl.Map | null;
  setMapInstance: (m: maplibregl.Map | null) => void;
}

export const useMapStore = create<MapStore>((set) => ({
  mapInstance: null,
  setMapInstance: (mapInstance) => set({ mapInstance }),
}));
