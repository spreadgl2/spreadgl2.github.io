import { create } from 'zustand';
import type { SymmetryMode } from '../lib/log/bssvs';
import type { DateDisplay, RenderQuality } from '../lib/persist/preferences';
import type { StylePaletteId } from '../lib/tree-render/palettes';

export type { DateDisplay, RenderQuality, SymmetryMode };

export type ActivePanel =
  | 'style'
  | 'layers'
  | 'filter'
  | 'locations'
  | 'dates'
  | 'export'
  | 'settings'
  | null;

export type Theme = 'dark' | 'light' | 'system';

/**
 * Tree ladderization order.
 * 'desc' = largest tip-count clade drawn at the top, shrinking downward (default).
 * 'asc'  = smallest tip-count clade drawn at the top, growing larger downward.
 * 'file' = preserve parser adjacency order. Legacy: no longer offered in the UI
 *          (the toolbar button was removed); kept for the raw-layout path and
 *          for older project files, which load coerced to 'desc'.
 */
export type TreeSortOrder = 'file' | 'asc' | 'desc';

export type Palette = StylePaletteId;

export type WorkspaceView = 'tree' | 'map' | 'analysis';

export type VisibleViews = Record<WorkspaceView, boolean>;

/**
 * Tabs of the Analysis panel. Lifted to the store (from local component state)
 * so loading a BSSVS log can open the panel directly on the BSSVS tab.
 */
export type AnalysisTab = 'ltt' | 'transitions' | 'bssvs';

export const BASEMAP_URLS = {
  dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  light: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
} as const;

export function basemapUrlForTheme(effectiveTheme: 'dark' | 'light'): string {
  return BASEMAP_URLS[effectiveTheme];
}

/**
 * Whether the effective theme uses a dark (near-black) basemap.
 * Drives two consumer decisions in MapView:
 *  - trim the deep-purple end of the viridis time-gradient (those stops are
 *    unreadable against dark tiles)
 *  - direction of the halo-color lift (toward white on dark, toward black on
 *    light)
 */
export function isDarkTheme(effectiveTheme: 'dark' | 'light'): boolean {
  return effectiveTheme === 'dark';
}

