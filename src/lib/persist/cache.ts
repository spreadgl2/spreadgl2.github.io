import { createStore, del, get, keys, set } from 'idb-keyval';
import type { WireParseResult } from '../../workers/wire.js';

const MAX_CACHE_BYTES = 200 * 1024 * 1024;

const LRU_INDEX_KEY = '__lru__';

interface LruEntry {
  accessedAt: number;
  sizeBytes: number;
}

type LruIndex = Record<string, LruEntry>;

export interface CacheStore {
  get: <T>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<void>;
  del: (key: string) => Promise<void>;
  keys: () => Promise<string[]>;
}

let _defaultStore: CacheStore | undefined;

function defaultStore(): CacheStore {
  if (_defaultStore) return _defaultStore;
  const idbStore = createStore('spreadgl2-parse-cache', 'parsed-trees');
  _defaultStore = {
    get: <T>(key: string) => get<T>(key, idbStore),
    set: (key: string, value: unknown) => set(key, value, idbStore),
    del: (key: string) => del(key, idbStore),
    keys: () => keys<string>(idbStore),
  };
  return _defaultStore;
}

export function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return crypto.subtle.digest('SHA-256', bytes).then((buf) => {
    const arr = new Uint8Array(buf);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  });
}

function estimateSize(result: WireParseResult): number {
  const bt = result.branchTable;
  let bytes = 0;
  bytes += bt.branchId.byteLength;
  bytes += bt.parentBranch.byteLength;
  bytes += bt.isInternal.byteLength;
  bytes += bt.startTime.byteLength;
  bytes += bt.endTime.byteLength;
  bytes += bt.startLat.byteLength;
  bytes += bt.startLon.byteLength;
  bytes += bt.endLat.byteLength;
  bytes += bt.endLon.byteLength;
  bytes += bt.stateWeight.byteLength;
  if (bt.startGeoResolved) bytes += bt.startGeoResolved.byteLength;
  if (bt.endGeoResolved) bytes += bt.endGeoResolved.byteLength;
  if (bt.posterior) bytes += bt.posterior.byteLength;
  if (bt.hpdIndex) bytes += bt.hpdIndex.byteLength;
  if (bt.startLocationId) bytes += bt.startLocationId.byteLength;
  if (bt.endLocationId) bytes += bt.endLocationId.byteLength;
  bytes += JSON.stringify(result.graph).length * 2;
  bytes += JSON.stringify(result.layout.nodes).length * 2;
  return bytes;
}

async function readLruIndex(store: CacheStore): Promise<LruIndex> {
  const idx = await store.get<LruIndex>(LRU_INDEX_KEY);
  return idx ?? {};
}

async function writeLruIndex(store: CacheStore, idx: LruIndex): Promise<void> {
  await store.set(LRU_INDEX_KEY, idx);
}

async function evictToFit(store: CacheStore, idx: LruIndex, incoming: number): Promise<LruIndex> {
  const total = Object.values(idx).reduce((sum, e) => sum + e.sizeBytes, 0);
  if (total + incoming <= MAX_CACHE_BYTES) return idx;

  const sorted = Object.entries(idx).sort((a, b) => a[1].accessedAt - b[1].accessedAt);
  let freed = 0;
  const needed = total + incoming - MAX_CACHE_BYTES;
  const updated = { ...idx };

  for (const [hash, entry] of sorted) {
    if (freed >= needed) break;
    await store.del(hash);
    freed += entry.sizeBytes;
    delete updated[hash];
  }

  return updated;
}

export async function getCached(
  hash: string,
  store: CacheStore = defaultStore(),
): Promise<WireParseResult | undefined> {
  const result = await store.get<WireParseResult>(hash);
  if (result === undefined) return undefined;

  const idx = await readLruIndex(store);
  const entry = idx[hash];
  if (entry !== undefined) {
    idx[hash] = { ...entry, accessedAt: Date.now() };
    await writeLruIndex(store, idx);
  }

  return result;
}

export async function putCached(
  hash: string,
  result: WireParseResult,
  store: CacheStore = defaultStore(),
): Promise<void> {
  const sizeBytes = estimateSize(result);
  const idx = await readLruIndex(store);
  const evicted = await evictToFit(store, idx, sizeBytes);

  await store.set(hash, result);
  evicted[hash] = { accessedAt: Date.now(), sizeBytes };
  await writeLruIndex(store, evicted);
}

export async function clearCache(store: CacheStore = defaultStore()): Promise<void> {
  const allKeys = await store.keys();
  await Promise.all(allKeys.map((k) => store.del(k)));
}
