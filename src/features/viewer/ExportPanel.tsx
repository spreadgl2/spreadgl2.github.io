import { Camera } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { decimalYearToISO } from '../../lib/format/decimal-year';
import type { TipDateRow } from '../../lib/format/tip-date-table';
import { saveFileAs } from '../../lib/native-dialog';
import type { ProjectDateOverride, SerializeInput } from '../../lib/persist/project';
import { serializeProjectFile } from '../../lib/persist/project';
import { buildEmbeddedData } from '../../lib/persist/project-embed';
import { TreeCalibration } from '../../lib/phylo/calibrate';
import { computeLayoutFromGraph } from '../../lib/phylo/layout';
import type { Layout, LayoutNode } from '../../lib/phylo/types';
import { type TipGlyph, traceTipGlyphPath } from '../../lib/tree-render/glyphs';
import { computeTreeRenderState } from '../../lib/tree-render/tree-render-state';
import { useEnvStore } from '../../store/env';
import { useMapStore } from '../../store/map';
import { useRasterStore } from '../../store/raster';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { effectivePlaybackSpeed } from '../timeline/speed-config';
import styles from './ExportPanel.module.css';
import {
  drawTimeOverlay,
  gatherEnvLegendState,
  renderEnvLegendCanvas,
  renderLegendCanvas,
} from './export-overlays';

// Unsupported-browser note (not yet implemented):
// Browsers without MediaRecorder (Safari < 14) cannot capture a canvas stream.
// The planned fallback is to collect ImageData blobs per frame and mux them
// into an MP4 via ffmpeg.wasm in a Web Worker. Tracking issue: T070 fallback.

const RESOLUTIONS = [
  { label: '1920×1080', width: 1920, height: 1080 },
  { label: '1280×720', width: 1280, height: 720 },
  { label: '854×480', width: 854, height: 480 },
] as const;

const FPS_OPTIONS = [24, 30, 60] as const;

const QUALITY_OPTIONS = [
  { label: '1×', value: 1 },
  { label: '2×', value: 2 },
  { label: '4×', value: 4 },
] as const;

type RecordingState = 'idle' | 'recording' | 'done' | 'unsupported';

export interface RecordConfig {
  startYear: number;
  endYear: number;
  width: number;
  height: number;
  fps: number;
  qualityMultiplier?: number;
  showOverlays?: boolean;
}

const VERTICAL_PADDING_PX = 16;
const HORIZONTAL_PADDING_PX = 32;

interface SnapshotTreeOptions {
  branchWidth: number;
  tipRadius: number;
  treeOpacity: number;
  showBranches: boolean;
  showTips: boolean;
  nodeColorById: Map<string, string> | undefined;
  nodeGlyphById: Map<string, TipGlyph> | undefined;
  dimmedNodeIds: Set<string> | undefined;
  hoveredId: string | null;
  selectedIds: string[];
  playhead: number;
}

function getMapPanelElement(): Element | null {
  return (
    document.querySelector('[data-testid="map-view"]') ??
    document.querySelector('[data-testid="map-panel"]')
  );
}

function getAnalysisPanelElement(): Element | null {
  return (
    document.querySelector('[data-testid="analysis-container"]') ??
    document.querySelector('[data-testid="analysis-panel-fill"]') ??
    document.querySelector('[data-testid="analysis-panel"]')
  );
}

function collectDocumentCss(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) chunks.push(rule.cssText);
    } catch {
      // Cross-origin stylesheets cannot be read; the SVG still carries inline attrs.
    }
  }
  return chunks.join('\n');
}

