import { DataFilterExtension } from '@deck.gl/extensions';
import { TripsLayer } from '@deck.gl/geo-layers';
import { DeckGL } from '@deck.gl/react';
import {
  ArcLayer,
  BitmapLayer,
  GeoJsonLayer,
  type Layer,
  PathLayer,
  PolygonLayer,
  ScatterplotLayer,
  TextLayer,
  WebMercatorViewport,
} from 'deck.gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { Map as MapLibreMap } from 'react-map-gl/maplibre';
import { getPaletteColor, suggestPaletteForVariable } from '../../lib/env/palettes';
import { choroplethColorScale, joinChoropleth } from '../../lib/format/choropleth-join';
import { decimalYearToISO } from '../../lib/format/decimal-year';
import type { HpdPolygonRenderDatum } from '../../lib/geo/hpd-render-data';
import { computeActualRates } from '../../lib/log/actual-rates';
import { bfColor } from '../../lib/log/bf-color';
import { computeBssvsBayesFactors } from '../../lib/log/bssvs';
import { computeJumpMatrix } from '../../lib/log/markov-jumps';
import {
  isBranchGeoResolved,
  isEndGeoResolved,
  isStartGeoResolved,
} from '../../lib/phylo/geo-completeness';
import { buildSubtreeBranchIdsForRoots, isActive } from '../../lib/phylo/slice';
import type { BranchTable, Layout, PhyloGraph } from '../../lib/phylo/types';
import { computeFocusedLineageNodeIds } from '../../lib/tree-render/focused-lineage';
import { hexToRgb, paletteColorFor } from '../../lib/tree-render/palettes';
import { getRangeRelativePlayheadBucket } from '../../lib/tree-render/playhead-bucket';
import { useEnvStore } from '../../store/env';
import { useMapStore } from '../../store/map';
import { useRasterStore } from '../../store/raster';
import { rebuildFromStore } from '../../store/rebuild-branch-table';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { basemapUrlForTheme, isDarkTheme, type Palette, useUiStore } from '../../store/ui';
import { Inspector } from '../viewer/Inspector';
import {
  deckDevicePixels,
  playbackBucketCount,
  shouldUsePerformanceMode,
} from '../viewer/performance-policy';
import { branchOpacitySliderToLayerOpacity } from './branch-opacity';
import { EnvLegendOverlay } from './EnvLegendOverlay';
import { computeLassoTaxa, LassoTool } from './LassoTool';

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const ARC_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 2 });
const ARC_FILTER_EXTENSIONS = [ARC_FILTER_EXTENSION];
const TRIP_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 2 });
const TRIP_FILTER_EXTENSIONS = [TRIP_FILTER_EXTENSION];
const HPD_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 1 });
const HPD_FILTER_EXTENSIONS = [HPD_FILTER_EXTENSION];

// 35° pitch: arcs visibly arch above the surface (classic SpreadGL look).
// User can drag-rotate to top-down (pitch=0) if they want flat lines.
const DEFAULT_PITCH = 35;
const DEFAULT_VIEW_STATE: ViewState = {
  longitude: 0,
  latitude: 20,
  zoom: 1,
  pitch: DEFAULT_PITCH,
  bearing: 0,
};

function cloneViewState(viewState: ViewState): ViewState {
  return {
    longitude: viewState.longitude,
    latitude: viewState.latitude,
    zoom: viewState.zoom,
    pitch: viewState.pitch,
    bearing: viewState.bearing,
  };
}

function sameViewState(a: ViewState, b: ViewState): boolean {
  return (
    a.longitude === b.longitude &&
    a.latitude === b.latitude &&
    a.zoom === b.zoom &&
    a.pitch === b.pitch &&
    a.bearing === b.bearing
  );
}

function fitBoundsForBranchTable(
  branchTable: BranchTable,
  width: number,
  height: number,
): ViewState | null {
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  const include = (lon: number, lat: number) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  };
  for (let i = 0; i < branchTable.count; i++) {
    if (isStartGeoResolved(branchTable, i)) {
      include(branchTable.startLon[i] ?? 0, branchTable.startLat[i] ?? 0);
    }
    if (isEndGeoResolved(branchTable, i)) {
      include(branchTable.endLon[i] ?? 0, branchTable.endLat[i] ?? 0);
    }
  }
  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) return null;
  // Degenerate (single-point) data: keep a sensible local zoom rather than letting fitBounds blow up.
  if (minLon === maxLon && minLat === maxLat) {
    return { longitude: minLon, latitude: minLat, zoom: 6, pitch: DEFAULT_PITCH, bearing: 0 };
  }
  const vp = new WebMercatorViewport({
    width: Math.max(width, 200),
    height: Math.max(height, 200),
  });
  const fitted = vp.fitBounds(
    [
      [minLon, minLat],
      [maxLon, maxLat],
    ],
    { padding: 60 },
  );
  return {
    longitude: fitted.longitude,
    latitude: fitted.latitude,
    // Clamp so we don't end up at z=24 for tiny extents.
    zoom: Math.min(fitted.zoom, 12),
    pitch: DEFAULT_PITCH,
    bearing: 0,
  };
}

// Brand orange from T044 (the "saturated" look the user remembers), explicit
// 4-tuple with full alpha so deck.gl's RGB→RGBA auto-conversion isn't relied on.
const DEFAULT_COLOR: [number, number, number, number] = [255, 153, 31, 255];
const HOVER_COLOR: [number, number, number, number] = [80, 200, 255, 255];
const DEFAULT_WIDTH = 6;
const HOVER_WIDTH = 10;
const WIDTH_MIN_PIXELS = 1;
const SLICE_WIDTH = 4;
const SLICE_HOVER_WIDTH = 8;
const SLICE_WIDTH_MIN_PIXELS = 1;
const SLICE_OPACITY = 1;
const MAP_EXCLUDE_ANNOTATION = 'spreadgl_map_exclude';
const ROUTE_ARC_BASE_HEIGHT = 0.6;
const ROUTE_ARC_HEIGHT_STEP = 0.1;
const ROUTE_ARC_MAX_STACK_INDEX = 10;

// HPD polygon style: fill ~31% alpha, stroke ~63% alpha — visible on both dark
// and light basemaps. Previous values (fill=20, stroke=64) combined with the
// 0.18 opacity multiplier yielded 1.4% effective fill — invisible in practice.
const HPD_FILL_COLOR: [number, number, number, number] = [255, 153, 31, 80];
const HPD_LINE_COLOR: [number, number, number, number] = [255, 153, 31, 160];

// --boundary token (dark theme): rgba(118, 144, 174, 0.85) → [R, G, B, A] for deck.gl.
// Muted steel blue, distinct from the warm Okabe-Ito / viridis branch colors.
// Mirrors the `--boundary` CSS token in src/styles/tokens.css; if you change
// one, change both. Alpha bumped from 0.55 → 0.85 + stroke from 1 → 2 px so
// the outline reads clearly at any zoom on the dark basemap (user feedback:
// "too dim/thin").
const BOUNDARY_LINE_COLOR: [number, number, number, number] = [118, 144, 174, 217];
const BOUNDARY_LINE_WIDTH = 2;
const LOCATION_HIGHLIGHT_COLOR: [number, number, number, number] = [144, 224, 211, 230];
const LOCATION_HIGHLIGHT_STROKE: [number, number, number, number] = [255, 255, 255, 245];

interface TripDatum {
  path: [number, number][];
  timestamps: [number, number];
  branchId: number;
  branchIdx: number;
  originLon: number;
  originLat: number;
}

interface ArcDatum {
  sourcePosition: [number, number];
  targetPosition: [number, number];
  branchId: number;
  startTime: number;
  endTime: number;
  stackIndex: number;
  stackCount: number;
}

function buildTripData(branchTable: BranchTable, isAllowed: (i: number) => boolean): TripDatum[] {
  const trips: TripDatum[] = [];
  for (let i = 0; i < branchTable.count; i++) {
    if (!isAllowed(i) || !isBranchGeoResolved(branchTable, i)) continue;
    const startLon = branchTable.startLon[i] ?? 0;
    const startLat = branchTable.startLat[i] ?? 0;
    const endLon = branchTable.endLon[i] ?? 0;
    const endLat = branchTable.endLat[i] ?? 0;
    const startTime = branchTable.startTime[i] ?? 0;
    const endTime = branchTable.endTime[i] ?? 0;
    const branchId = branchTable.branchId[i] ?? i;
    trips.push({
      path: [
        [startLon, startLat],
        [endLon, endLat],
      ],
      timestamps: [startTime, endTime],
      branchId,
      branchIdx: i,
      originLon: startLon,
      originLat: startLat,
    });
  }
  return trips;
}

function buildArcData(branchTable: BranchTable, isAllowed: (i: number) => boolean): ArcDatum[] {
  const arcs: ArcDatum[] = [];
  for (let i = 0; i < branchTable.count; i++) {
    if (!isAllowed(i) || !isBranchGeoResolved(branchTable, i)) continue;
    arcs.push({
      sourcePosition: [branchTable.startLon[i] ?? 0, branchTable.startLat[i] ?? 0],
      targetPosition: [branchTable.endLon[i] ?? 0, branchTable.endLat[i] ?? 0],
      branchId: branchTable.branchId[i] ?? i,
      startTime: branchTable.startTime[i] ?? 0,
      endTime: branchTable.endTime[i] ?? 0,
      stackIndex: 0,
      stackCount: 1,
    });
  }
  return assignArcStacks(arcs);
}

function isBranchMapIncluded(
  graph: PhyloGraph | null,
  branchTable: BranchTable,
  idx: number,
): boolean {
  const branchId = branchTable.branchId[idx] ?? idx;
  return graph?.nodes[branchId]?.annotations[MAP_EXCLUDE_ANNOTATION] !== 1;
}

interface BfArcDatum {
  sourcePosition: [number, number];
  targetPosition: [number, number];
  widthPixels: number;
  color: [number, number, number];
  stackIndex: number;
  stackCount: number;
}

// One point per discrete location under the BSSVS BF overlay; hover shows the
// number of supported routes in/out.
interface BfLocationDatum {
  position: [number, number];
  name: string;
  incoming: number;
  outgoing: number;
}

interface ClusterDatum {
  position: [number, number];
  count: number;
  color: [number, number, number];
  // Discrete location name for this cluster (hover tooltip). Empty when the
  // child state can't be resolved to a name.
  name: string;
}

interface LocationHighlightDatum {
  name: string;
  position: [number, number];
  label: string;
  flash: boolean;
  fading: boolean;
}

const CLUSTER_COORD_PRECISION = 4;

function roundCoord(v: number): number {
  const f = 10 ** CLUSTER_COORD_PRECISION;
  return Math.round(v * f) / f;
}

