import * as Comlink from 'comlink';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader, type ParsedOpts } from './features/loader/Loader';
import { LocationAnnotationWarning } from './features/loader/LocationAnnotationWarning';
import { LocationCsvDropZone } from './features/loader/LocationCsvDropZone';
import { LogDropZone } from './features/loader/LogDropZone';
import { useTauriDeepLink } from './features/tauri-deep-link/useTauriDeepLink';
import { usePlaybackLoop } from './features/timeline/playback';
import { DEFAULT_WINDOW_FRACTION } from './features/timeline/window-config';
import { warmColdStartResources } from './features/viewer/cold-start-warmup';
import { SmallScreenGuard } from './features/viewer/SmallScreenGuard';
import { Viewer } from './features/viewer/Viewer';
import { filterBoundariesByPoints } from './lib/format/boundaries';
import { parseEnvCSV } from './lib/format/env-csv';
import { matchGazetteer } from './lib/format/gazetteer';
import { detectTraitNameForStates } from './lib/log/bssvs';
import {
  type DEFAULTS,
  loadPreferencesFromTauriStore,
  setPreference,
} from './lib/persist/preferences';
import type { ProjectDateOverride, ProjectFile } from './lib/persist/project';
import { applyEmbeddedData, type EmbeddedData } from './lib/persist/project-embed';
import {
  countMissingNodeAnnotations,
  isEndGeoResolved,
  isStartGeoResolved,
} from './lib/phylo/geo-completeness';
import type { BranchTable } from './lib/phylo/types';
import { categoricalValuesForColorKey } from './lib/tree-render/categorical-values';
import {
  HIGH_CARDINALITY_CATEGORY_THRESHOLD,
  isGlasbeyPalette,
  suggestedCategoricalPaletteForCount,
} from './lib/tree-render/palettes';
import { rebuildBranchTable } from './lib/tree-render/rebuild';
import { useEnvStore } from './store/env';
import { useRasterStore } from './store/raster';
import { rebuildDatesFromRows } from './store/rebuild-dates';
import { useSelectionStore } from './store/selection';
import { deriveWindow, type PlayMode, useTimelineStore } from './store/timeline';
import { type CustomOverlay, useTreeStore } from './store/tree';
import { effectiveThemeForPreference, useUiStore } from './store/ui';
import type { LogWorkerApi } from './workers/log.worker';
import type { rehydrate } from './workers/wire';

const IS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Push t=0 a tiny step before the TMRCA and t=max a tiny step past the most
// recent sample. The animation starts with nothing active (no branch's
// startTime ≤ playhead until the playhead crosses the root) and ends with
// every lineage fully drawn (every endTime < playhead). 0.01 decimal years
// ≈ 3.65 days — small enough to be invisible on the timeline axis.
const PRE_TMRCA_BUFFER = 0.01;
const POST_SAMPLE_BUFFER = 0.01;

function applyProjectDateOverrides(overrides: ProjectDateOverride[]): void {
  if (overrides.length === 0) return;

  const currentRows = useTreeStore.getState().tipDateRows;
  if (currentRows.length === 0) return;

  const byNodeId = new Map(overrides.map((override) => [override.nodeId, override]));
  const byTaxon = new Map(overrides.map((override) => [override.taxon, override]));
  let matched = false;
  const nextRows = currentRows.map((row) => {
    const override = byNodeId.get(row.nodeId) ?? byTaxon.get(row.taxon);
    if (!override) return row;
    matched = true;
    return {
      ...row,
      parsedSubstring: override.parsedSubstring,
      decimalYear: override.decimalYear,
      format: override.format,
      source: override.source,
    };
  });

  if (matched) rebuildDatesFromRows(nextRows);
}

function buildPendingBoundaryOverlay(
  pending: NonNullable<ParsedOpts['pendingBoundary']>,
  branchTable: BranchTable,
): CustomOverlay | null {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < branchTable.count; i++) {
    if (isStartGeoResolved(branchTable, i)) {
      points.push([branchTable.startLon[i] ?? 0, branchTable.startLat[i] ?? 0]);
    }
    if (isEndGeoResolved(branchTable, i)) {
      points.push([branchTable.endLon[i] ?? 0, branchTable.endLat[i] ?? 0]);
    }
  }
  const filtered = filterBoundariesByPoints(pending.geojson, points);
  if (filtered.features.length === 0) return null;
  return { id: pending.id, name: pending.name, data: filtered };
}

function buildEnvironmentOverlay(
  pending: NonNullable<ParsedOpts['pendingEnvironment']>,
  boundaryOverlay: CustomOverlay,
) {
  const parsed = parseEnvCSV(pending.text);
  const firstCol = parsed.numericCols[0];
  if (!firstCol) return null;

  return {
    overlay: {
      id: pending.id,
      name: pending.name.replace(/\.csv$/i, ''),
      data: boundaryOverlay.data,
      valueByLocation: parsed.valueByLocation(firstCol),
      valueColumn: firstCol,
      locationCol: parsed.locationCol,
    },
    columns: parsed.numericColumns,
  };
}

