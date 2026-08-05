import { DeckGL } from '@deck.gl/react';
import {
  COORDINATE_SYSTEM,
  IconLayer,
  type IconLayerProps,
  LineLayer,
  OrthographicView,
  ScatterplotLayer,
  SolidPolygonLayer,
} from 'deck.gl';
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Home, ScanSearch, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TreeCalibration } from '../../lib/phylo/calibrate';
import { computeLayoutFromGraph } from '../../lib/phylo/layout';
import {
  type BranchSegment,
  buildKDTree,
  kdQueryNearest,
} from '../../lib/tree-render/branch-kdtree';
import { buildGlyphAtlas } from '../../lib/tree-render/glyph-atlas';
import type { TipGlyph } from '../../lib/tree-render/glyphs';
import { hexToRgb } from '../../lib/tree-render/palettes';
import {
  computeDimmedNodeIds,
  computeNodeAppearance,
} from '../../lib/tree-render/tree-render-state';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { type TreeSortOrder, useUiStore } from '../../store/ui';
import { usePlayheadIndicatorVisibility } from '../timeline/usePlayheadIndicatorVisibility';
import { Inspector } from '../viewer/Inspector';
import { playbackBucketCount, shouldUsePerformanceMode } from '../viewer/performance-policy';
import { getDimPlayheadBucket } from './dim-playhead-bucket';
import { useAutoFadeControls } from './useAutoFadeControls';

export interface TreeViewGLProps {
  playhead?: number;
}

type RGBAColor = [number, number, number, number];
type Point2D = [number, number];
type TreeOrthoViewState = {
  target: [number, number, number];
  zoom: number;
};
type ZoomDragState = {
  start: Point2D;
  current: Point2D;
};
type ZoomBoxRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type VerticalPanBounds = {
  min: number;
  max: number;
};

const DEFAULT_BRANCH_COLOR: RGBAColor = [136, 136, 136, 200];
const DEFAULT_TIP_COLOR: RGBAColor = [136, 136, 136, 200];
const ACCENT_COLOR: RGBAColor = [30, 144, 255, 255];
const HOVER_RING_COLOR: RGBAColor = [30, 144, 255, 220];

const PAD_X = 32;
const PAD_Y = 16;
const MIN_ZOOM_BOX_PX = 8;
const ZOOM_BOX_PADDING_SCALE = 0.92;
const MAX_TREE_BOX_ZOOM = 10;
const VIEW_EPSILON = 0.001;
const MIN_VERTICAL_SPACING = 1;
const MAX_VERTICAL_SPACING = 5;
const VERTICAL_SPACING_STEP = 0.25;
const PAN_EPSILON = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFullTreeViewState(panelDims: { width: number; height: number }): TreeOrthoViewState {
  return {
    target: [panelDims.width / 2, panelDims.height / 2, 0],
    zoom: 0,
  };
}

function getViewScale(zoom: number): number {
  return 2 ** zoom;
}

function getZoomBoxRect(start: Point2D, current: Point2D): ZoomBoxRect {
  const left = Math.min(start[0], current[0]);
  const top = Math.min(start[1], current[1]);
  return {
    left,
    top,
    width: Math.abs(current[0] - start[0]),
    height: Math.abs(current[1] - start[1]),
  };
}

function screenToTreeWorld(
  point: Point2D,
  viewState: TreeOrthoViewState,
  panelDims: { width: number; height: number },
): Point2D {
  const scale = getViewScale(viewState.zoom);
  return [
    viewState.target[0] + (point[0] - panelDims.width / 2) / scale,
    viewState.target[1] + (point[1] - panelDims.height / 2) / scale,
  ];
}

function isTreeZoomReset(
  viewState: TreeOrthoViewState,
  panelDims: { width: number; height: number },
) {
  return (
    Math.abs(viewState.zoom) < VIEW_EPSILON &&
    Math.abs(viewState.target[0] - panelDims.width / 2) < 0.5 &&
    Math.abs(viewState.target[1] - panelDims.height / 2) < 0.5
  );
}

