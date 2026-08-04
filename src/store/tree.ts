import type { FeatureCollection } from 'geojson';
import { create } from 'zustand';
import type { TipDateRow } from '../lib/format/tip-date-table';
import {
  buildHpdRenderData,
  buildMultiHpdRenderData,
  type HpdPolygonRenderDatum,
} from '../lib/geo/hpd-render-data';
import type { LogTable } from '../lib/log/log-table';
import type {
  BranchTable,
  GeoJSONPolygon,
  IntrospectResult,
  Layout,
  PhyloGraph,
} from '../lib/phylo/types';
import type { ParseStage } from '../workers/parser-pipeline';

export type ParseStatus = 'idle' | 'parsing' | 'done' | 'error';
export type LogStatus = 'idle' | 'loading' | 'loaded' | 'error';

// Provenance of a discrete location's coordinate, surfaced in the Locations
// panel so the user can see which coordinates are trustworthy.
export type GeoSource = 'gazetteer' | 'csv' | 'manual';

export interface CustomOverlay {
  id: string;
  name: string;
  data: FeatureCollection;
}

export interface ChoroplethOverlay {
  id: string;
  name: string;
  data: FeatureCollection;
  valueByLocation: Map<string, number>;
  valueColumn: string;
  locationCol: string;
}

export interface TreeStore {
  graph: PhyloGraph | null;
  layout: Layout | null;
  branchTable: BranchTable | null;
  nodeHpds: (GeoJSONPolygon | null)[] | null;
  nodeMultiHpds: (GeoJSONPolygon[] | null)[] | null;
  hpdRenderData: HpdPolygonRenderDatum[];
  multiHpdRenderData: HpdPolygonRenderDatum[];
  traitInfo: IntrospectResult | null;
  allDiscreteKeys: string[];
  parseStatus: ParseStatus;
  parseError: string | null;
  parseStage: ParseStage | null;
  parseProgress: number;
  fileName: string | null;
  exampleId: string | null;
  rawTreeText: string | null;
  confirmedTraitKey: string | null;
  confirmedTipDatePattern: string | null;
  tipDateRows: TipDateRow[];
  needsLocationCsv: boolean;
  discreteGeoLookup: Map<string, [number, number]> | null;
  discreteGeoSource: Map<string, GeoSource> | null;
  customOverlays: CustomOverlay[];
  choroplethOverlays: ChoroplethOverlay[];
  logTable: LogTable | null;
  logFileName: string | null;
  logStatus: LogStatus;
  logError: string | null;
  setGraph: (graph: PhyloGraph) => void;
  setLayout: (layout: Layout) => void;
  setBranchTable: (branchTable: BranchTable) => void;
  setNodeHpds: (nodeHpds: (GeoJSONPolygon | null)[] | null) => void;
  setNodeMultiHpds: (nodeMultiHpds: (GeoJSONPolygon[] | null)[] | null) => void;
  setTraitInfo: (traitInfo: IntrospectResult | null) => void;
  setAllDiscreteKeys: (keys: string[]) => void;
  setParseStatus: (status: ParseStatus, error?: string) => void;
  setParseProgress: (stage: ParseStage, percent: number) => void;
  setFileName: (name: string | null) => void;
  setExampleId: (id: string | null) => void;
  setRawTreeText: (text: string | null) => void;
  setConfirmedTraitKey: (key: string | null) => void;
  setConfirmedTipDatePattern: (pattern: string | null) => void;
  setTipDateRows: (rows: TipDateRow[]) => void;
  updateTipDateRow: (nodeId: string, row: Omit<TipDateRow, 'nodeId' | 'taxon'>) => void;
  setNeedsLocationCsv: (needs: boolean) => void;
  setDiscreteGeoLookup: (lookup: Map<string, [number, number]> | null) => void;
  // Replace the whole lookup, tagging every entry with one provenance source.
  setDiscreteGeoData: (lookup: Map<string, [number, number]>, source: GeoSource) => void;
  // Merge entries into the existing lookup (CSV import). New keys + overrides
  // take `source`; untouched keys keep their prior source.
  mergeGeoEntries: (entries: Map<string, [number, number]>, source: GeoSource) => void;
  // Set/override one location's coordinate from a manual edit.
  updateGeoEntry: (name: string, lat: number, lon: number) => void;
  addCustomOverlay: (overlay: CustomOverlay) => void;
  addChoroplethOverlay: (overlay: ChoroplethOverlay) => void;
  clearCustomOverlays: () => void;
  clearChoroplethOverlays: () => void;
  setLogTable: (table: LogTable, fileName: string) => void;
  setLogStatus: (status: LogStatus, error?: string) => void;
  reset: () => void;
}

