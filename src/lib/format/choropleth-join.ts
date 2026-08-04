import type { Feature, FeatureCollection, Geometry } from 'geojson';

export interface ChoroplethFeature {
  geometry: Geometry;
  value: number;
  location: string;
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

function findMatchingProperty(
  feature: Feature,
  valueByLocation: Map<string, number>,
): { location: string; value: number } | null {
  const props = feature.properties;
  if (!props) return null;

  for (const propVal of Object.values(props)) {
    if (typeof propVal !== 'string') continue;
    const trimmed = propVal.trim();
    if (valueByLocation.has(trimmed)) {
      return { location: trimmed, value: valueByLocation.get(trimmed) as number };
    }
    const norm = normalizeKey(trimmed);
    for (const [loc, val] of valueByLocation) {
      if (normalizeKey(loc) === norm) {
        return { location: loc, value: val };
      }
    }
  }
  return null;
}

export function joinChoropleth(
  geojson: FeatureCollection,
  valueByLocation: Map<string, number>,
): ChoroplethFeature[] {
  const result: ChoroplethFeature[] = [];
  for (const feature of geojson.features) {
    if (!feature.geometry) continue;
    const match = findMatchingProperty(feature, valueByLocation);
    if (!match) continue;
    result.push({ geometry: feature.geometry, value: match.value, location: match.location });
  }
  return result;
}

export function choroplethColorScale(
  value: number,
  min: number,
  max: number,
  opacity: number,
): [number, number, number, number] {
  const t = max > min ? (value - min) / (max - min) : 0;
  const clamped = Math.max(0, Math.min(1, t));
  // YlGnBu reversed so high values read as dark/saturated blue.
  const r = Math.round(255 - clamped * 220);
  const g = Math.round(247 - clamped * 115);
  const b = Math.round(188 + clamped * 20);
  return [r, g, b, Math.round(opacity * 200)];
}