function getVerticalPanBounds({
  baseTop,
  baseBottom,
  panelDims,
  viewState,
  verticalSpacing,
}: {
  baseTop: number;
  baseBottom: number;
  panelDims: { width: number; height: number };
  viewState: TreeOrthoViewState;
  verticalSpacing: number;
}): VerticalPanBounds {
  if (panelDims.height <= 0 || verticalSpacing <= MIN_VERTICAL_SPACING) return { min: 0, max: 0 };
  const viewScale = getViewScale(viewState.zoom);
  const expandedTop = viewState.target[1] + (baseTop - viewState.target[1]) * verticalSpacing;
  const expandedBottom = viewState.target[1] + (baseBottom - viewState.target[1]) * verticalSpacing;
  const screenTop = (expandedTop - viewState.target[1]) * viewScale + panelDims.height / 2;
  const screenBottom = (expandedBottom - viewState.target[1]) * viewScale + panelDims.height / 2;
  const viewportTop = PAD_Y;
  const viewportBottom = Math.max(PAD_Y, panelDims.height - PAD_Y);
  if (screenBottom - screenTop <= viewportBottom - viewportTop) return { min: 0, max: 0 };
  const min = screenTop - viewportTop;
  const max = screenBottom - viewportBottom;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

function hexToRgba(hex: string, alpha = 255): RGBAColor {
  const { r, g, b } = hexToRgb(hex);
  return [r, g, b, alpha];
}

// Dimmed (filtered-out) branches/tips blend strongly toward grey and drop to a
// low alpha so the selected set stands out. `DIM_DESATURATION` of 1 = full
// luminance grey; `DIM_ALPHA` scales the base alpha. Tree renderer only — the
// map hides filtered branches rather than dimming them.
const DIM_ALPHA = 0.05;
const DIM_DESATURATION = 0.85;

export function dimColor(base: RGBAColor, alphaScale: number): RGBAColor {
  const grey = 0.299 * base[0] + 0.587 * base[1] + 0.114 * base[2];
  return [
    Math.round(base[0] + (grey - base[0]) * DIM_DESATURATION),
    Math.round(base[1] + (grey - base[1]) * DIM_DESATURATION),
    Math.round(base[2] + (grey - base[2]) * DIM_DESATURATION),
    Math.round(base[3] * DIM_ALPHA * alphaScale),
  ];
}

export function useTreeGlDeckModel() {
  const rawLayout = useTreeStore((s) => s.layout);
  const graph = useTreeStore((s) => s.graph);
  const treeSortOrder = useUiStore((s) => s.treeSortOrder);
  const setTreeSortOrder = useUiStore((s) => s.setTreeSortOrder);
  const showBranches = useUiStore((s) => s.showBranches);
  const branchWidth = useUiStore((s) => s.branchWidth);
  const showTips = useUiStore((s) => s.showTips);
  const tipRadius = useUiStore((s) => s.tipRadius);
  const treeOpacity = useUiStore((s) => s.treeOpacity);
  const colorByTrait = useUiStore((s) => s.colorByKey);
  const glyphByKey = useUiStore((s) => s.glyphByKey);
  const palette = useUiStore((s) => s.palette);
  const paletteReverse = useUiStore((s) => s.paletteReverse);
  const traitInfo = useTreeStore((s) => s.traitInfo);
  const allDiscreteKeys = useTreeStore((s) => s.allDiscreteKeys);
  const branchTable = useTreeStore((s) => s.branchTable);
  const storeBounds = useTimelineStore((s) => s.bounds);
  const storeIsPlaying = useTimelineStore((s) => s.isPlaying);
  const storeWindow = useTimelineStore((s) => s.window);
  const storeWindowSize = useTimelineStore((s) => s.windowSize);
  const storeMode = useTimelineStore((s) => s.mode);
  const storeClade = useTimelineStore((s) => s.clade);
  const storeSubtreeRootIds = useTimelineStore((s) => s.subtreeRootIds);
  const storeSubtreeRootId = useTimelineStore((s) => s.subtreeRootId);
  const deselectedValues = useUiStore((s) => s.deselectedValues);
  const posteriorThreshold = useUiStore((s) => s.posteriorThreshold);
  const setPinnedSelection = useUiStore((s) => s.setPinnedSelection);
  const pinnedSelection = useUiStore((s) => s.pinnedSelection);
  const compareSelectionState = useUiStore((s) => s.compareSelection);
  const renderQuality = useUiStore((s) => s.renderQuality);

  const hoveredId = useSelectionStore((s) => s.hoveredId);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const selectedBranchIds = useSelectionStore((s) => s.selectedBranchIds);
  const highlightedBranchIds = useSelectionStore((s) => s.highlightedBranchIds);
  const focusedTaxa = useSelectionStore((s) => s.focusedTaxa);
  const setHoveredId = useSelectionStore((s) => s.setHoveredId);
  const setSelectedIds = useSelectionStore((s) => s.setSelectedIds);
  const setHoveredBranchId = useSelectionStore((s) => s.setHoveredBranchId);
  const setSelectedBranchIds = useSelectionStore((s) => s.setSelectedBranchIds);
  const toggleSelectedId = useSelectionStore((s) => s.toggleSelectedId);
  const toggleSelectedBranchId = useSelectionStore((s) => s.toggleSelectedBranchId);
  const clearHighlightedBranchIds = useSelectionStore((s) => s.clearHighlightedBranchIds);
  const clearSelection = useSelectionStore((s) => s.clearSelection);
  const setCompareSelection = useUiStore((s) => s.setCompareSelection);
  const setSubtreeRootId = useTimelineStore((s) => s.setSubtreeRootId);
  const toggleSubtreeRootId = useTimelineStore((s) => s.toggleSubtreeRootId);

  const storePlayhead = useTimelineStore((s) => s.playhead);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const playheadIndicatorVisible = usePlayheadIndicatorVisibility(
    isPlaying,
    3000,
    isPlaying ? null : storePlayhead,
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [panelDims, setPanelDims] = useState({ width: 0, height: 0 });
  const [shiftPeek, setShiftPeek] = useState(false);
  const [viewState, setViewState] = useState<TreeOrthoViewState>(() =>
    getFullTreeViewState({ width: 0, height: 0 }),
  );
  const [focusMode, setFocusMode] = useState(false);
  const [zoomDrag, setZoomDrag] = useState<ZoomDragState | null>(null);
  const [verticalSpacing, setVerticalSpacing] = useState(MIN_VERTICAL_SPACING);
  const [verticalPanPx, setVerticalPanPx] = useState(0);
  const hoverRafRef = useRef<number | null>(null);
  const performanceMode = shouldUsePerformanceMode(renderQuality, branchTable?.count ?? 0);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftPeek(true);
      if (event.key === 'Escape') {
        setZoomDrag(null);
        setFocusMode(false);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftPeek(false);
    };
    const handleBlur = () => setShiftPeek(false);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const setMeasuredPanelDims = useCallback((width: number, height: number) => {
    setPanelDims((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  }, []);

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      setContainerEl(node);
      if (node) {
        setMeasuredPanelDims(node.clientWidth, node.clientHeight);
      } else {
        setMeasuredPanelDims(0, 0);
      }
    },
    [setMeasuredPanelDims],
  );

  useEffect(() => {
    if (!containerEl) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setMeasuredPanelDims(width, height);
    });
    ro.observe(containerEl);
    // Initial size from the element in case ResizeObserver fires late.
    setMeasuredPanelDims(containerEl.clientWidth, containerEl.clientHeight);
    return () => ro.disconnect();
  }, [containerEl, setMeasuredPanelDims]);

  const layout = useMemo(() => {
    if (treeSortOrder === 'file' || !graph) return rawLayout;
    return computeLayoutFromGraph(graph, null, { sortBy: treeSortOrder });
  }, [graph, rawLayout, treeSortOrder]);
  const layoutRef = useRef(layout);

  useEffect(() => {
    if (panelDims.width <= 0 || panelDims.height <= 0) return;
    setViewState((prev) =>
      Math.abs(prev.zoom) < VIEW_EPSILON ? getFullTreeViewState(panelDims) : prev,
    );
  }, [panelDims]);

  useEffect(() => {
    if (layoutRef.current === layout) return;
    layoutRef.current = layout;
    setZoomDrag(null);
    setViewState(getFullTreeViewState(panelDims));
  }, [layout, panelDims]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reads stores via getState()
  const { nodeColorById, nodeGlyphById } = useMemo(
    () => computeNodeAppearance(),
    [
      colorByTrait,
      glyphByKey,
      graph,
      traitInfo,
      allDiscreteKeys,
      palette,
      paletteReverse,
      branchTable,
      storeBounds,
    ],
  );

  const playheadBucket = useMemo(
    () =>
      getDimPlayheadBucket(
        storePlayhead,
        storeBounds,
        storeIsPlaying,
        playbackBucketCount(performanceMode),
      ),
    [storePlayhead, storeBounds, storeIsPlaying, performanceMode],
  );

  const dimWindowWidth =
    storeMode === 'Window' && storeWindow !== null
      ? (storeWindowSize ?? storeWindow.end - storeWindow.start)
      : null;
  const pausedDimWindow = storeIsPlaying ? null : storeWindow;
  const dimWindow = useMemo(() => {
    if (storeMode !== 'Window' || dimWindowWidth === null) return null;
    if (!storeIsPlaying) return pausedDimWindow;
    return { start: playheadBucket - dimWindowWidth, end: playheadBucket };
  }, [dimWindowWidth, pausedDimWindow, playheadBucket, storeIsPlaying, storeMode]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: storePlayhead is bucketed during playback; computeDimmedNodeIds reads stores via getState()
  const { dimmedNodeIds, dimmedTipIds } = useMemo(() => {
    return computeDimmedNodeIds(
      storePlayhead,
      focusedTaxa,
      rawLayout,
      highlightedBranchIds,
      shiftPeek,
      dimWindow,
    );
  }, [
    playheadBucket,
    dimWindow,
    storeMode,
    storeClade,
    storeSubtreeRootIds,
    storeSubtreeRootId,
    storeIsPlaying,
    shiftPeek,
    rawLayout,
    graph,
    branchTable,
    deselectedValues,
    posteriorThreshold,
    colorByTrait,
    focusedTaxa,
    highlightedBranchIds,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (globalThis as unknown as Record<string, unknown>).__treeDimmedCount = dimmedNodeIds?.size ?? 0;
  }, [dimmedNodeIds]);

  const calibration = useMemo(() => {
    if (!layout) return null;
    const cal = new TreeCalibration();
    cal.setAnchor('date', layout.nodeMap, layout.maxX);
    return cal;
  }, [layout]);

  const glyphAtlas = useMemo(() => buildGlyphAtlas(), []);

  // Independent axes prevent OrthographicView's single-zoom from collapsing deep trees.
  const { scaleX, scaleY, originX, originY } = useMemo(() => {
    if (!layout || panelDims.width <= 0 || panelDims.height <= 0) {
      return { scaleX: 1, scaleY: 1, originX: PAD_X, originY: PAD_Y };
    }
    const usableW = Math.max(panelDims.width - 2 * PAD_X, 1);
    const usableH = Math.max(panelDims.height - 2 * PAD_Y, 1);
    const xExtent = layout.maxX > 0 ? layout.maxX : 1;
    const yExtent = layout.maxY > 0 ? layout.maxY : 1;
    return {
      scaleX: usableW / xExtent,
      scaleY: usableH / yExtent,
      originX: PAD_X,
      originY: PAD_Y,
    };
  }, [layout, panelDims]);

  const deckViewState = useMemo(() => getFullTreeViewState(panelDims), [panelDims]);
  const treeViewScale = getViewScale(viewState.zoom);
  const baseTreeYBounds = useMemo(() => {
    if (!layout) return { top: 0, bottom: panelDims.height };
    return { top: originY, bottom: originY + layout.maxY * scaleY };
  }, [layout, originY, scaleY, panelDims.height]);
  const verticalPanBounds = useMemo(
    () =>
      getVerticalPanBounds({
        baseTop: baseTreeYBounds.top,
        baseBottom: baseTreeYBounds.bottom,
        panelDims,
        viewState,
        verticalSpacing,
      }),
    [baseTreeYBounds, panelDims, viewState, verticalSpacing],
  );
  const isVerticallyScrollable =
    verticalSpacing > MIN_VERTICAL_SPACING && verticalPanBounds.max - verticalPanBounds.min > 0;

  useEffect(() => {
    setVerticalPanPx((prev) => clamp(prev, verticalPanBounds.min, verticalPanBounds.max));
  }, [verticalPanBounds]);

  // Y-down pixel space: top-left origin matches Canvas-2D convention. Tree focus is
  // applied to the layer coordinates so the same tree model works inside the
  // standalone tree DeckGL and the unified tree/map DeckGL surface. Vertical
  // spacing expands around the current tree target; wheel pan then moves the
  // expanded tree inside the pane.
  const px = useCallback(
    (worldX: number) => {
      const baseX = originX + worldX * scaleX;
      return (baseX - viewState.target[0]) * treeViewScale + panelDims.width / 2;
    },
    [originX, scaleX, viewState, treeViewScale, panelDims.width],
  );
  const py = useCallback(
    (worldY: number) => {
      const baseY = originY + worldY * scaleY;
      const expandedY = viewState.target[1] + (baseY - viewState.target[1]) * verticalSpacing;
      return (
        (expandedY - viewState.target[1]) * treeViewScale + panelDims.height / 2 - verticalPanPx
      );
    },
    [originY, scaleY, viewState, verticalSpacing, treeViewScale, panelDims.height, verticalPanPx],
  );

  const branchData = useMemo(() => {
    if (!layout) return [];
    return layout.nodes
      .filter((n): n is typeof n & { parentId: string } => n.parentId !== null)
      .map((n) => {
        const parent = layout.nodeMap.get(n.parentId);
        if (!parent) return null;
        return {
          sourcePosition: [px(parent.x), py(n.y)] as [number, number],
          targetPosition: [px(n.x), py(n.y)] as [number, number],
          branchId: n.id,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [layout, px, py]);

  // Vertical elbow per inner node spans its children's Y range.
  const elbowData = useMemo(() => {
    if (!layout) return [];
    const result: {
      sourcePosition: [number, number];
      targetPosition: [number, number];
      branchId: string;
    }[] = [];
    for (const node of layout.nodes) {
      if (node.isTip || node.children.length < 2) continue;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const cid of node.children) {
        const child = layout.nodeMap.get(cid);
        if (!child) continue;
        if (child.y < minY) minY = child.y;
        if (child.y > maxY) maxY = child.y;
      }
      if (!Number.isFinite(minY) || !Number.isFinite(maxY)) continue;
      result.push({
        sourcePosition: [px(node.x), py(minY)],
        targetPosition: [px(node.x), py(maxY)],
        branchId: node.id,
      });
    }
    return result;
  }, [layout, px, py]);

  const tipData = useMemo(() => {
    if (!layout) return [];
    return layout.nodes.filter((n) => n.isTip);
  }, [layout]);

  // Pickable point for every internal node — its own (x, y), where the hover
  // circle sits. Internal nodes are picked by this point rather than their
  // vertical connector, and it is the ONLY pickable geometry for the root, which
  // has no incoming branch and so is absent from branchData.
  const nodePointData = useMemo(() => {
    if (!layout) return [];
    const result: { x: number; y: number; branchId: string }[] = [];
    for (const node of layout.nodes) {
      if (node.isTip) continue;
      result.push({ x: px(node.x), y: py(node.y), branchId: node.id });
    }
    return result;
  }, [layout, px, py]);

  const PICK_TOLERANCE_PX = 6;

  const branchKDTree = useMemo(() => {
    // Pickable geometry = horizontal branch segments + internal-node points. The
    // vertical elbow connectors are deliberately excluded: each spans an internal
    // node's full child y-range, so including them let the node resolve from
    // anywhere along the connector (e.g. its bottom intersection with a child
    // branch) rather than from its point. Internal nodes — including the root,
    // which has no branch — are picked by their point (a zero-length segment).
    const segments: BranchSegment[] = [
      ...branchData.map((d) => ({
        x1: d.sourcePosition[0],
        y1: d.sourcePosition[1],
        x2: d.targetPosition[0],
        y2: d.targetPosition[1],
        branchId: d.branchId,
      })),
      ...nodePointData.map((d) => ({
        x1: d.x,
        y1: d.y,
        x2: d.x,
        y2: d.y,
        branchId: d.branchId,
      })),
    ];
    return buildKDTree(segments);
  }, [branchData, nodePointData]);

  const selectedBranchData = useMemo(() => {
    if (!layout) return [];
    const selectedSet = new Set(selectedIds);
    if (graph) {
      for (const branchId of [...selectedBranchIds, ...highlightedBranchIds]) {
        const nodeId = graph.nodes[branchId]?.origId;
        if (nodeId !== undefined) selectedSet.add(nodeId);
      }
    }
    if (selectedSet.size === 0) return [];
    return layout.nodes
      .filter(
        (n): n is typeof n & { parentId: string } => n.parentId !== null && selectedSet.has(n.id),
      )
      .map((n) => {
        const parent = layout.nodeMap.get(n.parentId);
        if (!parent) return null;
        return {
          sourcePosition: [px(parent.x), py(n.y)] as [number, number],
          targetPosition: [px(n.x), py(n.y)] as [number, number],
          branchId: n.id,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [layout, graph, selectedIds, selectedBranchIds, highlightedBranchIds, px, py]);

  const hoveredNodeData = useMemo(() => {
    if (!hoveredId || !layout) return [];
    const node = layout.nodeMap.get(hoveredId);
    if (!node) return [];
    return [{ id: hoveredId, position: [px(node.x), py(node.y)] as [number, number] }];
  }, [hoveredId, layout, px, py]);

  const selectedCladeRootData = useMemo(() => {
    if (!shiftPeek || !storeClade || storeSubtreeRootIds.length === 0 || !layout) return [];
    return storeSubtreeRootIds
      .map((id) => {
        const node = layout.nodeMap.get(id);
        if (!node) return null;
        return { id, position: [px(node.x), py(node.y)] as [number, number] };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [shiftPeek, storeClade, storeSubtreeRootIds, layout, px, py]);

  const playheadLineData = useMemo(() => {
    if (!playheadIndicatorVisible || !calibration?.active || !layout) return [];
    // Calibration returns height-before-present (root=maxX, tips=0) but layout.x
    // is divergence (root=0, tips=maxX) — convert so the playhead sweeps root→tips.
    const height = calibration.decYearToHeight(storePlayhead);
    if (Number.isNaN(height)) return [];
    const worldX = layout.maxX - height;
    return [
      {
        sourcePosition: [px(worldX), py(0)] as [number, number],
        targetPosition: [px(worldX), py(layout.maxY)] as [number, number],
      },
    ];
  }, [playheadIndicatorVisible, calibration, storePlayhead, layout, px, py]);

  const windowBandData = useMemo(() => {
    if (storeMode !== 'Window' || !storeWindow || !calibration?.active || !layout) return [];
    const hStart = calibration.decYearToHeight(storeWindow.start);
    const hEnd = calibration.decYearToHeight(storeWindow.end);
    if (!Number.isFinite(hStart) || !Number.isFinite(hEnd)) return [];
    const xStart = px(layout.maxX - hStart);
    const xEnd = px(layout.maxX - hEnd);
    const yTop = py(0);
    const yBot = py(layout.maxY);
    const left = Math.min(xStart, xEnd);
    const right = Math.max(xStart, xEnd);
    return [
      [
        [left, yTop],
        [right, yTop],
        [right, yBot],
        [left, yBot],
      ],
    ];
  }, [storeMode, storeWindow, calibration, layout, px, py]);

  const windowEdgeData = useMemo(() => {
    if (storeMode !== 'Window' || !storeWindow || !calibration?.active || !layout) return [];
    const hStart = calibration.decYearToHeight(storeWindow.start);
    const hEnd = calibration.decYearToHeight(storeWindow.end);
    if (!Number.isFinite(hStart) || !Number.isFinite(hEnd)) return [];
    const xStart = px(layout.maxX - hStart);
    const xEnd = px(layout.maxX - hEnd);
    const yTop = py(0);
    const yBot = py(layout.maxY);
    return [
      {
        sourcePosition: [xStart, yTop] as [number, number],
        targetPosition: [xStart, yBot] as [number, number],
      },
      {
        sourcePosition: [xEnd, yTop] as [number, number],
        targetPosition: [xEnd, yBot] as [number, number],
      },
    ];
  }, [storeMode, storeWindow, calibration, layout, px, py]);

  const rootStubData = useMemo(() => {
    if (!layout) return [];
    const root = layout.nodes[0];
    if (!root) return [];
    const rx = px(root.x);
    const ry = py(root.y);
    return [
      {
        sourcePosition: [rx - 8, ry] as [number, number],
        targetPosition: [rx, ry] as [number, number],
        nodeId: root.id,
      },
    ];
  }, [layout, px, py]);

  const zoomBoxRect = useMemo(
    () => (zoomDrag ? getZoomBoxRect(zoomDrag.start, zoomDrag.current) : null),
    [zoomDrag],
  );

  const canResetZoom =
    !isTreeZoomReset(viewState, panelDims) ||
    verticalSpacing > MIN_VERTICAL_SPACING ||
    Math.abs(verticalPanPx) > PAN_EPSILON;

  const resetTreeZoom = useCallback(() => {
    setZoomDrag(null);
    setViewState(getFullTreeViewState(panelDims));
    setVerticalSpacing(MIN_VERTICAL_SPACING);
    setVerticalPanPx(0);
  }, [panelDims]);

  const toggleFocusMode = useCallback(() => {
    setZoomDrag(null);
    setFocusMode((active) => !active);
  }, []);

  const adjustVerticalSpacing = useCallback((delta: number) => {
    setVerticalSpacing((prev) =>
      clamp(
        Math.round((prev + delta) / VERTICAL_SPACING_STEP) * VERTICAL_SPACING_STEP,
        MIN_VERTICAL_SPACING,
        MAX_VERTICAL_SPACING,
      ),
    );
  }, []);

  useEffect(() => {
    if (!focusMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      adjustVerticalSpacing(
        event.key === 'ArrowUp' ? VERTICAL_SPACING_STEP : -VERTICAL_SPACING_STEP,
      );
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusMode, adjustVerticalSpacing]);

  const opacityFactor = treeOpacity / 100;
  const renderTips = showTips && !(storeIsPlaying && tipData.length > 5000);

  const branchesLayer = useMemo(
    () =>
      new LineLayer({
        id: 'branches',
        data: branchData,
        getSourcePosition: (d) => d.sourcePosition,
        getTargetPosition: (d) => d.targetPosition,
        getColor: (d) => {
          const hex = nodeColorById?.get(d.branchId);
          const base = hex ? hexToRgba(hex) : DEFAULT_BRANCH_COLOR;
          if (dimmedNodeIds?.has(d.branchId)) return dimColor(base, opacityFactor);
          return [base[0], base[1], base[2], Math.round(base[3] * opacityFactor)] as RGBAColor;
        },
        getWidth: branchWidth,
        widthUnits: 'pixels' as const,
        widthMinPixels: 1,
        pickable: false,
        updateTriggers: {
          getColor: [nodeColorById, dimmedNodeIds, treeOpacity],
          getWidth: [branchWidth],
        },
      }),
    [branchData, nodeColorById, dimmedNodeIds, treeOpacity, opacityFactor, branchWidth],
  );

  const elbowsLayer = useMemo(
    () =>
      new LineLayer({
        id: 'elbows',
        data: elbowData,
        getSourcePosition: (d) => d.sourcePosition,
        getTargetPosition: (d) => d.targetPosition,
        getColor: (d) => {
          const hex = nodeColorById?.get(d.branchId);
          const base = hex ? hexToRgba(hex) : DEFAULT_BRANCH_COLOR;
          if (dimmedNodeIds?.has(d.branchId)) return dimColor(base, opacityFactor);
          return [base[0], base[1], base[2], Math.round(base[3] * opacityFactor)] as RGBAColor;
        },
        getWidth: branchWidth,
        widthUnits: 'pixels' as const,
        widthMinPixels: 1,
        pickable: false,
        updateTriggers: {
          getColor: [nodeColorById, dimmedNodeIds, treeOpacity],
          getWidth: [branchWidth],
        },
      }),
    [elbowData, nodeColorById, dimmedNodeIds, treeOpacity, opacityFactor, branchWidth],
  );

  const opacityScale = treeOpacity / 100;
  const tipsLayer = useMemo(
    () =>
      new IconLayer({
        id: 'tips',
        data: tipData,
        iconAtlas: glyphAtlas.iconAtlas as unknown as NonNullable<IconLayerProps['iconAtlas']>,
        iconMapping: glyphAtlas.iconMapping,
        getPosition: (n) => [px(n.x), py(n.y)],
        getSize: () => tipRadius * 2,
        sizeUnits: 'pixels' as const,
        sizeMinPixels: 4,
        getIcon: (n) => (nodeGlyphById?.get(n.id) ?? 'circle') as TipGlyph,
        getColor: (n) => {
          const hex = nodeColorById?.get(n.id);
          const base = hex ? hexToRgba(hex) : DEFAULT_TIP_COLOR;
          // Tip glyphs use the posterior-agnostic dim set — a tip stays lit
          // under a posterior filter even as its parent branch dims.
          if (dimmedTipIds?.has(n.id)) return dimColor(base, opacityScale);
          return [base[0], base[1], base[2], Math.round(base[3] * opacityScale)] as RGBAColor;
        },
        pickable: false,
        updateTriggers: {
          getColor: [nodeColorById, dimmedTipIds, treeOpacity],
          getSize: [tipRadius],
          getIcon: [nodeGlyphById],
          getPosition: [px, py],
        },
      }),
    [
      tipData,
      glyphAtlas,
      tipRadius,
      nodeGlyphById,
      nodeColorById,
      dimmedTipIds,
      treeOpacity,
      opacityScale,
      px,
      py,
    ],
  );

  const hoverRingLayer = useMemo(
    () =>
      hoveredNodeData.length > 0
        ? new ScatterplotLayer({
            id: 'hover-ring',
            data: hoveredNodeData,
            getPosition: (d) => d.position,
            getRadius: 6,
            getFillColor: [0, 0, 0, 0] as RGBAColor,
            getLineColor: HOVER_RING_COLOR,
            stroked: true,
            filled: false,
            lineWidthMinPixels: 2,
            radiusUnits: 'pixels' as const,
            pickable: false,
          })
        : null,
    [hoveredNodeData],
  );

  const selectedCladeRootLayer = useMemo(
    () =>
      selectedCladeRootData.length > 0
        ? new ScatterplotLayer({
            id: 'selected-clade-roots',
            data: selectedCladeRootData,
            getPosition: (d) => d.position,
            getRadius: 7,
            getFillColor: [30, 144, 255, 45] as RGBAColor,
            getLineColor: ACCENT_COLOR,
            stroked: true,
            filled: true,
            lineWidthMinPixels: 2,
            radiusUnits: 'pixels' as const,
            pickable: false,
          })
        : null,
    [selectedCladeRootData],
  );

  const selectionAccentLayer = useMemo(
    () =>
      selectedBranchData.length > 0
        ? new LineLayer({
            id: 'selection-accent',
            data: selectedBranchData,
            getSourcePosition: (d) => d.sourcePosition,
            getTargetPosition: (d) => d.targetPosition,
            getColor: () => ACCENT_COLOR,
            getWidth: 3,
            widthUnits: 'pixels' as const,
            widthMinPixels: 2,
            pickable: false,
          })
        : null,
    [selectedBranchData],
  );

  const playheadLayer = useMemo(
    () =>
      playheadLineData.length > 0
        ? new LineLayer({
            id: 'playhead',
            data: playheadLineData,
            getSourcePosition: (d) => d.sourcePosition,
            getTargetPosition: (d) => d.targetPosition,
            getColor: () => [255, 200, 50, 180] as RGBAColor,
            getWidth: 1,
            widthUnits: 'pixels' as const,
            widthMinPixels: 1,
            pickable: false,
          })
        : null,
    [playheadLineData],
  );

  const windowBandLayer = useMemo(
    () =>
      windowBandData.length > 0
        ? new SolidPolygonLayer({
            id: 'window-band',
            data: windowBandData,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPolygon: (d: number[][]) => d as unknown as [number, number][],
            getFillColor: [30, 144, 255, 31] as RGBAColor,
            pickable: false,
            extruded: false,
          })
        : null,
    [windowBandData],
  );

  const windowEdgesLayer = useMemo(
    () =>
      windowEdgeData.length > 0
        ? new LineLayer({
            id: 'window-edges',
            data: windowEdgeData,
            getSourcePosition: (d: { sourcePosition: [number, number] }) => d.sourcePosition,
            getTargetPosition: (d: { targetPosition: [number, number] }) => d.targetPosition,
            getColor: () => [30, 144, 255, 80] as RGBAColor,
            getWidth: 1,
            widthUnits: 'pixels' as const,
            widthMinPixels: 1,
            pickable: false,
          })
        : null,
    [windowEdgeData],
  );

  const rootStubLayer = useMemo(
    () =>
      rootStubData.length > 0
        ? new LineLayer({
            id: 'root-stub',
            data: rootStubData,
            getSourcePosition: (d) => d.sourcePosition,
            getTargetPosition: (d) => d.targetPosition,
            getColor: (d) => {
              const base = DEFAULT_BRANCH_COLOR;
              if (dimmedNodeIds?.has(d.nodeId)) return dimColor(base, opacityFactor);
              return [base[0], base[1], base[2], Math.round(base[3] * opacityFactor)] as RGBAColor;
            },
            getWidth: branchWidth,
            widthUnits: 'pixels' as const,
            widthMinPixels: 1,
            pickable: false,
            updateTriggers: {
              getColor: [dimmedNodeIds, treeOpacity],
              getWidth: [branchWidth],
            },
          })
        : null,
    [rootStubData, dimmedNodeIds, treeOpacity, opacityFactor, branchWidth],
  );

  const layers = useMemo(
    () =>
      [
        windowBandLayer,
        showBranches ? branchesLayer : null,
        showBranches ? elbowsLayer : null,
        renderTips ? tipsLayer : null,
        selectedCladeRootLayer,
        renderTips ? hoverRingLayer : null,
        showBranches ? selectionAccentLayer : null,
        playheadLayer,
        windowEdgesLayer,
        showBranches ? rootStubLayer : null,
      ].filter((l): l is NonNullable<typeof l> => l !== null),
    [
      windowBandLayer,
      showBranches,
      branchesLayer,
      elbowsLayer,
      renderTips,
      tipsLayer,
      selectedCladeRootLayer,
      hoverRingLayer,
      selectionAccentLayer,
      playheadLayer,
      windowEdgesLayer,
      rootStubLayer,
    ],
  );

  const isControlTarget = useCallback((e: React.MouseEvent<HTMLDivElement>): boolean => {
    const controls = containerRef.current?.querySelectorAll('[data-tree-control-root="true"]');
    if (!controls) return false;
    return Array.from(controls).some((control) => control.contains(e.target as Node));
  }, []);

  const getEventPoint = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): Point2D | null => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const maxX = panelDims.width > 0 ? panelDims.width : rect.width;
      const maxY = panelDims.height > 0 ? panelDims.height : rect.height;
      return [
        clamp(e.clientX - rect.left, 0, Math.max(maxX, 0)),
        clamp(e.clientY - rect.top, 0, Math.max(maxY, 0)),
      ];
    },
    [panelDims],
  );

  const completeZoomDrag = useCallback(
    (endPoint: Point2D) => {
      if (!zoomDrag || panelDims.width <= 0 || panelDims.height <= 0) {
        setZoomDrag(null);
        return;
      }
      const rect = getZoomBoxRect(zoomDrag.start, endPoint);
      setZoomDrag(null);
      if (rect.width < MIN_ZOOM_BOX_PX || rect.height < MIN_ZOOM_BOX_PX) return;

      const currentScale = getViewScale(viewState.zoom);
      const worldWidth = rect.width / currentScale;
      const worldHeight = rect.height / currentScale;
      if (worldWidth <= 0 || worldHeight <= 0) return;

      const centerScreen: Point2D = [rect.left + rect.width / 2, rect.top + rect.height / 2];
      const centerWorld = screenToTreeWorld(centerScreen, viewState, panelDims);
      const fittedScale =
        Math.min(panelDims.width / worldWidth, panelDims.height / worldHeight) *
        ZOOM_BOX_PADDING_SCALE;
      if (!Number.isFinite(fittedScale) || fittedScale <= 0) return;

      const nextZoom = clamp(
        Math.max(viewState.zoom, Math.log2(fittedScale)),
        0,
        MAX_TREE_BOX_ZOOM,
      );
      setViewState({ target: [centerWorld[0], centerWorld[1], 0], zoom: nextZoom });
    },
    [zoomDrag, panelDims, viewState],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!focusMode || isControlTarget(e) || e.button !== 0) return;
      const point = getEventPoint(e);
      if (!point) return;
      e.preventDefault();
      setZoomDrag({ start: point, current: point });
      setHoveredId(null);
      setHoveredBranchId(null);
    },
    [focusMode, getEventPoint, isControlTarget, setHoveredBranchId, setHoveredId],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!focusMode || !zoomDrag) return;
      const point = getEventPoint(e);
      if (!point) return;
      e.preventDefault();
      completeZoomDrag(point);
    },
    [focusMode, zoomDrag, getEventPoint, completeZoomDrag],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!isVerticallyScrollable) return;
      e.preventDefault();
      e.stopPropagation();
      setVerticalPanPx((prev) =>
        clamp(prev + e.deltaY, verticalPanBounds.min, verticalPanBounds.max),
      );
    },
    [isVerticallyScrollable, verticalPanBounds],
  );

  const handleHover = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlTarget(e)) return;
      if (focusMode) {
        if (zoomDrag) {
          const point = getEventPoint(e);
          if (point) setZoomDrag((prev) => (prev ? { ...prev, current: point } : prev));
        }
        return;
      }
      const screenPoint = getEventPoint(e);
      if (!screenPoint) return;
      if (hoverRafRef.current != null) return;
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const [x, y] = screenPoint;
        const hit = kdQueryNearest(branchKDTree, x, y, PICK_TOLERANCE_PX);
        const nodeId = hit ? hit.branchId : null;
        setHoveredId(nodeId);
        const branchId = nodeId && graph ? (graph.origIdToIdx.get(nodeId) ?? null) : null;
        setHoveredBranchId(branchId);
      });
    },
    [
      branchKDTree,
      graph,
      setHoveredId,
      setHoveredBranchId,
      isControlTarget,
      focusMode,
      zoomDrag,
      getEventPoint,
    ],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlTarget(e)) return;
      if (focusMode) return;
      const screenPoint = getEventPoint(e);
      if (!screenPoint) return;
      const [x, y] = screenPoint;
      const hit = kdQueryNearest(branchKDTree, x, y, PICK_TOLERANCE_PX);
      if (!hit || !layout) return;
      const nodeId = hit.branchId;
      if (storeClade) {
        let target = layout.nodeMap.get(nodeId);
        if (!target) return;
        while (target.isTip && target.parentId !== null) {
          const parent = layout.nodeMap.get(target.parentId);
          if (!parent) break;
          target = parent;
        }
        if (!target.isTip) {
          // Toggle: clicking the current subtree root again clears the selection,
          // so the whole tree returns to full colour (no dimming). Shift-click
          // toggles a clade into/out of the multi-clade set; plain click
          // replaces the set with one clade.
          if (e.shiftKey) {
            toggleSubtreeRootId(target.id);
          } else {
            const onlySelected =
              storeSubtreeRootIds.length === 1
                ? storeSubtreeRootIds[0] === target.id
                : storeSubtreeRootId === target.id;
            setSubtreeRootId(onlySelected ? null : target.id);
          }
          return;
        }
      }
      const branchId = graph ? (graph.origIdToIdx.get(nodeId) ?? null) : null;
      if (e.metaKey || e.ctrlKey) {
        if (branchId !== null) setCompareSelection({ branchId, source: 'tree' });
      } else {
        clearHighlightedBranchIds();
        if (branchId !== null) {
          if (e.shiftKey) {
            toggleSelectedId(nodeId);
            toggleSelectedBranchId(branchId);
          } else {
            setSelectedIds([nodeId]);
            setSelectedBranchIds([branchId]);
          }
          setPinnedSelection({ branchId, source: 'tree' });
        } else if (e.shiftKey) {
          toggleSelectedId(nodeId);
        } else {
          setSelectedIds([nodeId]);
          setSelectedBranchIds([]);
        }
      }
    },
    [
      branchKDTree,
      layout,
      graph,
      storeClade,
      storeSubtreeRootIds,
      storeSubtreeRootId,
      setSubtreeRootId,
      toggleSubtreeRootId,
      setCompareSelection,
      clearHighlightedBranchIds,
      setSelectedIds,
      setSelectedBranchIds,
      toggleSelectedId,
      toggleSelectedBranchId,
      setPinnedSelection,
      isControlTarget,
      focusMode,
      getEventPoint,
    ],
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverRafRef.current != null) {
      cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
    setHoveredId(null);
    setHoveredBranchId(null);
  }, [setHoveredId, setHoveredBranchId]);

  const hasBranchSelection =
    selectedIds.length > 0 ||
    selectedBranchIds.length > 0 ||
    highlightedBranchIds.length > 0 ||
    pinnedSelection !== null ||
    compareSelectionState !== null;

  const clearTreeSelection = useCallback(() => {
    clearSelection();
    setPinnedSelection(null);
    setCompareSelection(null);
  }, [clearSelection, setPinnedSelection, setCompareSelection]);

  // Double-clicking empty background (no branch under the cursor) clears any
  // current selection. A double-click on a branch is left to the single-click
  // handlers. Clicks on tree controls (toolbar, inspector) are ignored.
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlTarget(e)) return;
      if (focusMode) return;
      const screenPoint = getEventPoint(e);
      if (!screenPoint) return;
      const [x, y] = screenPoint;
      const hit = kdQueryNearest(branchKDTree, x, y, PICK_TOLERANCE_PX);
      if (!hit) clearTreeSelection();
    },
    [branchKDTree, isControlTarget, focusMode, getEventPoint, clearTreeSelection],
  );

  return {
    containerRef: setContainerRef,
    rootProps: {
      role: 'img',
      'aria-label': 'Phylogenetic tree (deck.gl renderer)',
      'data-testid': 'tree-view-gl',
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: focusMode ? 'crosshair' : 'default',
        userSelect: focusMode ? 'none' : 'auto',
      } as const,
      onMouseDown: handleMouseDown,
      onMouseMove: handleHover,
      onMouseUp: handleMouseUp,
      onWheel: handleWheel,
      onMouseLeave: handleMouseLeave,
      onClick: handleClick,
      onDoubleClick: handleDoubleClick,
    },
    deckProps: {
      id: 'tree-view-deck',
      views: new OrthographicView({ id: 'ortho', flipY: true }),
      initialViewState: deckViewState,
      viewState: deckViewState,
      controller: {
        inertia: false,
        scrollZoom: false,
        dragRotate: false,
        touchRotate: false,
        keyboard: false,
        dragPan: false,
        doubleClickZoom: false,
      },
      layers,
    },
    overlays: {
      sortOrder: treeSortOrder,
      setSortOrder: setTreeSortOrder,
      focusMode,
      toggleFocusMode,
      verticalSpacing,
      resetTreeZoom,
      canResetZoom,
      zoomBoxRect,
      hasBranchSelection,
      clearTreeSelection,
    },
  };
}

