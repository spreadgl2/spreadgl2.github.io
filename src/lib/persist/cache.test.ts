import { describe, expect, it } from 'vitest';
import type { WireParseResult } from '../../workers/wire.js';
import { type CacheStore, clearCache, getCached, putCached, sha256Hex } from './cache.js';

function makeStore(): CacheStore & { _data: Map<string, unknown> } {
  const _data = new Map<string, unknown>();
  return {
    _data,
    get: async <T>(key: string) => _data.get(key) as T | undefined,
    set: async (key: string, value: unknown) => {
      _data.set(key, value);
    },
    del: async (key: string) => {
      _data.delete(key);
    },
    keys: async () => Array.from(_data.keys()),
  };
}

function makeWireResult(tipCount = 4): WireParseResult {
  const count = tipCount - 1;
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
    dateRange: [2020, 2023],
    traitInfo: { kind: 'continuous', keyFamily: { lat: 'lat', lon: 'lon' }, wgs84: true },
    stringTable: [],
    nodeHpds: [],
    allDiscreteKeys: [],
    nodeMultiHpds: [],
  };
}

describe('sha256Hex', () => {
  it('returns 64-char lowercase hex string', async () => {
    const hash = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('same bytes produce same hash', async () => {
    const a = await sha256Hex(new Uint8Array([1, 2, 3]));
    const b = await sha256Hex(new Uint8Array([1, 2, 3]));
    expect(a).toBe(b);
  });

  it('different bytes produce different hash', async () => {
    const a = await sha256Hex(new Uint8Array([1, 2, 3]));
    const b = await sha256Hex(new Uint8Array([4, 5, 6]));
    expect(a).not.toBe(b);
  });
});

describe('getCached / putCached', () => {
  it('returns undefined on miss', async () => {
    const store = makeStore();
    const result = await getCached('nonexistent', store);
    expect(result).toBeUndefined();
  });

  it('round-trips a WireParseResult', async () => {
    const store = makeStore();
    const wire = makeWireResult();
    await putCached('abc123', wire, store);
    const hit = await getCached('abc123', store);
    expect(hit).toBeDefined();
    expect(hit?.dateRange).toEqual([2020, 2023]);
    expect(hit?.branchTable.count).toBe(wire.branchTable.count);
  });

  it('updates accessedAt on hit', async () => {
    const store = makeStore();
    const wire = makeWireResult();
    await putCached('hash1', wire, store);

    const lruBefore = store._data.get('__lru__') as Record<
      string,
      { accessedAt: number; sizeBytes: number }
    >;
    const tBefore = lruBefore['hash1']?.accessedAt ?? 0;

    await new Promise((r) => setTimeout(r, 5));
    await getCached('hash1', store);

    const lruAfter = store._data.get('__lru__') as Record<
      string,
      { accessedAt: number; sizeBytes: number }
    >;
    const tAfter = lruAfter['hash1']?.accessedAt ?? 0;
    expect(tAfter).toBeGreaterThan(tBefore);
  });
});

describe('LRU eviction', () => {
  it('evicts oldest entry when total exceeds 200 MB', async () => {
    const store = makeStore();

    const BIG = 200 * 1024 * 1024;

    const idx = {
      old_entry: { accessedAt: 1000, sizeBytes: BIG },
    };
    store._data.set('__lru__', idx);
    store._data.set('old_entry', makeWireResult());

    const wire = makeWireResult();
    await putCached('new_entry', wire, store);

    expect(store._data.has('old_entry')).toBe(false);
    expect(store._data.has('new_entry')).toBe(true);
  });

  it('evicts multiple oldest entries when a single new entry requires freeing more than one', async () => {
    const store = makeStore();

    const SMALL = 1 * 1024 * 1024;
    const LARGE = 199 * 1024 * 1024;
    const idx = {
      entry_a: { accessedAt: 1000, sizeBytes: SMALL },
      entry_b: { accessedAt: 2000, sizeBytes: SMALL },
      entry_c: { accessedAt: 3000, sizeBytes: LARGE },
    };
    store._data.set('__lru__', idx);
    store._data.set('entry_a', makeWireResult());
    store._data.set('entry_b', makeWireResult());
    store._data.set('entry_c', makeWireResult());

    const wire = makeWireResult();
    await putCached('entry_d', wire, store);

    expect(store._data.has('entry_a')).toBe(false);
    expect(store._data.has('entry_b')).toBe(false);
    expect(store._data.has('entry_c')).toBe(true);
    expect(store._data.has('entry_d')).toBe(true);
  });
});

describe('clearCache', () => {
  it('removes all keys from the store', async () => {
    const store = makeStore();
    await putCached('k1', makeWireResult(), store);
    await putCached('k2', makeWireResult(), store);
    await clearCache(store);
    expect(store._data.size).toBe(0);
  });
});
