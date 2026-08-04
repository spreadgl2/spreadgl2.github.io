import type { BranchTable, Layout, PhyloGraph } from '../phylo/types';
import type { LttBounds } from './ltt';

export interface Transition {
  from: string;
  to: string;
  time: number;
  weight: number;
  branchId: number;
}

export interface TransitionLocationStack {
  location: string;
  weight: number;
  branchIds: number[];
}

export interface TransitionBin {
  t0: number;
  t1: number;
  introductions: number;
  exports: number;
  net: number;
  total: number;
  introductionBranchIds: number[];
  exportBranchIds: number[];
  totalBranchIds: number[];
  introductionStacks: TransitionLocationStack[];
  exportStacks: TransitionLocationStack[];
  totalStacks: TransitionLocationStack[];
  byFromInto: Map<string, number>;
  byToOut: Map<string, number>;
  bySegment: Map<string, number>;
}

export interface TransitionRouteTotal {
  from: string;
  to: string;
  weight: number;
}

export interface TransitionSummary {
  bins: TransitionBin[];
  totals: {
    introductions: number;
    exports: number;
    net: number;
    total: number;
  };
  topInto: TransitionRouteTotal[];
  topOut: TransitionRouteTotal[];
  topSegments: TransitionRouteTotal[];
  mode: 'total' | 'focal';
  focalValues: string[];
  bounds: LttBounds;
  binSizeDays: 15 | 30 | 45 | 60;
}

export interface TransitionSummaryOptions {
  bounds?: LttBounds | null;
  values: string[];
  deselectedValues?: Set<string>;
  binCount?: number;
}

export type TransitionBranchFilter = (rowIndex: number, branchId: number) => boolean;

function resolveStates(value: unknown): string[] {
  if (typeof value !== 'string' || value === '') return [];
  return value
    .split('+')
    .map((state) => state.trim())
    .filter((state) => state !== '');
}

function addToMap(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function addBranchId(ids: number[], branchId: number): void {
  if (!ids.includes(branchId)) ids.push(branchId);
}

function addStackSegment(
  stack: TransitionLocationStack[],
  location: string,
  weight: number,
  branchId: number,
): void {
  const existing = stack.find((segment) => segment.location === location);
  if (existing) {
    existing.weight += weight;
    addBranchId(existing.branchIds, branchId);
    return;
  }
  stack.push({ location, weight, branchIds: [branchId] });
}

function segmentKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

function routeFromKey(key: string, weight: number): TransitionRouteTotal {
  const [from = '', to = ''] = key.split('\u0000');
  return { from, to, weight };
}

function rankRoutes(map: Map<string, number>, limit = 5): TransitionRouteTotal[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, weight]) => routeFromKey(key, weight));
}

function rowIndicesByBranch(branchTable: BranchTable): Map<number, number[]> {
  const result = new Map<number, number[]>();
  for (let i = 0; i < branchTable.count; i++) {
    const branchId = branchTable.branchId[i];
    if (branchId === undefined) continue;
    const rows = result.get(branchId);
    if (rows) {
      rows.push(i);
    } else {
      result.set(branchId, [i]);
    }
  }
  return result;
}

function firstAllowedRow(
  rows: number[] | undefined,
  branchId: number,
  branchFilter: TransitionBranchFilter | undefined,
): number | null {
  if (!rows) return null;
  for (const row of rows) {
    if (!branchFilter || branchFilter(row, branchId)) return row;
  }
  return null;
}

export function buildTransitions(
  branchTable: BranchTable | null,
  graph: PhyloGraph | null,
  layout: Layout | null,
  traitKey: string | null,
  branchFilter?: TransitionBranchFilter,
): Transition[] {
  if (!branchTable || !graph || !layout || !traitKey) return [];

  const rowByBranch = rowIndicesByBranch(branchTable);
  const transitions: Transition[] = [];

  for (const layoutNode of layout.nodes) {
    if (layoutNode.parentId === null) continue;

    const childIdx = graph.origIdToIdx.get(layoutNode.id);
    if (childIdx === undefined) continue;
    const parentIdx = graph.origIdToIdx.get(layoutNode.parentId);
    if (parentIdx === undefined) continue;

    const row = firstAllowedRow(rowByBranch.get(childIdx), childIdx, branchFilter);
    if (row === null) continue;

    const time = branchTable.endTime[row];
    if (time === undefined || !Number.isFinite(time)) continue;

    const parentStates = resolveStates(graph.nodes[parentIdx]?.annotations[traitKey]);
    const childStates = resolveStates(graph.nodes[childIdx]?.annotations[traitKey]);
    if (parentStates.length === 0 || childStates.length === 0) continue;

    const weight = 1 / (parentStates.length * childStates.length);
    for (const from of parentStates) {
      for (const to of childStates) {
        if (from === to) continue;
        transitions.push({ from, to, time, weight, branchId: childIdx });
      }
    }
  }

  return transitions.sort((a, b) => a.time - b.time || a.branchId - b.branchId);
}

export function filterByInducedSubtree(
  transitions: Transition[],
  branchIds: Set<number> | null | undefined,
): Transition[] {
  if (!branchIds || branchIds.size === 0) return transitions;
  return transitions.filter((transition) => branchIds.has(transition.branchId));
}

