import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CacheStore } from '../../src/lib/persist/cache.js';
import { putCached, sha256Hex } from '../../src/lib/persist/cache.js';
import { runPipelineFromString } from '../../src/workers/parser-pipeline.js';
import { createParserApi } from '../../src/workers/parser.worker.js';
import type { WireParseResult } from '../../src/workers/wire.js';
import { rehydrate } from '../../src/workers/wire.js';

const FIXTURES_DIR = join(import.meta.dirname, '../fixtures');

const SYNTHETIC_NEXUS = `#NEXUS
begin trees;
  tree T = [&R] ((TipA|2020-01-01[&location1=40.0,location2=-90.0]:1.0,TipB|2021-06-15[&location1=41.0,location2=-89.0]:1.0)[&location1=39.0,location2=-91.0]:1.0,(TipC|2020-07-04[&location1=38.0,location2=-92.0]:1.0,TipD|2021-12-31[&location1=37.0,location2=-93.0]:1.0)[&location1=36.0,location2=-94.0]:1.0)[&location1=38.0,location2=-92.0];
end;
`;

const MIXED_GEO_NEXUS = `#NEXUS
begin trees;
  tree T = [&R] ((TipA|2020-01-01[&location1=40.0,location2=-90.0,region="North"]:1.0,TipB|2021-06-15[&location1=41.0,location2=-89.0,region="South"]:1.0)[&location1=39.0,location2=-91.0]:1.0,(TipC|2020-07-04[&location1=38.0,location2=-92.0,region="North"]:1.0,TipD|2021-12-31[&location1=37.0,location2=-93.0,region="South"]:1.0)[&location1=36.0,location2=-94.0]:1.0)[&location1=38.0,location2=-92.0];
end;
`;

const YEAR_MONTH_ANNOTATION_NEXUS = `#NEXUS
begin trees;
  tree T = [&R] ((TipA[&date="2020-06",location1=40.0,location2=-90.0]:0.0,TipB[&date="2021-07",location1=41.0,location2=-89.0]:1.0)[&location1=39.0,location2=-91.0]:1.0,(TipC[&date="2020-08",location1=38.0,location2=-92.0]:1.0,TipD[&date="2021-12",location1=37.0,location2=-93.0]:1.0)[&location1=36.0,location2=-94.0]:1.0)[&location1=38.0,location2=-92.0];
end;
`;

const NO_DATE_NEXUS = `#NEXUS
begin trees;
  tree T = [&R] ((TipA[&location1=40.0,location2=-90.0]:1.0,TipB[&location1=41.0,location2=-89.0]:1.0)[&location1=39.0,location2=-91.0]:1.0,(TipC[&location1=38.0,location2=-92.0]:1.0,TipD[&location1=37.0,location2=-93.0]:1.0)[&location1=36.0,location2=-94.0]:1.0)[&location1=38.0,location2=-92.0];
end;
`;

describe('parser pipeline — WireParseResult shape', () => {
  const wire = runPipelineFromString(SYNTHETIC_NEXUS);

  it('produces a graph with nodes', () => {
    expect(wire.graph.nodes.length).toBeGreaterThan(0);
    expect(wire.graph.origIds.length).toBe(wire.graph.nodes.length);
  });

  it('origIds length matches nodes length', () => {
    expect(wire.graph.origIds).toHaveLength(wire.graph.nodes.length);
  });

  it('layout nodes are present and have x/y', () => {
    expect(wire.layout.nodes.length).toBeGreaterThan(0);
    for (const n of wire.layout.nodes) {
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
    }
  });

  it('layout has no nodeMap (Map stripped)', () => {
    expect((wire.layout as Record<string, unknown>)['nodeMap']).toBeUndefined();
  });

  it('branchTable has typed-array columns', () => {
    expect(wire.branchTable.branchId).toBeInstanceOf(Int32Array);
    expect(wire.branchTable.parentBranch).toBeInstanceOf(Int32Array);
    expect(wire.branchTable.isInternal).toBeInstanceOf(Uint8Array);
    expect(wire.branchTable.startTime).toBeInstanceOf(Float32Array);
    expect(wire.branchTable.endTime).toBeInstanceOf(Float32Array);
    expect(wire.branchTable.startLat).toBeInstanceOf(Float32Array);
    expect(wire.branchTable.startLon).toBeInstanceOf(Float32Array);
    expect(wire.branchTable.endLat).toBeInstanceOf(Float32Array);
    expect(wire.branchTable.endLon).toBeInstanceOf(Float32Array);
    expect(wire.branchTable.startGeoResolved).toBeInstanceOf(Uint8Array);
    expect(wire.branchTable.endGeoResolved).toBeInstanceOf(Uint8Array);
  });

  it('dateRange is [min, max] finite numbers', () => {
    expect(wire.dateRange).toHaveLength(2);
    expect(Number.isFinite(wire.dateRange[0])).toBe(true);
    expect(Number.isFinite(wire.dateRange[1])).toBe(true);
    expect(wire.dateRange[0]).toBeLessThan(wire.dateRange[1]);
  });

  it('traitInfo is continuous', () => {
    expect(wire.traitInfo.kind).toBe('continuous');
  });

  it('stringTable is an array', () => {
    expect(Array.isArray(wire.stringTable)).toBe(true);
  });

  it('graph.root has no origIdToIdx Map', () => {
    expect((wire.graph as Record<string, unknown>)['origIdToIdx']).toBeUndefined();
  });
});