async function rasterizeAnalysisPanel(
  analysisPanel: Element,
  width: number,
  height: number,
): Promise<HTMLCanvasElement | null> {
  const svg = analysisPanel.querySelector('svg');
  if (!svg || width <= 0 || height <= 0) return null;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const styles = collectDocumentCss();
  if (styles) {
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = styles;
    clone.insertBefore(style, clone.firstChild);
  }

  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('analysis svg rasterization failed'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cropCanvasToElementRect(canvas: HTMLCanvasElement, target: Element): HTMLCanvasElement {
  const canvasRect = canvas.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (
    canvasRect.width <= 0 ||
    canvasRect.height <= 0 ||
    targetRect.width <= 0 ||
    targetRect.height <= 0
  ) {
    return canvas;
  }

  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;
  const sx = Math.max(0, (targetRect.left - canvasRect.left) * scaleX);
  const sy = Math.max(0, (targetRect.top - canvasRect.top) * scaleY);
  const sw = Math.min(canvas.width - sx, targetRect.width * scaleX);
  const sh = Math.min(canvas.height - sy, targetRect.height * scaleY);
  if (sw <= 0 || sh <= 0) return canvas;

  const coversTarget =
    Math.abs(canvasRect.left - targetRect.left) < 1 &&
    Math.abs(canvasRect.top - targetRect.top) < 1 &&
    Math.abs(canvasRect.width - targetRect.width) < 1 &&
    Math.abs(canvasRect.height - targetRect.height) < 1;
  if (coversTarget) return canvas;

  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  const ctx = out.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

function buildSerializeInput(params: {
  fileName: string | null;
  exampleId: string | null;
  rawTreeText: string | null;
  confirmedTraitKey: string | null;
  confirmedTipDatePattern: string | null;
  playhead: number;
  window: ReturnType<typeof useTimelineStore.getState>['window'];
  windowSize: ReturnType<typeof useTimelineStore.getState>['windowSize'];
  speed: number;
  mode: ReturnType<typeof useTimelineStore.getState>['mode'];
  arcs: boolean;
  clade: boolean;
  subtreeRootIds: string[];
  subtreeRootId: string | null;
  selectedIds: string[];
  selectedBranchIds: number[];
  focusedTaxa: string[];
  deselectedValues: string[];
  posteriorThreshold: number;
  activePanel: ReturnType<typeof useUiStore.getState>['activePanel'];
  visibleViews: ReturnType<typeof useUiStore.getState>['visibleViews'];
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
  colorByKey: string;
  glyphByKey: string;
  palette: ReturnType<typeof useUiStore.getState>['palette'];
  paletteReverse: boolean;
  showBranches: boolean;
  branchWidth: number;
  arcWidth: number;
  showTips: boolean;
  tipRadius: number;
  treeOpacity: number;
  treeSortOrder: ReturnType<typeof useUiStore.getState>['treeSortOrder'];
  theme: ReturnType<typeof useUiStore.getState>['theme'];
  envActiveKey: string | null;
  envPaletteOverride: ReturnType<typeof useEnvStore.getState>['paletteOverride'];
  dateOverrides: ProjectDateOverride[];
}): SerializeInput {
  return {
    treeSourceRef: params.fileName
      ? {
          fileName: params.fileName,
          exampleId: params.exampleId,
          confirmedTraitKey: params.confirmedTraitKey,
          confirmedTipDatePattern: params.confirmedTipDatePattern,
        }
      : null,
    ...(params.rawTreeText ? { rawTreeText: params.rawTreeText } : {}),
    timeline: {
      playhead: params.playhead,
      window: params.window,
      windowSize: params.windowSize,
      speed: params.speed,
      mode: params.mode,
      arcs: params.arcs,
      clade: params.clade,
      subtreeRootIds: params.subtreeRootIds,
      subtreeRootId: params.subtreeRootId,
    },
    selection: {
      selectedIds: params.selectedIds,
      selectedBranchIds: params.selectedBranchIds,
    },
    filters: {
      focusedTaxa: params.focusedTaxa,
      deselectedValues: params.deselectedValues,
      posteriorThreshold: params.posteriorThreshold,
    },
    panels: {
      activePanel: params.activePanel,
      visibleViews: params.visibleViews,
      layerVisibility: params.layerVisibility,
      layerOpacity: params.layerOpacity,
    },
    style: {
      colorByKey: params.colorByKey,
      glyphByKey: params.glyphByKey,
      palette: params.palette,
      paletteReverse: params.paletteReverse,
      showBranches: params.showBranches,
      branchWidth: params.branchWidth,
      arcWidth: params.arcWidth,
      showTips: params.showTips,
      tipRadius: params.tipRadius,
      treeOpacity: params.treeOpacity,
      treeSortOrder: params.treeSortOrder,
      theme: params.theme,
    },
    environment: {
      activeKey: params.envActiveKey,
      paletteOverride: params.envPaletteOverride,
    },
    dateOverrides: params.dateOverrides,
  };
}

function buildDateOverrides(rows: TipDateRow[]): ProjectDateOverride[] {
  return rows
    .filter((row) => row.source === 'manual' || row.source === 'csv')
    .map((row) => ({
      nodeId: row.nodeId,
      taxon: row.taxon,
      parsedSubstring: row.parsedSubstring,
      decimalYear: row.decimalYear,
      format: row.format,
      source: row.source === 'csv' ? 'csv' : 'manual',
    }));
}

export function getMapCanvases(): {
  basemap: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
} | null {
  const mapView = getMapPanelElement();
  if (!mapView) return null;
  const basemap =
    (mapView.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null) ??
    (document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null);
  const allCanvases = mapView.querySelectorAll('canvas');
  const overlay =
    (Array.from(allCanvases).find((c) => !c.classList.contains('maplibregl-canvas')) as
      | HTMLCanvasElement
      | undefined) ??
    (Array.from(document.querySelectorAll('canvas')).find((c) => {
      if (c.classList.contains('maplibregl-canvas')) return false;
      const canvasRect = c.getBoundingClientRect();
      const mapRect = mapView.getBoundingClientRect();
      return (
        canvasRect.left < mapRect.right &&
        canvasRect.right > mapRect.left &&
        canvasRect.top < mapRect.bottom &&
        canvasRect.bottom > mapRect.top
      );
    }) as HTMLCanvasElement | undefined);
  if (!basemap || !overlay) return null;
  return {
    basemap: cropCanvasToElementRect(basemap, mapView),
    overlay: cropCanvasToElementRect(overlay, mapView),
  };
}

function drawBranchPass(
  ctx: CanvasRenderingContext2D,
  nodes: LayoutNode[],
  layout: Layout,
  wx: (x: number) => number,
  wy: (y: number) => number,
): void {
  ctx.beginPath();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const parent = layout.nodeMap.get(node.parentId);
    if (!parent) continue;
    ctx.moveTo(wx(parent.x), wy(node.y));
    ctx.lineTo(wx(node.x), wy(node.y));
  }
  ctx.stroke();

  ctx.beginPath();
  for (const node of nodes) {
    if (node.isTip || node.children.length < 2) continue;
    const children = node.children
      .map((id) => layout.nodeMap.get(id))
      .filter((n): n is LayoutNode => n !== undefined);
    if (children.length < 2) continue;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const child of children) {
      minY = Math.min(minY, child.y);
      maxY = Math.max(maxY, child.y);
    }
    ctx.moveTo(wx(node.x), wy(minY));
    ctx.lineTo(wx(node.x), wy(maxY));
  }
  ctx.stroke();
}

function drawTreeBranches(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  scaleX: number,
  scaleY: number,
  originX: number,
  originY: number,
  opts: SnapshotTreeOptions,
): void {
  const wx = (x: number) => originX + x * scaleX;
  const wy = (y: number) => originY + y * scaleY;
  const fallbackColor = '#888888';
  const previousAlpha = ctx.globalAlpha;

  const drawNodes = (nodes: LayoutNode[], alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = opts.branchWidth;
    if (!opts.nodeColorById) {
      ctx.strokeStyle = fallbackColor;
      drawBranchPass(ctx, nodes, layout, wx, wy);
      return;
    }

    const byColor = new Map<string, LayoutNode[]>();
    for (const node of nodes) {
      const color = opts.nodeColorById.get(node.id) ?? fallbackColor;
      const bucket = byColor.get(color);
      if (bucket) bucket.push(node);
      else byColor.set(color, [node]);
    }
    for (const [color, bucket] of byColor) {
      ctx.strokeStyle = color;
      drawBranchPass(ctx, bucket, layout, wx, wy);
    }
  };

  if (opts.dimmedNodeIds && opts.dimmedNodeIds.size > 0) {
    drawNodes(
      layout.nodes.filter((node) => !opts.dimmedNodeIds?.has(node.id)),
      opts.treeOpacity,
    );
    drawNodes(
      layout.nodes.filter((node) => opts.dimmedNodeIds?.has(node.id)),
      opts.treeOpacity * 0.3,
    );
  } else {
    drawNodes(layout.nodes, opts.treeOpacity);
  }

  const rootNode = layout.nodes[0];
  if (rootNode) {
    ctx.globalAlpha = opts.treeOpacity;
    ctx.strokeStyle = fallbackColor;
    ctx.lineWidth = opts.branchWidth;
    ctx.beginPath();
    ctx.moveTo(wx(rootNode.x) - 8, wy(rootNode.y));
    ctx.lineTo(wx(rootNode.x), wy(rootNode.y));
    ctx.stroke();
  }
  ctx.globalAlpha = previousAlpha;
}

function drawTreeTips(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  scaleX: number,
  scaleY: number,
  originX: number,
  originY: number,
  opts: SnapshotTreeOptions,
): void {
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = opts.treeOpacity;

  for (const node of layout.nodes) {
    if (!node.isTip || node.isCollapsed) continue;
    const color = opts.nodeColorById?.get(node.id) ?? '#888888';
    const glyph = opts.nodeGlyphById?.get(node.id) ?? 'circle';
    const posterior =
      typeof node.annotations.posterior === 'number' ? node.annotations.posterior : null;
    const filled = posterior === null || posterior >= 0.5;
    const cx = originX + node.x * scaleX;
    const cy = originY + node.y * scaleY;

    ctx.beginPath();
    traceTipGlyphPath(ctx, cx, cy, opts.tipRadius, glyph);
    if (filled) {
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  ctx.globalAlpha = previousAlpha;
}

function drawTreeSelection(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  scaleX: number,
  scaleY: number,
  originX: number,
  originY: number,
  opts: SnapshotTreeOptions,
): void {
  const wx = (x: number) => originX + x * scaleX;
  const wy = (y: number) => originY + y * scaleY;
  const accentColor = '#1e90ff';

  if (opts.selectedIds.length > 0) {
    const selected = new Set(opts.selectedIds);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const node of layout.nodes) {
      if (!selected.has(node.id) || !node.parentId) continue;
      const parent = layout.nodeMap.get(node.parentId);
      if (!parent) continue;
      ctx.moveTo(wx(parent.x), wy(node.y));
      ctx.lineTo(wx(node.x), wy(node.y));
    }
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    for (const node of layout.nodes) {
      if (!selected.has(node.id)) continue;
      const cx = wx(node.x);
      const cy = wy(node.y);
      ctx.moveTo(cx + opts.tipRadius, cy);
      ctx.arc(cx, cy, opts.tipRadius, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  if (opts.hoveredId !== null) {
    const hovered = layout.nodeMap.get(opts.hoveredId);
    if (hovered) {
      const previousAlpha = ctx.globalAlpha;
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wx(hovered.x), wy(hovered.y), opts.tipRadius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = previousAlpha;
    }
  }
}

function drawTreeTimeMarkers(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  innerW: number,
  innerH: number,
  originX: number,
  originY: number,
  opts: SnapshotTreeOptions,
): void {
  const calibration = new TreeCalibration();
  calibration.setAnchor('date', layout.nodeMap, layout.maxX);
  if (!calibration.active) return;

  const xForYear = (year: number) => {
    const height = calibration.decYearToHeight(year);
    if (!Number.isFinite(height)) return null;
    const divergenceX = layout.maxX - height;
    const screenX = originX + (divergenceX / layout.maxX) * innerW;
    if (screenX < originX || screenX > originX + innerW) return null;
    return screenX;
  };

  const { mode, window: timeWindow } = useTimelineStore.getState();
  if (mode === 'Window' && timeWindow) {
    const xStart = xForYear(timeWindow.start);
    const xEnd = xForYear(timeWindow.end);
    if (xStart !== null && xEnd !== null) {
      const left = Math.min(xStart, xEnd);
      const right = Math.max(xStart, xEnd);
      ctx.fillStyle = 'rgba(30,144,255,0.12)';
      ctx.fillRect(left, originY, right - left, innerH);
    }
  }

  const x = xForYear(opts.playhead);
  if (x === null) return;
  ctx.strokeStyle = '#1e90ff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, originY);
  ctx.lineTo(x, originY + innerH);
  ctx.stroke();
}

function renderTreeAtSize(width: number, height: number, playhead?: number): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;

  const { layout: rawLayout, graph } = useTreeStore.getState();
  const { branchWidth, tipRadius, treeOpacity, treeSortOrder, showBranches, showTips } =
    useUiStore.getState();
  const { hoveredId, selectedIds } = useSelectionStore.getState();
  const { playhead: storePlayhead } = useTimelineStore.getState();

  if (!rawLayout) return off;

  const layout =
    treeSortOrder === 'file' || !graph
      ? rawLayout
      : computeLayoutFromGraph(graph, null, { sortBy: treeSortOrder });

  const ctx = off.getContext('2d');
  if (!ctx) return off;

  const innerW = Math.max(width - 2 * HORIZONTAL_PADDING_PX, 1);
  const innerH = Math.max(height - 2 * VERTICAL_PADDING_PX, 1);
  const scaleX = layout.maxX > 0 ? innerW / layout.maxX : 1;
  const scaleY = layout.maxY > 0 ? innerH / layout.maxY : 1;
  const originX = HORIZONTAL_PADDING_PX;
  const originY = VERTICAL_PADDING_PX;

  const { nodeColorById, nodeGlyphById, dimmedNodeIds } = computeTreeRenderState(playhead);

  ctx.clearRect(0, 0, width, height);

  const opts: SnapshotTreeOptions = {
    branchWidth,
    tipRadius,
    treeOpacity: treeOpacity / 100,
    showBranches,
    showTips,
    nodeColorById,
    nodeGlyphById,
    dimmedNodeIds,
    hoveredId,
    selectedIds,
    playhead: playhead ?? storePlayhead,
  };

  if (opts.showBranches) drawTreeBranches(ctx, layout, scaleX, scaleY, originX, originY, opts);
  if (opts.showTips) drawTreeTips(ctx, layout, scaleX, scaleY, originX, originY, opts);
  drawTreeSelection(ctx, layout, scaleX, scaleY, originX, originY, opts);
  drawTreeTimeMarkers(ctx, layout, innerW, innerH, originX, originY, opts);

  return off;
}

// Runtime-only API — not in maplibre-gl's public TS types but present since v2.
type MapWithPixelRatio = {
  getPixelRatio(): number;
  setPixelRatio(r: number): void;
  triggerRepaint(): void;
  once(event: string, listener: () => void): void;
};

export function composeFrame(
  treeSlotW: number,
  mapSlotW: number,
  height: number,
  qualityMultiplier: number,
  playhead: number,
  bgColor: string,
  showOverlays: boolean,
  legendCanvas: HTMLCanvasElement | null,
): HTMLCanvasElement {
  const outW = (treeSlotW + mapSlotW) * qualityMultiplier;
  const outH = height * qualityMultiplier;
  const treeW = treeSlotW * qualityMultiplier;
  const mapW = mapSlotW * qualityMultiplier;

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;

  const ctx = out.getContext('2d');
  if (!ctx) return out;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, outW, outH);

  const treeCanvas = renderTreeAtSize(treeW, outH, playhead);
  ctx.drawImage(treeCanvas, 0, 0, treeW, outH);

  const mapCanvases = getMapCanvases();
  if (mapCanvases) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mapCanvases.basemap, treeW, 0, mapW, outH);
    ctx.drawImage(mapCanvases.overlay, treeW, 0, mapW, outH);
  }

  if (showOverlays) {
    const legend = legendCanvas ?? renderLegendCanvas(qualityMultiplier);
    const envState = gatherEnvLegendState(qualityMultiplier);
    const envLegend = envState ? renderEnvLegendCanvas(envState) : null;
    const marginLeft = 16 * qualityMultiplier;
    const marginBottom = 16 * qualityMultiplier;
    const gap = 8 * qualityMultiplier;

    let treeY = outH - marginBottom;
    if (legend.height > 0) {
      treeY = outH - legend.height - marginBottom;
      ctx.drawImage(legend, marginLeft, treeY);
    }
    if (envLegend && envLegend.height > 0) {
      const envY = (legend.height > 0 ? treeY : outH - marginBottom) - envLegend.height - gap;
      ctx.drawImage(envLegend, marginLeft, envY);
    }
    drawTimeOverlay(ctx, playhead, outW, { qualityMultiplier });
  }

  return out;
}

export async function snapPng(qualityMultiplier = 1, showOverlays = false): Promise<string | null> {
  const treePanel = document.querySelector('[data-testid="tree-panel"]');
  const mapPanel = getMapPanelElement();
  const analysisPanel = getAnalysisPanelElement();
  const treeCanvas = treePanel
    ? (treePanel.querySelector('canvas') as HTMLCanvasElement | null)
    : null;
  const mapCanvases = getMapCanvases();

  if (!treePanel && !mapPanel && !analysisPanel) return 'Canvases not ready — load a tree first.';
  if (mapPanel && !mapCanvases) return 'Canvases not ready — load a tree first.';

  const treeRect = treePanel?.getBoundingClientRect() ?? null;
  const mapRect = mapPanel?.getBoundingClientRect() ?? null;
  const analysisRect = analysisPanel?.getBoundingClientRect() ?? null;
  const dpr = window.devicePixelRatio || 1;

  if (
    mapPanel &&
    mapCanvases &&
    (mapCanvases.overlay.width === 0 || mapCanvases.overlay.height === 0)
  ) {
    return 'Deck.gl overlay canvas has zero size — map may not have rendered yet.';
  }

  const bgColor =
    getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim() || '#0a0b0d';
  const { playhead } = useTimelineStore.getState();

  const baseTreeSlotW = treeRect ? Math.round(treeRect.width * dpr) : 0;
  const baseMapSlotW = mapRect ? Math.round(mapRect.width * dpr) : 0;
  const baseTopH = Math.round(Math.max(treeRect?.height ?? 0, mapRect?.height ?? 0) * dpr);
  const baseTopW = baseTreeSlotW + baseMapSlotW;
  const baseAnalysisW = analysisRect ? Math.round(analysisRect.width * dpr) : 0;
  const baseAnalysisH = analysisRect ? Math.round(analysisRect.height * dpr) : 0;
  const baseTotalW = Math.max(baseTopW, baseAnalysisW);
  const baseTotalH = baseTopH + baseAnalysisH;

  if (baseTotalW <= 0 || baseTotalH <= 0) return 'Canvases not ready — load a tree first.';

  const q = qualityMultiplier;
  const outW = baseTotalW * q;
  const outH = baseTotalH * q;
  const topH = baseTopH * q;
  const treeSlotW = baseTreeSlotW * q;
  const mapSlotX = treeSlotW;
  const mapSlotW = baseMapSlotW * q;
  const analysisW = (baseAnalysisW || baseTotalW) * q;
  const analysisH = baseAnalysisH * q;

  const map = mapPanel
    ? (useMapStore.getState().mapInstance as unknown as MapWithPixelRatio | null)
    : null;
  let mapBumped = false;
  let originalRatio = dpr;

  if (map && q > 1) {
    originalRatio = map.getPixelRatio();
    map.setPixelRatio(originalRatio * q);
    map.triggerRepaint();
    await new Promise<void>((resolve) => map.once('idle', resolve));
    mapBumped = true;
  }

  try {
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d');
    if (!ctx) return 'Canvas 2D context unavailable.';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, outW, outH);

    if (treePanel && treeSlotW > 0 && topH > 0) {
      const treeSource =
        q === 1 && treeCanvas ? treeCanvas : renderTreeAtSize(treeSlotW, topH, playhead);
      ctx.drawImage(treeSource, 0, 0, treeSource.width, treeSource.height, 0, 0, treeSlotW, topH);
    }

    if (mapPanel && mapCanvases && mapSlotW > 0 && topH > 0) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mapCanvases.basemap, mapSlotX, 0, mapSlotW, topH);
      ctx.drawImage(mapCanvases.overlay, mapSlotX, 0, mapSlotW, topH);
    }

    if (analysisPanel && analysisH > 0) {
      const analysisCanvas = await rasterizeAnalysisPanel(analysisPanel, analysisW, analysisH);
      if (!analysisCanvas) return 'Analysis panel not ready — try again after it renders.';
      ctx.drawImage(analysisCanvas, 0, topH, analysisW, analysisH);
    }

    if (showOverlays) {
      const legend = renderLegendCanvas(q);
      const envState = gatherEnvLegendState(q);
      const envLegend = envState ? renderEnvLegendCanvas(envState) : null;
      const marginLeft = 16 * q;
      const marginBottom = 16 * q;
      const gap = 8 * q;
      let treeY = outH - marginBottom;
      if (legend.height > 0) {
        treeY = outH - legend.height - marginBottom;
        ctx.drawImage(legend, marginLeft, treeY);
      }
      if (envLegend && envLegend.height > 0) {
        const envY = (legend.height > 0 ? treeY : outH - marginBottom) - envLegend.height - gap;
        ctx.drawImage(envLegend, marginLeft, envY);
      }
      drawTimeOverlay(ctx, playhead, outW, { qualityMultiplier: q });
    }

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spreadgl2-snapshot-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  } finally {
    if (map && mapBumped) {
      map.setPixelRatio(originalRatio);
      map.triggerRepaint();
    }
  }

  return null;
}

