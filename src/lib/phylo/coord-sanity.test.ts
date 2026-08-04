import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractGeoAnnotations } from './annotate.js';
import { introspect } from './introspect.js';
import { parseTreeFile } from './parse.js';

const B117_PATH = join(import.meta.dirname, '../../../public/examples/b117/tree.nex');

// Approximate UK land-mass bounding box (conservative).
// A few coastal/offshore points are acceptable up to slight overshoot.
const UK_LAT_MIN = 49.9;
const UK_LAT_MAX = 60.9;
const UK_LON_MIN = -8.6;
const UK_LON_MAX = 2.2; // extended slightly east to cover Kent coast

// Deliberately tight water carve-outs catch coastal datum-shift regressions.
function isApproxUkLand(lat: number, lon: number): boolean {
  if (lon < -8 || lon > 2.2 || lat < 49 || lat > 61) return false;
  if (lon > 1.75 && lat > 51 && lat < 56) return false; // North Sea
  if (lat < 50.78 && lon > -3) return false; // English Channel
  if (lon > -6 && lon < -3.8 && lat > 53 && lat < 55) return false; // Irish Sea
  if (lon > 1.0 && lat < 51.5 && lat > 51.35) return false; // Thames Estuary mouth
  return true;
}

describe('B.1.1.7 fixture — coordinate sanity (reprojection regression)', () => {
  const text = readFileSync(B117_PATH, 'utf8');
  const graph = parseTreeFile(text);
  const result = introspect(graph);
  const geos = extractGeoAnnotations(graph, result);

  const validGeos = geos.filter((g): g is NonNullable<typeof g> => g !== null);

  it('most nodes have geo annotations', () => {
    expect(validGeos.length).toBeGreaterThan(graph.nodes.length * 0.9);
  });

  it('all node lat values fall within UK bounding box', () => {
    const outsideLat = validGeos.filter((g) => g.lat < UK_LAT_MIN || g.lat > UK_LAT_MAX);
    expect(outsideLat).toHaveLength(0);
  });

  it('all node lon values fall within UK bounding box', () => {
    const outsideLon = validGeos.filter((g) => g.lon < UK_LON_MIN || g.lon > UK_LON_MAX);
    expect(outsideLon).toHaveLength(0);
  });

  it('root MRCA is within SE England (not in the Irish Sea or Atlantic)', () => {
    // Root is node index 0. The root MRCA for B.1.1.7 (Alpha, Kent) should be
    // near SE England. The Irish Sea bug placed it at lat~54.7, lon~-5.6.
    const rootGeo = geos[0] ?? null;
    expect(rootGeo).not.toBeNull();
    if (!rootGeo) return;
    // SE England: lat 50-53, lon -2 to 2
    expect(rootGeo.lat).toBeGreaterThan(50.0);
    expect(rootGeo.lat).toBeLessThan(53.0);
    expect(rootGeo.lon).toBeGreaterThan(-2.0);
    expect(rootGeo.lon).toBeLessThan(2.5);
  });

  it('mean lat is consistent with England (not Northern Ireland)', () => {
    const meanLat = validGeos.reduce((sum, g) => sum + g.lat, 0) / validGeos.length;
    // SE England centroid ~51.5-52.5; Northern Ireland centroid ~54.5
    expect(meanLat).toBeGreaterThan(50.5);
    expect(meanLat).toBeLessThan(53.5);
  });

  it('carries the old SpreadGL cleaned-map outlier mask', () => {
    // The original SpreadGL B117 HTML was generated from
    // B.1.1.7_England.single.tree.output.reprojected.cleaned.csv, after
    // trimming branches with missing UTLA geography. SpreadGL2 keeps the full
    // tree topology but masks those branches from the map.
    const excluded = graph.nodes.filter((n) => n.annotations.spreadgl_map_exclude === 1);
    expect(excluded).toHaveLength(1426);
  });

  it('≥95% of tip nodes fall within approximate UK land polygon (BNG reprojection regression)', () => {
    // Internal ancestral state estimates can legitimately land off-coast.
    const tipGeos = graph.nodes
      .filter((n) => n.adjacents.length === 1)
      .map((n) => geos[n.idx])
      .filter((g): g is NonNullable<typeof g> => g !== null);
    expect(tipGeos.length).toBeGreaterThan(0);

    const onLand = tipGeos.filter((g) => isApproxUkLand(g.lat, g.lon));
    const pct = onLand.length / tipGeos.length;
    expect(pct).toBeGreaterThanOrEqual(0.95);
  });
});
