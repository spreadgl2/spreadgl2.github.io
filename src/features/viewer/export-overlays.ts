import type { EnvPaletteId } from '../../lib/env/palettes';
import { getPaletteColor, suggestPaletteForVariable } from '../../lib/env/palettes';
import { decimalYearToISO } from '../../lib/format/decimal-year';
import { buildGlyphByValue } from '../../lib/glyph-map';
import { type TipGlyph, traceTipGlyphPath } from '../../lib/tree-render/glyphs';
import { paletteColorFor } from '../../lib/tree-render/palettes';
import { useEnvStore } from '../../store/env';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';

const BASE_PANEL_PADDING = 8;
const BASE_ROW_HEIGHT = 22;
const BASE_SWATCH_SIZE = 12;
const SWATCH_GAP = 6;
const BASE_FONT_SIZE = 15;
const MAX_WIDTH = 280;
const BASE_CORNER_RADIUS = 12;
const EXPORT_LEGEND_VISUAL_SCALE = 2;
const GRADIENT_STOPS = 24;

function getThemeBg(): { fill: string; text: string } {
  const bgBase = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim();
  const isDark =
    !bgBase || bgBase === '#0a0b0d' || bgBase.startsWith('#0') || bgBase.startsWith('rgb(0');
  return isDark
    ? { fill: 'rgba(0,0,0,0.6)', text: '#e8e8e8' }
    : { fill: 'rgba(255,255,255,0.75)', text: '#073642' };
}

function drawGlyphSwatch(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  glyph: TipGlyph,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  traceTipGlyphPath(ctx, cx, cy, r, glyph);
  ctx.fill();
}

interface LegendEntry {
  label: string;
  color: string;
  glyph?: TipGlyph | undefined;
}

function gatherLegendEntries(): LegendEntry[] {
  const { colorByKey, glyphByKey, palette, paletteReverse } = useUiStore.getState();
  const { graph, traitInfo, allDiscreteKeys } = useTreeStore.getState();
  const { focusedTaxa } = useSelectionStore.getState();

  const entries: LegendEntry[] = [];

  if (colorByKey !== 'single-color' && graph && traitInfo) {
    let colorValues: string[] | null = null;

    if (traitInfo.kind === 'discrete') {
      colorValues = traitInfo.values;
    } else if (
      traitInfo.kind === 'continuous' &&
      colorByKey !== '__time__' &&
      allDiscreteKeys.includes(colorByKey)
    ) {
      const seen = new Set<string>();
      for (const node of graph.nodes) {
        const v = node.annotations[colorByKey];
        if (typeof v === 'string') seen.add(v);
      }
      colorValues = Array.from(seen).sort();
    }

    if (colorValues) {
      const activeKey =
        traitInfo.kind === 'discrete' && colorByKey !== 'single-color' && colorByKey !== '__time__'
          ? colorByKey
          : traitInfo.kind === 'discrete'
            ? traitInfo.key
            : colorByKey;

      const glyphMap =
        glyphByKey !== 'none' && glyphByKey === activeKey && graph
          ? buildGlyphByValue(graph, glyphByKey)
          : null;

      for (const value of colorValues) {
        const color = paletteColorFor(value, colorValues, palette, paletteReverse);
        const glyph = glyphMap?.get(value);
        entries.push(
          glyph !== undefined ? { label: value, color, glyph } : { label: value, color },
        );
      }
    }
  } else if (
    glyphByKey !== 'none' &&
    graph &&
    (colorByKey === 'single-color' || colorByKey === '__time__')
  ) {
    const glyphMap = buildGlyphByValue(graph, glyphByKey);
    for (const [value, glyph] of glyphMap) {
      entries.push({ label: value, color: '#888888', glyph });
    }
  }

  if (focusedTaxa.length > 0) {
    entries.push({ label: `Tracked: ${focusedTaxa.length} taxa`, color: '#1e90ff' });
  }

  return entries;
}

function gatherTimeGradient(): {
  stops: string[];
  minLabel: string;
  maxLabel: string;
  label: string;
} | null {
  const { colorByKey, palette, paletteReverse } = useUiStore.getState();
  const { traitInfo } = useTreeStore.getState();
  const { bounds } = useTimelineStore.getState();

  if (traitInfo?.kind !== 'continuous' || colorByKey !== '__time__' || !bounds) return null;

  return {
    label: 'Time',
    stops: Array.from({ length: GRADIENT_STOPS }, (_, i) =>
      paletteColorFor(i / (GRADIENT_STOPS - 1), null, palette, paletteReverse),
    ),
    minLabel: decimalYearToISO(bounds.min),
    maxLabel: decimalYearToISO(bounds.max),
  };
}

