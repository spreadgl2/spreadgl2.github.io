/** @original SpreadGL2 - geographic and HPD annotation extraction. */

import type {
  GeoJSONPolygon,
  IntrospectResult,
  NodeGeo,
  NodeHpd,
  NodeMultiHpd,
  PhyloGraph,
} from './types.js';

export type { NodeGeo, NodeHpd, NodeMultiHpd };

export function extractGeoAnnotations(graph: PhyloGraph, introspect: IntrospectResult): NodeGeo[] {
  if (introspect.kind !== 'continuous') {
    return graph.nodes.map(() => null);
  }

  const { lat: latKey, lon: lonKey } = introspect.keyFamily;

  return graph.nodes.map((node) => {
    const lat = node.annotations[latKey];
    const lon = node.annotations[lonKey];
    if (
      typeof lat === 'number' &&
      Number.isFinite(lat) &&
      typeof lon === 'number' &&
      Number.isFinite(lon)
    ) {
      return { lat, lon };
    }
    return null;
  });
}

function isNumericArray(v: unknown): v is number[] {
  return (
    Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && Number.isFinite(x))
  );
}

// Douglas-Peucker perpendicular distance from point P to line (A→B).
function perpendicularDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const cross = Math.abs((py - ay) * dx - (px - ax) * dy);
  return cross / Math.sqrt(lenSq);
}

function rdpReduce(
  pts: [number, number][],
  lo: number,
  hi: number,
  tol: number,
  keep: boolean[],
): void {
  if (hi <= lo + 1) return;
  let maxDist = 0;
  let maxIdx = lo;
  const [ax = 0, ay = 0] = pts[lo] ?? [];
  const [bx = 0, by = 0] = pts[hi] ?? [];
  for (let i = lo + 1; i < hi; i++) {
    const [px = 0, py = 0] = pts[i] ?? [];
    const d = perpendicularDist(px, py, ax, ay, bx, by);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > tol) {
    keep[maxIdx] = true;
    rdpReduce(pts, lo, maxIdx, tol, keep);
    rdpReduce(pts, maxIdx, hi, tol, keep);
  }
}

// Ramer-Douglas-Peucker simplification. Tolerance is in the same units as
// the coordinates (degrees for WGS84 lon/lat rings). 0.01° ≈ 1 km — visually
// lossless at any zoom level used in SpreadGL2 (global to continent scale).
const RDP_TOLERANCE = 0.01;

function simplifyRing(ring: [number, number][]): [number, number][] {
  if (ring.length <= 4) return ring;
  const keep = new Array<boolean>(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;
  rdpReduce(ring, 0, ring.length - 1, RDP_TOLERANCE, keep);
  const simplified = ring.filter((_, i) => keep[i]);
  // A closed ring needs at least 4 points (3 unique + closing repeat) to be
  // a valid polygon. A tiny HPD tip whose every interior vertex lies within
  // RDP_TOLERANCE of the base segment degenerates to 2 points; skip
  // simplification and return the original in that case.
  if (simplified.length < 4) return ring;
  return simplified;
}

function buildClosedRing(lats: number[], lons: number[]): GeoJSONPolygon {
  const ring: [number, number][] = lats.map((lat, i) => [lons[i] ?? 0, lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  const simplified = simplifyRing(ring);
  return { type: 'Polygon', coordinates: [simplified] };
}

export function extractHpdPolygons(
  graph: PhyloGraph,
  introspect: IntrospectResult,
  hpdFamily?: { lat: string; lon: string } | null,
): NodeHpd[] {
  if (introspect.kind !== 'continuous') {
    return graph.nodes.map(() => null);
  }
  if (hpdFamily === null) {
    return graph.nodes.map(() => null);
  }

  const { lat: latKey, lon: lonKey } = introspect.keyFamily;
  const latHpdKey = hpdFamily?.lat ?? `${latKey}_95%_HPD`;
  const lonHpdKey = hpdFamily?.lon ?? `${lonKey}_95%_HPD`;

  return graph.nodes.map((node) => {
    const latArr = node.annotations[latHpdKey];
    const lonArr = node.annotations[lonHpdKey];
    if (!isNumericArray(latArr) || !isNumericArray(lonArr) || latArr.length !== lonArr.length) {
      return null;
    }
    return buildClosedRing(latArr, lonArr);
  });
}

export function extractMultiModalHpdPolygons(
  graph: PhyloGraph,
  introspect: IntrospectResult,
): NodeMultiHpd[] {
  if (introspect.kind !== 'continuous') {
    return graph.nodes.map(() => null);
  }

  const { lat: latKey, lon: lonKey } = introspect.keyFamily;
  // Some BEAST X outputs use the base name (without the numeric suffix) for the
  // modality key: e.g. "location_80%HPD_modality" when coordinate keys are
  // "location1"/"location2". Try the numbered form first; fall back to base.
  const baseKey = latKey.endsWith('1') ? latKey.slice(0, -1) : latKey;
  const modalityKeyFull = `${latKey}_80%HPD_modality`;
  const modalityKeyBase = `${baseKey}_80%HPD_modality`;
  const modalityKey = graph.nodes.some((n) => modalityKeyFull in n.annotations)
    ? modalityKeyFull
    : modalityKeyBase;

  return graph.nodes.map((node) => {
    const modality = node.annotations[modalityKey];
    if (typeof modality !== 'number' || !Number.isFinite(modality) || modality < 1) {
      return null;
    }
    const n = Math.round(modality);
    const polygons: GeoJSONPolygon[] = [];
    for (let i = 1; i <= n; i++) {
      const latArr = node.annotations[`${latKey}_80%HPD_${i}`];
      const lonArr = node.annotations[`${lonKey}_80%HPD_${i}`];
      if (!isNumericArray(latArr) || !isNumericArray(lonArr) || latArr.length !== lonArr.length) {
        continue;
      }
      polygons.push(buildClosedRing(latArr, lonArr));
    }
    return polygons.length > 0 ? polygons : null;
  });
}