describe('parser pipeline — analysis override', () => {
  it('defaults mixed continuous/discrete annotations to continuous', () => {
    const wire = runPipelineFromString(MIXED_GEO_NEXUS);
    expect(wire.traitInfo.kind).toBe('continuous');
    expect(wire.allDiscreteKeys).toContain('region');
  });

  it('can force mixed continuous/discrete annotations to a discrete trait', () => {
    const wire = runPipelineFromString(
      MIXED_GEO_NEXUS,
      undefined,
      'region',
      undefined,
      undefined,
      undefined,
      'discrete',
    );
    expect(wire.traitInfo).toMatchObject({ kind: 'discrete', key: 'region' });
  });
});

describe('parser pipeline — MRSD anchored tree-height dates', () => {
  const wire = runPipelineFromString(YEAR_MONTH_ANNOTATION_NEXUS);
  const result = rehydrate(wire);

  it('calibrates year-month annotation dates', () => {
    expect(result.dateRange[1]).toBeGreaterThan(2021.9);
  });

  it('uses detected MRSD as the anchor and reports tree-height provenance', () => {
    // Raw date is each tip's OWN substring (TipA=2020-06), not the MRSD tip's.
    expect(result.tipDateRows[0]).toMatchObject({
      taxon: 'TipA',
      parsedSubstring: '2020-06',
      format: 'decimal-year',
      source: 'tree-height',
    });
    // The MRSD tip (TipD, 2021-12) keeps its own substring too — raw dates differ per tip.
    expect(result.tipDateRows.find((r) => r.taxon === 'TipD')?.parsedSubstring).toBe('2021-12');
    const tipDate = Number(result.graph.nodes.find((node) => node.name === 'TipA')?.annotations.date);
    expect(tipDate).toBeCloseTo(2020.953, 3);
  });

  it('requires MRSD when no date evidence is detected', () => {
    expect(() => runPipelineFromString(NO_DATE_NEXUS)).toThrow('needs_mrsd');
  });

  it('accepts manual MRSD as YYYY-MM-DD when no date evidence is detected', () => {
    const manual = rehydrate(runPipelineFromString(NO_DATE_NEXUS, undefined, undefined, undefined, '2022-01-31'));

    expect(manual.tipDateRows[0]).toMatchObject({
      parsedSubstring: '2022-01-31',
      source: 'tree-height',
    });
    expect(manual.dateRange[1]).toBeCloseTo(2022.082, 2);
  });
});

describe('parser pipeline — MRSD provenance', () => {
  it('reports which tip produced the auto-detected MRSD', () => {
    const wire = runPipelineFromString(SYNTHETIC_NEXUS);
    // TipD|2021-12-31 is the most recent sampling date.
    expect(wire.mrsdInfo).toBeDefined();
    expect(wire.mrsdInfo?.taxon).toBe('TipD|2021-12-31');
    expect(wire.mrsdInfo?.substring).toBe('2021-12-31');
    expect(wire.mrsdInfo?.format).toBe('iso-pipe');
    expect(wire.mrsdInfo?.manual).toBe(false);
    expect(Math.trunc(wire.mrsdInfo?.decimalYear ?? 0)).toBe(2021);
  });

  it('flags a manual MRSD override with iso-date format and no taxon', () => {
    const wire = runPipelineFromString(NO_DATE_NEXUS, undefined, undefined, undefined, '2022-01-31');
    expect(wire.mrsdInfo?.manual).toBe(true);
    expect(wire.mrsdInfo?.substring).toBe('2022-01-31');
    expect(wire.mrsdInfo?.format).toBe('iso-date');
    expect(wire.mrsdInfo?.taxon).toBeNull();
  });

  it('survives the wire round-trip through rehydrate', () => {
    const result = rehydrate(runPipelineFromString(SYNTHETIC_NEXUS));
    expect(result.mrsdInfo?.taxon).toBe('TipD|2021-12-31');
  });

  it('does not let a bare |NNNN| field masquerade as the MRSD year', () => {
    // Regression: FioRJ|4480|...|22-04-2017 must resolve to 2017-04-22, not 4480.
    const nexus = `#NEXUS
begin trees;
  tree T = [&R] ((FioRJ|4480|Human|RioJaneiro_CasimirodeAbreu|22-04-2017[&location1=-22.0,location2=-42.0]:1.0,M25|Human|NovoCruzeiro|25-01-2017[&location1=-17.0,location2=-41.0]:1.0)[&location1=-19.0,location2=-41.5]:1.0,(M43|Human|Pote|18-01-2017[&location1=-17.5,location2=-41.5]:1.0,MF17|Monkey|SaoRoque|NA|30-01-2017[&location1=-20.0,location2=-46.0]:1.0)[&location1=-18.0,location2=-43.0]:1.0)[&location1=-19.0,location2=-42.0];
end;
`;
    const wire = runPipelineFromString(nexus);
    expect(wire.mrsdInfo?.taxon).toBe('FioRJ|4480|Human|RioJaneiro_CasimirodeAbreu|22-04-2017');
    expect(wire.mrsdInfo?.substring).toBe('22-04-2017');
    expect(wire.mrsdInfo?.format).toBe('day-month-year');
    expect(Math.trunc(wire.mrsdInfo?.decimalYear ?? 0)).toBe(2017);
    expect(wire.dateRange[1]).toBeLessThan(2018);
  });
});

