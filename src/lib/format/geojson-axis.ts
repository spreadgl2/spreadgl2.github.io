import type { FeatureCollection, Geometry } from 'geojson';

/**
 * Which coordinate axis comes first in each GeoJSON position. RFC 7946 requires
 * longitude first, but some exporters write latitude first.
 */
export type AxisOrder = 'lon-lat' | 'lat-lon';

export type AxisRange = [min: number, max: number];

export interface AxisSummary {
  positionCount: number;
  /** First few positions, as written in the file. */
  samples: number[][];
  /** Value range of the first and second number across all positions; null when empty. */
  ranges: [AxisRange, AxisRange] | null;
}

const SAMPLE_LIMIT = 3;

function isPosition(value: unknown[]): boolean {
  return value.length > 0 && value.every((entry) => typeof entry === 'number');
}

function visitPositions(coordinates: unknown, visit: (position: number[]) => void): void {
  if (!Array.isArray(coordinates)) return;
  if (isPosition(coordinates)) {
    visit(coordinates as number[]);
    return;
  }
  for (const entry of coordinates) visitPositions(entry, visit);
}

function visitGeometry(geometry: Geometry | null, visit: (position: number[]) => void): void {
  if (!geometry) return;
  if (geometry.type === 'GeometryCollection') {
    for (const child of geometry.geometries) visitGeometry(child, visit);
    return;
  }
  visitPositions(geometry.coordinates, visit);
}

export function summarizeAxes(data: FeatureCollection): AxisSummary {
  const samples: number[][] = [];
  let positionCount = 0;
  let min0 = Infinity;
  let max0 = -Infinity;
  let min1 = Infinity;
  let max1 = -Infinity;

  for (const feature of data.features) {
    visitGeometry(feature.geometry, (position) => {
      const [a = 0, b = 0] = position;
      positionCount += 1;
      if (samples.length < SAMPLE_LIMIT) samples.push(position);
      if (a < min0) min0 = a;
      if (a > max0) max0 = a;
      if (b < min1) min1 = b;
      if (b > max1) max1 = b;
    });
  }

  return {
    positionCount,
    samples,
    ranges:
      positionCount === 0
        ? null
        : [
            [min0, max0],
            [min1, max1],
          ],
  };
}

export function isLatitudeRange([min, max]: AxisRange): boolean {
  return min >= -90 && max <= 90;
}

export function isLongitudeRange([min, max]: AxisRange): boolean {
  return min >= -180 && max <= 180;
}

/** Latitude axis index (0 or 1) for an order. */
export function latitudeIndex(order: AxisOrder): 0 | 1 {
  return order === 'lon-lat' ? 1 : 0;
}

/**
 * Suggests an order from value ranges: latitude must lie within ±90. Falls back
 * to the RFC 7946 longitude-first order when both readings are plausible.
 */
export function detectAxisOrder(summary: AxisSummary): AxisOrder {
  if (!summary.ranges) return 'lon-lat';
  const [first, second] = summary.ranges;
  if (!isLatitudeRange(second) && isLatitudeRange(first)) return 'lat-lon';
  return 'lon-lat';
}

/** Whether the given order yields valid longitude and latitude ranges. */
export function isValidAxisOrder(summary: AxisSummary, order: AxisOrder): boolean {
  if (!summary.ranges) return true;
  const lat = summary.ranges[latitudeIndex(order)];
  const lon = summary.ranges[1 - latitudeIndex(order)] as AxisRange;
  return isLatitudeRange(lat) && isLongitudeRange(lon);
}

function swapPositions(coordinates: unknown): unknown {
  if (!Array.isArray(coordinates)) return coordinates;
  if (isPosition(coordinates)) {
    const [a, b, ...rest] = coordinates as number[];
    return [b, a, ...rest];
  }
  return coordinates.map(swapPositions);
}

function swapGeometry(geometry: Geometry | null): Geometry | null {
  if (!geometry) return geometry;
  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: geometry.geometries.map((child) => swapGeometry(child) as Geometry),
    };
  }
  return { ...geometry, coordinates: swapPositions(geometry.coordinates) } as Geometry;
}

/** Returns the collection in RFC 7946 longitude-first order. */
export function toLonLatOrder(data: FeatureCollection, order: AxisOrder): FeatureCollection {
  if (order === 'lon-lat') return data;
  const { bbox: _bbox, ...rest } = data;
  return {
    ...rest,
    features: data.features.map(({ bbox: _featureBbox, ...feature }) => ({
      ...feature,
      geometry: swapGeometry(feature.geometry) as Geometry,
    })),
  };
}