interface ClusterUniverse {
  // Stable color per location, assigned by first-appearance order across the
  // whole branchTable. Filtering branches (per mode + playhead) only changes
  // counts, never colors — circles keep their identity as they grow/shrink.
  colorByKey: Map<string, [number, number, number]>;
  positionByKey: Map<string, [number, number]>;
  // Discrete location name per endpoint key — for the cluster hover tooltip.
  nameByKey: Map<string, string>;
  // Global max stateWeight-summed count across all branches at any location.
  // Used as the denominator for radius scaling so a single early cluster
  // with count=2 doesn't render at max radius just because the per-frame
  // max happens to be 2.
  globalMaxCount: number;
}

function buildClusterUniverse(
  branchTable: BranchTable,
  traitValues: string[],
  lookup: Map<string, [number, number]>,
  palette: Palette,
  paletteReverse: boolean,
): ClusterUniverse {
  const colorByKey = new Map<string, [number, number, number]>();
  const positionByKey = new Map<string, [number, number]>();
  const nameByKey = new Map<string, string>();

  // Identity (name/color/position) is keyed off the clean discrete trait
  // values + lookup — NOT scanned from node annotations, which may be
  // compound tie strings ("A+B"). Each value maps to its own coordinate.
  for (const value of traitValues) {
    const coord = lookup.get(value);
    if (!coord) continue;
    const lat = roundCoord(coord[0]);
    const lon = roundCoord(coord[1]);
    const key = `${lat},${lon}`;
    if (positionByKey.has(key)) continue;
    positionByKey.set(key, [lon, lat]);
    nameByKey.set(key, value);
    const hex = paletteColorFor(value, traitValues, palette, paletteReverse);
    const { r, g, b } = hexToRgb(hex.startsWith('#') ? hex : rgbStringToHex(hex));
    colorByKey.set(key, [r, g, b]);
  }

  // globalMaxCount: the densest endpoint's total stateWeight across all
  // branches — the denominator for radius scaling.
  const totalByKey = new Map<string, number>();
  for (let i = 0; i < branchTable.count; i++) {
    if (!isEndGeoResolved(branchTable, i)) continue;
    const lat = roundCoord(branchTable.endLat[i] ?? 0);
    const lon = roundCoord(branchTable.endLon[i] ?? 0);
    const key = `${lat},${lon}`;
    totalByKey.set(key, (totalByKey.get(key) ?? 0) + (branchTable.stateWeight[i] ?? 1));
  }
  let globalMaxCount = 0;
  for (const v of totalByKey.values()) {
    if (v > globalMaxCount) globalMaxCount = v;
  }
  return { colorByKey, positionByKey, nameByKey, globalMaxCount: Math.max(globalMaxCount, 1) };
}

// paletteColorFor returns rgb(r,g,b) strings for sequential palettes (viridis,
// rd-bu). Convert those to hex so hexToRgb can parse. Categorical (okabe-ito)
// already returns hex.
function rgbStringToHex(rgb: string): string {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb.replace(/\s/g, ''));
  if (!m) return '#aaaaaa';
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function buildClusterData(
  branchTable: BranchTable,
  universe: ClusterUniverse,
  isBranchActive: (i: number) => boolean,
): ClusterDatum[] {
  const counts = new Map<string, number>();

  for (let i = 0; i < branchTable.count; i++) {
    if (!isBranchActive(i) || !isEndGeoResolved(branchTable, i)) continue;
    const lat = roundCoord(branchTable.endLat[i] ?? 0);
    const lon = roundCoord(branchTable.endLon[i] ?? 0);
    const key = `${lat},${lon}`;
    // BSSVS multi-state ancestors emit one branch row per possible parent
    // state (T047). Each row carries its state probability in stateWeight;
    // summing weights collapses the N rows back into 1.0 effective lineage,
    // so cluster counts reflect actual lineage flux instead of inflating by
    // the state-set size.
    const weight = branchTable.stateWeight[i] ?? 1;
    counts.set(key, (counts.get(key) ?? 0) + weight);
  }

  const result: ClusterDatum[] = [];
  for (const [key, count] of counts) {
    const position = universe.positionByKey.get(key);
    const color = universe.colorByKey.get(key);
    if (!position || !color) continue;
    result.push({ position, count, color, name: universe.nameByKey.get(key) ?? '' });
  }
  return result;
}

const CLUSTER_MIN_RADIUS = 4;
const CLUSTER_MAX_RADIUS = 24;

function clusterRadius(count: number, maxCount: number): number {
  if (maxCount <= 1) return CLUSTER_MIN_RADIUS;
  const t = Math.sqrt(count / maxCount);
  return CLUSTER_MIN_RADIUS + t * (CLUSTER_MAX_RADIUS - CLUSTER_MIN_RADIUS);
}

function branchIdToOrigId(graph: PhyloGraph | null, branchId: number | null): string | null {
  if (!graph || branchId === null) return null;
  return graph.nodes[branchId]?.origId ?? null;
}

function coordStackKey(coord: [number, number]): string {
  return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
}