export function renderLegendCanvas(qualityMultiplier = 1): HTMLCanvasElement {
  const entries = gatherLegendEntries();
  const gradient = entries.length === 0 ? gatherTimeGradient() : null;
  const theme = getThemeBg();
  const q = qualityMultiplier * EXPORT_LEGEND_VISUAL_SCALE;

  const panelPadding = BASE_PANEL_PADDING * q;
  const rowHeight = BASE_ROW_HEIGHT * q;
  const swatchSize = BASE_SWATCH_SIZE * q;
  const fontSize = BASE_FONT_SIZE * q;
  const cornerRadius = BASE_CORNER_RADIUS * q;
  const panelW = MAX_WIDTH * q;
  const gradientBarH = 16 * q;
  const gradientGap = 8 * q;
  const panelH =
    entries.length > 0
      ? panelPadding * 2 + entries.length * rowHeight
      : gradient
        ? panelPadding * 2 + rowHeight + gradientBarH + gradientGap + rowHeight
        : 0;

  const canvas = document.createElement('canvas');
  canvas.width = panelW;
  canvas.height = panelH;

  if (entries.length === 0 && !gradient) return canvas;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = theme.fill;
  ctx.beginPath();
  ctx.roundRect(0, 0, panelW, panelH, cornerRadius);
  ctx.fill();

  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = theme.text;

  if (gradient) {
    ctx.fillText(gradient.label, panelPadding, panelPadding + fontSize);

    const barX = panelPadding;
    const barY = panelPadding + rowHeight;
    const barW = panelW - panelPadding * 2;
    const ramp = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    for (let i = 0; i < gradient.stops.length; i++) {
      ramp.addColorStop(i / Math.max(gradient.stops.length - 1, 1), gradient.stops[i] ?? '#000000');
    }
    ctx.fillStyle = ramp;
    ctx.fillRect(barX, barY, barW, gradientBarH);

    ctx.fillStyle = theme.text;
    const labelsY = barY + gradientBarH + gradientGap + fontSize;
    ctx.fillText(gradient.minLabel, barX, labelsY);
    const maxW = ctx.measureText(gradient.maxLabel).width;
    ctx.fillText(gradient.maxLabel, barX + barW - maxW, labelsY);
    return canvas;
  }

  for (const [i, entry] of entries.entries()) {
    const rowY = panelPadding + i * rowHeight + rowHeight / 2;
    const swatchX = panelPadding + swatchSize / 2;

    if (entry.glyph) {
      drawGlyphSwatch(ctx, swatchX, rowY, swatchSize / 2, entry.glyph, entry.color);
    } else {
      ctx.fillStyle = entry.color;
      ctx.fillRect(panelPadding, rowY - swatchSize / 2, swatchSize, swatchSize);
    }

    ctx.fillStyle = theme.text;
    const labelX = panelPadding + swatchSize + SWATCH_GAP * q;
    const maxLabelW = panelW - labelX - panelPadding;
    let label = entry.label;
    while (label.length > 1 && ctx.measureText(label).width > maxLabelW) {
      label = `${label.slice(0, -2)}…`;
    }
    ctx.fillText(label, labelX, rowY + fontSize * 0.35);
  }

  return canvas;
}

export interface TimeOverlayOptions {
  marginRight?: number;
  marginTop?: number;
  fontSize?: number;
  qualityMultiplier?: number;
}

export function drawTimeOverlay(
  ctx: CanvasRenderingContext2D,
  year: number,
  canvasWidth: number,
  options: TimeOverlayOptions = {},
): void {
  const q = options.qualityMultiplier ?? 1;
  const marginRight = (options.marginRight ?? 16) * q;
  const marginTop = (options.marginTop ?? 16) * q;
  const fontSize = options.fontSize ?? 26 * q;

  const iso = decimalYearToISO(year);
  const date = new Date(iso);
  const label = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });

  const theme = getThemeBg();
  const panelPad = 10 * q;

  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  const textW = ctx.measureText(label).width;
  const panelW = textW + panelPad * 2;
  const panelH = fontSize + panelPad * 2;
  const panelX = canvasWidth - panelW - marginRight;
  const panelY = marginTop;

  ctx.fillStyle = theme.fill;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 8 * q);
  ctx.fill();

  ctx.fillStyle = theme.text;
  ctx.fillText(label, panelX + panelPad, panelY + panelPad + fontSize * 0.8);
}