export function effectiveThemeForPreference(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

export interface PinnedSelection {
  branchId: number;
  source: 'tree' | 'map';
}

export type LayerId = 'branches' | 'hpd-polygons' | 'cluster-endpoints' | 'raster-overlay';

export interface UiStore {
  activePanel: ActivePanel;
  theme: Theme;
  dateDisplay: DateDisplay;
  reducedMotion: boolean;
  renderQuality: RenderQuality;
  visibleViews: VisibleViews;
  treeSplitFraction: number;
  sidePanelWidth: number;
  datesPanelWidth: number;
  locationsPanelWidth: number;
  analysisPanelHeight: number;
  analysisTab: AnalysisTab;
  timelineHeight: number;
  treeSortOrder: TreeSortOrder;
  multiTreeCount: number;
  multiTreeNoticeDismissed: boolean;
  colorByKey: string | 'single-color';
  glyphByKey: string | 'none';
  palette: Palette;
  paletteReverse: boolean;
  showBranches: boolean;
  branchWidth: number;
  arcWidth: number;
  showTips: boolean;
  tipRadius: number;
  treeOpacity: number;
  pinnedSelection: PinnedSelection | null;
  compareSelection: PinnedSelection | null;
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
  deselectedValues: Set<string>;
  showLogDropZone: boolean;
  logBurnIn: number;
  dtaMapOverlay: 'none' | 'bf' | 'jumps' | 'rates';
  symmetryMode: SymmetryMode;
  // Minimum Bayes factor for a BSSVS route to show in the table and BF-arrow overlay.
  bssvsBfThreshold: number;
  posteriorThreshold: number;
  lassoMode: boolean;
  lassoVertices: Array<[number, number]>;
  pickLocationName: string | null;
  hoveredLocationName: string | null;
  setActivePanel: (panel: ActivePanel) => void;
  setShowLogDropZone: (show: boolean) => void;
  setLogBurnIn: (v: number) => void;
  setDtaMapOverlay: (mode: 'none' | 'bf' | 'jumps' | 'rates') => void;
  setSymmetryMode: (mode: SymmetryMode) => void;
  setBssvsBfThreshold: (v: number) => void;
  setPosteriorThreshold: (threshold: number) => void;
  setLassoMode: (active: boolean) => void;
  addLassoVertex: (vertex: [number, number]) => void;
  clearLasso: () => void;
  setPickLocationName: (name: string | null) => void;
  setHoveredLocationName: (name: string | null) => void;
  setTheme: (theme: Theme) => void;
  setDateDisplay: (display: DateDisplay) => void;
  setReducedMotion: (reduced: boolean) => void;
  setRenderQuality: (quality: RenderQuality) => void;
  setVisibleView: (view: WorkspaceView, visible: boolean) => void;
  toggleVisibleView: (view: WorkspaceView) => void;
  setTreeSplitFraction: (fraction: number) => void;
  setSidePanelWidth: (width: number) => void;
  setDatesPanelWidth: (width: number) => void;
  setLocationsPanelWidth: (width: number) => void;
  setAnalysisPanelHeight: (height: number) => void;
  setAnalysisTab: (tab: AnalysisTab) => void;
  setTimelineHeight: (height: number) => void;
  setTreeSortOrder: (order: TreeSortOrder) => void;
  setMultiTreeCount: (count: number) => void;
  dismissMultiTreeNotice: () => void;
  setColorByKey: (key: string | 'single-color') => void;
  setGlyphByKey: (key: string | 'none') => void;
  setPalette: (palette: Palette) => void;
  setPaletteReverse: (reverse: boolean) => void;
  setShowBranches: (show: boolean) => void;
  setBranchWidth: (width: number) => void;
  setArcWidth: (width: number) => void;
  setShowTips: (show: boolean) => void;
  setTipRadius: (radius: number) => void;
  setTreeOpacity: (opacity: number) => void;
  setPinnedSelection: (sel: PinnedSelection | null) => void;
  setCompareSelection: (sel: PinnedSelection | null) => void;
  setLayerVisibility: (id: string, visible: boolean) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setDeselectedValues: (values: string[]) => void;
  toggleLegendValue: (value: string, allValues: string[]) => void;
  soloLegendValue: (value: string, allValues: string[]) => void;
  resetLegendFilter: () => void;
}

const DEFAULT_LAYER_VISIBILITY: Record<LayerId, boolean> = {
  branches: true,
  // HPD polygons default ON: when a tree carries HPDs, surface the geographic
  // uncertainty without forcing the user to discover the toggle. The layer
  // self-suppresses (no PolygonLayer added) for trees without HPD data.
  'hpd-polygons': true,
  'cluster-endpoints': true,
  'raster-overlay': true,
};

const DEFAULT_LAYER_OPACITY: Record<LayerId, number> = {
  branches: 100,
  'hpd-polygons': 100,
  'cluster-endpoints': 100,
  'raster-overlay': 50,
};

export const DEFAULT_VISIBLE_VIEWS: VisibleViews = {
  tree: true,
  map: true,
  // Analysis (the LTT/quantitative strip) is a secondary, opt-in panel — it
  // shouldn't compete with the tree+map workspace for vertical space on first
  // load. Toggle it on from the header; the choice persists in project files.
  analysis: false,
};

function hasAnyVisibleView(visibleViews: VisibleViews): boolean {
  return visibleViews.tree || visibleViews.map || visibleViews.analysis;
}

export const useUiStore = create<UiStore>((set) => ({
  activePanel: null,
  theme: 'dark',
  dateDisplay: 'iso',
  reducedMotion:
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  renderQuality: 'auto',
  visibleViews: { ...DEFAULT_VISIBLE_VIEWS },
  treeSplitFraction: 0.5,
  sidePanelWidth: 280,
  datesPanelWidth: 480,
  locationsPanelWidth: 384,
  analysisPanelHeight: 156,
  analysisTab: 'ltt',
  timelineHeight: 56,
  treeSortOrder: 'desc',
  multiTreeCount: 1,
  multiTreeNoticeDismissed: false,
  colorByKey: 'single-color',
  glyphByKey: 'none',
  palette: 'okabe-ito',
  paletteReverse: false,
  showBranches: true,
  branchWidth: 1.5,
  arcWidth: 20,
  showTips: true,
  tipRadius: 2.5,
  treeOpacity: 100,
  pinnedSelection: null,
  compareSelection: null,
  layerVisibility: { ...DEFAULT_LAYER_VISIBILITY },
  layerOpacity: { ...DEFAULT_LAYER_OPACITY },
  deselectedValues: new Set<string>(),
  showLogDropZone: false,
  logBurnIn: 0.1,
  dtaMapOverlay: 'none',
  symmetryMode: 'symmetric',
  bssvsBfThreshold: 0,
  posteriorThreshold: 0,
  lassoMode: false,
  lassoVertices: [],
  pickLocationName: null,
  hoveredLocationName: null,
  setActivePanel: (activePanel) => set({ activePanel }),
  setShowLogDropZone: (showLogDropZone) => set({ showLogDropZone }),
  setLogBurnIn: (logBurnIn) => set({ logBurnIn }),
  setDtaMapOverlay: (dtaMapOverlay) => set({ dtaMapOverlay }),
  setSymmetryMode: (symmetryMode) => set({ symmetryMode }),
  setBssvsBfThreshold: (bssvsBfThreshold) => set({ bssvsBfThreshold }),
  setPosteriorThreshold: (posteriorThreshold) => set({ posteriorThreshold }),
  setLassoMode: (lassoMode) =>
    set({ lassoMode, lassoVertices: [], ...(lassoMode ? { pickLocationName: null } : {}) }),
  addLassoVertex: (vertex) => set((state) => ({ lassoVertices: [...state.lassoVertices, vertex] })),
  clearLasso: () => set({ lassoMode: false, lassoVertices: [], pickLocationName: null }),
  setPickLocationName: (pickLocationName) =>
    set({
      pickLocationName,
      ...(pickLocationName ? { lassoMode: false, lassoVertices: [] } : {}),
    }),
  setHoveredLocationName: (hoveredLocationName) => set({ hoveredLocationName }),
  setTheme: (theme) => set({ theme }),
  setDateDisplay: (dateDisplay) => set({ dateDisplay }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setRenderQuality: (renderQuality) => set({ renderQuality }),
  setVisibleView: (view, visible) =>
    set((state) => {
      const next = { ...state.visibleViews, [view]: visible };
      return hasAnyVisibleView(next) ? { visibleViews: next } : {};
    }),
  toggleVisibleView: (view) =>
    set((state) => {
      const next = { ...state.visibleViews, [view]: !state.visibleViews[view] };
      return hasAnyVisibleView(next) ? { visibleViews: next } : {};
    }),
  setTreeSplitFraction: (treeSplitFraction) => set({ treeSplitFraction }),
  setSidePanelWidth: (sidePanelWidth) => set({ sidePanelWidth }),
  setDatesPanelWidth: (datesPanelWidth) => set({ datesPanelWidth }),
  setLocationsPanelWidth: (locationsPanelWidth) => set({ locationsPanelWidth }),
  setAnalysisPanelHeight: (analysisPanelHeight) => set({ analysisPanelHeight }),
  setAnalysisTab: (analysisTab) => set({ analysisTab }),
  setTimelineHeight: (timelineHeight) => set({ timelineHeight }),
  setTreeSortOrder: (treeSortOrder) => set({ treeSortOrder }),
  setMultiTreeCount: (multiTreeCount) => set({ multiTreeCount, multiTreeNoticeDismissed: false }),
  dismissMultiTreeNotice: () => set({ multiTreeNoticeDismissed: true }),
  setColorByKey: (colorByKey) => set({ colorByKey, deselectedValues: new Set<string>() }),
  setGlyphByKey: (glyphByKey) => set({ glyphByKey }),
  setPalette: (palette) => set({ palette }),
  setPaletteReverse: (paletteReverse) => set({ paletteReverse }),
  setShowBranches: (showBranches) => set({ showBranches }),
  setBranchWidth: (branchWidth) => set({ branchWidth }),
  setArcWidth: (arcWidth) => set({ arcWidth }),
  setShowTips: (showTips) => set({ showTips }),
  setTipRadius: (tipRadius) => set({ tipRadius }),
  setTreeOpacity: (treeOpacity) => set({ treeOpacity }),
  setPinnedSelection: (pinnedSelection) => set({ pinnedSelection }),
  setCompareSelection: (compareSelection) => set({ compareSelection }),
  setLayerVisibility: (id, visible) =>
    set((state) => ({ layerVisibility: { ...state.layerVisibility, [id]: visible } })),
  setLayerOpacity: (id, opacity) =>
    set((state) => ({ layerOpacity: { ...state.layerOpacity, [id]: opacity } })),
  setDeselectedValues: (values) => set({ deselectedValues: new Set(values) }),
  toggleLegendValue: (value, allValues) =>
    set((state) => {
      const next = new Set(state.deselectedValues);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
        // If all values end up deselected, reset instead of a blank canvas.
        if (allValues.every((v) => next.has(v))) return { deselectedValues: new Set<string>() };
      }
      return { deselectedValues: next };
    }),
  soloLegendValue: (value, allValues) =>
    set(() => {
      const next = new Set(allValues.filter((v) => v !== value));
      return { deselectedValues: next };
    }),
  resetLegendFilter: () => set({ deselectedValues: new Set<string>() }),
}));