function routeStackKey(source: [number, number], target: [number, number]): string {
  const a = coordStackKey(source);
  const b = coordStackKey(target);
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function routeStackHeight(stackIndex: number): number {
  return (
    ROUTE_ARC_BASE_HEIGHT + Math.min(stackIndex, ROUTE_ARC_MAX_STACK_INDEX) * ROUTE_ARC_HEIGHT_STEP
  );
}

interface RouteStackDatum {
  sourcePosition: [number, number];
  targetPosition: [number, number];
  stackIndex: number;
  stackCount: number;
}

function assignArcStacks<T extends RouteStackDatum>(arcs: T[]): T[] {
  const totals = new Map<string, number>();
  for (const arc of arcs) {
    const key = routeStackKey(arc.sourcePosition, arc.targetPosition);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return arcs.map((arc) => {
    const key = routeStackKey(arc.sourcePosition, arc.targetPosition);
    const stackCount = totals.get(key) ?? 1;
    const stackIndex = seen.get(key) ?? 0;
    seen.set(key, stackIndex + 1);
    return {
      ...arc,
      stackIndex,
      stackCount,
    };
  });
}

function routeArcHeight(d: RouteStackDatum): number {
  return routeStackHeight(d.stackIndex);
}

type ArcFilterConfig = {
  getFilterValue: (d: ArcDatum) => [number, number];
  filterRange: [[number, number], [number, number]];
};

type TripFilterConfig = {
  getFilterValue: (d: TripDatum) => [number, number];
  filterRange: [[number, number], [number, number]];
};

type TimeFilterDomain = {
  min: number;
  max: number;
};

function buildTimeFilterDomain(
  bounds: { min: number; max: number } | null,
  branchTable: BranchTable,
): TimeFilterDomain {
  let min = bounds?.min ?? Number.POSITIVE_INFINITY;
  let max = bounds?.max ?? Number.NEGATIVE_INFINITY;

  if (bounds === null) {
    for (let i = 0; i < branchTable.count; i++) {
      const startTime = branchTable.startTime[i] ?? 0;
      const endTime = branchTable.endTime[i] ?? 0;
      if (Number.isFinite(startTime)) min = Math.min(min, startTime);
      if (Number.isFinite(endTime)) max = Math.max(max, endTime);
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: -1, max: 1 };
  }

  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const range = Math.max(hi - lo, 1);
  return { min: lo - range, max: hi + range };
}

function buildArcFilterConfig(
  mode: string,
  playhead: number,
  timeWindow: { start: number; end: number } | null,
  domain: TimeFilterDomain,
): ArcFilterConfig {
  if (mode === 'Window' && timeWindow !== null) {
    const w = timeWindow.end - timeWindow.start;
    return {
      getFilterValue: (d: ArcDatum) => [d.startTime, d.endTime],
      filterRange: [
        [domain.min, playhead],
        [playhead - w, domain.max],
      ],
    };
  }
  return {
    getFilterValue: (d: ArcDatum) => [d.startTime, d.endTime],
    filterRange: [
      [domain.min, playhead],
      [domain.min, domain.max],
    ],
  };
}

function buildTripFilterConfig(
  mode: string,
  playhead: number,
  timeWindow: { start: number; end: number } | null,
  domain: TimeFilterDomain,
): TripFilterConfig {
  if (mode === 'Window' && timeWindow !== null) {
    return {
      getFilterValue: (d: TripDatum) => [d.timestamps[0], d.timestamps[1]],
      filterRange: [
        [domain.min, playhead],
        [timeWindow.start, domain.max],
      ],
    };
  }
  return {
    getFilterValue: (d: TripDatum) => [d.timestamps[0], d.timestamps[1]],
    filterRange: [
      [domain.min, playhead],
      [domain.min, domain.max],
    ],
  };
}

function buildPrimaryLayer(
  tripData: TripDatum[],
  arcData: ArcDatum[],
  arcs: boolean,
  mode: string,
  playhead: number,
  trailLength: number,
  tripFilterConfig: TripFilterConfig,
  arcFilterConfig: ArcFilterConfig,
  hoveredBranchId: number | null,
  branchLayerOpacity: number,
  colorForBranch: (
    branchId: number,
    originLon: number,
    originLat: number,
  ) => [number, number, number, number],
  colorTrigger: unknown,
  stackCount = 1,
  arcStackCount = 10,
  arcWidthFraction = 1,
): Layer[] {
  if (arcs) {
    const baseArcProps = {
      data: arcData,
      getSourcePosition: (d: ArcDatum) => d.sourcePosition,
      getTargetPosition: (d: ArcDatum) => d.targetPosition,
      // Elevated arcs — classic SpreadGL look. ArcLayer peak height =
      // distance × getHeight. 1.0 gives a dramatic arch at pitch > 0.
      getHeight: routeArcHeight,
      // GPU-side time gate mirrors slice.ts:isActive predicate. Always filterSize=2 to
      // avoid GPU/layer-instance mismatch when mode switches (deck.gl reuses layer by ID).
      // Trail: dim-1 is a finite no-op. Window: dim-1 gates endTime ≥ playhead-w.
      // Data is static; only filterRange changes per frame.
      getFilterValue: arcFilterConfig.getFilterValue,
      filterRange: arcFilterConfig.filterRange,
      extensions: ARC_FILTER_EXTENSIONS,
    };
    const arcUpdateTriggers = {
      getSourceColor: [hoveredBranchId, colorTrigger],
      getTargetColor: [hoveredBranchId, colorTrigger],
      getWidth: [hoveredBranchId, arcWidthFraction],
      getHeight: arcData,
      getFilterValue: mode,
    };

    const arcLayers: Layer[] = [];
    for (let s = 0; s < arcStackCount; s++) {
      arcLayers.push(
        new ArcLayer<ArcDatum>({
          ...baseArcProps,
          id: s === 0 ? 'branches-slice' : `branches-slice-stack-${s}`,
          getSourceColor: (d: ArcDatum) =>
            d.branchId === hoveredBranchId
              ? HOVER_COLOR
              : colorForBranch(d.branchId, d.sourcePosition[0], d.sourcePosition[1]),
          getTargetColor: (d: ArcDatum) =>
            d.branchId === hoveredBranchId
              ? HOVER_COLOR
              : colorForBranch(d.branchId, d.sourcePosition[0], d.sourcePosition[1]),
          getWidth: (d) =>
            (d.branchId === hoveredBranchId ? SLICE_HOVER_WIDTH : SLICE_WIDTH) * arcWidthFraction,
          opacity: SLICE_OPACITY * branchLayerOpacity,
          widthMinPixels: SLICE_WIDTH_MIN_PIXELS,
          pickable: s === 0,
          updateTriggers: arcUpdateTriggers,
        }),
      );
    }

    return arcLayers;
  }

  const layers: Layer[] = [];
  for (let s = 0; s < stackCount; s++) {
    const tripProps = {
      id: s === 0 ? 'branches-trail' : `branches-trail-stack-${s}`,
      data: tripData,
      getPath: (d: TripDatum) => d.path,
      getTimestamps: (d: TripDatum) => d.timestamps,
      getColor: (d: TripDatum) =>
        d.branchId === hoveredBranchId
          ? HOVER_COLOR
          : colorForBranch(d.branchId, d.originLon, d.originLat),
      getWidth: (d: TripDatum) =>
        (d.branchId === hoveredBranchId ? HOVER_WIDTH : DEFAULT_WIDTH) * arcWidthFraction,
      opacity: branchLayerOpacity,
      widthUnits: 'pixels' as const,
      widthMinPixels: WIDTH_MIN_PIXELS,
      trailLength,
      currentTime: playhead,
      fadeTrail: mode === 'Window',
      getFilterValue: tripFilterConfig.getFilterValue,
      filterRange: tripFilterConfig.filterRange,
      extensions: TRIP_FILTER_EXTENSIONS,
      rounded: true,
      capRounded: true,
      jointRounded: true,
      pickable: false,
      updateTriggers: {
        getColor: [hoveredBranchId, colorTrigger],
        getWidth: [hoveredBranchId, arcWidthFraction],
        getFilterValue: mode,
      },
    };
    layers.push(
      new TripsLayer<TripDatum>(
        tripProps as unknown as ConstructorParameters<typeof TripsLayer<TripDatum>>[0],
      ),
    );
  }
  return layers;
}

export function useMapDeckModel() {
  const branchTable = useTreeStore((s) => s.branchTable);
  const cameraSourceKey = useTreeStore((s) => s.exampleId ?? s.fileName ?? 'none');
  const graph = useTreeStore((s) => s.graph);
  const layout = useTreeStore((s) => s.layout);
  const allHpdData = useTreeStore((s) => s.hpdRenderData);
  const allMultiHpdData = useTreeStore((s) => s.multiHpdRenderData);
  const updateGeoEntry = useTreeStore((s) => s.updateGeoEntry);
  const traitInfo = useTreeStore((s) => s.traitInfo);
  const allDiscreteKeys = useTreeStore((s) => s.allDiscreteKeys);
  const discreteGeoLookup = useTreeStore((s) => s.discreteGeoLookup);
  const customOverlays = useTreeStore((s) => s.customOverlays);
  const choroplethOverlays = useTreeStore((s) => s.choroplethOverlays);
  const playhead = useTimelineStore((s) => s.playhead);
  const mode = useTimelineStore((s) => s.mode);
  const arcs = useTimelineStore((s) => s.arcs);
  const clade = useTimelineStore((s) => s.clade);
  const timeWindow = useTimelineStore((s) => s.window);
  const timeWindowSize = useTimelineStore((s) => s.windowSize);
  const subtreeRootIds = useTimelineStore((s) => s.subtreeRootIds);
  const subtreeRootId = useTimelineStore((s) => s.subtreeRootId);
  const bounds = useTimelineStore((s) => s.bounds);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const hoveredBranchId = useSelectionStore((s) => s.hoveredBranchId);
  const setHoveredBranchId = useSelectionStore((s) => s.setHoveredBranchId);
  const setHoveredId = useSelectionStore((s) => s.setHoveredId);
  const toggleSelectedBranchId = useSelectionStore((s) => s.toggleSelectedBranchId);
  const toggleSelectedId = useSelectionStore((s) => s.toggleSelectedId);
  const focusedTaxa = useSelectionStore((s) => s.focusedTaxa);
  const logTable = useTreeStore((s) => s.logTable);
  const theme = useUiStore((s) => s.theme);
  const colorByTrait = useUiStore((s) => s.colorByKey);
  const palette = useUiStore((s) => s.palette);
  const paletteReverse = useUiStore((s) => s.paletteReverse);
  const setPinnedSelection = useUiStore((s) => s.setPinnedSelection);
  const setCompareSelection = useUiStore((s) => s.setCompareSelection);
  const layerVisibility = useUiStore((s) => s.layerVisibility);
  const layerOpacity = useUiStore((s) => s.layerOpacity);
  const arcWidth = useUiStore((s) => s.arcWidth);
  const deselectedValues = useUiStore((s) => s.deselectedValues);
  const dtaMapOverlay = useUiStore((s) => s.dtaMapOverlay);
  const symmetryMode = useUiStore((s) => s.symmetryMode);
  const bssvsBfThreshold = useUiStore((s) => s.bssvsBfThreshold);
  const posteriorThreshold = useUiStore((s) => s.posteriorThreshold);
  const renderQuality = useUiStore((s) => s.renderQuality);
  const lassoMode = useUiStore((s) => s.lassoMode);
  const lassoVertices = useUiStore((s) => s.lassoVertices);
  const addLassoVertex = useUiStore((s) => s.addLassoVertex);
  const clearLasso = useUiStore((s) => s.clearLasso);
  const pickLocationName = useUiStore((s) => s.pickLocationName);
  const setPickLocationName = useUiStore((s) => s.setPickLocationName);
  const hoveredLocationName = useUiStore((s) => s.hoveredLocationName);
  const setFocusedTaxa = useSelectionStore((s) => s.setFocusedTaxa);
  const envColumns = useEnvStore((s) => s.columns);
  const activeEnvKey = useEnvStore((s) => s.activeKey);
  const envPaletteOverride = useEnvStore((s) => s.paletteOverride);
  const raster = useRasterStore((s) => s.raster);
  const performanceMode = shouldUsePerformanceMode(renderQuality, branchTable?.count ?? 0);

  const containerRef = useRef<HTMLElement>(null);
  const wheelTargetRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<MapRef>(null);
  const setMapInstance = useMapStore((s) => s.setMapInstance);
  // viewStateRef tracks the current camera without triggering React re-renders on pan/zoom.
  // DeckGL uses initialViewState (uncontrolled); onViewStateChange only writes to this ref.
  const viewStateRef = useRef<ViewState>(DEFAULT_VIEW_STATE);
  // cameraKey increments only when we need to programmatically reset the camera (new data load).
  // Incrementing causes DeckGL to re-mount, applying the new initialViewState.
  const [cameraKey, setCameraKey] = useState(0);
  const [initialViewState, setInitialViewState] = useState<ViewState>(DEFAULT_VIEW_STATE);
  const lastFittedCameraDatasetRef = useRef<{
    source: string;
    graph: PhyloGraph | null;
    layout: Layout | null;
    branchCount: number;
  } | null>(null);
  const lastLassoClickTimeRef = useRef<number>(0);
  const lassoModeRef = useRef(lassoMode);
  lassoModeRef.current = lassoMode;
  const pickModeRef = useRef<string | null>(pickLocationName);
  useEffect(() => {
    pickModeRef.current = pickLocationName;
  }, [pickLocationName]);
  // rAF ref for mousemove throttle — at most one cluster proximity check per frame.
  const mouseMoveRafRef = useRef<number | null>(null);
  // Auto-pause state: true while animation was paused by a map gesture.
  const autoPausedRef = useRef(false);
  // Pending resume timer handle.
  const resumeTimerRef = useRef<number | null>(null);
  // Tracks previous pan interaction state to detect start/end transitions.
  const wasInteractingRef = useRef(false);
  // Separate ref for wheel-zoom interactions so they don't conflict with pan detection.
  const wasInteractingViaWheelRef = useRef(false);
  // Zoom-end debounce timer: 200ms quiet after last wheel event = zoom settled.
  const wheelZoomEndTimerRef = useRef<number | null>(null);
  const flashFadeTimerRef = useRef<number | null>(null);
  const flashClearTimerRef = useRef<number | null>(null);
  const [flashLocation, setFlashLocation] = useState<{ name: string; fading: boolean } | null>(
    null,
  );
  const commitCurrentViewState = useCallback(() => {
    const next = cloneViewState(viewStateRef.current);
    setInitialViewState((prev) => (sameViewState(prev, next) ? prev : next));
  }, []);
  const showFlashLocation = useCallback((name: string) => {
    if (flashFadeTimerRef.current != null) clearTimeout(flashFadeTimerRef.current);
    if (flashClearTimerRef.current != null) clearTimeout(flashClearTimerRef.current);
    setFlashLocation({ name, fading: false });
    flashFadeTimerRef.current = window.setTimeout(() => {
      setFlashLocation((cur) => (cur?.name === name ? { name, fading: true } : cur));
      flashFadeTimerRef.current = null;
    }, 2400);
    flashClearTimerRef.current = window.setTimeout(() => {
      setFlashLocation((cur) => (cur?.name === name ? null : cur));
      flashClearTimerRef.current = null;
    }, 3000);
  }, []);
  const handleMapInteractionStart = useCallback(() => {
    if (resumeTimerRef.current != null) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    if (useTimelineStore.getState().isPlaying && !autoPausedRef.current) {
      autoPausedRef.current = true;
      useTimelineStore.getState().setIsPlaying(false);
    }
  }, []);

  const handleMapInteractionEnd = useCallback(() => {
    commitCurrentViewState();
    if (resumeTimerRef.current != null) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      if (autoPausedRef.current) {
        useTimelineStore.getState().setIsPlaying(true);
        autoPausedRef.current = false;
      }
      resumeTimerRef.current = null;
    }, 500);
  }, [commitCurrentViewState]);

  // Cluster tooltip: text + screen position, updated by CPU-side proximity check in mousemove.
  const [clusterTooltip, setClusterTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  // Ref to latest clusterData so mousemove handler doesn't stale-close over it.
  const clusterDataRef = useRef<ClusterDatum[] | null>(null);
  const bfLocationsRef = useRef<BfLocationDatum[] | null>(null);

  const [osDark, setOsDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    function update(e: MediaQueryListEvent) {
      setOsDark(e.matches);
    }
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [theme]);

  useEffect(() => {
    return () => {
      setMapInstance(null);
    };
  }, [setMapInstance]);

  // Clear auto-pause state on unmount so stale timers don't fire into an unmounted component.
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current != null) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      if (wheelZoomEndTimerRef.current != null) {
        clearTimeout(wheelZoomEndTimerRef.current);
        wheelZoomEndTimerRef.current = null;
      }
      if (flashFadeTimerRef.current != null) {
        clearTimeout(flashFadeTimerRef.current);
        flashFadeTimerRef.current = null;
      }
      if (flashClearTimerRef.current != null) {
        clearTimeout(flashClearTimerRef.current);
        flashClearTimerRef.current = null;
      }
    };
  }, []);

  // If the user manually presses Play while we auto-paused, clear the flag so
  // the pending resume timer won't double-resume.
  useEffect(() => {
    return useTimelineStore.subscribe((state, prev) => {
      if (state.isPlaying && !prev.isPlaying && autoPausedRef.current) {
        autoPausedRef.current = false;
        if (resumeTimerRef.current != null) {
          clearTimeout(resumeTimerRef.current);
          resumeTimerRef.current = null;
        }
      }
    });
  }, []);

  // DOM-level wheel listener for zoom detection.
  // onViewStateChange's zoom-value comparison is unreliable: on first load after
  // camera-fit, DeckGL fires an initial viewState change with a zoom that differs
  // from the ref's initialised value, triggering a false-positive zoom-start that
  // either silently auto-pauses or leaves wasInteractingRef in a broken state.
  // Listening directly on wheel events is unambiguous: a real user gesture fires
  // wheel, the camera-fit callback does not.
  // Pinch-zoom on trackpads also fires wheel. iOS Safari pinch fires gesturechange
  // instead — noted as a known gap.
  useEffect(() => {
    const el = wheelTargetRef.current ?? containerRef.current;
    if (!el) return;

    const handleWheel = () => {
      if (!wasInteractingViaWheelRef.current) {
        wasInteractingViaWheelRef.current = true;
        handleMapInteractionStart();
      }

      if (wheelZoomEndTimerRef.current != null) clearTimeout(wheelZoomEndTimerRef.current);
      wheelZoomEndTimerRef.current = window.setTimeout(() => {
        if (wasInteractingViaWheelRef.current) {
          handleMapInteractionEnd();
          wasInteractingViaWheelRef.current = false;
        }
        wheelZoomEndTimerRef.current = null;
      }, 200);
    };

    el.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (wheelZoomEndTimerRef.current != null) {
        clearTimeout(wheelZoomEndTimerRef.current);
        wheelZoomEndTimerRef.current = null;
      }
    };
  }, [handleMapInteractionStart, handleMapInteractionEnd]);

  // Auto-fit only when the loaded dataset changes. Location edits rebuild the
  // BranchTable but should not tear down the unified DeckGL root and its GPU buffers.
  useEffect(() => {
    if (!branchTable || branchTable.count === 0) return;
    const lastFit = lastFittedCameraDatasetRef.current;
    if (
      lastFit &&
      lastFit.source === cameraSourceKey &&
      lastFit.graph === graph &&
      lastFit.layout === layout &&
      lastFit.branchCount === branchTable.count
    ) {
      return;
    }
    const el = containerRef.current;
    const width = el?.clientWidth ?? 800;
    const height = el?.clientHeight ?? 600;
    const fitted = fitBoundsForBranchTable(branchTable, width, height);
    if (fitted) {
      lastFittedCameraDatasetRef.current = {
        source: cameraSourceKey,
        graph,
        layout,
        branchCount: branchTable.count,
      };
      viewStateRef.current = fitted;
      setInitialViewState(fitted);
      setCameraKey((k) => k + 1);
    }
  }, [branchTable, cameraSourceKey, graph, layout]);

  const isOverlayTarget = useCallback((e: React.MouseEvent<HTMLElement>): boolean => {
    const container = containerRef.current;
    if (!container) return false;
    const inspector = container.querySelector('[data-testid="inspector"]');
    const envLegend = container.querySelector('[data-testid="env-legend-overlay"]');
    const lassoCount = container.querySelector('[data-testid="lasso-vertex-count"]');
    const t = e.target as Node;
    return (
      (!!inspector && inspector.contains(t)) ||
      (!!envLegend && envLegend.contains(t)) ||
      (!!lassoCount && lassoCount.contains(t))
    );
  }, []);

  const handleMapMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (lassoModeRef.current || pickModeRef.current !== null) return;
      if (isOverlayTarget(e)) return;
      // Capture coordinates synchronously (SyntheticEvent is pooled/recycled).
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clientX = e.clientX;
      const clientY = e.clientY;
      if (mouseMoveRafRef.current != null) return;
      mouseMoveRafRef.current = requestAnimationFrame(() => {
        mouseMoveRafRef.current = null;
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const vp = new WebMercatorViewport({
          ...viewStateRef.current,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        });

        // Under the BF overlay, location points own the hover: show the route
        // counts in/out of the nearest location instead of the cluster tooltip.
        const bfLocations = bfLocationsRef.current;
        if (bfLocations && bfLocations.length > 0) {
          const PICK_PX = 28;
          let best: BfLocationDatum | null = null;
          let bestDist = PICK_PX * PICK_PX;
          for (const loc of bfLocations) {
            const sp = vp.project(loc.position);
            const dx = (sp[0] ?? 0) - px;
            const dy = (sp[1] ?? 0) - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) {
              bestDist = d2;
              best = loc;
            }
          }
          setClusterTooltip(
            best
              ? {
                  text: `${best.name} · ${best.incoming} in · ${best.outgoing} out`,
                  x: clientX,
                  y: clientY,
                }
              : null,
          );
          return;
        }

        // CPU-side cluster proximity check — replaces GPU picking (pickable: false).
        const clusters = clusterDataRef.current;
        if (clusters && clusters.length > 0) {
          const CLUSTER_PICK_PX = 28;
          let best: ClusterDatum | null = null;
          let bestDist = CLUSTER_PICK_PX * CLUSTER_PICK_PX;
          for (const c of clusters) {
            const sp = vp.project(c.position);
            const dx = (sp[0] ?? 0) - px;
            const dy = (sp[1] ?? 0) - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) {
              bestDist = d2;
              best = c;
            }
          }
          if (best) {
            const n = Math.round(best.count);
            setClusterTooltip({
              text: `${best.name} · ${n} ${n === 1 ? 'lineage' : 'lineages'}`,
              x: clientX,
              y: clientY,
            });
          } else {
            setClusterTooltip(null);
          }
        } else {
          setClusterTooltip(null);
        }
      });
    },
    [isOverlayTarget],
  );

  const handleMapMouseLeave = useCallback(() => {
    if (mouseMoveRafRef.current != null) {
      cancelAnimationFrame(mouseMoveRafRef.current);
      mouseMoveRafRef.current = null;
    }
    setHoveredBranchId(null);
    setHoveredId(null);
    setClusterTooltip(null);
  }, [setHoveredBranchId, setHoveredId]);

  const handleDeckClick = useCallback(
    (info: { object?: unknown; srcEvent?: { metaKey?: boolean; ctrlKey?: boolean } }) => {
      if (lassoModeRef.current || pickModeRef.current !== null) return false;
      const branchId =
        typeof (info.object as { branchId?: unknown } | undefined)?.branchId === 'number'
          ? (info.object as { branchId: number }).branchId
          : null;
      if (branchId === null) return false;
      if (info.srcEvent?.metaKey || info.srcEvent?.ctrlKey) {
        setCompareSelection({ branchId, source: 'map' });
      } else {
        const origId = branchIdToOrigId(graph, branchId);
        if (origId) toggleSelectedId(origId);
        toggleSelectedBranchId(branchId);
        setPinnedSelection({ branchId, source: 'map' });
      }
      return true;
    },
    [graph, toggleSelectedId, toggleSelectedBranchId, setPinnedSelection, setCompareSelection],
  );

  const trailLength = useMemo(() => {
    if (mode === 'Window' && timeWindow !== null) return timeWindow.end - timeWindow.start;
    // Large finite value: WebGL float uniforms can mangle Infinity on some GPUs
    // (Apple Silicon in particular), making the trail-fade math produce
    // transparent or invisible trails. 1e9 decimal-years is effectively
    // infinite for any phylogeographic timescale.
    return 1e9;
  }, [mode, timeWindow]);

  // Universe = stable color/position per endpoint location, computed once per
  // dataset. clusterData below recomputes per-frame with the mode-aware
  // predicate so circles grow/shrink as the playhead advances.
  const clusterUniverse = useMemo(() => {
    if (!branchTable || traitInfo?.kind !== 'discrete' || !discreteGeoLookup) return null;
    return buildClusterUniverse(
      branchTable,
      traitInfo.values,
      discreteGeoLookup,
      palette,
      paletteReverse,
    );
  }, [branchTable, traitInfo, discreteGeoLookup, palette, paletteReverse]);

  const subtreeBranchIds = useMemo<Set<number> | null>(() => {
    const selectedSubtreeRootIds =
      subtreeRootIds.length > 0 ? subtreeRootIds : subtreeRootId !== null ? [subtreeRootId] : [];
    if (!clade || selectedSubtreeRootIds.length === 0 || !graph || !layout) return null;
    return buildSubtreeBranchIdsForRoots(graph, layout, selectedSubtreeRootIds);
  }, [clade, subtreeRootIds, subtreeRootId, graph, layout]);

  // Numeric branch IDs (graph node indices) on the root→tip path for each focused taxon.
  // Empty set = no focus filter active.
  const focusedLineageBranchIds = useMemo<Set<number>>(() => {
    if (!layout || !graph || focusedTaxa.length === 0) return new Set();
    const nodeIds = computeFocusedLineageNodeIds(layout, focusedTaxa);
    const result = new Set<number>();
    for (const origId of nodeIds) {
      const idx = graph.origIdToIdx.get(origId);
      if (idx !== undefined) result.add(idx);
    }
    return result;
  }, [layout, graph, focusedTaxa]);

  const isPosteriorAllowed = useMemo(() => {
    if (!branchTable || !branchTable.posterior || posteriorThreshold <= 0) return null;
    const { posterior } = branchTable;
    return (idx: number): boolean => {
      const p = posterior[idx];
      return p === undefined || p >= posteriorThreshold;
    };
  }, [branchTable, posteriorThreshold]);

  const clusterPlayhead = useMemo(
    () =>
      getRangeRelativePlayheadBucket(
        playhead,
        bounds,
        isPlaying,
        playbackBucketCount(performanceMode),
      ),
    [playhead, bounds, isPlaying, performanceMode],
  );

  const clusterWindowWidth =
    mode === 'Window' && timeWindow !== null
      ? (timeWindowSize ?? timeWindow.end - timeWindow.start)
      : null;
  const clusterTimeWindow = useMemo(
    () =>
      clusterWindowWidth === null
        ? null
        : { start: clusterPlayhead - clusterWindowWidth, end: clusterPlayhead },
    [clusterPlayhead, clusterWindowWidth],
  );

  const clusterData = useMemo(() => {
    if (!branchTable || !clusterUniverse) return null;
    const clusterIsActive = (i: number): boolean => {
      if (isPosteriorAllowed && !isPosteriorAllowed(i)) return false;
      return isActive(
        {
          startTime: branchTable.startTime[i] ?? 0,
          endTime: branchTable.endTime[i] ?? 0,
          branchId: branchTable.branchId[i] ?? i,
        },
        clusterPlayhead,
        clusterTimeWindow,
        mode,
        subtreeBranchIds ?? undefined,
      );
    };
    let data = buildClusterData(branchTable, clusterUniverse, clusterIsActive);

    if (focusedLineageBranchIds.size > 0 && graph && traitInfo?.kind === 'discrete') {
      const annotKey = traitInfo.key;
      const lineageLocations = new Set<string>();
      for (const nodeIdx of focusedLineageBranchIds) {
        const node = graph.nodes[nodeIdx];
        if (!node) continue;
        const val = node.annotations[annotKey];
        if (typeof val === 'string') lineageLocations.add(val);
      }
      data = data.filter((d) => lineageLocations.has(d.name));
    }

    const clusterLegendFilterActive =
      deselectedValues.size > 0 && traitInfo?.kind === 'discrete' && colorByTrait === traitInfo.key;
    if (clusterLegendFilterActive) {
      data = data.filter((d) => !deselectedValues.has(d.name));
    }

    return data;
  }, [
    branchTable,
    clusterUniverse,
    clusterPlayhead,
    clusterTimeWindow,
    mode,
    subtreeBranchIds,
    isPosteriorAllowed,
    focusedLineageBranchIds,
    graph,
    traitInfo,
    deselectedValues,
    colorByTrait,
  ]);

  clusterDataRef.current = clusterData;

  // Per-branch endTime lookup for time-gradient coloring on continuous trees.
  const branchEndTime = useMemo(() => {
    if (!branchTable) return null;
    const map = new Map<number, number>();
    for (let i = 0; i < branchTable.count; i++) {
      const id = branchTable.branchId[i] ?? i;
      const t = branchTable.endTime[i] ?? 0;
      if (!map.has(id)) map.set(id, t);
    }
    return map;
  }, [branchTable]);

  // Color resolver for branches.
  //   - Single-color → brand orange.
  //   - Continuous trait + colorByKey='__time__' → gradient over [bounds.min,
  //     bounds.max] via the sequential palette path of paletteColorFor.
  //   - Discrete trait → the ORIGIN location's color, so a branch reads as an
  //     outgoing line from its source. The origin coordinate keys straight
  //     into the cluster universe, which already resolved compound tie
  //     endpoints into per-arc coordinates.
  const effectiveTheme: 'dark' | 'light' = theme === 'system' ? (osDark ? 'dark' : 'light') : theme;
  const darkBasemap = isDarkTheme(effectiveTheme);

  const secondaryDiscreteColorMap = useMemo(() => {
    if (
      !graph ||
      !traitInfo ||
      traitInfo.kind !== 'continuous' ||
      colorByTrait === '__time__' ||
      colorByTrait === 'single-color' ||
      !allDiscreteKeys.includes(colorByTrait)
    )
      return null;
    const seen = new Set<string>();
    for (const node of graph.nodes) {
      const v = node.annotations[colorByTrait];
      if (typeof v === 'string') seen.add(v);
    }
    const values = Array.from(seen).sort();
    const m = new Map<number, [number, number, number, number]>();
    for (let i = 0; i < graph.nodes.length; i++) {
      const v = graph.nodes[i]?.annotations[colorByTrait];
      if (typeof v !== 'string') continue;
      const hex = paletteColorFor(v, values, palette, paletteReverse);
      const { r, g, b } = hexToRgb(hex.startsWith('#') ? hex : rgbStringToHex(hex));
      m.set(i, [r, g, b, 255]);
    }
    return m;
  }, [graph, traitInfo, colorByTrait, allDiscreteKeys, palette, paletteReverse]);

  const colorForBranch = useMemo(() => {
    return (
      branchId: number,
      originLon: number,
      originLat: number,
    ): [number, number, number, number] => {
      if (colorByTrait === 'single-color' || !graph || !traitInfo) {
        return DEFAULT_COLOR;
      }

      if (
        traitInfo.kind === 'continuous' &&
        colorByTrait === '__time__' &&
        bounds &&
        branchEndTime
      ) {
        const endTime = branchEndTime.get(branchId);
        if (endTime === undefined) return DEFAULT_COLOR;
        const range = bounds.max - bounds.min;
        const tRaw = range > 0 ? (endTime - bounds.min) / range : 0;
        // Viridis on a dark basemap leaves the early-time branches in deep
        // purple (RGB ~(68, 1, 84)) which is indistinguishable from the
        // CARTO dark-matter tiles. Remap t ∈ [0, 1] → [0.2, 1] so the trail
        // gradient starts at the indigo stop instead of the unreadable
        // purple one. The first 20 % of perceptual range is dropped, but
        // it wasn't readable against the dark basemap anyway.
        const t = palette === 'viridis' && darkBasemap ? 0.2 + tRaw * 0.8 : tRaw;
        const hex = paletteColorFor(Math.max(0, Math.min(1, t)), null, palette, paletteReverse);
        const { r, g, b } = hexToRgb(hex.startsWith('#') ? hex : rgbStringToHex(hex));
        return [r, g, b, 255];
      }

      if (traitInfo.kind === 'continuous' && secondaryDiscreteColorMap) {
        const base = secondaryDiscreteColorMap.get(branchId) ?? DEFAULT_COLOR;
        return [base[0], base[1], base[2], 255];
      }

      if (traitInfo.kind === 'discrete') {
        if (!clusterUniverse) return DEFAULT_COLOR;
        const key = `${roundCoord(originLat)},${roundCoord(originLon)}`;
        const rgb = clusterUniverse.colorByKey.get(key);
        if (!rgb) return DEFAULT_COLOR;
        return [rgb[0], rgb[1], rgb[2], 255];
      }

      return DEFAULT_COLOR;
    };
  }, [
    colorByTrait,
    graph,
    traitInfo,
    palette,
    paletteReverse,
    bounds,
    branchEndTime,
    clusterUniverse,
    darkBasemap,
    secondaryDiscreteColorMap,
  ]);

  // Legend filter: only active when colorByKey is the primary geographic trait
  // and some values are deselected. Filters by child-node trait value (same set
  // the tree colors by), so tree-dim and map-removal target the identical branches.
  const legendFilterActive =
    deselectedValues.size > 0 && traitInfo?.kind === 'discrete' && colorByTrait === traitInfo.key;

  const isLegendAllowed = useMemo(() => {
    if (!legendFilterActive || !graph || !branchTable) return null;
    const annotKey = traitInfo!.key;
    return (idx: number): boolean => {
      const branchId = branchTable.branchId[idx] ?? idx;
      const node = graph.nodes[branchId];
      if (!node) return true;
      const traitVal = node.annotations[annotKey];
      return typeof traitVal !== 'string' || !deselectedValues.has(traitVal);
    };
  }, [legendFilterActive, graph, branchTable, traitInfo, deselectedValues]);

  // Build ALL trip geometry once per branchTable load (plus non-time predicates).
  // TripsLayer receives static buffers; DataFilterExtension gates start/end time
  // GPU-side so future caps cannot leak before the playhead reaches them.
  const tripData = useMemo(() => {
    if (!branchTable) return [];
    const allowed = (idx: number): boolean => {
      if (!isBranchMapIncluded(graph, branchTable, idx)) return false;
      if (isLegendAllowed && !isLegendAllowed(idx)) return false;
      if (isPosteriorAllowed && !isPosteriorAllowed(idx)) return false;
      if (subtreeBranchIds !== null && !subtreeBranchIds.has(branchTable.branchId[idx] ?? idx))
        return false;
      return true;
    };
    const all = buildTripData(branchTable, allowed);
    if (focusedLineageBranchIds.size === 0) return all;
    return all.filter((d) => focusedLineageBranchIds.has(d.branchId));
  }, [
    branchTable,
    graph,
    subtreeBranchIds,
    isLegendAllowed,
    isPosteriorAllowed,
    focusedLineageBranchIds,
  ]);

  // Build ALL arc geometry once per branchTable load (plus non-time predicates).
  // DataFilterExtension handles time-gating GPU-side via filterRange uniform.
  const arcData = useMemo(() => {
    if (!branchTable) return [];
    const allowed = (i: number): boolean => {
      if (!isBranchMapIncluded(graph, branchTable, i)) return false;
      if (isLegendAllowed && !isLegendAllowed(i)) return false;
      if (isPosteriorAllowed && !isPosteriorAllowed(i)) return false;
      if (subtreeBranchIds !== null && !subtreeBranchIds.has(branchTable.branchId[i] ?? i))
        return false;
      return true;
    };
    const all = buildArcData(branchTable, allowed);
    if (focusedLineageBranchIds.size === 0) return all;
    return all.filter((d) => focusedLineageBranchIds.has(d.branchId));
  }, [
    branchTable,
    graph,
    subtreeBranchIds,
    isLegendAllowed,
    isPosteriorAllowed,
    focusedLineageBranchIds,
  ]);

  // BSSVS Bayes factor arc overlay — one ArcLayer datum per route.
  // Width ∝ log(BF); only routes with BF > 1 (weak support or better) are drawn.
  const bfArcData = useMemo((): BfArcDatum[] => {
    if (dtaMapOverlay !== 'bf' || !logTable || traitInfo?.kind !== 'discrete' || !discreteGeoLookup)
      return [];
    const stateList = traitInfo.values;
    const rows = computeBssvsBayesFactors(logTable, stateList, symmetryMode);
    // Draw routes with BF > 1 (weak support or better), further restricted by the
    // user's BF threshold from the DTA panel.
    const minBf = Math.max(1, bssvsBfThreshold);
    const result: BfArcDatum[] = [];
    let maxLogBf = 0;
    for (const row of rows) {
      if (row.bayesFactor >= minBf && row.bayesFactor > 1) {
        const lbf = Math.log(row.bayesFactor);
        if (lbf > maxLogBf) maxLogBf = lbf;
      }
    }
    for (const row of rows) {
      if (row.bayesFactor <= 1 || row.bayesFactor < minBf) continue;
      const srcCoord = discreteGeoLookup.get(row.from);
      const tgtCoord = discreteGeoLookup.get(row.to);
      if (!srcCoord || !tgtCoord) continue;
      const logBf = Math.log(row.bayesFactor);
      const t = maxLogBf > 0 ? logBf / maxLogBf : 1;
      const widthPixels = 1 + t * 8;
      result.push({
        sourcePosition: [srcCoord[1], srcCoord[0]],
        targetPosition: [tgtCoord[1], tgtCoord[0]],
        widthPixels,
        color: bfColor(row.evidenceLabel, darkBasemap),
        stackIndex: 0,
        stackCount: 1,
      });
    }
    return assignArcStacks(result);
  }, [
    dtaMapOverlay,
    logTable,
    traitInfo,
    discreteGeoLookup,
    symmetryMode,
    bssvsBfThreshold,
    darkBasemap,
  ]);

  // One hoverable point per discrete location under the BF overlay, with the
  // number of supported routes into (target) and out of (source) it.
  const bfLocationData = useMemo((): BfLocationDatum[] => {
    if (dtaMapOverlay !== 'bf' || !logTable || traitInfo?.kind !== 'discrete' || !discreteGeoLookup)
      return [];
    const rows = computeBssvsBayesFactors(logTable, traitInfo.values, symmetryMode);
    const minBf = Math.max(1, bssvsBfThreshold);
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    for (const row of rows) {
      if (row.bayesFactor <= 1 || row.bayesFactor < minBf) continue;
      outgoing.set(row.from, (outgoing.get(row.from) ?? 0) + 1);
      incoming.set(row.to, (incoming.get(row.to) ?? 0) + 1);
    }
    const result: BfLocationDatum[] = [];
    for (const name of traitInfo.values) {
      const coord = discreteGeoLookup.get(name);
      if (!coord) continue;
      const inCount = incoming.get(name) ?? 0;
      const outCount = outgoing.get(name) ?? 0;
      // Only show a point where at least one supported route touches it, so
      // points appear/disappear with the BF threshold.
      if (inCount === 0 && outCount === 0) continue;
      result.push({
        position: [coord[1], coord[0]],
        name,
        incoming: inCount,
        outgoing: outCount,
      });
    }
    return result;
  }, [dtaMapOverlay, logTable, traitInfo, discreteGeoLookup, symmetryMode, bssvsBfThreshold]);

  bfLocationsRef.current = bfLocationData;

  // Markov jump count arc overlay — width ∝ mean jump count.
  const jumpArcData = useMemo((): BfArcDatum[] => {
    if (dtaMapOverlay !== 'jumps' || !logTable || !discreteGeoLookup) return [];
    const matrix = computeJumpMatrix(logTable);
    if (!matrix) return [];
    let maxCount = 0;
    for (const r of matrix.routes) {
      if (r.meanCount > maxCount) maxCount = r.meanCount;
    }
    const result: BfArcDatum[] = [];
    for (const r of matrix.routes) {
      if (r.meanCount <= 0) continue;
      const srcCoord = discreteGeoLookup.get(r.from);
      const tgtCoord = discreteGeoLookup.get(r.to);
      if (!srcCoord || !tgtCoord) continue;
      const t = maxCount > 0 ? r.meanCount / maxCount : 1;
      const widthPixels = 1 + t * 8;
      result.push({
        sourcePosition: [srcCoord[1], srcCoord[0]],
        targetPosition: [tgtCoord[1], tgtCoord[0]],
        widthPixels,
        color: [200, 200, 200],
        stackIndex: 0,
        stackCount: 1,
      });
    }
    return assignArcStacks(result);
  }, [dtaMapOverlay, logTable, discreteGeoLookup]);

  // Effective transition rate arc overlay — width ∝ mean rate.
  const ratesArcData = useMemo((): BfArcDatum[] => {
    if (
      dtaMapOverlay !== 'rates' ||
      !logTable ||
      traitInfo?.kind !== 'discrete' ||
      !discreteGeoLookup
    )
      return [];
    const stateList = [...traitInfo.values].sort();
    const matrix = computeActualRates(logTable, stateList, symmetryMode);
    if (!matrix) return [];
    let maxRate = 0;
    for (const r of matrix.routes) {
      if (r.meanRate > maxRate) maxRate = r.meanRate;
    }
    const result: BfArcDatum[] = [];
    for (const r of matrix.routes) {
      if (r.meanRate <= 0) continue;
      const srcCoord = discreteGeoLookup.get(r.from);
      const tgtCoord = discreteGeoLookup.get(r.to);
      if (!srcCoord || !tgtCoord) continue;
      const t = maxRate > 0 ? r.meanRate / maxRate : 1;
      const widthPixels = 1 + t * 8;
      result.push({
        sourcePosition: [srcCoord[1], srcCoord[0]],
        targetPosition: [tgtCoord[1], tgtCoord[0]],
        widthPixels,
        color: [200, 200, 200],
        stackIndex: 0,
        stackCount: 1,
      });
    }
    return assignArcStacks(result);
  }, [dtaMapOverlay, logTable, traitInfo, discreteGeoLookup, symmetryMode]);

  const timeFilterDomain = useMemo((): TimeFilterDomain => {
    if (!branchTable) return { min: -1, max: 1 };
    return buildTimeFilterDomain(bounds, branchTable);
  }, [bounds, branchTable]);

  // Fix 2 continued: filterRange uniform — cheap [number, number] update per frame.
  // Trail uses a finite lower bound; Window uses [playhead - w, playhead].
  const hpdFilterRange = useMemo((): [number, number] => {
    if (mode === 'Window' && timeWindow) {
      const w = timeWindow.end - timeWindow.start;
      return [playhead - w, playhead];
    }
    return [timeFilterDomain.min, playhead];
  }, [playhead, mode, timeWindow, timeFilterDomain]);

  const filteredHpdData = useMemo((): HpdPolygonRenderDatum[] => {
    let data = allHpdData;
    if (subtreeBranchIds !== null) data = data.filter((d) => subtreeBranchIds.has(d.nodeIdx));
    if (focusedLineageBranchIds.size > 0) {
      data = data.filter((d) => focusedLineageBranchIds.has(d.nodeIdx));
    }
    return data;
  }, [allHpdData, subtreeBranchIds, focusedLineageBranchIds]);

  const filteredMultiHpdData = useMemo((): HpdPolygonRenderDatum[] => {
    let data = allMultiHpdData;
    if (subtreeBranchIds !== null) data = data.filter((d) => subtreeBranchIds.has(d.nodeIdx));
    if (focusedLineageBranchIds.size > 0) {
      data = data.filter((d) => focusedLineageBranchIds.has(d.nodeIdx));
    }
    return data;
  }, [allMultiHpdData, subtreeBranchIds, focusedLineageBranchIds]);

  const resolvedEnvPalette = useMemo(() => {
    const col = envColumns.find((c) => c.key === activeEnvKey);
    if (!col) return 'viridis' as const;
    const override = envPaletteOverride[col.key];
    if (override && override !== 'auto') return override;
    return suggestPaletteForVariable(col.displayName);
  }, [envColumns, activeEnvKey, envPaletteOverride]);

  const activeEnvValues = useMemo(() => {
    if (!activeEnvKey) return null;
    return envColumns.find((c) => c.key === activeEnvKey)?.values ?? null;
  }, [envColumns, activeEnvKey]);

  // Static layers (choropleth + custom overlays + raster) — no playhead dependency.
  // deck.gl's reconciler skips these on every animation frame since neither
  // the layer IDs nor the data refs change.
  const staticLayers = useMemo((): Layer[] => {
    const result: Layer[] = [];

    // Z-order bottom-most: raster overlay below choropleth fills.
    // GeoTIFFs must be EPSG:4326; no reprojection is applied.
    if (raster && layerVisibility['raster-overlay']) {
      const rasterOpacity = (layerOpacity['raster-overlay'] ?? 50) / 100;
      result.push(
        new BitmapLayer({
          id: 'raster-overlay',
          image: { data: raster.data, width: raster.width, height: raster.height },
          bounds: raster.bounds,
          opacity: rasterOpacity,
          pickable: false,
        }),
      );
    }

    // Z-order bottom: choropleth fills so boundary strokes and branches remain on top.
    for (const overlay of choroplethOverlays) {
      if (layerVisibility[overlay.id] === false) continue;
      const opacity = (layerOpacity[overlay.id] ?? 100) / 100;

      // Use active env column values if available; fall back to stored valueByLocation.
      const valueLookup = activeEnvValues ?? overlay.valueByLocation;
      const features = joinChoropleth(overlay.data, valueLookup);
      if (features.length === 0) continue;

      const values = features.map((f) => f.value);
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const range = maxVal - minVal;

      result.push(
        new GeoJsonLayer({
          id: overlay.id,
          data: {
            type: 'FeatureCollection' as const,
            features: features.map((f) => ({
              type: 'Feature' as const,
              geometry: f.geometry,
              properties: { value: f.value, location: f.location },
            })),
          },
          stroked: true,
          filled: true,
          getFillColor: (feature: { properties: { value?: number } | null }) => {
            const v = feature.properties?.value;
            if (v === undefined || v === null)
              return [0, 0, 0, 0] as [number, number, number, number];
            if (activeEnvValues) {
              const t = range > 0 ? (v - minVal) / range : 0;
              const [r, g, b] = getPaletteColor(resolvedEnvPalette, Math.max(0, Math.min(1, t)));
              return [r, g, b, Math.round(opacity * 200)] as [number, number, number, number];
            }
            return choroplethColorScale(v, minVal, maxVal, opacity);
          },
          getLineColor: BOUNDARY_LINE_COLOR,
          getLineWidth: BOUNDARY_LINE_WIDTH,
          lineWidthUnits: 'pixels',
          pickable: false,
          updateTriggers: {
            getFillColor: [overlay.id, opacity, minVal, maxVal, activeEnvKey, resolvedEnvPalette],
          },
        }),
      );
    }

    for (const overlay of customOverlays) {
      if (layerVisibility[overlay.id] === false) continue;
      const opacity = (layerOpacity[overlay.id] ?? 100) / 100;
      result.push(
        new GeoJsonLayer({
          id: overlay.id,
          data: overlay.data,
          stroked: true,
          filled: false,
          getLineColor: BOUNDARY_LINE_COLOR,
          getLineWidth: BOUNDARY_LINE_WIDTH,
          lineWidthUnits: 'pixels',
          opacity,
          pickable: false,
        }),
      );
    }

    return result;
  }, [
    raster,
    choroplethOverlays,
    customOverlays,
    layerVisibility,
    layerOpacity,
    activeEnvKey,
    activeEnvValues,
    resolvedEnvPalette,
  ]);

  // Only HPD filter uniforms and primary branch layers need per-frame updates.
  const branchAndHpdLayers = useMemo((): Layer[] => {
    if (!branchTable) return [];
    const result: Layer[] = [];

    // Fix 2: HPD PolygonLayers with DataFilterExtension.
    // data is stable; filterRange is a GPU uniform — no re-tessellation on playhead change.
    const hpdOpacity = (layerOpacity['hpd-polygons'] ?? 100) / 100;

    if (filteredHpdData.length > 0 && layerVisibility['hpd-polygons']) {
      const hpdProps = {
        id: 'hpd-polygons',
        data: filteredHpdData,
        getPolygon: (d: HpdPolygonRenderDatum) => d.polygon.coordinates[0] ?? [],
        getFillColor: HPD_FILL_COLOR,
        getLineColor: HPD_LINE_COLOR,
        getLineWidth: 1,
        lineWidthUnits: 'pixels' as const,
        opacity: hpdOpacity,
        pickable: false,
        getFilterValue: (d: HpdPolygonRenderDatum) => d.nodeTime,
        filterRange: hpdFilterRange,
        extensions: HPD_FILTER_EXTENSIONS,
      };
      result.push(
        new PolygonLayer<HpdPolygonRenderDatum>(
          hpdProps as unknown as ConstructorParameters<
            typeof PolygonLayer<HpdPolygonRenderDatum>
          >[0],
        ),
      );
    }

    if (filteredMultiHpdData.length > 0 && layerVisibility['hpd-polygons']) {
      const multiHpdProps = {
        id: 'hpd-polygons-multi',
        data: filteredMultiHpdData,
        getPolygon: (d: HpdPolygonRenderDatum) => d.polygon.coordinates[0] ?? [],
        getFillColor: HPD_FILL_COLOR,
        getLineColor: HPD_LINE_COLOR,
        getLineWidth: 1,
        lineWidthUnits: 'pixels' as const,
        opacity: hpdOpacity,
        pickable: false,
        getFilterValue: (d: HpdPolygonRenderDatum) => d.nodeTime,
        filterRange: hpdFilterRange,
        extensions: HPD_FILTER_EXTENSIONS,
      };
      result.push(
        new PolygonLayer<HpdPolygonRenderDatum>(
          multiHpdProps as unknown as ConstructorParameters<
            typeof PolygonLayer<HpdPolygonRenderDatum>
          >[0],
        ),
      );
    }

    if (layerVisibility.branches) {
      const stackCount = performanceMode ? 1 : 2;
      const arcStackCount = branchTable.count > 10_000 ? 1 : 10;
      const arcFilterConfig = buildArcFilterConfig(mode, playhead, timeWindow, timeFilterDomain);
      const tripFilterConfig = buildTripFilterConfig(mode, playhead, timeWindow, timeFilterDomain);
      const primaryLayers = buildPrimaryLayer(
        tripData,
        arcData,
        arcs,
        mode,
        playhead,
        trailLength,
        tripFilterConfig,
        arcFilterConfig,
        hoveredBranchId,
        branchOpacitySliderToLayerOpacity(layerOpacity.branches ?? 100),
        colorForBranch,
        `${colorByTrait}|${palette}|${paletteReverse}`,
        stackCount,
        arcStackCount,
        arcWidth / 100,
      );
      result.push(...primaryLayers);
    }

    return result;
  }, [
    branchTable,
    filteredHpdData,
    filteredMultiHpdData,
    hpdFilterRange,
    timeFilterDomain,
    mode,
    timeWindow,
    arcs,
    tripData,
    arcData,
    playhead,
    trailLength,
    hoveredBranchId,
    layerVisibility,
    layerOpacity,
    arcWidth,
    performanceMode,
    colorForBranch,
    colorByTrait,
    palette,
    paletteReverse,
  ]);

  const locationHighlightData = useMemo((): LocationHighlightDatum[] => {
    if (!discreteGeoLookup || discreteGeoLookup.size === 0) return [];
    const byName = new Map<string, { flash: boolean; fading: boolean }>();
    if (hoveredLocationName) byName.set(hoveredLocationName, { flash: false, fading: false });
    if (pickLocationName) byName.set(pickLocationName, { flash: false, fading: false });
    if (flashLocation)
      byName.set(flashLocation.name, { flash: true, fading: flashLocation.fading });

    const data: LocationHighlightDatum[] = [];
    for (const [name, state] of byName) {
      const coord = discreteGeoLookup.get(name);
      if (!coord) continue;
      const [lat, lon] = coord;
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        continue;
      }
      data.push({
        name,
        position: [lon, lat],
        label: `${name}\n${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        flash: state.flash,
        fading: state.fading,
      });
    }
    return data;
  }, [discreteGeoLookup, flashLocation, hoveredLocationName, pickLocationName]);

  // Stable overlays do not depend on playhead and avoid per-frame rebuilds.
  const overlayLayers = useMemo((): Layer[] => {
    const result: Layer[] = [];

    if (bfArcData.length > 0) {
      result.push(
        new ArcLayer<BfArcDatum>({
          id: 'bssvs-bf-arcs',
          data: bfArcData,
          getSourcePosition: (d) => d.sourcePosition,
          getTargetPosition: (d) => d.targetPosition,
          getSourceColor: (d) => [...d.color, 200] as [number, number, number, number],
          getTargetColor: (d) => [...d.color, 200] as [number, number, number, number],
          getWidth: (d) => d.widthPixels,
          widthUnits: 'pixels',
          widthMinPixels: 1,
          getHeight: routeArcHeight,
          opacity: 1,
          pickable: false,
          updateTriggers: {
            getWidth: bfArcData,
            getHeight: bfArcData,
            getSourceColor: bfArcData,
            getTargetColor: bfArcData,
          },
        }),
      );
    }

    if (bfLocationData.length > 0) {
      result.push(
        new ScatterplotLayer<BfLocationDatum>({
          id: 'bssvs-bf-locations',
          data: bfLocationData,
          getPosition: (d) => d.position,
          getRadius: 5,
          radiusUnits: 'pixels',
          getFillColor: darkBasemap ? [235, 235, 235, 235] : [40, 40, 40, 235],
          stroked: true,
          getLineColor: darkBasemap ? [20, 20, 20, 255] : [255, 255, 255, 255],
          lineWidthMinPixels: 1,
          pickable: false,
          updateTriggers: {
            getFillColor: darkBasemap,
            getLineColor: darkBasemap,
          },
        }),
      );
    }

    if (jumpArcData.length > 0) {
      result.push(
        new ArcLayer<BfArcDatum>({
          id: 'markov-jump-arcs',
          data: jumpArcData,
          getSourcePosition: (d) => d.sourcePosition,
          getTargetPosition: (d) => d.targetPosition,
          getSourceColor: [100, 180, 255, 180],
          getTargetColor: [100, 180, 255, 180],
          getWidth: (d) => d.widthPixels,
          widthUnits: 'pixels',
          widthMinPixels: 1,
          getHeight: routeArcHeight,
          opacity: 1,
          pickable: false,
          updateTriggers: {
            getWidth: jumpArcData,
            getHeight: jumpArcData,
          },
        }),
      );
    }

    if (ratesArcData.length > 0) {
      result.push(
        new ArcLayer<BfArcDatum>({
          id: 'actual-rates-arcs',
          data: ratesArcData,
          getSourcePosition: (d) => d.sourcePosition,
          getTargetPosition: (d) => d.targetPosition,
          getSourceColor: [140, 255, 160, 180],
          getTargetColor: [140, 255, 160, 180],
          getWidth: (d) => d.widthPixels,
          widthUnits: 'pixels',
          widthMinPixels: 1,
          getHeight: routeArcHeight,
          opacity: 1,
          pickable: false,
          updateTriggers: {
            getWidth: ratesArcData,
            getHeight: ratesArcData,
          },
        }),
      );
    }

    if (
      clusterData &&
      clusterData.length > 0 &&
      clusterUniverse &&
      layerVisibility['cluster-endpoints']
    ) {
      const denominator = clusterUniverse.globalMaxCount;
      result.push(
        new ScatterplotLayer<ClusterDatum>({
          id: 'cluster-endpoints',
          data: clusterData,
          getPosition: (d) => d.position,
          getRadius: (d) => clusterRadius(d.count, denominator),
          getFillColor: (d) =>
            [...d.color, Math.round(255 * ((layerOpacity['cluster-endpoints'] ?? 100) / 100))] as [
              number,
              number,
              number,
              number,
            ],
          radiusUnits: 'pixels',
          stroked: false,
          pickable: false,
          updateTriggers: {
            getFillColor: layerOpacity['cluster-endpoints'],
          },
        }),
      );
    }

    if (lassoVertices.length >= 2) {
      const firstVertex = lassoVertices[0] ?? ([0, 0] as [number, number]);
      const closedPath = [...lassoVertices, firstVertex];
      result.push(
        new PathLayer<{ path: [number, number][] }>({
          id: 'lasso-draw',
          data: [{ path: closedPath }],
          getPath: (d) => d.path,
          getColor: [255, 220, 60, 220],
          getWidth: 2,
          widthUnits: 'pixels',
          pickable: false,
          updateTriggers: { getPath: lassoVertices },
        }),
      );
      result.push(
        new ScatterplotLayer<{ position: [number, number] }>({
          id: 'lasso-vertices',
          data: lassoVertices.map((v) => ({ position: v })),
          getPosition: (d) => d.position,
          getRadius: 4,
          getFillColor: [255, 220, 60, 255],
          radiusUnits: 'pixels',
          stroked: false,
          pickable: false,
          updateTriggers: { data: lassoVertices },
        }),
      );
    }

    if (locationHighlightData.length > 0) {
      result.push(
        new ScatterplotLayer<LocationHighlightDatum>({
          id: 'location-coordinate-highlight',
          data: locationHighlightData,
          getPosition: (d) => d.position,
          getRadius: (d) => (d.flash ? 8 : 6),
          getFillColor: (d) => (d.fading ? [144, 224, 211, 0] : LOCATION_HIGHLIGHT_COLOR),
          getLineColor: (d) => (d.fading ? [255, 255, 255, 0] : LOCATION_HIGHLIGHT_STROKE),
          getLineWidth: 2,
          radiusUnits: 'pixels',
          lineWidthUnits: 'pixels',
          stroked: true,
          filled: true,
          pickable: false,
          transitions: {
            getFillColor: 600,
            getLineColor: 600,
          },
        }),
      );
      result.push(
        new TextLayer<LocationHighlightDatum>({
          id: 'location-coordinate-highlight-label',
          data: locationHighlightData,
          getPosition: (d) => d.position,
          getText: (d) => d.label,
          getColor: (d) => (d.fading ? [232, 234, 238, 0] : [232, 234, 238, 235]),
          getSize: 12,
          getAngle: 0,
          getTextAnchor: 'start',
          getAlignmentBaseline: 'center',
          getPixelOffset: [12, -12],
          sizeUnits: 'pixels',
          billboard: true,
          pickable: false,
          transitions: {
            getColor: 600,
          },
        }),
      );
    }

    return result;
  }, [
    bfArcData,
    bfLocationData,
    jumpArcData,
    ratesArcData,
    clusterData,
    clusterUniverse,
    layerVisibility,
    layerOpacity,
    lassoVertices,
    locationHighlightData,
    darkBasemap,
  ]);

  // Z-order: static fills → HPD + branches → BF/cluster/lasso overlays.
  const layers = useMemo(
    () => [...staticLayers, ...branchAndHpdLayers, ...overlayLayers],
    [staticLayers, branchAndHpdLayers, overlayLayers],
  );

  const devInfoLastUpdateRef = useRef<number>(0);
  useEffect(() => {
    if (!import.meta.env.DEV || !branchTable) return;
    // Throttle to 2Hz during playback — the O(n) branch scan at 60Hz costs
    // ~1ms/frame at B.1.1.7 scale (17k branches). During pause it runs freely.
    const now = performance.now();
    const isPlaying = useTimelineStore.getState().isPlaying;
    if (isPlaying && now - devInfoLastUpdateRef.current < 500) return;
    devInfoLastUpdateRef.current = now;
    let activeCount = 0;
    for (let i = 0; i < branchTable.count; i++) {
      if ((branchTable.startTime[i] ?? Infinity) <= playhead) activeCount++;
    }
    const [filterLo, filterHi] = hpdFilterRange;
    const activeMultiHpdPolygonCount = allMultiHpdData.filter(
      (d) => d.nodeTime >= filterLo && d.nodeTime <= filterHi,
    ).length;
    const firstColor =
      branchTable.count > 0
        ? colorForBranch(
            branchTable.branchId[0] ?? 0,
            branchTable.startLon[0] ?? 0,
            branchTable.startLat[0] ?? 0,
          )
        : null;
    (globalThis as unknown as Record<string, unknown>).__deckLayerInfo = {
      branchCount: branchTable.count,
      activeCount,
      layerIds: layers.map((l) => (l as unknown as { id?: string }).id ?? ''),
      multiHpdPolygonCount: allMultiHpdData.length,
      activeMultiHpdPolygonCount,
      colorByKey: colorByTrait,
      firstBranchColor: firstColor,
      activeTripCount: tripData.length,
      activeArcCount: arcData.length,
    };
  }, [
    branchTable,
    playhead,
    layers,
    allMultiHpdData,
    hpdFilterRange,
    colorForBranch,
    colorByTrait,
    tripData,
    arcData,
  ]);

  // A tree with no recognized geographic trait (no lat/lon family, no discrete
  // location key) can't be plotted. Surface that instead of silently rendering
  // arcs at null-island (0,0).
  const noGeoData = traitInfo?.kind === 'unrecognized';

  const mapTipCount = useMemo(() => {
    if (!layout) return 0;
    return layout.nodes.filter((n) => n.isTip).length;
  }, [layout]);

  const basemapName = effectiveTheme === 'dark' ? 'Dark Matter' : 'Voyager';
  const animationMode = arcs ? 'arcs' : mode.toLowerCase();

  const mapAriaLabel = useMemo(() => {
    if (!branchTable) return 'Phylogeographic map, no data loaded';
    return `Phylogeographic map, ${mapTipCount} tips on ${basemapName} basemap, ${animationMode} mode`;
  }, [branchTable, mapTipCount, basemapName, animationMode]);

  const playheadDateLabel = useMemo(
    () => (bounds ? decimalYearToISO(playhead) : null),
    [playhead, bounds],
  );

  const handleSectionClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (!lassoModeRef.current) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const vp = new WebMercatorViewport({
        ...viewStateRef.current,
        width: rect.width,
        height: rect.height,
      });
      const coords = vp.unproject([px, py]);
      const lon = coords[0] ?? 0;
      const lat = coords[1] ?? 0;
      const now = Date.now();
      const isDoubleClick = now - lastLassoClickTimeRef.current < 350;
      lastLassoClickTimeRef.current = now;
      if (isDoubleClick) {
        if (branchTable && graph && layout) {
          const taxa = computeLassoTaxa(lassoVertices, branchTable, graph, layout);
          setFocusedTaxa(taxa);
        }
        clearLasso();
        return;
      }
      addLassoVertex([lon, lat]);
    },
    [branchTable, graph, layout, lassoVertices, addLassoVertex, clearLasso, setFocusedTaxa],
  );

  const handlePickClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const target = pickModeRef.current;
      if (target === null) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }

      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const vp = new WebMercatorViewport({
        ...viewStateRef.current,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
      const [lonRaw = 0, latRaw = 0] = vp.unproject([px, py]);
      const lat = Math.max(-90, Math.min(90, latRaw));
      const lon = ((((lonRaw + 180) % 360) + 360) % 360) - 180;
      updateGeoEntry(target, lat, lon);
      rebuildFromStore();
      showFlashLocation(target);
      setPickLocationName(null);
    },
    [setPickLocationName, showFlashLocation, updateGeoEntry],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (useUiStore.getState().pickLocationName === null) return;
      useUiStore.getState().setPickLocationName(null);
      e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleViewStateChange = useCallback(
    (e: { viewState: unknown; interactionState?: { isPanning?: boolean } }) => {
      viewStateRef.current = e.viewState as ViewState;
      const isPanning = !!e.interactionState?.isPanning;

      // Pan detection only — wheel-zoom is handled by the DOM wheel listener above.
      // isPanning transitions reliably for drag events and is not fired spuriously
      // by camera-fit resets (which use initialViewState, not onViewStateChange).
      if (isPanning && !wasInteractingRef.current) {
        wasInteractingRef.current = true;
        handleMapInteractionStart();
      } else if (!isPanning && wasInteractingRef.current) {
        wasInteractingRef.current = false;
        handleMapInteractionEnd();
      }
    },
    [handleMapInteractionStart, handleMapInteractionEnd],
  );

  const handleMapLoad = useCallback(() => {
    const m = mapRef.current?.getMap();
    if (m) setMapInstance(m);
  }, [setMapInstance]);

  return {
    containerRef,
    wheelTargetRef,
    mapRef,
    sectionProps: {
      'aria-label': mapAriaLabel,
      'data-testid': 'map-view',
      style: { width: '100%', height: '100%', position: 'relative' } as const,
      onMouseMove: handleMapMouseMove,
      onMouseLeave: handleMapMouseLeave,
      onClick:
        pickLocationName !== null ? handlePickClick : lassoMode ? handleSectionClick : undefined,
    },
    deckProps: {
      id: 'map-view-deck',
      key: cameraKey,
      initialViewState,
      controller: true,
      layers: noGeoData ? [] : layers,
      onViewStateChange: handleViewStateChange,
      onClick: handleDeckClick,
      useDevicePixels: deckDevicePixels(performanceMode),
      style: lassoMode || pickLocationName !== null ? ({ cursor: 'crosshair' } as const) : null,
    },
    mapProps: {
      mapStyle: basemapUrlForTheme(effectiveTheme),
      // ExportPanel composites the live basemap canvas for PNG and video output.
      // Performance budgets include this intentional export-correctness cost.
      canvasContextAttributes: { preserveDrawingBuffer: true } as const,
      onLoad: handleMapLoad,
    },
    overlays: {
      noGeoData,
      playheadDateLabel,
      pickLocationName,
      clusterTooltip,
      branchTable,
      graph,
      layout,
    },
  };
}

export type MapDeckModel = ReturnType<typeof useMapDeckModel>;

export function MapView() {
  const model = useMapDeckModel();

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handling (Enter/Esc) is delegated to LassoTool's window keydown listener
    <section
      ref={model.containerRef}
      aria-label={model.sectionProps['aria-label']}
      data-testid={model.sectionProps['data-testid']}
      style={model.sectionProps.style}
      onMouseMove={model.sectionProps.onMouseMove}
      onMouseLeave={model.sectionProps.onMouseLeave}
      onClick={model.sectionProps.onClick}
    >
      <DeckGL
        id={model.deckProps.id}
        key={model.deckProps.key}
        initialViewState={model.deckProps.initialViewState}
        controller={model.deckProps.controller}
        layers={model.deckProps.layers}
        onViewStateChange={model.deckProps.onViewStateChange}
        onClick={model.deckProps.onClick}
        useDevicePixels={model.deckProps.useDevicePixels}
        style={model.deckProps.style}
      >
        <MapLibreMap
          ref={model.mapRef}
          mapStyle={model.mapProps.mapStyle}
          canvasContextAttributes={model.mapProps.canvasContextAttributes}
          onLoad={model.mapProps.onLoad}
        />
      </DeckGL>
      {model.overlays.noGeoData && (
        <div
          data-testid="map-no-geo-notice"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            padding: 24,
          }}
        >
          <div
            style={{
              maxWidth: 360,
              background: 'rgba(20, 22, 26, 0.92)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 8,
              padding: '16px 20px',
              fontFamily: 'system-ui, sans-serif',
              color: 'var(--fg-secondary, #c8ccd2)',
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, color: '#e8eaee', marginBottom: 6 }}>
              No geographic data in this tree
            </div>
            This tree has no continuous lat/lon annotations and no discrete location trait, so there
            is nothing to plot on the map. Load a BEAST X tree with geographic annotations, or drop
            a tree that uses a discrete location trait together with a location-lookup CSV.
          </div>
        </div>
      )}
      {model.overlays.playheadDateLabel && (
        <span
          aria-live="polite"
          aria-atomic="true"
          data-testid="map-playhead-live"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            margin: -1,
            padding: 0,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            border: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {model.overlays.playheadDateLabel}
        </span>
      )}
      {model.overlays.pickLocationName && (
        <div
          data-testid="map-pick-location-banner"
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(20, 22, 26, 0.92)',
            border: '1px solid var(--accent)',
            borderRadius: 6,
            padding: '6px 10px',
            color: 'var(--fg-primary, #e8eaee)',
            fontSize: 12,
            fontFamily: 'system-ui, sans-serif',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          Click to set coordinates for "{model.overlays.pickLocationName}" · Esc to cancel
        </div>
      )}
      <Inspector source="map" />
      <EnvLegendOverlay />
      <LassoTool
        branchTable={model.overlays.branchTable}
        graph={model.overlays.graph}
        layout={model.overlays.layout}
      />
      {model.overlays.clusterTooltip && (
        <div
          data-testid="cluster-tooltip"
          style={{
            position: 'fixed',
            left: model.overlays.clusterTooltip.x + 14,
            top: model.overlays.clusterTooltip.y + 14,
            background: 'rgba(20, 22, 26, 0.92)',
            color: '#e8eaee',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'system-ui, sans-serif',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {model.overlays.clusterTooltip.text}
        </div>
      )}
    </section>
  );
}