describe('rehydrate — rebuilds Maps from wire format', () => {
  const wire = runPipelineFromString(SYNTHETIC_NEXUS);
  const result = rehydrate(wire);

  it('origIdToIdx is a Map with size = node count', () => {
    expect(result.graph.origIdToIdx).toBeInstanceOf(Map);
    expect(result.graph.origIdToIdx.size).toBe(wire.graph.nodes.length);
  });

  it('every origId maps to correct index', () => {
    for (let i = 0; i < wire.graph.origIds.length; i++) {
      const id = wire.graph.origIds[i];
      if (id === undefined) continue;
      expect(result.graph.origIdToIdx.get(id)).toBe(i);
    }
  });

  it('Layout.nodeMap is a Map with correct size', () => {
    expect(result.layout.nodeMap).toBeInstanceOf(Map);
    expect(result.layout.nodeMap.size).toBe(wire.layout.nodes.length);
  });

  it('each layout node is findable by id in nodeMap', () => {
    for (const n of result.layout.nodes) {
      expect(result.layout.nodeMap.has(n.id)).toBe(true);
      expect(result.layout.nodeMap.get(n.id)).toBe(n);
    }
  });

  it('branchTable round-trips (same reference)', () => {
    expect(result.branchTable.count).toBe(wire.branchTable.count);
    expect(result.branchTable.branchId).toBe(wire.branchTable.branchId);
  });

  it('dateRange round-trips', () => {
    expect(result.dateRange).toEqual(wire.dateRange);
  });

  it('hiddenNodeIds is empty Set', () => {
    expect(result.graph.hiddenNodeIds).toBeInstanceOf(Set);
    expect(result.graph.hiddenNodeIds.size).toBe(0);
  });

  it('collapsedCladeIds is empty Map', () => {
    expect(result.graph.collapsedCladeIds).toBeInstanceOf(Map);
    expect(result.graph.collapsedCladeIds.size).toBe(0);
  });
});

describe('parser pipeline — continuous-tiny.nex round-trip', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
  const wire = runPipelineFromString(text);
  const result = rehydrate(wire);

  it('node count preserved', () => {
    expect(result.graph.nodes.length).toBe(wire.graph.nodes.length);
  });

  it('branch table row count equals nodes - 1', () => {
    expect(result.branchTable.count).toBe(result.graph.nodes.length - 1);
  });

  it('layout x/y values preserved after rehydrate', () => {
    for (let i = 0; i < wire.layout.nodes.length; i++) {
      const original = wire.layout.nodes[i];
      if (original === undefined) continue;
      const rehydrated = result.layout.nodeMap.get(original.id);
      expect(rehydrated).toBeDefined();
      expect(rehydrated?.x).toBe(original.x);
      expect(rehydrated?.y).toBe(original.y);
    }
  });

  it('dateRange min < max and within plausible year range', () => {
    const [min, max] = result.dateRange;
    expect(min).toBeLessThan(max);
    expect(min).toBeGreaterThan(2000);
    expect(max).toBeLessThan(2030);
  });

  it('5 tips in the tree', () => {
    const tips = result.graph.nodes.filter((n) => n.adjacents.length === 1);
    expect(tips.length).toBe(5);
  });

  it('traitInfo is continuous with location1/location2 keys', () => {
    expect(result.traitInfo.kind).toBe('continuous');
    if (result.traitInfo.kind === 'continuous') {
      expect(result.traitInfo.keyFamily.lat).toBe('location1');
      expect(result.traitInfo.keyFamily.lon).toBe('location2');
    }
  });
});