export type TreeGlDeckModel = ReturnType<typeof useTreeGlDeckModel>;

export function TreeViewGL(_props: TreeViewGLProps) {
  const model = useTreeGlDeckModel();

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: tree-view canvas; keyboard nav handled in Phase 3C
    <div
      ref={model.containerRef}
      role="img"
      aria-label={model.rootProps['aria-label']}
      data-testid="tree-view-gl"
      style={model.rootProps.style}
      onMouseDown={model.rootProps.onMouseDown}
      onMouseMove={model.rootProps.onMouseMove}
      onMouseUp={model.rootProps.onMouseUp}
      onWheel={model.rootProps.onWheel}
      onMouseLeave={model.rootProps.onMouseLeave}
      onClick={model.rootProps.onClick}
      onDoubleClick={model.rootProps.onDoubleClick}
    >
      <DeckGL
        id={model.deckProps.id}
        views={model.deckProps.views}
        viewState={model.deckProps.viewState}
        controller={model.deckProps.controller}
        layers={model.deckProps.layers}
      />
      <SortToolbar
        order={model.overlays.sortOrder}
        onChange={model.overlays.setSortOrder}
        focusMode={model.overlays.focusMode}
        onToggleFocusMode={model.overlays.toggleFocusMode}
        verticalSpacing={model.overlays.verticalSpacing}
        onResetZoom={model.overlays.resetTreeZoom}
        canResetZoom={model.overlays.canResetZoom}
      />
      {model.overlays.zoomBoxRect && <ZoomBoxOverlay rect={model.overlays.zoomBoxRect} />}
      {model.overlays.hasBranchSelection && (
        <ClearSelectionButton onClearSelection={model.overlays.clearTreeSelection} />
      )}
      <Inspector source="tree" />
    </div>
  );
}