function resolveBounds(transitions: Transition[], bounds: LttBounds | null | undefined): LttBounds {
  if (
    bounds &&
    Number.isFinite(bounds.min) &&
    Number.isFinite(bounds.max) &&
    bounds.max > bounds.min
  ) {
    return bounds;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const transition of transitions) {
    min = Math.min(min, transition.time);
    max = Math.max(max, transition.time);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (max <= min) return { min, max: min + 1 };
  return { min, max };
}

const DAYS_PER_YEAR = 365.25;

export function transitionBinSizeDays(bounds: LttBounds): 15 | 30 | 45 | 60 {
  const spanDays = Math.max(0, (bounds.max - bounds.min) * DAYS_PER_YEAR);
  if (spanDays > DAYS_PER_YEAR * 4) return 60;
  if (spanDays > DAYS_PER_YEAR * 2) return 45;
  if (spanDays > DAYS_PER_YEAR) return 30;
  return 15;
}

function makeBins(
  bounds: LttBounds,
  binCount: number | undefined,
): {
  bins: TransitionBin[];
  binSizeDays: 15 | 30 | 45 | 60;
} {
  const binSizeDays = transitionBinSizeDays(bounds);
  const width = binCount
    ? (bounds.max - bounds.min) / Math.max(1, Math.floor(binCount))
    : binSizeDays / DAYS_PER_YEAR;
  const count = Math.max(1, Math.ceil((bounds.max - bounds.min) / width));
  return {
    bins: Array.from({ length: count }, (_, i) => ({
      t0: bounds.min + width * i,
      t1: i === count - 1 ? bounds.max : bounds.min + width * (i + 1),
      introductions: 0,
      exports: 0,
      net: 0,
      total: 0,
      introductionBranchIds: [],
      exportBranchIds: [],
      totalBranchIds: [],
      introductionStacks: [],
      exportStacks: [],
      totalStacks: [],
      byFromInto: new Map<string, number>(),
      byToOut: new Map<string, number>(),
      bySegment: new Map<string, number>(),
    })),
    binSizeDays,
  };
}

function binIndex(time: number, bounds: LttBounds, binCount: number): number | null {
  if (time < bounds.min || time > bounds.max) return null;
  if (time === bounds.max) return binCount - 1;
  const span = bounds.max - bounds.min;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(binCount - 1, Math.floor(((time - bounds.min) / span) * binCount)));
}

export function summariseTransitions(
  transitions: Transition[],
  options: TransitionSummaryOptions,
): TransitionSummary {
  const bounds = resolveBounds(transitions, options.bounds);
  const { bins, binSizeDays } = makeBins(bounds, options.binCount);
  const selectedValues = options.values.filter((value) => !options.deselectedValues?.has(value));
  const mode =
    selectedValues.length > 0 && selectedValues.length < options.values.length ? 'focal' : 'total';
  const focal = new Set(selectedValues);
  const topInto = new Map<string, number>();
  const topOut = new Map<string, number>();
  const topSegments = new Map<string, number>();
  const totals = { introductions: 0, exports: 0, net: 0, total: 0 };

  for (const transition of transitions) {
    const idx = binIndex(transition.time, bounds, bins.length);
    if (idx === null) continue;

    const bin = bins[idx];
    if (!bin) continue;

    if (mode === 'total') {
      bin.total += transition.weight;
      totals.total += transition.weight;
      addBranchId(bin.totalBranchIds, transition.branchId);
      addStackSegment(bin.totalStacks, transition.to, transition.weight, transition.branchId);
      addToMap(bin.bySegment, segmentKey(transition.from, transition.to), transition.weight);
      addToMap(topSegments, segmentKey(transition.from, transition.to), transition.weight);
      continue;
    }

    const fromInside = focal.has(transition.from);
    const toInside = focal.has(transition.to);
    const route = segmentKey(transition.from, transition.to);
    let touchesFocal = false;

    if (toInside) {
      bin.introductions += transition.weight;
      totals.introductions += transition.weight;
      addBranchId(bin.introductionBranchIds, transition.branchId);
      addStackSegment(
        bin.introductionStacks,
        transition.to,
        transition.weight,
        transition.branchId,
      );
      addToMap(bin.byFromInto, transition.from, transition.weight);
      addToMap(topInto, route, transition.weight);
      touchesFocal = true;
    }

    if (fromInside) {
      bin.exports += transition.weight;
      totals.exports += transition.weight;
      addBranchId(bin.exportBranchIds, transition.branchId);
      addStackSegment(bin.exportStacks, transition.from, transition.weight, transition.branchId);
      addToMap(bin.byToOut, transition.to, transition.weight);
      addToMap(topOut, route, transition.weight);
      touchesFocal = true;
    }

    if (touchesFocal) {
      bin.total += transition.weight;
      totals.total += transition.weight;
      addBranchId(bin.totalBranchIds, transition.branchId);
      addStackSegment(bin.totalStacks, transition.to, transition.weight, transition.branchId);
      addToMap(bin.bySegment, route, transition.weight);
      addToMap(topSegments, route, transition.weight);
    }

    bin.net = bin.introductions - bin.exports;
  }

  totals.net = totals.introductions - totals.exports;

  return {
    bins,
    totals,
    topInto: rankRoutes(topInto),
    topOut: rankRoutes(topOut),
    topSegments: rankRoutes(topSegments),
    mode,
    focalValues: mode === 'focal' ? selectedValues : [],
    bounds,
    binSizeDays,
  };
}

export function transitionBinAtTime(
  summary: TransitionSummary,
  time: number,
): TransitionBin | null {
  const idx = binIndex(time, summary.bounds, summary.bins.length);
  return idx === null ? null : (summary.bins[idx] ?? null);
}