function makeInMemoryStore(): CacheStore & { _data: Map<string, unknown> } {
  const _data = new Map<string, unknown>();
  return {
    _data,
    get: async <T>(key: string) => _data.get(key) as T | undefined,
    set: async (key: string, value: unknown) => { _data.set(key, value); },
    del: async (key: string) => { _data.delete(key); },
    keys: async () => Array.from(_data.keys()),
  };
}

function makeSentinelResult(): WireParseResult {
  const count = 2;
  return {
    graph: {
      nodes: [],
      root: { nodeA: 0, nodeB: 1, lenA: 0.5, lenB: 0.5, annotations: {} },
      origIds: [],
      rooted: true,
    },
    layout: { nodes: [], maxX: 1, maxY: 1, xAxisMode: 'date' },
    branchTable: {
      count,
      branchId: new Int32Array(count),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array(count),
      endTime: new Float32Array(count),
      startLat: new Float32Array(count),
      startLon: new Float32Array(count),
      endLat: new Float32Array(count),
      endLon: new Float32Array(count),
      stateWeight: new Float32Array(count),
    },
    dateRange: [1000, 2000],
    traitInfo: { kind: 'continuous', keyFamily: { lat: 'lat', lon: 'lon' }, wgs84: true },
    stringTable: [],
    nodeHpds: [],
    allDiscreteKeys: [],
    nodeMultiHpds: [],
  };
}

async function cacheKeyFor(
  text: string,
  traitKey?: string,
  tipDatePattern?: string,
  mrsdIso?: string,
  coordinateKeys?: string,
  analysisKind?: 'continuous' | 'discrete',
  hpdKeys?: string | null,
): Promise<string> {
  // Must mirror PARSE_CACHE_VERSION + keyMaterial in parser.worker.ts.
  const keyMaterial = `v3\0${text}\0${traitKey ?? ''}\0${tipDatePattern ?? ''}\0${mrsdIso ?? ''}\0${coordinateKeys ?? ''}\0${analysisKind ?? ''}\0${hpdKeys === null ? '<none>' : (hpdKeys ?? '')}`;
  return sha256Hex(new TextEncoder().encode(keyMaterial));
}

describe('createParserApi — ArrayBuffer input', () => {
  it('parse() accepts ArrayBuffer and returns the same result as string input', async () => {
    const api = createParserApi();
    const fromString = await api.parse(SYNTHETIC_NEXUS);
    const buf = new TextEncoder().encode(SYNTHETIC_NEXUS).buffer as ArrayBuffer;
    const fromBuffer = await api.parse(buf);
    expect(fromBuffer.dateRange).toEqual(fromString.dateRange);
    expect(fromBuffer.traitInfo.kind).toBe('continuous');
  });

  it('ArrayBuffer input always skips the cache', async () => {
    const store = makeInMemoryStore();
    const api = createParserApi(store);
    const buf = new TextEncoder().encode(SYNTHETIC_NEXUS).buffer as ArrayBuffer;
    await api.parse(buf);
    const dataKeys = (await store.keys()).filter((k) => k !== '__lru__');
    expect(dataKeys.length).toBe(0);
  });
});

describe('cache integration — createParserApi', () => {
  it('miss: populates store after first parse', async () => {
    const store = makeInMemoryStore();
    const api = createParserApi(store);
    await api.parse(SYNTHETIC_NEXUS);
    const dataKeys = (await store.keys()).filter((k) => k !== '__lru__');
    expect(dataKeys.length).toBe(1);
  });

  it('hit: returns cached result without re-running the pipeline', async () => {
    const store = makeInMemoryStore();
    const hash = await cacheKeyFor(SYNTHETIC_NEXUS);
    await putCached(hash, makeSentinelResult(), store);
    const api = createParserApi(store);
    const result = await api.parse(SYNTHETIC_NEXUS);
    expect(result.dateRange).toEqual([1000, 2000]);
  });

  it('different confirmedTraitKey misses the plain cache entry', async () => {
    const store = makeInMemoryStore();
    const hash = await cacheKeyFor(SYNTHETIC_NEXUS);
    await putCached(hash, makeSentinelResult(), store);
    const api = createParserApi(store);
    const result = await api.parse(SYNTHETIC_NEXUS, 'location1');
    expect(result.dateRange).not.toEqual([1000, 2000]);
  });

  it('different confirmedTipDatePattern misses the plain cache entry', async () => {
    const store = makeInMemoryStore();
    const hash = await cacheKeyFor(SYNTHETIC_NEXUS);
    await putCached(hash, makeSentinelResult(), store);
    const api = createParserApi(store);
    const result = await api.parse(SYNTHETIC_NEXUS, undefined, 'yyyy-MM-dd');
    expect(result.dateRange).not.toEqual([1000, 2000]);
  });
});
