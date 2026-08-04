import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';

export type BBox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

/**
 * Compute the bounding box of a list of (lon, lat) points. Returns null if
 * the input has no finite coordinates.
 */
export function computePointsBBox(
  points: Array<[number, number]> | Iterable<[number, number]>,
): BBox | null {
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const [lon, lat] of points) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lon === 0 && lat === 0) continue; // null-island fallback, ignored
    any = true;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return any ? [minLon, minLat, maxLon, maxLat] : null;
}

/**
 * Pad a bbox by a fraction of its extent (default 10 %). When the extent
 * collapses on one axis (single-point data), fall back to an absolute degree
 * pad so the result is still a positive-area box.
 */
export function padBBox(bbox: BBox, fraction = 0.1, minPadDeg = 2): BBox {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lonPad = Math.max((maxLon - minLon) * fraction, minPadDeg);
  const latPad = Math.max((maxLat - minLat) * fraction, minPadDeg);
  return [minLon - lonPad, minLat - latPad, maxLon + lonPad, maxLat + latPad];
}

/**
 * Compute a Feature's bbox by walking its geometry. Uses the precomputed
 * `bbox` property if the feature carries one (Natural Earth files do).
 */
export function featureBBox(feature: Feature): BBox | null {
  if (
    Array.isArray(feature.bbox) &&
    feature.bbox.length >= 4 &&
    feature.bbox.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    return [feature.bbox[0], feature.bbox[1], feature.bbox[2], feature.bbox[3]] as BBox;
  }
  return geometryBBox(feature.geometry);
}

function geometryBBox(geom: Geometry | null): BBox | null {
  if (!geom) return null;
  const positions: Position[] = [];
  collectPositions(geom, positions);
  return computePointsBBox(positions.map((p) => [p[0] ?? 0, p[1] ?? 0]));
}

function collectPositions(geom: Geometry, out: Position[]): void {
  switch (geom.type) {
    case 'Point':
      out.push(geom.coordinates);
      return;
    case 'MultiPoint':
    case 'LineString':
      for (const p of geom.coordinates) out.push(p);
      return;
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of geom.coordinates) for (const p of ring) out.push(p);
      return;
    case 'MultiPolygon':
      for (const poly of geom.coordinates)
        for (const ring of poly) for (const p of ring) out.push(p);
      return;
    case 'GeometryCollection':
      for (const g of geom.geometries) collectPositions(g, out);
      return;
  }
}

function bboxesOverlap(a: BBox, b: BBox): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

/**
 * Return a new FeatureCollection containing only the features whose bbox
 * intersects `analysisBBox`. Used by the example auto-loader to keep just the
 * country / region polygons that overlap the tree's geographic extent —
 * everything else (e.g. the 190+ other Natural Earth countries) is dropped.
 */
export function filterBoundariesByBBox(
  geojson: FeatureCollection,
  analysisBBox: BBox,
): FeatureCollection {
  const features = geojson.features.filter((f) => {
    const fb = featureBBox(f);
    return fb !== null && bboxesOverlap(fb, analysisBBox);
  });
  return { type: 'FeatureCollection', features };
}

/**
 * Ray-casting point-in-ring. `ring` is an array of [lon, lat] vertices that
 * close back on themselves (the last vertex equals the first). Returns true
 * if (lon, lat) is strictly inside the ring; edge cases (exactly on an
 * edge or a vertex) may be true or false depending on which side the
 * floating-point math falls on — fine for our usage (one of ~hundreds of
 * branch endpoints needs to land inside, exact-edge cases are rounding
 * noise).
 */
function pointInRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * True if the point falls inside the feature's geometry. Handles Polygon
 * (with holes) and MultiPolygon. Point/LineString/etc. always return false —
 * those geometry types aren't meaningful as "regions" for our filter.
 */
export function pointInFeature(point: [number, number], feature: Feature): boolean {
  const [lon, lat] = point;
  const fb = featureBBox(feature);
  if (fb === null) return false;
  if (lon < fb[0] || lon > fb[2] || lat < fb[1] || lat > fb[3]) return false;
  const geom = feature.geometry;
  if (!geom) return false;
  if (geom.type === 'Polygon') {
    return polygonContains(lon, lat, geom.coordinates);
  }
  if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      if (polygonContains(lon, lat, poly)) return true;
    }
  }
  return false;
}

function polygonContains(lon: number, lat: number, rings: Position[][]): boolean {
  // First ring is the outer boundary; subsequent rings are holes. A point
  // is inside the polygon iff it's inside the outer ring AND not inside any hole.
  if (rings.length === 0) return false;
  const outer = rings[0]!;
  if (!pointInRing(lon, lat, outer)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lon, lat, rings[i]!)) return false;
  }
  return true;
}

/**
 * Return a new FeatureCollection containing only the features that contain
 * at least one of `points`. Strict per-feature filter — RABV's continental-US
 * branch points will keep just the US feature; YFV's Brazilian points keep
 * just Brazil. Uses each feature's bbox as a cheap pre-filter before paying
 * for the per-point polygon ray-cast.
 */
export function filterBoundariesByPoints(
  geojson: FeatureCollection,
  points: Array<[number, number]>,
): FeatureCollection {
  // De-dupe & drop null-island fallbacks.
  const cleaned: Array<[number, number]> = [];
  for (const [lon, lat] of points) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lon === 0 && lat === 0) continue;
    cleaned.push([lon, lat]);
  }
  if (cleaned.length === 0) return { type: 'FeatureCollection', features: [] };

  // Compute the union bbox of all points once so we can skip features whose
  // bbox is entirely outside the point cloud — cheaper than per-point checks.
  const unionBBox = computePointsBBox(cleaned);
  if (unionBBox === null) return { type: 'FeatureCollection', features: [] };

  const features = geojson.features.filter((f) => {
    const fb = featureBBox(f);
    if (fb === null || !bboxesOverlap(fb, unionBBox)) return false;
    for (const p of cleaned) {
      if (pointInFeature(p, f)) return true;
    }
    return false;
  });
  return { type: 'FeatureCollection', features };
}