interface SortToolbarProps {
  order: TreeSortOrder;
  onChange: (order: TreeSortOrder) => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  verticalSpacing: number;
  onResetZoom: () => void;
  canResetZoom: boolean;
}

function SortToolbar({
  order,
  onChange,
  focusMode,
  onToggleFocusMode,
  verticalSpacing,
  onResetZoom,
  canResetZoom,
}: SortToolbarProps): React.ReactElement {
  const { faded, autoFadeHandlers } = useAutoFadeControls(2000);

  const handleSet = useCallback(
    (next: TreeSortOrder) => {
      onChange(next);
    },
    [onChange],
  );

  const btnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    background: 'var(--surface-raised, rgba(255,255,255,0.06))',
    color: 'var(--text-secondary, #aaa)',
    border: '1px solid var(--border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    cursor: 'pointer',
    padding: 0,
  };
  const active: React.CSSProperties = {
    background: 'var(--accent, #1e90ff)',
    color: 'var(--fg-on-accent, #fff)',
    border: '1px solid var(--accent, #1e90ff)',
  };
  const disabled: React.CSSProperties = {
    opacity: 0.45,
    cursor: 'not-allowed',
  };
  const divider: React.CSSProperties = {
    width: 1,
    height: 18,
    margin: '5px 2px',
    background: 'var(--border, rgba(255,255,255,0.14))',
  };
  return (
    <div
      role="toolbar"
      aria-label="Tree controls"
      data-testid="tree-sort-toolbar"
      data-tree-control-root="true"
      {...autoFadeHandlers}
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        display: 'inline-flex',
        gap: 4,
        background: 'var(--surface-base, rgba(0,0,0,0.4))',
        padding: 4,
        borderRadius: 6,
        backdropFilter: 'blur(4px)',
        zIndex: 20,
        opacity: faded && !focusMode ? 0.2 : 1,
        transition: 'opacity 0.4s ease-out',
      }}
    >
      <button
        type="button"
        title="Ladderize descending (large clades on top)"
        aria-pressed={order === 'desc'}
        onClick={() => handleSet('desc')}
        style={order === 'desc' ? { ...btnBase, ...active } : btnBase}
      >
        <ArrowDownNarrowWide size={14} />
      </button>
      <button
        type="button"
        title="Ladderize ascending (small clades on top)"
        aria-pressed={order === 'asc'}
        onClick={() => handleSet('asc')}
        style={order === 'asc' ? { ...btnBase, ...active } : btnBase}
      >
        <ArrowUpNarrowWide size={14} />
      </button>
      <span aria-hidden="true" style={divider} />
      <button
        type="button"
        title={
          focusMode
            ? 'Exit tree focus mode'
            : `Tree focus: drag to zoom; Up/Down adjust spacing (${Number.parseFloat(
                verticalSpacing.toFixed(2),
              )}x)`
        }
        aria-label="Tree focus mode"
        aria-pressed={focusMode}
        data-testid="tree-focus-toggle"
        onClick={onToggleFocusMode}
        style={focusMode ? { ...btnBase, ...active } : btnBase}
      >
        <ScanSearch size={14} />
      </button>
      <button
        type="button"
        title="Reset tree view"
        aria-label="Reset tree view"
        data-testid="tree-zoom-reset"
        disabled={!canResetZoom}
        onClick={onResetZoom}
        style={canResetZoom ? btnBase : { ...btnBase, ...disabled }}
      >
        <Home size={14} />
      </button>
    </div>
  );
}

function ZoomBoxOverlay({ rect }: { rect: ZoomBoxRect }): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      data-testid="tree-zoom-box"
      style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        border: '1px solid var(--accent, #1e90ff)',
        background: 'rgba(30, 144, 255, 0.16)',
        boxShadow: '0 0 0 1px rgb(30 144 255 / 24%) inset',
        pointerEvents: 'none',
        zIndex: 15,
      }}
    />
  );
}

function ClearSelectionButton({
  onClearSelection,
}: {
  onClearSelection: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      title="Clear tree selection"
      aria-label="Clear tree selection"
      data-testid="tree-clear-selection"
      data-tree-control-root="true"
      onClick={(event) => {
        event.stopPropagation();
        onClearSelection();
      }}
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 28,
        padding: '0 10px',
        background: 'var(--surface-base, rgba(0,0,0,0.6))',
        color: 'var(--fg-primary, #fff)',
        border: '1px solid var(--border, rgba(255,255,255,0.16))',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgb(0 0 0 / 24%)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1,
        zIndex: 30,
      }}
    >
      <X size={14} />
      Clear selection
    </button>
  );
}
