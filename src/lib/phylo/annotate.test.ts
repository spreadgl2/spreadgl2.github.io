/** @original SpreadGL2 - geographic and HPD annotation tests. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractGeoAnnotations,
  extractHpdPolygons,
  extractMultiModalHpdPolygons,
} from './annotate.js';
import { introspect } from './introspect.js';
import { parseTreeFile } from './parse.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../../tests/fixtures');

describe('extractGeoAnnotations — continuous-tiny.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const introspectResult = introspect(graph);
  const geos = extractGeoAnnotations(graph, introspectResult);

  it('returns one entry per node', () => {
    expect(geos).toHaveLength(graph.nodes.length);
  });

  it('all entries are non-null (all nodes in fixture have paired annotations)', () => {
    for (const geo of geos) {
      expect(geo).not.toBeNull();
    }
  });

  it('root node (idx=0) has correct lat/lon', () => {
    const geo = geos[0] ?? null;
    expect(geo).not.toBeNull();
    if (geo === null) throw new Error('unexpected null');
    expect(geo.lat).toBeCloseTo(39.4523, 4);
    expect(geo.lon).toBeCloseTo(-89.9012, 4);
  });

  it('TipA (idx=3) has correct lat/lon', () => {
    const geo = geos[3] ?? null;
    expect(geo).not.toBeNull();
    if (geo === null) throw new Error('unexpected null');
    expect(geo.lat).toBeCloseTo(38.5234, 4);
    expect(geo.lon).toBeCloseTo(-95.3127, 4);
  });
});

describe('extractGeoAnnotations — unrecognized introspect result', () => {
  it('returns all nulls when introspect is unrecognized', () => {
    const graph = parseTreeFile('(A:1,B:2):0;');
    const introspectResult = introspect(graph);
    const geos = extractGeoAnnotations(graph, introspectResult);
    expect(introspectResult.kind).toBe('unrecognized');
    expect(geos).toHaveLength(graph.nodes.length);
    for (const geo of geos) {
      expect(geo).toBeNull();
    }
  });
});

describe('T046 extractHpdPolygons — continuous-tiny.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const introspectResult = introspect(graph);
  const hpds = extractHpdPolygons(graph, introspectResult);

  it('returns one entry per node', () => {
    expect(hpds).toHaveLength(graph.nodes.length);
  });

  it('tips return null (no HPD annotations on tips)', () => {
    const tips = graph.nodes.filter((n) => n.adjacents.length === 1);
    for (const tip of tips) {
      expect(hpds[tip.idx]).toBeNull();
    }
  });

  it('internal nodes with HPD return GeoJSON Polygon', () => {
    const internals = graph.nodes.filter((n) => n.adjacents.length > 1);
    const withHpd = internals.filter(
      (n) =>
        Array.isArray(n.annotations['location1_95%_HPD']) &&
        Array.isArray(n.annotations['location2_95%_HPD']),
    );
    expect(withHpd.length).toBeGreaterThan(0);
    for (const node of withHpd) {
      const hpd = hpds[node.idx];
      expect(hpd).not.toBeNull();
      expect(hpd?.type).toBe('Polygon');
      expect(Array.isArray(hpd?.coordinates)).toBe(true);
      expect(hpd?.coordinates).toHaveLength(1);
    }
  });

  it('root node (idx=0) has no HPD in fixture → null', () => {
    expect(hpds[0]).toBeNull();
  });
});

describe('T046 extractHpdPolygons — hpd-polygon.nex (multi-vertex polygon)', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'hpd-polygon.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const introspectResult = introspect(graph);
  const hpds = extractHpdPolygons(graph, introspectResult);

  it('returns one entry per node', () => {
    expect(hpds).toHaveLength(graph.nodes.length);
  });

  it('internal nodes with 9-vertex HPD produce simplified closed rings (Fix 4: RDP tolerance)', () => {
    const internals = graph.nodes.filter((n) => n.adjacents.length > 1);
    const withHpd = internals.filter(
      (n) =>
        Array.isArray(n.annotations['location1_95%_HPD']) &&
        (n.annotations['location1_95%_HPD'] as unknown[]).length === 9,
    );
    expect(withHpd.length).toBeGreaterThan(0);
    for (const node of withHpd) {
      const hpd = hpds[node.idx];
      expect(hpd).not.toBeNull();
      const ring = hpd?.coordinates[0] ?? [];
      // Fix 4: RDP simplification may reduce vertex count. Minimum meaningful
      // polygon is 4 points (triangle + closing vertex). Ring must remain closed.
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
  });

  it('polygon vertices are [lon, lat] pairs within WGS84 range', () => {
    const internals = graph.nodes.filter((n) => n.adjacents.length > 1);
    for (const node of internals) {
      const hpd = hpds[node.idx] ?? null;
      if (hpd === null) continue;
      for (const [lon, lat] of hpd.coordinates[0] ?? []) {
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
      }
    }
  });
});

describe('T046 extractHpdPolygons — unrecognized introspect result', () => {
  it('returns all nulls when introspect is unrecognized', () => {
    const graph = parseTreeFile('(A:1,B:2):0;');
    const introspectResult = introspect(graph);
    const hpds = extractHpdPolygons(graph, introspectResult);
    expect(introspectResult.kind).toBe('unrecognized');
    expect(hpds).toHaveLength(graph.nodes.length);
    for (const hpd of hpds) {
      expect(hpd).toBeNull();
    }
  });
});

describe('T065 extractMultiModalHpdPolygons — multimodal-hpd.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'multimodal-hpd.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const introspectResult = introspect(graph);
  const multiHpds = extractMultiModalHpdPolygons(graph, introspectResult);

  it('returns one entry per node', () => {
    expect(multiHpds).toHaveLength(graph.nodes.length);
  });

  it('tips return null (no multi-modal HPD annotations on tips)', () => {
    const tips = graph.nodes.filter((n) => n.adjacents.length === 1);
    for (const tip of tips) {
      expect(multiHpds[tip.idx]).toBeNull();
    }
  });

  it('node with modality=1 emits exactly 1 polygon', () => {
    const node = graph.nodes.find(
      (n) =>
        typeof n.annotations['location1_80%HPD_modality'] === 'number' &&
        n.annotations['location1_80%HPD_modality'] === 1,
    );
    expect(node).toBeDefined();
    if (node === undefined) return;
    const result = multiHpds[node.idx];
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.type).toBe('Polygon');
  });

  it('node with modality=2 emits exactly 2 polygons', () => {
    const node = graph.nodes.find(
      (n) =>
        typeof n.annotations['location1_80%HPD_modality'] === 'number' &&
        n.annotations['location1_80%HPD_modality'] === 2,
    );
    expect(node).toBeDefined();
    if (node === undefined) return;
    const result = multiHpds[node.idx];
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    for (const poly of result ?? []) {
      expect(poly.type).toBe('Polygon');
      expect(Array.isArray(poly.coordinates)).toBe(true);
      expect(poly.coordinates).toHaveLength(1);
    }
  });

  it('node with modality=3 emits exactly 3 polygons', () => {
    const node = graph.nodes.find(
      (n) =>
        typeof n.annotations['location1_80%HPD_modality'] === 'number' &&
        n.annotations['location1_80%HPD_modality'] === 3,
    );
    expect(node).toBeDefined();
    if (node === undefined) return;
    const result = multiHpds[node.idx];
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    for (const poly of result ?? []) {
      expect(poly.type).toBe('Polygon');
      expect(poly.coordinates).toHaveLength(1);
    }
  });

  it('each polygon has a closed ring (first vertex equals last)', () => {
    for (const entry of multiHpds) {
      if (entry === null) continue;
      for (const poly of entry) {
        const ring = poly.coordinates[0] ?? [];
        expect(ring.length).toBeGreaterThanOrEqual(2);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
      }
    }
  });

  it('all polygon vertices are [lon, lat] pairs within WGS84 range', () => {
    for (const entry of multiHpds) {
      if (entry === null) continue;
      for (const poly of entry) {
        for (const [lon, lat] of poly.coordinates[0] ?? []) {
          expect(lon).toBeGreaterThanOrEqual(-180);
          expect(lon).toBeLessThanOrEqual(180);
          expect(lat).toBeGreaterThanOrEqual(-90);
          expect(lat).toBeLessThanOrEqual(90);
        }
      }
    }
  });
});

describe('RDP degenerate-ring guard — hpd-polygon-degenerate.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'hpd-polygon-degenerate.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const introspectResult = introspect(graph);
  const hpds = extractHpdPolygons(graph, introspectResult);

  it('preserves the original ring when all interior vertices are sub-tolerance', () => {
    const nodeWithTinyHpd = graph.nodes.find(
      (n) =>
        Array.isArray(n.annotations['location1_95%_HPD']) &&
        (n.annotations['location1_95%_HPD'] as unknown[]).length === 5,
    );
    expect(nodeWithTinyHpd).toBeDefined();
    if (!nodeWithTinyHpd) return;
    const hpd = hpds[nodeWithTinyHpd.idx];
    expect(hpd).not.toBeNull();
    const ring = hpd?.coordinates[0] ?? [];
    // All 5 input vertices are within RDP_TOLERANCE of the closing-pair base
    // segment; without the guard, RDP would return 2 points (degenerate).
    // Guard must preserve the original 5-point ring.
    expect(ring.length).toBe(5);
  });
});

describe('T065 extractMultiModalHpdPolygons — unrecognized introspect result', () => {
  it('returns all nulls when introspect is unrecognized', () => {
    const graph = parseTreeFile('(A:1,B:2):0;');
    const introspectResult = introspect(graph);
    const result = extractMultiModalHpdPolygons(graph, introspectResult);
    expect(introspectResult.kind).toBe('unrecognized');
    expect(result).toHaveLength(graph.nodes.length);
    for (const entry of result) {
      expect(entry).toBeNull();
    }
  });
});