export interface EnvLegendCanvasState {
  variableName: string;
  units: string | null;
  paletteId: EnvPaletteId;
  min: number;
  mid: number;
  max: number;
  qualityMultiplier: number;
  theme: 'dark' | 'light';
}

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function renderEnvLegendCanvas(state: EnvLegendCanvasState): HTMLCanvasElement | null {
  if (!state.variableName) return null;

  const q = state.qualityMultiplier;
  const BASE_W = 240;
  const BASE_H_NO_UNITS = 68;
  const BASE_H_WITH_UNITS = 82;
  const baseH = state.units ? BASE_H_WITH_UNITS : BASE_H_NO_UNITS;

  const canvasW = BASE_W * q;
  const canvasH = baseH * q;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const themeBg = getThemeBg();
  const fontSize = BASE_FONT_SIZE * q;
  const titleFontSize = Math.round(12 * q);
  const smallFontSize = Math.round(11 * q);
  const pad = 8 * q;
  const cornerRadius = BASE_CORNER_RADIUS * q;

  ctx.fillStyle = themeBg.fill;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvasW, canvasH, cornerRadius);
  ctx.fill();

  let y = pad;

  ctx.font = `small-caps 600 ${titleFontSize}px system-ui, sans-serif`;
  ctx.fillStyle = themeBg.text;
  ctx.fillText(state.variableName.toUpperCase(), pad, y + titleFontSize);
  y += titleFontSize + 4 * q;

  const rampX = pad;
  const rampW = canvasW - pad * 2;
  const rampH = 10 * q;
  const steps = Math.max(1, Math.round(rampW));
  for (let i = 0; i < steps; i++) {
    const t = steps > 1 ? i / (steps - 1) : 0;
    const [r, g, b] = getPaletteColor(state.paletteId, t);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(rampX + i, y, 1, rampH);
  }
  y += rampH + 3 * q;

  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = themeBg.text;
  const minLabel = formatNumber(state.min);
  const midLabel = formatNumber(state.mid);
  const maxLabel = formatNumber(state.max);
  const midW = ctx.measureText(midLabel).width;
  const maxW = ctx.measureText(maxLabel).width;
  ctx.fillText(minLabel, rampX, y + fontSize);
  ctx.fillText(midLabel, rampX + rampW / 2 - midW / 2, y + fontSize);
  ctx.fillText(maxLabel, rampX + rampW - maxW, y + fontSize);
  y += fontSize + 4 * q;

  if (state.units) {
    ctx.font = `${smallFontSize}px system-ui, sans-serif`;
    ctx.fillStyle = state.theme === 'dark' ? 'rgba(232,232,232,0.55)' : 'rgba(7,54,66,0.55)';
    const unitsW = ctx.measureText(state.units).width;
    ctx.fillText(state.units, rampX + rampW - unitsW, y + smallFontSize);
  }

  return canvas;
}

export function gatherEnvLegendState(qualityMultiplier: number): EnvLegendCanvasState | null {
  const { columns, activeKey, paletteOverride } = useEnvStore.getState();
  const { choroplethOverlays } = useTreeStore.getState();
  const { layerVisibility } = useUiStore.getState();

  if (!activeKey) return null;
  const col = columns.find((c) => c.key === activeKey) ?? null;
  if (!col) return null;

  const anyChoroplethVisible =
    choroplethOverlays.length > 0 &&
    choroplethOverlays.some((o) => layerVisibility[o.id] !== false);
  if (!anyChoroplethVisible) return null;

  const override = paletteOverride[col.key];
  const paletteId =
    override && override !== 'auto' ? override : suggestPaletteForVariable(col.displayName);

  const vals = Array.from(col.values.values());
  if (vals.length === 0) return null;
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);

  const bgBase = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim();
  const isDark =
    !bgBase || bgBase === '#0a0b0d' || bgBase.startsWith('#0') || bgBase.startsWith('rgb(0');

  return {
    variableName: col.displayName,
    units: col.units ?? null,
    paletteId,
    min: minVal,
    mid: (minVal + maxVal) / 2,
    max: maxVal,
    qualityMultiplier,
    theme: isDark ? 'dark' : 'light',
  };
}
