import * as Comlink from 'comlink';
import { type CacheStore, getCached, putCached, sha256Hex } from '../lib/persist/cache.js';
import { assertTextSize } from '../lib/security/input-limits.js';
import type { ParseStage, ProgressCallback } from './parser-pipeline.js';
import { runPipeline } from './parser-pipeline.js';
import type { WireParseResult } from './wire.js';
import { getTransferables } from './wire.js';

// Bump whenever the parse output shape or logic changes, so stale entries
// keyed only on the tree text are not served by a newer build. Folded into the
// cache key below.
//   v2: add mrsdInfo to the wire; prioritize complete dates over bare years.
//   v3: add explicit branch endpoint geographic-resolution masks.
const PARSE_CACHE_VERSION = 'v3';

type CacheProbe =
  | { kind: 'hit'; result: WireParseResult }
  | { kind: 'miss'; hash: string }
  | { kind: 'skip' };

async function resolveInput(input: string | File | ArrayBuffer): Promise<string> {
  const text =
    input instanceof ArrayBuffer
      ? new TextDecoder().decode(input)
      : typeof input === 'string'
        ? input
        : await input.text();
  assertTextSize('tree', text);
  return text;
}

async function probeCache(
  input: string | File | ArrayBuffer,
  confirmedTraitKey: string | undefined,
  confirmedTipDatePattern: string | undefined,
  manualMrsdIso: string | undefined,
  confirmedCoordinateKeys: string | undefined,
  confirmedAnalysisKind: 'continuous' | 'discrete' | undefined,
  confirmedHpdKeys: string | null | undefined,
  store: CacheStore | undefined,
): Promise<CacheProbe> {
  if (input instanceof ArrayBuffer) return { kind: 'skip' };
  try {
    const text = typeof input === 'string' ? input : await input.text();
    assertTextSize('tree', text);
    const keyMaterial = `${PARSE_CACHE_VERSION}\0${text}\0${confirmedTraitKey ?? ''}\0${confirmedTipDatePattern ?? ''}\0${manualMrsdIso ?? ''}\0${confirmedCoordinateKeys ?? ''}\0${confirmedAnalysisKind ?? ''}\0${confirmedHpdKeys === null ? '<none>' : (confirmedHpdKeys ?? '')}`;
    const bytes = new TextEncoder().encode(keyMaterial) as Uint8Array<ArrayBuffer>;
    const hash = await sha256Hex(bytes);
    const cached = await getCached(hash, store);
    if (cached !== undefined) return { kind: 'hit', result: cached };
    return { kind: 'miss', hash };
  } catch {
    return { kind: 'skip' };
  }
}

export function createParserApi(store?: CacheStore) {
  return {
    async parse(
      input: string | File | ArrayBuffer,
      confirmedTraitKey?: string,
      confirmedTipDatePattern?: string,
      manualMrsdIso?: string,
      confirmedCoordinateKeys?: string,
      confirmedAnalysisKind?: 'continuous' | 'discrete',
      confirmedHpdKeys?: string | null,
    ): Promise<WireParseResult> {
      const probe = await probeCache(
        input,
        confirmedTraitKey,
        confirmedTipDatePattern,
        manualMrsdIso,
        confirmedCoordinateKeys,
        confirmedAnalysisKind,
        confirmedHpdKeys,
        store,
      );
      if (probe.kind === 'hit') {
        return Comlink.transfer(probe.result, getTransferables(probe.result));
      }
      const text = await resolveInput(input);
      const result = await runPipeline(
        text,
        undefined,
        confirmedTraitKey,
        confirmedTipDatePattern,
        manualMrsdIso,
        confirmedCoordinateKeys,
        confirmedAnalysisKind,
        confirmedHpdKeys,
      );
      if (probe.kind === 'miss') {
        await putCached(probe.hash, result, store).catch(() => {});
      }
      return Comlink.transfer(result, getTransferables(result));
    },

    async parseWithProgress(
      input: string | File | ArrayBuffer,
      onProgress: ProgressCallback,
      confirmedTraitKey?: string,
      confirmedTipDatePattern?: string,
      manualMrsdIso?: string,
      confirmedCoordinateKeys?: string,
      confirmedAnalysisKind?: 'continuous' | 'discrete',
      confirmedHpdKeys?: string | null,
    ): Promise<WireParseResult> {
      const probe = await probeCache(
        input,
        confirmedTraitKey,
        confirmedTipDatePattern,
        manualMrsdIso,
        confirmedCoordinateKeys,
        confirmedAnalysisKind,
        confirmedHpdKeys,
        store,
      );
      if (probe.kind === 'hit') {
        return Comlink.transfer(probe.result, getTransferables(probe.result));
      }
      const text = await resolveInput(input);
      const result = await runPipeline(
        text,
        (stage: ParseStage, percent: number) => {
          onProgress(stage, percent);
        },
        confirmedTraitKey,
        confirmedTipDatePattern,
        manualMrsdIso,
        confirmedCoordinateKeys,
        confirmedAnalysisKind,
        confirmedHpdKeys,
      );
      if (probe.kind === 'miss') {
        await putCached(probe.hash, result, store).catch(() => {});
      }
      return Comlink.transfer(result, getTransferables(result));
    },
  };
}

export type ParserWorkerApi = ReturnType<typeof createParserApi>;

if ('WorkerGlobalScope' in globalThis) {
  Comlink.expose(createParserApi());
}
