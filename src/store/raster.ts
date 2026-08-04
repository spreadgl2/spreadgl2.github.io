import { create } from 'zustand';
import type { RasterData } from '../lib/geotiff/loader';

export interface RasterStore {
  raster: RasterData | null;
  setRaster: (raster: RasterData | null) => void;
}

export const useRasterStore = create<RasterStore>((set) => ({
  raster: null,
  setRaster: (raster) => set({ raster }),
}));
