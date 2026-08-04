import type { FeatureCollection, GeoJsonGeometryTypes, Geometry } from 'geojson';
import { assertTextSize, INPUT_LIMITS, InputLimitError } from './input-limits';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const COORDINATE_GEOMETRIES = new Set<GeoJsonGeometryTypes>([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
]);

function countCoordinates(value: unknown): number {
  if (!Array.isArray(value)) throw new InputLimitError('GeoJSON coordinates must be arrays.');

  let count = 0;
  const stack: Array<{ value: unknown[]; depth: number }> = [{ value, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.depth > INPUT_LIMITS.geojsonGeometryDepth) {
      throw new InputLimitError('GeoJSON geometry is nested too deeply.');
    }
    if (current.value.length > 0 && current.value.every((entry) => typeof entry === 'number')) {
      if (current.value.length < 2 || current.value.length > 4) {
        throw new InputLimitError('GeoJSON positions must contain two to four numbers.');
      }
      if (!current.value.every(Number.isFinite)) {
        throw new InputLimitError('GeoJSON coordinates must be finite numbers.');
      }
      count += 1;
      if (count > INPUT_LIMITS.geojsonCoordinates) {
        throw new InputLimitError(
          `GeoJSON may contain at most ${INPUT_LIMITS.geojsonCoordinates.toLocaleString()} positions.`,
        );
      }
      continue;
    }
    for (const entry of current.value) {
      if (!Array.isArray(entry)) throw new InputLimitError('GeoJSON coordinates are malformed.');
      stack.push({ value: entry, depth: current.depth + 1 });
    }
  }
  return count;
}

function validateGeometry(raw: unknown, depth = 0): number {
  if (raw === null) return 0;
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    throw new InputLimitError('GeoJSON features must contain valid geometry objects.');
  }
  if (depth > INPUT_LIMITS.geojsonGeometryDepth) {
    throw new InputLimitError('GeoJSON geometry collections are nested too deeply.');
  }
  if (raw.type === 'GeometryCollection') {
    if (!Array.isArray(raw.geometries)) {
      throw new InputLimitError('GeoJSON GeometryCollection must contain a geometries array.');
    }
    let total = 0;
    for (const geometry of raw.geometries) total += validateGeometry(geometry, depth + 1);
    return total;
  }
  if (!COORDINATE_GEOMETRIES.has(raw.type as GeoJsonGeometryTypes)) {
    throw new InputLimitError(`Unsupported GeoJSON geometry type: ${raw.type}.`);
  }
  return countCoordinates(raw.coordinates);
}

export function validateFeatureCollection(raw: unknown): FeatureCollection {
  if (!isRecord(raw) || raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
    throw new InputLimitError('GeoJSON must be a FeatureCollection.');
  }
  if (raw.features.length > INPUT_LIMITS.geojsonFeatures) {
    throw new InputLimitError(
      `GeoJSON may contain at most ${INPUT_LIMITS.geojsonFeatures.toLocaleString()} features.`,
    );
  }

  let coordinateCount = 0;
  for (const feature of raw.features) {
    if (!isRecord(feature) || feature.type !== 'Feature') {
      throw new InputLimitError('GeoJSON FeatureCollection contains a malformed feature.');
    }
    coordinateCount += validateGeometry(feature.geometry);
    if (coordinateCount > INPUT_LIMITS.geojsonCoordinates) {
      throw new InputLimitError(
        `GeoJSON may contain at most ${INPUT_LIMITS.geojsonCoordinates.toLocaleString()} positions.`,
      );
    }
  }
  return raw as unknown as FeatureCollection<Geometry>;
}

export function parseFeatureCollection(text: string): FeatureCollection {
  assertTextSize('geojson', text);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InputLimitError('GeoJSON contains invalid JSON.');
  }
  return validateFeatureCollection(raw);
}