function drawScaledFit(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  destX: number,
  destY: number,
  destW: number,
  destH: number,
): void {
  const srcAspect = src.width / src.height;
  const destAspect = destW / destH;
  let drawW = destW,
    drawH = destH;
  if (srcAspect > destAspect) {
    drawH = destW / srcAspect;
  } else {
    drawW = destH * srcAspect;
  }
  const ox = destX + (destW - drawW) / 2;
  const oy = destY + (destH - drawH) / 2;
  ctx.drawImage(src, 0, 0, src.width, src.height, ox, oy, drawW, drawH);
}

export async function runCapture(
  config: RecordConfig,
  onProgress: (pct: number) => void,
): Promise<(Blob & { ext: string }) | null> {
  const { startYear, endYear, width, height, fps } = config;
  const qualityMultiplier = config.qualityMultiplier ?? 1;
  const showOverlays = config.showOverlays ?? false;

  const treePanel = document.querySelector('[data-testid="tree-panel"]');
  const mapPanel = getMapPanelElement();
  const mapCanvases = getMapCanvases();
  if (!mapCanvases || !treePanel || !mapPanel) return null;

  const treeRect = treePanel.getBoundingClientRect();
  const mapRect = mapPanel.getBoundingClientRect();
  const totalCssW = treeRect.width + mapRect.width;
  const treeRatio = totalCssW > 0 ? treeRect.width / totalCssW : 0.5;
  const treeSlotW = Math.round(width * treeRatio);
  const mapSlotW = width - treeSlotW;

  const bgColor =
    getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim() || '#0a0b0d';

  const outW = width * qualityMultiplier;
  const outH = height * qualityMultiplier;

  const offscreen = document.createElement('canvas');
  offscreen.width = outW;
  offscreen.height = outH;
  const ctx = offscreen.getContext('2d');
  if (!ctx) return null;

  const stream: MediaStream = offscreen.captureStream(fps);

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch {
    return null;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const {
    setPlayhead,
    speed: storeSpeed,
    mode: timelineMode,
    window: renderedWindow,
    windowSize,
  } = useTimelineStore.getState();
  setPlayhead(startYear);

  recorder.start();

  // Match live playback speed so the video looks the same as the app.
  // If speed is 0 (paused), fall back to 1 yr/sec so the export is always non-empty.
  const yearsPerSecond = storeSpeed > 0 ? effectivePlaybackSpeed(storeSpeed) : 1;
  const yearsPerFrame = yearsPerSecond / fps;
  const windowTail =
    timelineMode === 'Window'
      ? Math.max(0, windowSize ?? (renderedWindow ? renderedWindow.end - renderedWindow.start : 0))
      : 0;
  const captureEndYear = endYear + windowTail;
  const totalFrames = Math.max(1, Math.ceil((captureEndYear - startYear) / yearsPerFrame));
  const frameStep = yearsPerFrame;

  const stoppedPromise = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const legendCanvas = showOverlays ? renderLegendCanvas(qualityMultiplier) : null;
  const envLegendCanvas = showOverlays
    ? (() => {
        const s = gatherEnvLegendState(qualityMultiplier);
        return s ? renderEnvLegendCanvas(s) : null;
      })()
    : null;

  const ctx2d = ctx;
  const panel = treePanel;

  const captureMap = useMapStore.getState().mapInstance as unknown as MapWithPixelRatio | null;
  let captureOriginalRatio = window.devicePixelRatio || 1;
  let captureMapBumped = false;

  if (captureMap && qualityMultiplier > 1) {
    captureOriginalRatio = captureMap.getPixelRatio();
    captureMap.setPixelRatio(captureOriginalRatio * qualityMultiplier);
    captureMap.triggerRepaint();
    captureMapBumped = true;
  }

  function compositeFrame(playhead: number) {
    if (qualityMultiplier > 1) {
      const treePx = treeSlotW * qualityMultiplier;
      const mapPx = mapSlotW * qualityMultiplier;

      ctx2d.fillStyle = bgColor;
      ctx2d.fillRect(0, 0, outW, outH);

      const treeOff = renderTreeAtSize(treePx, outH, playhead);
      ctx2d.drawImage(treeOff, 0, 0, treePx, outH);

      const liveMap = getMapCanvases();
      if (liveMap) {
        ctx2d.imageSmoothingQuality = 'high';
        ctx2d.drawImage(liveMap.basemap, treePx, 0, mapPx, outH);
        ctx2d.drawImage(liveMap.overlay, treePx, 0, mapPx, outH);
      }
    } else {
      const liveTree =
        (panel.querySelector('canvas') as HTMLCanvasElement | null) ??
        renderTreeAtSize(treeSlotW, outH, playhead);
      const liveMap = getMapCanvases();
      ctx2d.fillStyle = bgColor;
      ctx2d.fillRect(0, 0, outW, outH);
      drawScaledFit(ctx2d, liveTree, 0, 0, treeSlotW, outH);
      if (liveMap) {
        drawScaledFit(ctx2d, liveMap.basemap, treeSlotW, 0, mapSlotW, outH);
        drawScaledFit(ctx2d, liveMap.overlay, treeSlotW, 0, mapSlotW, outH);
      }
    }

    if (showOverlays) {
      const marginLeft = 16 * qualityMultiplier;
      const marginBottom = 16 * qualityMultiplier;
      const gap = 8 * qualityMultiplier;
      let treeY = outH - marginBottom;
      if (legendCanvas && legendCanvas.height > 0) {
        treeY = outH - legendCanvas.height - marginBottom;
        ctx2d.drawImage(legendCanvas, marginLeft, treeY);
      }
      if (envLegendCanvas && envLegendCanvas.height > 0) {
        const envY =
          (legendCanvas && legendCanvas.height > 0 ? treeY : outH - marginBottom) -
          envLegendCanvas.height -
          gap;
        ctx2d.drawImage(envLegendCanvas, marginLeft, envY);
      }
      drawTimeOverlay(ctx2d, playhead, outW, { qualityMultiplier });
    }
  }

  try {
    await new Promise<void>((resolve) => {
      let frame = 0;

      function tick() {
        if (frame >= totalFrames) {
          setPlayhead(captureEndYear);
          compositeFrame(captureEndYear);
          recorder.stop();
          resolve();
          return;
        }

        const t = Math.min(captureEndYear, startYear + frame * frameStep);
        setPlayhead(t);
        onProgress(frame / totalFrames);
        compositeFrame(t);

        frame++;
        requestAnimationFrame(tick);
      }

      requestAnimationFrame(tick);
    });

    await stoppedPromise;
  } finally {
    if (captureMap && captureMapBumped) {
      captureMap.setPixelRatio(captureOriginalRatio);
      captureMap.triggerRepaint();
    }
  }

  const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type: mimeType });
  return Object.assign(blob, { ext });
}

