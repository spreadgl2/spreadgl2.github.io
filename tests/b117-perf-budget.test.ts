import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPipelineFromString } from '../src/workers/parser-pipeline.js';
import { rehydrate } from '../src/workers/wire.js';

const REPO_ROOT = join(import.meta.dirname, '..');
const B117_PATH = join(REPO_ROOT, 'public/examples/b117/tree.nex');

// Wall-clock performance budget on the largest bundled fixture (T064.5).
//
// This suite is EXCLUDED from `pnpm test:ci` and run by `pnpm test:stress`.
// It asserts elapsed milliseconds, which makes it sensitive to machine load
// and to whatever else a shared CI runner is doing. Treat a failure here as a
// trend signal worth investigating, not as proof of a regression — reproduce
// locally on an idle machine before acting on it.
//
// The deterministic correctness assertions for this fixture live in
// b117-pipeline.test.ts and DO run in normal CI.
describe('B.1.1.7 performance budget (T064.5)', { timeout: 120_000 }, () => {
  let treeText: string;
  try {
    treeText = readFileSync(B117_PATH, 'utf8');
  } catch {
    it.skip('b117/tree.nex not found — skipping', () => {});
    return;
  }

  it('parse pipeline is ≤ 5 s and wire-to-main reconstruction is ≤ 50 ms', () => {
    const parseStart = performance.now();
    const wire = runPipelineFromString(treeText);
    const parseMs = performance.now() - parseStart;

    const t0 = performance.now();
    const result = rehydrate(wire);
    const rehydrateMs = performance.now() - t0;
    console.info(
      `[T064.5] parse pipeline: ${parseMs.toFixed(2)} ms; wire reconstruction: ${rehydrateMs.toFixed(2)} ms`,
    );

    expect(result.graph.origIdToIdx).toBeInstanceOf(Map);
    expect(result.layout.nodeMap).toBeInstanceOf(Map);

    expect(parseMs).toBeLessThanOrEqual(5_000);
    expect(rehydrateMs).toBeLessThanOrEqual(50);
  });
});