export const useTreeStore = create<TreeStore>((set) => ({
  graph: null,
  layout: null,
  branchTable: null,
  nodeHpds: null,
  nodeMultiHpds: null,
  hpdRenderData: [],
  multiHpdRenderData: [],
  traitInfo: null,
  allDiscreteKeys: [],
  parseStatus: 'idle',
  parseError: null,
  parseStage: null,
  parseProgress: 0,
  fileName: null,
  exampleId: null,
  rawTreeText: null,
  confirmedTraitKey: null,
  confirmedTipDatePattern: null,
  tipDateRows: [],
  needsLocationCsv: false,
  discreteGeoLookup: null,
  discreteGeoSource: null,
  customOverlays: [],
  choroplethOverlays: [],
  logTable: null,
  logFileName: null,
  logStatus: 'idle',
  logError: null,
  setGraph: (graph) => set({ graph }),
  setLayout: (layout) => set({ layout }),
  setBranchTable: (branchTable) =>
    set((state) => ({
      branchTable,
      hpdRenderData: buildHpdRenderData(state.nodeHpds, branchTable),
      multiHpdRenderData: buildMultiHpdRenderData(state.nodeMultiHpds, branchTable),
    })),
  setNodeHpds: (nodeHpds) =>
    set((state) => ({
      nodeHpds,
      hpdRenderData: buildHpdRenderData(nodeHpds, state.branchTable),
    })),
  setNodeMultiHpds: (nodeMultiHpds) =>
    set((state) => ({
      nodeMultiHpds,
      multiHpdRenderData: buildMultiHpdRenderData(nodeMultiHpds, state.branchTable),
    })),
  setTraitInfo: (traitInfo) => set({ traitInfo }),
  setAllDiscreteKeys: (allDiscreteKeys) => set({ allDiscreteKeys }),
  setParseStatus: (parseStatus, error) => set({ parseStatus, parseError: error ?? null }),
  setParseProgress: (stage, percent) => set({ parseStage: stage, parseProgress: percent }),
  setFileName: (fileName) => set({ fileName }),
  setExampleId: (exampleId) => set({ exampleId }),
  setRawTreeText: (rawTreeText) => set({ rawTreeText }),
  setConfirmedTraitKey: (confirmedTraitKey) => set({ confirmedTraitKey }),
  setConfirmedTipDatePattern: (confirmedTipDatePattern) => set({ confirmedTipDatePattern }),
  setTipDateRows: (tipDateRows) => set({ tipDateRows }),
  updateTipDateRow: (nodeId, row) =>
    set((state) => ({
      tipDateRows: state.tipDateRows.map((existing) =>
        existing.nodeId === nodeId ? { ...existing, ...row } : existing,
      ),
    })),
  setNeedsLocationCsv: (needsLocationCsv) => set({ needsLocationCsv }),
  setDiscreteGeoLookup: (discreteGeoLookup) => set({ discreteGeoLookup }),
  setDiscreteGeoData: (lookup, source) =>
    set({
      discreteGeoLookup: lookup,
      discreteGeoSource: new Map([...lookup.keys()].map((k) => [k, source])),
    }),
  mergeGeoEntries: (entries, source) =>
    set((state) => {
      const lookup = new Map(state.discreteGeoLookup ?? []);
      const srcMap = new Map(state.discreteGeoSource ?? []);
      for (const [name, coord] of entries) {
        lookup.set(name, coord);
        srcMap.set(name, source);
      }
      return { discreteGeoLookup: lookup, discreteGeoSource: srcMap };
    }),
  updateGeoEntry: (name, lat, lon) =>
    set((state) => {
      const lookup = new Map(state.discreteGeoLookup ?? []);
      const srcMap = new Map(state.discreteGeoSource ?? []);
      lookup.set(name, [lat, lon]);
      srcMap.set(name, 'manual');
      return { discreteGeoLookup: lookup, discreteGeoSource: srcMap };
    }),
  addCustomOverlay: (overlay) =>
    set((state) => {
      // Replace existing entry with the same id (e.g., repeated example
      // pick re-fetches the same boundary GeoJSON) so React keyed lists
      // and the layer stack don't see duplicates.
      const filtered = state.customOverlays.filter((o) => o.id !== overlay.id);
      return { customOverlays: [...filtered, overlay] };
    }),
  addChoroplethOverlay: (overlay) =>
    set((state) => ({ choroplethOverlays: [...state.choroplethOverlays, overlay] })),
  clearCustomOverlays: () => set({ customOverlays: [] }),
  clearChoroplethOverlays: () => set({ choroplethOverlays: [] }),
  setLogTable: (table, fileName) =>
    set({ logTable: table, logFileName: fileName, logStatus: 'loaded', logError: null }),
  setLogStatus: (logStatus, error) => set({ logStatus, logError: error ?? null }),
  reset: () =>
    set({
      graph: null,
      layout: null,
      branchTable: null,
      nodeHpds: null,
      nodeMultiHpds: null,
      hpdRenderData: [],
      multiHpdRenderData: [],
      traitInfo: null,
      allDiscreteKeys: [],
      parseStatus: 'idle',
      parseError: null,
      parseStage: null,
      parseProgress: 0,
      fileName: null,
      exampleId: null,
      rawTreeText: null,
      confirmedTraitKey: null,
      confirmedTipDatePattern: null,
      tipDateRows: [],
      needsLocationCsv: false,
      discreteGeoLookup: null,
      discreteGeoSource: null,
      customOverlays: [],
      choroplethOverlays: [],
      logTable: null,
      logFileName: null,
      logStatus: 'idle',
      logError: null,
    }),
}));
