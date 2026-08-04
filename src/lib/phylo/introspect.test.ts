/** @original SpreadGL2 - trait introspection tests. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectAllDiscreteTipKeys, introspect, validateGraphForViewing } from './introspect.js';
import { parseTreeFile } from './parse.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../../tests/fixtures');

describe('introspect — continuous-tiny.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const result = introspect(graph);

  it('returns kind === continuous', () => {
    expect(result.kind).toBe('continuous');
  });

  it('key family is location1 / location2', () => {
    if (result.kind !== 'continuous') throw new Error('not continuous');
    expect(result.keyFamily.lat).toBe('location1');
    expect(result.keyFamily.lon).toBe('location2');
  });

  it('wgs84 === true', () => {
    if (result.kind !== 'continuous') throw new Error('not continuous');
    expect(result.wgs84).toBe(true);
  });
});

describe('introspect — non-wgs84.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'non-wgs84.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const result = introspect(graph);

  it('returns kind === continuous (paired numeric detected)', () => {
    expect(result.kind).toBe('continuous');
  });

  it('key family is coordinates1 / coordinates2', () => {
    if (result.kind !== 'continuous') throw new Error('not continuous');
    expect(result.keyFamily.lat).toBe('coordinates1');
    expect(result.keyFamily.lon).toBe('coordinates2');
  });

  it('wgs84 === false', () => {
    if (result.kind !== 'continuous') throw new Error('not continuous');
    expect(result.wgs84).toBe(false);
  });
});

describe('introspect — unrecognized cases', () => {
  it('returns unrecognized for a graph with no internal annotations', () => {
    const g = parseTreeFile('(A:1,B:2):0;');
    const r = introspect(g);
    expect(r.kind).toBe('unrecognized');
  });
});

describe('validateGraphForViewing — non-wgs84.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'non-wgs84.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const result = validateGraphForViewing(graph);

  it('returns ok === false', () => {
    expect(result.ok).toBe(false);
  });

  it('refusal code is non_wgs84', () => {
    if (result.ok) throw new Error('expected refusal');
    expect(result.refusal.code).toBe('non_wgs84');
  });

  it('returns the WGS84 refusal title', () => {
    if (result.ok) throw new Error('expected refusal');
    expect(result.refusal.title).toBe("Coordinates aren't WGS84");
  });

  it('explains why projected coordinates are refused', () => {
    if (result.ok) throw new Error('expected refusal');
    expect(result.refusal.body).toBe(
      'The coordinates in this tree look like a projected CRS (values out of lat/lon range). SpreadGL2 needs WGS84.',
    );
  });

  it('suggests offline reprojection', () => {
    if (result.ok) throw new Error('expected refusal');
    expect(result.refusal.action).toBe('Reproject offline (e.g. with cs2cs) and reload.');
  });
});

describe('validateGraphForViewing — continuous-tiny.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const result = validateGraphForViewing(graph);

  it('returns ok === true (WGS84 coords, no refusal)', () => {
    expect(result.ok).toBe(true);
  });
});

describe('collectAllDiscreteTipKeys — discrete-tiny.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'discrete-tiny.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const keys = collectAllDiscreteTipKeys(graph);

  it('returns location key', () => {
    expect(keys).toContain('location');
  });

  it('excludes internal annotation keys (only tip string keys)', () => {
    expect(keys.every((k) => typeof k === 'string')).toBe(true);
  });
});

describe('collectAllDiscreteTipKeys — multi-key graph', () => {
  it('returns all discrete tip string keys including secondary traits', () => {
    const nex =
      '#NEXUS\nbegin trees;\n  tree T = [&R] (A[&location="NY",host_type="bat"]:0.5,B[&location="CA",host_type="bird"]:0.5)[&location="NY"]:0;\nend;';
    const graph = parseTreeFile(nex);
    const keys = collectAllDiscreteTipKeys(graph);
    expect(keys).toContain('location');
    expect(keys).toContain('host_type');
  });

  it('excludes keys with % (HPD keys) and _set/_set_prob keys', () => {
    const nex =
      '#NEXUS\nbegin trees;\n  tree T = [&R] (A[&location="NY",location.set={"NY"},location.set.prob={1.0}]:0.5,B[&location="CA",location.set={"CA"},location.set.prob={1.0}]:0.5)[&location="NY"]:0;\nend;';
    const graph = parseTreeFile(nex);
    const keys = collectAllDiscreteTipKeys(graph);
    expect(keys).not.toContain('location_set');
    expect(keys).not.toContain('location_set_prob');
    expect(keys).toContain('location');
  });
});
