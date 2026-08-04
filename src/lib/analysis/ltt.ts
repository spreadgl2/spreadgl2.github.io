import { isStartGeoResolved } from '../phylo/geo-completeness';
import type { BranchTable } from '../phylo/types';

export interface LttPoint {
  time: number;
  count: number;
}

export interface LttBounds {
  min: number;
  max: number;
}

export interface LttLocationConfig {
  values: string[];
  coordByValue: Map<string, [lat: number, lon: number]>;
}

export interface LttSeriesBundle {
  bounds: LttBounds;
  global: LttPoint[];
  byLocation: Map<string, LttPoint[]>;
  locations: string[];
  maxCount: number;
}

const COORD_PRECISION = 4;

function coordKey(lat: number, lon: number): string {
  const f = 10 ** COORD_PRECISION;
  return `${Math.round(lat * f) / f},${Math.round(lon * f) / f}`;
}

function addEvent(events: Map<number, number>, time: number, delta: number): void {
  events.set(time, (events.get(time) ?? 0) + delta);
}

function finiteBounds(branchTable: BranchTable, fallback: LttBounds | null): LttBounds {
  if (
    fallback &&
    Number.isFinite(fallback.min) &&
    Number.isFinite(fallback.max) &&
    fallback.max > fallback.min
  ) {
    return fallback;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < branchTable.count; i++) {
    const start = branchTable.startTime[i];
    const end = branchTable.endTime[i];
    if (start !== undefined && Number.isFinite(start)) min = Math.min(min, start);
    if (end !== undefined && Number.isFinite(end)) max = Math.max(max, end);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return { min: 0, max: 1 };
  return { min, max };
}

function buildSeries(events: Map<number, number>, bounds: LttBounds): LttPoint[] {
  const times = [...events.keys()].sort((a, b) => a - b);
  const points: LttPoint[] = [];
  let count = 0;
  let idx = 0;

  while (idx < times.length && (times[idx] ?? 0) <= bounds.min) {
    count += events.get(times[idx] ?? 0) ?? 0;
    idx++;
  }

  points.push({ time: bounds.min, count: cleanCount(count) });

  while (idx < times.length) {
    const time = times[idx] ?? 0;
    if (time > bounds.max) break;
    count += events.get(time) ?? 0;
    points.push({ time, count: cleanCount(count) });
    idx++;
  }

  const last = points[points.length - 1];
  if (!last || last.time < bounds.max) points.push({ time: bounds.max, count: cleanCount(count) });
  return points;
}

function cleanCount(count: number): number {
  if (Math.abs(count) < 1e-6) return 0;
  return Math.max(0, count);
}

function maxSeriesCount(series: LttPoint[]): number {
  let max = 0;
  for (const point of series) {
    if (point.count > max) max = point.count;
  }
  return max;
}

function locationLookup(config: LttLocationConfig | null | undefined): Map<string, string> {
  const byCoord = new Map<string, string>();
  if (!config) return byCoord;
  for (const value of config.values) {
    const coord = config.coordByValue.get(value);
    if (!coord) continue;
    byCoord.set(coordKey(coord[0], coord[1]), value);
  }
  return byCoord;
}

export function buildLttSeries(
  branchTable: BranchTable | null,
  bounds: LttBounds | null,
  locationConfig?: LttLocationConfig | null,
  branchFilter?: (index: number) => boolean,
): LttSeriesBundle {
  if (!branchTable) {
    const emptyBounds = bounds ?? { min: 0, max: 1 };
    return {
      bounds: emptyBounds,
      global: [
        { time: emptyBounds.min, count: 0 },
        { time: emptyBounds.max, count: 0 },
      ],
      byLocation: new Map(),
      locations: [],
      maxCount: 0,
    };
  }

  const resolvedBounds = finiteBounds(branchTable, bounds);
  const globalEvents = new Map<number, number>();
  const locationEvents = new Map<string, Map<number, number>>();
  const valueByCoord = locationLookup(locationConfig);

  for (let i = 0; i < branchTable.count; i++) {
    if (branchFilter && !branchFilter(i)) continue;
    const start = branchTable.startTime[i];
    const end = branchTable.endTime[i];
    if (
      start === undefined ||
      end === undefined ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      continue;
    }
    const weight = branchTable.stateWeight[i] ?? 1;
    addEvent(globalEvents, start, weight);
    addEvent(globalEvents, end, -weight);

    const location = isStartGeoResolved(branchTable, i)
      ? valueByCoord.get(coordKey(branchTable.startLat[i] ?? 0, branchTable.startLon[i] ?? 0))
      : undefined;
    if (location) {
      let events = locationEvents.get(location);
      if (!events) {
        events = new Map<number, number>();
        locationEvents.set(location, events);
      }
      addEvent(events, start, weight);
      addEvent(events, end, -weight);
    }
  }

  const global = buildSeries(globalEvents, resolvedBounds);
  const byLocation = new Map<string, LttPoint[]>();
  let maxCount = maxSeriesCount(global);
  const locations = locationConfig?.values.filter((value) => locationEvents.has(value)) ?? [];
  for (const location of locations) {
    const series = buildSeries(locationEvents.get(location) ?? new Map(), resolvedBounds);
    byLocation.set(location, series);
    maxCount = Math.max(maxCount, maxSeriesCount(series));
  }

  return { bounds: resolvedBounds, global, byLocation, locations, maxCount };
}

export function countAtTime(series: LttPoint[], time: number): number {
  if (series.length === 0) return 0;
  let lo = 0;
  let hi = series.length - 1;
  let result = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const point = series[mid];
    if (!point) break;
    if (point.time <= time) {
      result = point.count;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

export function sumLttSeries(seriesList: LttPoint[][], bounds: LttBounds): LttPoint[] {
  if (seriesList.length === 0) {
    return [
      { time: bounds.min, count: 0 },
      { time: bounds.max, count: 0 },
    ];
  }
  const times = new Set<number>([bounds.min, bounds.max]);
  for (const series of seriesList) {
    for (const point of series) times.add(point.time);
  }
  return [...times]
    .sort((a, b) => a - b)
    .map((time) => ({
      time,
      count: cleanCount(seriesList.reduce((sum, series) => sum + countAtTime(series, time), 0)),
    }));
}