export interface AppProps {
  autoLoadExampleId?: string | null;
  playbackLoopEnabled?: boolean;
}

export default function App({ autoLoadExampleId, playbackLoopEnabled = true }: AppProps = {}) {
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  usePlaybackLoop(playbackLoopEnabled && !reducedMotion);
  const pendingRestoreRef = useRef<ProjectFile | null>(null);
  const parsedRunRef = useRef(0);

  const theme = useUiStore((s) => s.theme);
  const parseStatus = useTreeStore((s) => s.parseStatus);
  const needsLocationCsv = useTreeStore((s) => s.needsLocationCsv);
  const traitInfo = useTreeStore((s) => s.traitInfo);
  const allDiscreteKeys = useTreeStore((s) => s.allDiscreteKeys);
  const graph = useTreeStore((s) => s.graph);
  const layout = useTreeStore((s) => s.layout);
  const setGraph = useTreeStore((s) => s.setGraph);
  const setLayout = useTreeStore((s) => s.setLayout);
  const setBranchTable = useTreeStore((s) => s.setBranchTable);
  const setNodeHpds = useTreeStore((s) => s.setNodeHpds);
  const setNodeMultiHpds = useTreeStore((s) => s.setNodeMultiHpds);
  const setTraitInfo = useTreeStore((s) => s.setTraitInfo);
  const setAllDiscreteKeys = useTreeStore((s) => s.setAllDiscreteKeys);
  const setTipDateRows = useTreeStore((s) => s.setTipDateRows);
  const setParseStatus = useTreeStore((s) => s.setParseStatus);
  const setFileName = useTreeStore((s) => s.setFileName);
  const setExampleId = useTreeStore((s) => s.setExampleId);
  const setRawTreeText = useTreeStore((s) => s.setRawTreeText);
  const setConfirmedTraitKey = useTreeStore((s) => s.setConfirmedTraitKey);
  const setConfirmedTipDatePattern = useTreeStore((s) => s.setConfirmedTipDatePattern);
  const setNeedsLocationCsv = useTreeStore((s) => s.setNeedsLocationCsv);
  const setDiscreteGeoData = useTreeStore((s) => s.setDiscreteGeoData);
  const addCustomOverlay = useTreeStore((s) => s.addCustomOverlay);
  const addChoroplethOverlay = useTreeStore((s) => s.addChoroplethOverlay);
  const clearCustomOverlays = useTreeStore((s) => s.clearCustomOverlays);
  const clearChoroplethOverlays = useTreeStore((s) => s.clearChoroplethOverlays);
  const setRaster = useRasterStore((s) => s.setRaster);
  const setEnvColumns = useEnvStore((s) => s.setColumns);
  const setEnvActiveKey = useEnvStore((s) => s.setActiveKey);
  const setEnvPaletteOverrides = useEnvStore((s) => s.setPaletteOverrides);
  const setBounds = useTimelineStore((s) => s.setBounds);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const setTimelineWindow = useTimelineStore((s) => s.setWindow);
  const setTimelineWindowSize = useTimelineStore((s) => s.setWindowSize);
  const setSubtreeRootIds = useTimelineStore((s) => s.setSubtreeRootIds);
  const setSubtreeRootId = useTimelineStore((s) => s.setSubtreeRootId);
  const setMode = useTimelineStore((s) => s.setMode);
  const setArcs = useTimelineStore((s) => s.setArcs);
  const setClade = useTimelineStore((s) => s.setClade);
  const setIsPlaying = useTimelineStore((s) => s.setIsPlaying);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const setSelectedIds = useSelectionStore((s) => s.setSelectedIds);
  const setSelectedBranchIds = useSelectionStore((s) => s.setSelectedBranchIds);
  const setFocusedTaxa = useSelectionStore((s) => s.setFocusedTaxa);
  const setPinnedSelection = useUiStore((s) => s.setPinnedSelection);
  const setCompareSelection = useUiStore((s) => s.setCompareSelection);
  const setColorByKey = useUiStore((s) => s.setColorByKey);
  const setPalette = useUiStore((s) => s.setPalette);
  const setPaletteReverse = useUiStore((s) => s.setPaletteReverse);
  const setShowBranches = useUiStore((s) => s.setShowBranches);
  const setBranchWidth = useUiStore((s) => s.setBranchWidth);
  const setArcWidth = useUiStore((s) => s.setArcWidth);
  const setShowTips = useUiStore((s) => s.setShowTips);
  const setTipRadius = useUiStore((s) => s.setTipRadius);
  const setTreeOpacity = useUiStore((s) => s.setTreeOpacity);
  const setTreeSortOrder = useUiStore((s) => s.setTreeSortOrder);
  const setPosteriorThreshold = useUiStore((s) => s.setPosteriorThreshold);
  const setDeselectedValues = useUiStore((s) => s.setDeselectedValues);
  const setTheme = useUiStore((s) => s.setTheme);
  const setGlyphByKey = useUiStore((s) => s.setGlyphByKey);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const setVisibleView = useUiStore((s) => s.setVisibleView);
  const setAnalysisTab = useUiStore((s) => s.setAnalysisTab);
  const setMultiTreeCount = useUiStore((s) => s.setMultiTreeCount);
  const setLayerVisibility = useUiStore((s) => s.setLayerVisibility);
  const setLayerOpacity = useUiStore((s) => s.setLayerOpacity);
  const setSpeed = useTimelineStore((s) => s.setSpeed);
  const showLogDropZone = useUiStore((s) => s.showLogDropZone);
  const setShowLogDropZone = useUiStore((s) => s.setShowLogDropZone);
  const setLogTable = useTreeStore((s) => s.setLogTable);
  const setLogStatus = useTreeStore((s) => s.setLogStatus);
  const colorByKey = useUiStore((s) => s.colorByKey);
  const palette = useUiStore((s) => s.palette);

  const sidePanelWidth = useUiStore((s) => s.sidePanelWidth);
  const animationMode = useTimelineStore((s) => s.mode);
  const animationSpeed = useTimelineStore((s) => s.speed);

  const logBurnIn = useUiStore((s) => s.logBurnIn);

  const logWorkerRef = useRef<Worker | null>(null);
  const logApiRef = useRef<Comlink.Remote<LogWorkerApi> | null>(null);
  const [importHandoffActive, setImportHandoffActive] = useState(false);
  const [replaceFileOpen, setReplaceFileOpen] = useState(false);
  const [locationAnnotationWarningAcknowledged, setLocationAnnotationWarningAcknowledged] =
    useState(false);

  useEffect(() => {
    const worker = new Worker(new URL('./workers/log.worker.ts', import.meta.url), {
      type: 'module',
    });
    logWorkerRef.current = worker;
    logApiRef.current = Comlink.wrap<LogWorkerApi>(worker);
    return () => {
      worker.terminate();
    };
  }, []);

  // Idle-warm heavy viewer resources after the landing screen is interactive.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const warm = () => warmColdStartResources();
    if (window.requestIdleCallback) {
      const id = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 200);
    return () => window.clearTimeout(id);
  }, []);

  const [deepLinkFile, setDeepLinkFile] = useState<{ path: string; text: string } | null>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);

  const resetTree = useTreeStore((s) => s.reset);

  useTauriDeepLink({
    onFilePath: useCallback(
      (path: string, text: string) => {
        setDeepLinkError(null);
        if (parseStatus === 'done') {
          setIsPlaying(false);
          resetTree();
        }
        setDeepLinkFile({ path, text });
      },
      [parseStatus, setIsPlaying, resetTree],
    ),
    onFileError: useCallback(
      (message: string) => {
        setDeepLinkError(message);
        if (parseStatus === 'done') setReplaceFileOpen(true);
      },
      [parseStatus],
    ),
  });

  const prefetchedLookupRef = useRef<Map<string, [number, number]> | null>(null);
  // Boundary stash for the discrete-no-CSV path: when a discrete tree drops
  // without a usable gazetteer hit, BranchTable lat/lon stay at 0 until the
  // user supplies a CSV in LocationCsvDropZone. The boundary auto-load has
  // to wait — we hold it here and apply it from handleCsvLookup after the
  // CSV rebuilds the BranchTable with real coords.
  const pendingBoundaryRef = useRef<NonNullable<ParsedOpts['pendingBoundary']> | null>(null);
  const pendingEnvironmentRef = useRef<NonNullable<ParsedOpts['pendingEnvironment']> | null>(null);

  // Apply theme token to <html> so CSS variable tokens switch correctly.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-reduced-motion', String(reducedMotion));
    if (reducedMotion) useTimelineStore.getState().setIsPlaying(false);
  }, [reducedMotion]);

  // Follow system color-scheme when "system" is selected.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function update(e: MediaQueryListEvent) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [theme]);

  useEffect(() => {
    const values = categoricalValuesForColorKey(traitInfo, graph, allDiscreteKeys, colorByKey);
    if (!values || values.length <= HIGH_CARDINALITY_CATEGORY_THRESHOLD) return;
    if (!isGlasbeyPalette(palette)) return;

    const suggested = suggestedCategoricalPaletteForCount(
      values.length,
      effectiveThemeForPreference(theme),
    );
    if (palette !== suggested) setPalette(suggested);
  }, [allDiscreteKeys, colorByKey, graph, palette, setPalette, theme, traitInfo]);

  // Restore persisted preferences on mount. Uses .getState() to access
  // store setters without tracking them as React hook dependencies.
  useEffect(() => {
    async function restore() {
      const stored = IS_TAURI
        ? await loadPreferencesFromTauriStore()
        : (() => {
            try {
              const raw = localStorage.getItem('spreadgl2_prefs');
              return raw ? (JSON.parse(raw) as Partial<typeof DEFAULTS>) : {};
            } catch {
              return {};
            }
          })();

      const ui = useUiStore.getState();
      const tl = useTimelineStore.getState();
      if (stored.theme) ui.setTheme(stored.theme);
      if (stored.dateDisplay) ui.setDateDisplay(stored.dateDisplay);
      if (stored.reducedMotion !== undefined) ui.setReducedMotion(stored.reducedMotion);
      if (stored.renderQuality) ui.setRenderQuality(stored.renderQuality);
      if (stored.sidePanelWidth !== undefined) ui.setSidePanelWidth(stored.sidePanelWidth);
      if (stored.datesPanelWidth !== undefined) ui.setDatesPanelWidth(stored.datesPanelWidth);
      if (stored.locationsPanelWidth !== undefined) {
        ui.setLocationsPanelWidth(stored.locationsPanelWidth);
      }
      if (stored.analysisPanelHeight !== undefined) {
        ui.setAnalysisPanelHeight(stored.analysisPanelHeight);
      }
      if (stored.treeSplitFraction !== undefined) ui.setTreeSplitFraction(stored.treeSplitFraction);
      if (stored.animationSpeed !== undefined) tl.setSpeed(stored.animationSpeed);
      if (stored.animationMode) tl.setMode(stored.animationMode as PlayMode);
      if (stored.logBurnIn !== undefined) useUiStore.getState().setLogBurnIn(stored.logBurnIn);
    }
    restore();
  }, []);

  // Persist non-settings preferences when they change (after initial restore).
  const persistedRef = useRef({ sidePanelWidth, animationMode, animationSpeed });
  useEffect(() => {
    const prev = persistedRef.current;
    if (prev.sidePanelWidth !== sidePanelWidth) {
      setPreference('sidePanelWidth', sidePanelWidth);
      persistedRef.current = { ...persistedRef.current, sidePanelWidth };
    }
  }, [sidePanelWidth]);
  useEffect(() => {
    const prev = persistedRef.current;
    if (prev.animationMode !== animationMode) {
      setPreference('animationMode', animationMode);
      persistedRef.current = { ...persistedRef.current, animationMode };
    }
  }, [animationMode]);
  useEffect(() => {
    const prev = persistedRef.current;
    if (prev.animationSpeed !== animationSpeed) {
      setPreference('animationSpeed', animationSpeed);
      persistedRef.current = { ...persistedRef.current, animationSpeed };
    }
  }, [animationSpeed]);
  const handlePrefetchedLookup = useCallback((mapping: Map<string, [number, number]> | null) => {
    prefetchedLookupRef.current = mapping;
  }, []);

  const handleParsed = useCallback(
    async (result: ReturnType<typeof rehydrate>, opts?: ParsedOpts) => {
      const parsedRun = ++parsedRunRef.current;

      // Resolve the pending boundary GeoJSON down to the analysis area.
      // The Loader hands us the full file (often the shared ~190-country
      // Natural Earth fallback); we keep only features that strictly contain
      // at least one branch endpoint (point-in-polygon). Anything else is
      // dropped so broad fallback files only retain the active analysis area.
      function applyPendingBoundary(
        pending: NonNullable<ParsedOpts['pendingBoundary']>,
        branchTable: BranchTable,
      ): CustomOverlay | null {
        const overlay = buildPendingBoundaryOverlay(pending, branchTable);
        if (overlay) addCustomOverlay(overlay);
        return overlay;
      }

      function applyPendingEnvironment(
        pending: NonNullable<ParsedOpts['pendingEnvironment']>,
        boundaryOverlay: CustomOverlay,
      ) {
        try {
          const env = buildEnvironmentOverlay(pending, boundaryOverlay);
          if (!env) return;
          addChoroplethOverlay(env.overlay);
          setEnvColumns(env.columns);
        } catch {
          // malformed example CSV — silently ignore
        }
      }

      function applyRestore() {
        const pending = pendingRestoreRef.current;
        if (!pending) return;
        pendingRestoreRef.current = null;
        applyProjectDateOverrides(pending.dateOverrides);
        const bounds = useTimelineStore.getState().bounds;
        const fallbackWindowSize =
          pending.timeline.mode === 'Window' && bounds
            ? DEFAULT_WINDOW_FRACTION * (bounds.max - bounds.min)
            : null;
        const restoredWindowSize =
          pending.timeline.windowSize ??
          (pending.timeline.window
            ? pending.timeline.window.end - pending.timeline.window.start
            : fallbackWindowSize);
        const restoredWindow =
          pending.timeline.window ??
          (pending.timeline.mode === 'Window' && restoredWindowSize !== null
            ? deriveWindow(pending.timeline.playhead, restoredWindowSize, bounds)
            : null);
        setSpeed(pending.timeline.speed);
        setMode(pending.timeline.mode);
        setTimelineWindow(restoredWindow);
        if (restoredWindow === null && restoredWindowSize !== null) {
          setTimelineWindowSize(restoredWindowSize);
        }
        setPlayhead(pending.timeline.playhead);
        setArcs(pending.timeline.arcs);
        setClade(pending.timeline.clade);
        setSubtreeRootIds(pending.timeline.subtreeRootIds);
        setSelectedIds(pending.selection.selectedIds);
        setSelectedBranchIds(pending.selection.selectedBranchIds);
        setFocusedTaxa(pending.filters.focusedTaxa);
        setPosteriorThreshold(pending.filters.posteriorThreshold);
        setActivePanel(pending.panels.activePanel);
        setVisibleView('tree', pending.panels.visibleViews.tree);
        setVisibleView('map', pending.panels.visibleViews.map);
        setVisibleView('analysis', pending.panels.visibleViews.analysis);
        for (const [id, visible] of Object.entries(pending.panels.layerVisibility)) {
          setLayerVisibility(id, visible);
        }
        for (const [id, opacity] of Object.entries(pending.panels.layerOpacity)) {
          setLayerOpacity(id, opacity);
        }
        setColorByKey(pending.style.colorByKey);
        setGlyphByKey(pending.style.glyphByKey);
        setPalette(pending.style.palette);
        setPaletteReverse(pending.style.paletteReverse);
        setShowBranches(pending.style.showBranches);
        setBranchWidth(pending.style.branchWidth);
        setArcWidth(pending.style.arcWidth);
        setShowTips(pending.style.showTips);
        setTipRadius(pending.style.tipRadius);
        setTreeOpacity(pending.style.treeOpacity);
        // 'file' (no-sort) is no longer offered in the UI; load older projects
        // that saved it as the current default instead of a button-less state.
        setTreeSortOrder(
          pending.style.treeSortOrder === 'file' ? 'desc' : pending.style.treeSortOrder,
        );
        setTheme(pending.style.theme);
        setDeselectedValues(pending.filters.deselectedValues);
        setEnvActiveKey(pending.environment.activeKey);
        setEnvPaletteOverrides(pending.environment.paletteOverride);

        // Restore embedded source data so a shared project is self-contained.
        // Coordinates apply synchronously (no CSV re-prompt); the log is
        // ungzipped asynchronously and applied when ready.
        const embedded = pending.embedded;
        if (embedded?.geo && result.traitInfo.kind === 'discrete') {
          const lookup = new Map<string, [number, number]>();
          for (const [name, lat, lon] of embedded.geo.entries) lookup.set(name, [lat, lon]);
          setDiscreteGeoData(lookup, embedded.geo.source);
          // Rebuild the branch table with the restored coordinates — the parse
          // path may have left lat/lon at 0 (discrete-no-match) or filled from
          // the gazetteer; the embedded lookup is the authoritative one the user
          // saved. Times are unchanged, so the restored timeline still applies.
          const rebuilt = rebuildBranchTable(result.graph, result.layout, result.traitInfo, lookup);
          setBranchTable(rebuilt);
          setNeedsLocationCsv(false);
        }
        // Log and layers need async ungzip; apply them together when ready.
        // (The per-tree clear block runs before applyRestore is called, so it
        // has already reset overlays/env/raster — restored layers land clean.)
        const asyncInput: EmbeddedData = {};
        if (embedded?.log) asyncInput.log = embedded.log;
        if (embedded?.layers) asyncInput.layers = embedded.layers;
        if (asyncInput.log || asyncInput.layers) {
          void applyEmbeddedData(asyncInput).then((applied) => {
            if (applied.log) setLogTable(applied.log.table, applied.log.fileName);
            if (applied.layers) {
              for (const b of applied.layers.boundaries) addCustomOverlay(b);
              for (const c of applied.layers.choropleths) addChoroplethOverlay(c);
              if (applied.layers.envColumns.length > 0) setEnvColumns(applied.layers.envColumns);
              if (applied.layers.raster) setRaster(applied.layers.raster);
            }
          });
        }
      }

      let discreteMapping: Map<string, [number, number]> | null = null;
      let discreteGeoSource: 'csv' | 'gazetteer' = 'gazetteer';
      if (result.traitInfo.kind === 'discrete') {
        const prefetched = opts?.replacementSource
          ? opts.replacementSource.prefetchedLookup
          : prefetchedLookupRef.current;
        if (prefetched) {
          discreteMapping = prefetched;
          discreteGeoSource = 'csv';
        } else {
          try {
            discreteMapping = await matchGazetteer(result.traitInfo.values);
          } catch {
            discreteMapping = new Map();
          }
        }
        if (parsedRunRef.current !== parsedRun) return;
      }

      const replacementSource = opts?.replacementSource;
      if (replacementSource) {
        setFileName(replacementSource.fileName);
        setExampleId(replacementSource.exampleId);
        setRawTreeText(replacementSource.rawTreeText);
        setConfirmedTraitKey(replacementSource.confirmedTraitKey);
        setConfirmedTipDatePattern(replacementSource.confirmedTipDatePattern);
        setMultiTreeCount(replacementSource.multiTreeCount);
        pendingRestoreRef.current = replacementSource.projectFile;
      }

      setLocationAnnotationWarningAcknowledged(false);

      // Clear per-tree state from any previously-loaded dataset so the new
      // tree starts clean. timeWindow, subtreeRootId, and selections all
      // refer to node ids / time ranges that don't apply to a different
      // tree. Mode resets to Trail and Clade resets to off; Arcs default
      // on per the store default (true) — the user can disable after load.
      setTimelineWindow(null);
      setSubtreeRootId(null);
      setMode('Trail');
      setArcs(true);
      setClade(false);
      setIsPlaying(false);
      clearSelection();
      setFocusedTaxa([]);
      setPinnedSelection(null);
      setCompareSelection(null);
      setPosteriorThreshold(0);
      setDeselectedValues([]);
      setEnvPaletteOverrides({});
      setEnvColumns([]);
      // Map layers belong to the old dataset's geography — clear them so a new
      // tree (or an imported project) starts with no stale overlays. applyRestore
      // re-adds any layers embedded in the project after this.
      clearCustomOverlays();
      clearChoroplethOverlays();
      setRaster(null);

      setGraph(result.graph);
      setLayout(result.layout);
      setNodeHpds(result.nodeHpds);
      setNodeMultiHpds(result.nodeMultiHpds);
      setTraitInfo(result.traitInfo);
      setAllDiscreteKeys(result.allDiscreteKeys);
      setTipDateRows(result.tipDateRows ?? []);

      // Default coloring per trait type. Continuous → time gradient; discrete
      // → the auto-detected trait key, so the tree and map are coloured by the
      // trait straight away. Anything unrecognised falls back to single-color.
      setColorByKey(
        result.traitInfo.kind === 'continuous'
          ? '__time__'
          : result.traitInfo.kind === 'discrete'
            ? result.traitInfo.key
            : 'single-color',
      );

      setPalette(
        result.traitInfo.kind === 'continuous'
          ? 'viridis'
          : result.traitInfo.kind === 'discrete'
            ? suggestedCategoricalPaletteForCount(
                result.traitInfo.values.length,
                effectiveThemeForPreference(theme),
              )
            : 'okabe-ito',
      );

      if (result.traitInfo.kind === 'discrete') {
        const mapping = discreteMapping ?? new Map<string, [number, number]>();
        // The built-in gazetteer (used when no lookup CSV was supplied) may only
        // place some states. Gate for a CSV whenever it left any state unmatched
        // — but still apply the partial match below, so the states it DID place
        // (e.g. countries) get coordinates and are kept if the user continues.
        // The gate reports how many of the states matched.
        const gazetteerIncomplete =
          discreteGeoSource === 'gazetteer' && mapping.size < result.traitInfo.values.length;

        setDiscreteGeoData(mapping, discreteGeoSource);
        const newBranchTable = rebuildBranchTable(
          result.graph,
          result.layout,
          result.traitInfo,
          mapping,
        );
        setBranchTable(newBranchTable);
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < newBranchTable.count; i++) {
          const s = newBranchTable.startTime[i] ?? Infinity;
          const e = newBranchTable.endTime[i] ?? -Infinity;
          if (s < min) min = s;
          if (e > max) max = e;
        }
        if (Number.isFinite(min) && Number.isFinite(max)) {
          setBounds({ min: min - PRE_TMRCA_BUFFER, max: max + POST_SAMPLE_BUFFER });
          setPlayhead(min - PRE_TMRCA_BUFFER);
        }

        if (gazetteerIncomplete) {
          // Stash the boundary/environment so handleCsvLookup can re-apply them
          // if the user drops a CSV to place the remaining states.
          if (opts?.pendingBoundary) pendingBoundaryRef.current = opts.pendingBoundary;
          if (opts?.pendingEnvironment) pendingEnvironmentRef.current = opts.pendingEnvironment;
          setNeedsLocationCsv(true);
        } else {
          const boundaryOverlay = opts?.pendingBoundary
            ? applyPendingBoundary(opts.pendingBoundary, newBranchTable)
            : null;
          if (opts?.pendingEnvironment && boundaryOverlay) {
            applyPendingEnvironment(opts.pendingEnvironment, boundaryOverlay);
          }
        }
        prefetchedLookupRef.current = null;
        applyRestore();
        setParseStatus('done');
        return;
      }

      const bt = result.branchTable;
      setBranchTable(bt);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < bt.count; i++) {
        const s = bt.startTime[i] ?? Infinity;
        const e = bt.endTime[i] ?? -Infinity;
        if (s < min) min = s;
        if (e > max) max = e;
      }
      if (Number.isFinite(min) && Number.isFinite(max)) {
        setBounds({ min: min - PRE_TMRCA_BUFFER, max: max + POST_SAMPLE_BUFFER });
        setPlayhead(min - PRE_TMRCA_BUFFER);
      }
      const boundaryOverlay = opts?.pendingBoundary
        ? applyPendingBoundary(opts.pendingBoundary, bt)
        : null;
      if (opts?.pendingEnvironment && boundaryOverlay) {
        applyPendingEnvironment(opts.pendingEnvironment, boundaryOverlay);
      }
      applyRestore();
      setParseStatus('done');
    },
    [
      setGraph,
      setLayout,
      setBranchTable,
      setNodeHpds,
      setNodeMultiHpds,
      setTraitInfo,
      setAllDiscreteKeys,
      setTipDateRows,
      setParseStatus,
      setFileName,
      setExampleId,
      setRawTreeText,
      setConfirmedTraitKey,
      setConfirmedTipDatePattern,
      setNeedsLocationCsv,
      setDiscreteGeoData,
      setBounds,
      setPlayhead,
      setTimelineWindow,
      setTimelineWindowSize,
      setSubtreeRootIds,
      setSubtreeRootId,
      setMode,
      setArcs,
      setClade,
      setIsPlaying,
      clearSelection,
      setSelectedIds,
      setSelectedBranchIds,
      setFocusedTaxa,
      setPinnedSelection,
      setCompareSelection,
      setColorByKey,
      setPalette,
      setPaletteReverse,
      setShowBranches,
      setBranchWidth,
      setArcWidth,
      setShowTips,
      setTipRadius,
      setTreeOpacity,
      setTreeSortOrder,
      setPosteriorThreshold,
      setDeselectedValues,
      setTheme,
      setGlyphByKey,
      setActivePanel,
      setVisibleView,
      setLayerVisibility,
      setLayerOpacity,
      setSpeed,
      addCustomOverlay,
      addChoroplethOverlay,
      clearCustomOverlays,
      clearChoroplethOverlays,
      setRaster,
      setEnvColumns,
      setEnvActiveKey,
      setEnvPaletteOverrides,
      setLogTable,
      setMultiTreeCount,
      theme,
    ],
  );

  const handleCsvLookup = useCallback(
    (mapping: Map<string, [number, number]>) => {
      if (!graph || !layout || traitInfo?.kind !== 'discrete') return;

      setDiscreteGeoData(mapping, 'csv');
      setLocationAnnotationWarningAcknowledged(true);

      const newBranchTable = rebuildBranchTable(graph, layout, traitInfo, mapping);
      setBranchTable(newBranchTable);

      const bt = newBranchTable;
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < bt.count; i++) {
        const s = bt.startTime[i] ?? Infinity;
        const e = bt.endTime[i] ?? -Infinity;
        if (s < min) min = s;
        if (e > max) max = e;
      }
      if (Number.isFinite(min) && Number.isFinite(max)) {
        setBounds({ min: min - PRE_TMRCA_BUFFER, max: max + POST_SAMPLE_BUFFER });
        setPlayhead(min - PRE_TMRCA_BUFFER);
      }

      // The discrete-no-CSV path stashed the example's pending boundary;
      // now that BranchTable has real coords, filter + add it.
      const pendingBoundary = pendingBoundaryRef.current;
      pendingBoundaryRef.current = null;
      const pendingEnvironment = pendingEnvironmentRef.current;
      pendingEnvironmentRef.current = null;
      let boundaryOverlay: CustomOverlay | null = null;
      if (pendingBoundary) {
        boundaryOverlay = buildPendingBoundaryOverlay(pendingBoundary, bt);
        if (boundaryOverlay) addCustomOverlay(boundaryOverlay);
      }
      if (pendingEnvironment && boundaryOverlay) {
        try {
          const env = buildEnvironmentOverlay(pendingEnvironment, boundaryOverlay);
          if (env) {
            addChoroplethOverlay(env.overlay);
            setEnvColumns(env.columns);
          }
        } catch {
          // malformed example CSV — silently ignore
        }
      }

      setNeedsLocationCsv(false);
      setParseStatus('done');
    },
    [
      graph,
      layout,
      traitInfo,
      setDiscreteGeoData,
      setBranchTable,
      setNeedsLocationCsv,
      setParseStatus,
      setBounds,
      setPlayhead,
      addCustomOverlay,
      addChoroplethOverlay,
      setEnvColumns,
    ],
  );

  const handleLogFile = useCallback(
    (file: File) => {
      const api = logApiRef.current;
      if (!api) return;
      setLogStatus('loading');
      api
        .parse(file, { burnInFraction: logBurnIn })
        .then((table) => {
          setLogTable(table, file.name);
          // If the log carries BSSVS indicators for the tree's discrete trait,
          // surface them straight away: open the Analysis panel on the BSSVS tab.
          const { traitInfo } = useTreeStore.getState();
          if (
            traitInfo?.kind === 'discrete' &&
            detectTraitNameForStates(table.columnNames, traitInfo.values) !== null
          ) {
            setVisibleView('analysis', true);
            setAnalysisTab('bssvs');
          }
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          setLogStatus('error', msg);
        });
    },
    [logBurnIn, setLogTable, setLogStatus, setVisibleView, setAnalysisTab],
  );

  const handleProjectFileDrop = useCallback((file: ProjectFile) => {
    pendingRestoreRef.current = file;
  }, []);

  const handleReplaceFile = useCallback(() => {
    setReplaceFileOpen(true);
  }, []);

  const handleReplacementParsed = useCallback(
    async (result: ReturnType<typeof rehydrate>, opts?: ParsedOpts) => {
      await handleParsed(result, opts);
      setReplaceFileOpen(false);
    },
    [handleParsed],
  );

  const locationCsvTraitInfo =
    parseStatus === 'done' && needsLocationCsv && traitInfo?.kind === 'discrete' ? traitInfo : null;
  const missingLocationAnnotationCount = useMemo(
    () =>
      graph && traitInfo?.kind === 'discrete'
        ? countMissingNodeAnnotations(graph, traitInfo.key).internal
        : 0,
    [graph, traitInfo],
  );
  const showLocationCsv = locationCsvTraitInfo !== null;
  const showLocationAnnotationWarning =
    parseStatus === 'done' &&
    !showLocationCsv &&
    missingLocationAnnotationCount > 0 &&
    !locationAnnotationWarningAcknowledged;
  const showViewer = parseStatus === 'done' && !showLocationCsv;
  const showLoader =
    parseStatus !== 'done' || importHandoffActive || replaceFileOpen || deepLinkError !== null;

  return (
    <SmallScreenGuard>
      {showViewer && (
        <div key="viewer" style={{ width: '100vw', height: '100vh' }}>
          <Viewer onReplaceFile={handleReplaceFile} />
          {showLogDropZone && (
            <LogDropZone onFile={handleLogFile} onClose={() => setShowLogDropZone(false)} />
          )}
        </div>
      )}
      {showLocationCsv && (
        <LocationCsvDropZone
          key="location-csv"
          valueCount={locationCsvTraitInfo.values.length}
          values={locationCsvTraitInfo.values}
          traitName={locationCsvTraitInfo.key}
          missingAnnotationCount={missingLocationAnnotationCount}
          onLookup={handleCsvLookup}
          onSkip={() => {
            setLocationAnnotationWarningAcknowledged(true);
            setNeedsLocationCsv(false);
          }}
        />
      )}
      {showLocationAnnotationWarning && traitInfo?.kind === 'discrete' && (
        <LocationAnnotationWarning
          count={missingLocationAnnotationCount}
          traitName={traitInfo.key}
          onContinue={() => setLocationAnnotationWarningAcknowledged(true)}
        />
      )}
      {showLoader && (
        <Loader
          key="loader"
          onParsed={replaceFileOpen ? handleReplacementParsed : handleParsed}
          onPrefetchedLookup={handlePrefetchedLookup}
          autoLoadExampleId={replaceFileOpen ? null : (autoLoadExampleId ?? null)}
          autoLoadFile={replaceFileOpen ? null : deepLinkFile}
          autoLoadError={deepLinkError}
          onProjectFileDrop={handleProjectFileDrop}
          overlayOnly={parseStatus === 'done' && !replaceFileOpen}
          replacement={replaceFileOpen}
          onCancel={() => {
            setReplaceFileOpen(false);
            setDeepLinkError(null);
          }}
          onAutoLoadErrorDismiss={() => setDeepLinkError(null)}
          onImportHandoffStart={() => setImportHandoffActive(true)}
          onImportHandoffComplete={() => setImportHandoffActive(false)}
        />
      )}
    </SmallScreenGuard>
  );
}