export function ExportPanel() {
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [qualityMultiplier, setQualityMultiplier] = useState<number>(2);
  const [showOverlays, setShowOverlays] = useState(true);

  const handleSnapshot = useCallback(() => {
    setSnapshotError(null);
    snapPng(qualityMultiplier, showOverlays).then((err) => {
      if (err) setSnapshotError(err);
    });
  }, [qualityMultiplier, showOverlays]);

  const fileName = useTreeStore((s) => s.fileName);
  const exampleId = useTreeStore((s) => s.exampleId);
  const rawTreeText = useTreeStore((s) => s.rawTreeText);
  const discreteGeoLookup = useTreeStore((s) => s.discreteGeoLookup);
  const discreteGeoSource = useTreeStore((s) => s.discreteGeoSource);
  const logTable = useTreeStore((s) => s.logTable);
  const logFileName = useTreeStore((s) => s.logFileName);
  const customOverlays = useTreeStore((s) => s.customOverlays);
  const choroplethOverlays = useTreeStore((s) => s.choroplethOverlays);
  const envColumns = useEnvStore((s) => s.columns);
  const raster = useRasterStore((s) => s.raster);
  const confirmedTraitKey = useTreeStore((s) => s.confirmedTraitKey);
  const confirmedTipDatePattern = useTreeStore((s) => s.confirmedTipDatePattern);
  const tipDateRows = useTreeStore((s) => s.tipDateRows);

  const playhead = useTimelineStore((s) => s.playhead);
  const timeWindow = useTimelineStore((s) => s.window);
  const windowSize = useTimelineStore((s) => s.windowSize);
  const speed = useTimelineStore((s) => s.speed);
  const mode = useTimelineStore((s) => s.mode);
  const arcs = useTimelineStore((s) => s.arcs);
  const clade = useTimelineStore((s) => s.clade);
  const subtreeRootIds = useTimelineStore((s) => s.subtreeRootIds);
  const subtreeRootId = useTimelineStore((s) => s.subtreeRootId);
  const bounds = useTimelineStore((s) => s.bounds);

  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const selectedBranchIds = useSelectionStore((s) => s.selectedBranchIds);
  const focusedTaxa = useSelectionStore((s) => s.focusedTaxa);

  const activePanel = useUiStore((s) => s.activePanel);
  const visibleViews = useUiStore((s) => s.visibleViews);
  const layerVisibility = useUiStore((s) => s.layerVisibility);
  const layerOpacity = useUiStore((s) => s.layerOpacity);
  const colorByKey = useUiStore((s) => s.colorByKey);
  const glyphByKey = useUiStore((s) => s.glyphByKey);
  const palette = useUiStore((s) => s.palette);
  const paletteReverse = useUiStore((s) => s.paletteReverse);
  const showBranches = useUiStore((s) => s.showBranches);
  const branchWidth = useUiStore((s) => s.branchWidth);
  const arcWidth = useUiStore((s) => s.arcWidth);
  const showTips = useUiStore((s) => s.showTips);
  const tipRadius = useUiStore((s) => s.tipRadius);
  const treeOpacity = useUiStore((s) => s.treeOpacity);
  const treeSortOrder = useUiStore((s) => s.treeSortOrder);
  const theme = useUiStore((s) => s.theme);
  const deselectedValues = useUiStore((s) => s.deselectedValues);
  const posteriorThreshold = useUiStore((s) => s.posteriorThreshold);
  const envActiveKey = useEnvStore((s) => s.activeKey);
  const envPaletteOverride = useEnvStore((s) => s.paletteOverride);

  const min = bounds?.min ?? 2000;
  const max = bounds?.max ?? 2020;

  const [startYear, setStartYear] = useState<number>(min);
  const [endYear, setEndYear] = useState<number>(max);
  const [resolutionIdx, setResolutionIdx] = useState(0);
  const [fps, setFps] = useState<number>(30);
  const [recordState, setRecordState] = useState<RecordingState>(
    typeof MediaRecorder !== 'undefined' ? 'idle' : 'unsupported',
  );
  const [progress, setProgress] = useState(0);
  const abortRef = useRef(false);

  function gatherInput(): SerializeInput {
    return buildSerializeInput({
      fileName,
      exampleId,
      rawTreeText,
      confirmedTraitKey,
      confirmedTipDatePattern,
      playhead,
      window: timeWindow,
      windowSize,
      speed,
      mode,
      arcs,
      clade,
      subtreeRootIds,
      subtreeRootId,
      selectedIds,
      selectedBranchIds,
      focusedTaxa,
      deselectedValues: Array.from(deselectedValues),
      posteriorThreshold,
      activePanel,
      visibleViews,
      layerVisibility,
      layerOpacity,
      colorByKey,
      glyphByKey,
      palette,
      paletteReverse,
      showBranches,
      branchWidth,
      arcWidth,
      showTips,
      tipRadius,
      treeOpacity,
      treeSortOrder,
      theme,
      envActiveKey,
      envPaletteOverride,
      dateOverrides: buildDateOverrides(tipDateRows),
    });
  }

  async function handleSaveProject() {
    // Embed the processed coordinate lookup, BSSVS log, and map layers so a
    // shared project is self-contained (no re-prompt / re-load on import).
    const embedded = await buildEmbeddedData({
      geoLookup: discreteGeoLookup,
      geoSource: discreteGeoSource?.values().next().value ?? 'csv',
      logTable,
      logFileName,
      customOverlays,
      choroplethOverlays,
      envColumns,
      raster,
    });
    const file = await serializeProjectFile({ ...gatherInput(), embedded });
    const json = JSON.stringify(file);
    const base = fileName ? fileName.replace(/\.[^.]+$/, '') : 'project';
    void saveFileAs(json, `${base}.spreadgl2.json`);
  }

  const handleRecord = useCallback(async () => {
    if (recordState !== 'idle') return;
    const clampedStart = Math.max(min, Math.min(startYear, max));
    const clampedEnd = Math.max(min, Math.min(endYear, max));
    if (clampedStart >= clampedEnd) return;

    abortRef.current = false;
    setRecordState('recording');
    setProgress(0);

    const res = RESOLUTIONS[resolutionIdx] ?? RESOLUTIONS[0];
    const result = await runCapture(
      {
        startYear: clampedStart,
        endYear: clampedEnd,
        width: res.width,
        height: res.height,
        fps,
        qualityMultiplier,
        showOverlays,
      },
      (pct) => setProgress(pct),
    );

    if (!result || abortRef.current) {
      setRecordState('idle');
      return;
    }

    const url = URL.createObjectURL(result);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spreadgl2-export.${result.ext}`;
    a.click();
    URL.revokeObjectURL(url);

    setRecordState('done');
    setTimeout(() => setRecordState('idle'), 3000);
  }, [
    recordState,
    startYear,
    endYear,
    resolutionIdx,
    fps,
    min,
    max,
    qualityMultiplier,
    showOverlays,
  ]);

  return (
    <div className={styles.panel} data-testid="export-panel">
      <div className={styles.section}>
        <button
          type="button"
          className={styles.actionBtn}
          data-testid="export-save-project"
          onClick={() => void handleSaveProject()}
        >
          Save project
        </button>
      </div>

      <div className={styles.section}>
        <div className={styles.row}>
          <label className={styles.fieldLabel} htmlFor="export-quality">
            Quality
          </label>
          <select
            id="export-quality"
            className={styles.select}
            data-testid="export-quality"
            value={qualityMultiplier}
            onChange={(e) => setQualityMultiplier(Number(e.target.value))}
          >
            {QUALITY_OPTIONS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.row}>
          <label className={styles.fieldLabel} htmlFor="export-overlays">
            Overlays
          </label>
          <input
            id="export-overlays"
            type="checkbox"
            data-testid="export-overlays"
            checked={showOverlays}
            onChange={(e) => setShowOverlays(e.target.checked)}
          />
        </div>

        <button
          type="button"
          className={styles.actionBtn}
          data-testid="export-png-snapshot"
          onClick={handleSnapshot}
        >
          <Camera size={15} />
          PNG snapshot
        </button>
        {snapshotError && (
          <p className={styles.errorText} data-testid="export-snapshot-error">
            {snapshotError}
          </p>
        )}
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Record video</span>

        {recordState === 'unsupported' && (
          <p className={styles.unsupported} data-testid="export-unsupported">
            MediaRecorder is not supported in this browser. Try Chrome or Firefox.
          </p>
        )}

        {recordState !== 'unsupported' && (
          <>
            <div className={styles.row}>
              <label className={styles.fieldLabel} htmlFor="export-start">
                Start
              </label>
              <input
                id="export-start"
                type="number"
                className={styles.yearInput}
                data-testid="export-start"
                value={startYear}
                step={0.1}
                min={min}
                max={endYear}
                onChange={(e) => setStartYear(Number(e.target.value))}
                disabled={recordState === 'recording'}
              />
              <span className={styles.isoHint}>{decimalYearToISO(startYear)}</span>
            </div>

            <div className={styles.row}>
              <label className={styles.fieldLabel} htmlFor="export-end">
                End
              </label>
              <input
                id="export-end"
                type="number"
                className={styles.yearInput}
                data-testid="export-end"
                value={endYear}
                step={0.1}
                min={startYear}
                max={max}
                onChange={(e) => setEndYear(Number(e.target.value))}
                disabled={recordState === 'recording'}
              />
              <span className={styles.isoHint}>{decimalYearToISO(endYear)}</span>
            </div>

            <div className={styles.row}>
              <label className={styles.fieldLabel} htmlFor="export-resolution">
                Resolution
              </label>
              <select
                id="export-resolution"
                className={styles.select}
                data-testid="export-resolution"
                value={resolutionIdx}
                onChange={(e) => setResolutionIdx(Number(e.target.value))}
                disabled={recordState === 'recording'}
              >
                {RESOLUTIONS.map((r, i) => (
                  <option key={r.label} value={i}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.row}>
              <label className={styles.fieldLabel} htmlFor="export-fps">
                FPS
              </label>
              <select
                id="export-fps"
                className={styles.select}
                data-testid="export-fps"
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                disabled={recordState === 'recording'}
              >
                {FPS_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            {recordState === 'recording' && (
              <div className={styles.progressRow} data-testid="export-progress">
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <span className={styles.progressLabel}>{Math.round(progress * 100)}%</span>
              </div>
            )}

            <button
              type="button"
              className={[
                styles.recordBtn,
                recordState === 'recording' ? styles.recordBtnActive : '',
                recordState === 'done' ? styles.recordBtnDone : '',
              ]
                .filter(Boolean)
                .join(' ')}
              data-testid="export-record-btn"
              onClick={() => void handleRecord()}
              disabled={recordState === 'recording'}
            >
              {recordState === 'recording'
                ? 'Recording…'
                : recordState === 'done'
                  ? 'Saved'
                  : 'Record video'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
