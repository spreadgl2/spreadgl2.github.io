/** @original SpreadGL2 - informed by peartree's adjacency-list graph model. */

import type { IntrospectResult, PhyloGraph, ValidationResult } from './types.js';

const SAMPLE_SIZE = 20;

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function findPairedNumericFamily(
  keys: string[],
  preferred?: { lat: string; lon: string },
): { lat: string; lon: string } | null {
  const keySet = new Set(keys);
  if (preferred !== undefined && keySet.has(preferred.lat) && keySet.has(preferred.lon)) {
    return preferred;
  }
  for (const key of keys) {
    // Skip HPD-bound keys (contain '%') — they share the lat/lon naming
    // convention (<k>1/<k>2) but hold interval arrays, not point values.
    if (key.includes('%')) continue;
    if (key.endsWith('1')) {
      const base = key.slice(0, -1);
      const lonKey = `${base}2`;
      if (keySet.has(lonKey)) {
        return { lat: key, lon: lonKey };
      }
    }
  }
  return null;
}

function collectInternalAnnotationKeys(graph: PhyloGraph): string[] {
  const keyCounts = new Map<string, number>();
  for (const node of graph.nodes) {
    const isTip = node.adjacents.length === 1;
    if (isTip) continue;
    for (const key of Object.keys(node.annotations)) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(keyCounts.keys());
}

function sampleInternalValues(graph: PhyloGraph, key: string): number[] {
  const values: number[] = [];
  for (const node of graph.nodes) {
    if (values.length >= SAMPLE_SIZE) break;
    const isTip = node.adjacents.length === 1;
    if (isTip) continue;
    const v = node.annotations[key];
    if (isNumber(v)) values.push(v);
  }
  return values;
}

function checkWgs84(latValues: number[], lonValues: number[]): boolean {
  if (latValues.length === 0 || lonValues.length === 0) return false;
  const latsOk = latValues.every((v) => v >= -90 && v <= 90);
  const lonsOk = lonValues.every((v) => v >= -180 && v <= 180);
  return latsOk && lonsOk;
}

const DATE_ANNOTATION_KEYS = new Set(['date', 'numdate', 'year']);

function isDiscreteKey(key: string): boolean {
  if (DATE_ANNOTATION_KEYS.has(key)) return false;
  return !key.endsWith('_set') && !key.endsWith('_set_prob') && !key.includes('%');
}

export function collectTipStringValues(graph: PhyloGraph, key: string): string[] {
  const seen = new Set<string>();
  for (const node of graph.nodes) {
    const isTip = node.adjacents.length === 1;
    if (!isTip) continue;
    const v = node.annotations[key];
    if (typeof v === 'string') seen.add(v);
  }
  return Array.from(seen).sort();
}

function findDiscreteCandidates(graph: PhyloGraph): Array<{ key: string; values: string[] }> {
  const tipKeyCounts = new Map<string, number>();
  for (const node of graph.nodes) {
    const isTip = node.adjacents.length === 1;
    if (!isTip) continue;
    for (const key of Object.keys(node.annotations)) {
      if (!isDiscreteKey(key)) continue;
      const v = node.annotations[key];
      if (typeof v === 'string') {
        tipKeyCounts.set(key, (tipKeyCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const tipCount = graph.nodes.filter((n) => n.adjacents.length === 1).length;
  if (tipCount === 0) return [];

  const candidates: Array<{ key: string; values: string[] }> = [];
  for (const [key, count] of tipKeyCounts) {
    if (count >= tipCount) {
      candidates.push({ key, values: collectTipStringValues(graph, key) });
    }
  }
  return candidates;
}

function toDiscreteResult(
  candidates: Array<{ key: string; values: string[] }>,
  fallback: IntrospectResult,
): IntrospectResult {
  if (candidates.length === 1) {
    const c = candidates[0];
    if (c !== undefined) {
      return { kind: 'discrete', key: c.key, values: c.values, ambiguous: false };
    }
  }
  if (candidates.length > 1) {
    return { kind: 'discrete-ambiguous', candidates };
  }
  return fallback;
}

export function collectAllDiscreteTipKeys(graph: PhyloGraph): string[] {
  const keyCounts = new Map<string, number>();
  const tipCount = graph.nodes.filter((n) => n.adjacents.length === 1).length;
  if (tipCount === 0) return [];
  for (const node of graph.nodes) {
    const isTip = node.adjacents.length === 1;
    if (!isTip) continue;
    for (const key of Object.keys(node.annotations)) {
      if (!isDiscreteKey(key)) continue;
      if (typeof node.annotations[key] === 'string') {
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      }
    }
  }
  return Array.from(keyCounts.entries())
    .filter(([, count]) => count >= tipCount)
    .map(([key]) => key);
}

export function introspect(
  graph: PhyloGraph,
  preferredCoordinateFamily?: { lat: string; lon: string },
): IntrospectResult {
  const keys = collectInternalAnnotationKeys(graph);
  if (keys.length === 0) {
    return toDiscreteResult(findDiscreteCandidates(graph), {
      kind: 'unrecognized',
      reason: 'no annotations on internal nodes',
    });
  }

  const family = findPairedNumericFamily(keys, preferredCoordinateFamily);
  if (family === null) {
    return toDiscreteResult(findDiscreteCandidates(graph), {
      kind: 'unrecognized',
      reason: 'no paired <k>1/<k>2 numeric annotation family found',
    });
  }

  const latValues = sampleInternalValues(graph, family.lat);
  const lonValues = sampleInternalValues(graph, family.lon);

  if (latValues.length === 0 || lonValues.length === 0) {
    return {
      kind: 'unrecognized',
      reason: 'paired keys found but no numeric values on internal nodes',
    };
  }

  const wgs84 = checkWgs84(latValues, lonValues);

  return { kind: 'continuous', keyFamily: family, wgs84 };
}

export function validateGraphForViewing(graph: PhyloGraph): ValidationResult {
  const result = introspect(graph);
  if (result.kind === 'unrecognized') {
    return {
      ok: false,
      refusal: {
        code: 'no_geo',
        title: 'No geographic annotations',
        body: 'SpreadGL2 visualizes phylogeography, which needs location traits like location1/location2 (continuous) or region (discrete).',
        action: 'Re-run BEAST with a geographic prior, or try one of the examples.',
      },
    };
  }
  if (result.kind === 'continuous' && !result.wgs84) {
    return {
      ok: false,
      refusal: {
        code: 'non_wgs84',
        title: "Coordinates aren't WGS84",
        body: 'The coordinates in this tree look like a projected CRS (values out of lat/lon range). SpreadGL2 needs WGS84.',
        action: 'Reproject offline (e.g. with cs2cs) and reload.',
      },
    };
  }
  return { ok: true };
}
