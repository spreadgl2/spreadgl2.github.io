import { create } from 'zustand';
import type { EnvPaletteId } from '../lib/env/palettes';
import { suggestPaletteForVariable } from '../lib/env/palettes';
import type { EnvColumn } from '../lib/format/env-csv';

export type { EnvColumn };

export interface EnvStore {
  columns: EnvColumn[];
  activeKey: string | null;
  paletteOverride: Record<string, EnvPaletteId | 'auto'>;
  setColumns: (columns: EnvColumn[]) => void;
  setActiveKey: (key: string | null) => void;
  setPaletteOverrides: (overrides: Record<string, EnvPaletteId | 'auto'>) => void;
  setPaletteOverride: (key: string, palette: EnvPaletteId | 'auto') => void;
}

export const useEnvStore = create<EnvStore>((set) => ({
  columns: [],
  activeKey: null,
  paletteOverride: {},
  setColumns: (columns) =>
    set((state) => {
      const newActiveKey =
        columns.length > 0
          ? columns.some((c) => c.key === state.activeKey)
            ? state.activeKey
            : (columns[0]?.key ?? null)
          : null;
      return { columns, activeKey: newActiveKey };
    }),
  setActiveKey: (activeKey) => set({ activeKey }),
  setPaletteOverrides: (paletteOverride) => set({ paletteOverride: { ...paletteOverride } }),
  setPaletteOverride: (key, palette) =>
    set((state) => ({ paletteOverride: { ...state.paletteOverride, [key]: palette } })),
}));

export function resolveEnvPalette(
  column: EnvColumn,
  paletteOverride: Record<string, EnvPaletteId | 'auto'>,
): EnvPaletteId {
  const override = paletteOverride[column.key];
  if (override && override !== 'auto') return override;
  return suggestPaletteForVariable(column.displayName);
}
