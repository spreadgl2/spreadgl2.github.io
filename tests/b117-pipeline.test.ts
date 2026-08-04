import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPipelineFromString } from '../src/workers/parser-pipeline.js';

const REPO_ROOT = join(import.meta.dirname, '..');
const B117_PATH = join(REPO_ROOT, 'public/examples/b117/tree.nex');

// Correctness of the parse pipeline on the largest bundled fixture (T064.5).
// These assertions are deterministic — they check node counts and buffer
// shapes, not wall-clock time — so they belong in normal CI despite the 4.5 MB
// fixture. The one timing-sensitive assertion from the original stress suite
// lives in b117-perf-budget.test.ts, which normal CI excludes.
//
// Skip guard: with the Vitest node env the fixture is fine locally, but it may
// OOM on restricted CI runners.
describe('B.1.1.7 parse pipeline (T064.5)', { timeout: 120_000 }, () => {
  let treeText: string;
  try {
    treeText = readFileSync(B117_PATH, 'utf8');
  } catch {
    it.skip('b117/tree.nex not found — skipping', () => {});
    return;
  }

  it('pipeline completes and node count is ~17k tips', () => {
    const t0 = performance.now();
    const wire = runPipelineFromString(treeText);
    const parseMs = performance.now() - t0;
    console.info(`[T064.5] parse+worker time: ${parseMs.toFixed(0)} ms`);
    console.info(`[T064.5] node count: ${wire.graph.nodes.length}`);
    console.info(`[T064.5] branch table rows: ${wire.branchTable.count}`);
    console.info(
      `[T064.5] date range: ${wire.dateRange[0].toFixed(3)} – ${wire.dateRange[1].toFixed(3)}`,
    );

    expect(wire.graph.nodes.length).toBeGreaterThan(17_000);
    expect(wire.branchTable.count).toBeGreaterThan(0);
    expect(Number.isFinite(wire.dateRange[0])).toBe(true);
    expect(Number.isFinite(wire.dateRange[1])).toBe(true);
  });

  it('BranchTable transfer buffer sizes are sane', () => {
    const wire = runPipelineFromString(treeText);
    const bt = wire.branchTable;

    const totalTransferBytes =
      bt.branchId.byteLength +
      bt.parentBranch.byteLength +
      bt.isInternal.byteLength +
      bt.startTime.byteLength +
      bt.endTime.byteLength +
      bt.startLat.byteLength +
      bt.startLon.byteLength +
      bt.endLat.byteLength +
      bt.endLon.byteLength +
      bt.stateWeight.byteLength;

    console.info(`[T064.5] BranchTable transfer size: ${(totalTransferBytes / 1024).toFixed(1)} KB`);
    console.info(`[T064.5] branchId buffer: ${(bt.branchId.byteLength / 1024).toFixed(1)} KB`);
    console.info(`[T064.5] startTime buffer: ${(bt.startTime.byteLength / 1024).toFixed(1)} KB`);

    // Sanity: typed-array buffers must be non-empty.
    expect(bt.branchId.length).toBeGreaterThan(0);
    expect(bt.startTime.length).toBeGreaterThan(0);
  });
});
