import { describe, expect, it } from 'vitest';
import type { BranchTable, Layout, PhyloGraph } from '../phylo/types';
import { computeLegendCounts } from './legend-counts';

// Minimal tree: root(internal) + 3 tips — A/B Beijing, C Shanghai (low posterior).
function makeGraph(): PhyloGraph {
  const node = (origId: string, location: string) => ({
    origId,
    annotations: { location },
    adjacents: [],
  });
  return {
    nodes: [node('root', ''), node('A', 'Beijing'), node('B', 'Beijing'), node('C', 'Shanghai')],
  } as unknown as PhyloGraph;
}

function makeBranchTable(): BranchTable {
  return {
    count: 4,
    branchId: Int32Array.from([0, 1, 2, 3]),
    isInternal: Uint8Array.from([1, 0, 0, 0]),
    posterior: Float32Array.from([1, 1, 1, 0.3]),
  } as unknown as BranchTable;
}

const LAYOUT = {} as unknown as Layout; // unused unless focus/subtree active

const BASE = {
  graph: makeGraph(),
  layout: LAYOUT,
  branchTable: makeBranchTable(),
  colorByKey: 'location',
  deselectedValues: new Set<string>(),
  focusedTaxa: [] as string[],
  subtreeRootId: null,
  clade: false,
};

describe('computeLegendCounts', () => {
  it('counts terminal tips per state, unfiltered', () => {
    const c = computeLegendCounts(BASE);
    expect(c.total).toBe(3);
    expect(c.shown).toBe(3);
    expect(c.filtered).toBe(false);
    expect(c.perValue.get('Beijing')).toEqual({ total: 2, shown: 2 });
    expect(c.perValue.get('Shanghai')).toEqual({ total: 1, shown: 1 });
  });

  it('legend deselection removes a state from the shown count', () => {
    const c = computeLegendCounts({ ...BASE, deselectedValues: new Set(['Beijing']) });
    expect(c.perValue.get('Beijing')).toEqual({ total: 2, shown: 0 });
    expect(c.perValue.get('Shanghai')).toEqual({ total: 1, shown: 1 });
    expect(c.total).toBe(3);
    expect(c.shown).toBe(1);
    expect(c.filtered).toBe(true);
  });

  it('never filters tips by posterior support (a tip is observed — support 1)', () => {
    // makeBranchTable gives tip C's branch posterior 0.3 (its parent's support);
    // the tip must still be counted. Clade support filters branches, not tips.
    const c = computeLegendCounts(BASE);
    expect(c.perValue.get('Shanghai')).toEqual({ total: 1, shown: 1 });
    expect(c.shown).toBe(3);
    expect(c.filtered).toBe(false);
  });

  it('ignores non-string / absent trait values', () => {
    const c = computeLegendCounts({ ...BASE, colorByKey: 'missing' });
    expect(c.total).toBe(0);
    expect(c.perValue.size).toBe(0);
    expect(c.filtered).toBe(false);
  });

  it('counts a tip once even when a MAP tie emits several branch rows', () => {
    // Tip C (branchId 3) occupies two rows, as a posterior MAP tie would.
    const branchTable = {
      count: 5,
      branchId: Int32Array.from([0, 1, 2, 3, 3]),
      isInternal: Uint8Array.from([1, 0, 0, 0, 0]),
      posterior: Float32Array.from([1, 1, 1, 1, 1]),
    } as unknown as BranchTable;
    const c = computeLegendCounts({ ...BASE, branchTable });
    expect(c.total).toBe(3); // not 4
    expect(c.perValue.get('Shanghai')).toEqual({ total: 1, shown: 1 }); // not 2
  });

  it('counts all tips overall with a null colour key (continuous legend)', () => {
    const c = computeLegendCounts({ ...BASE, colorByKey: null });
    expect(c.total).toBe(3);
    expect(c.shown).toBe(3);
    expect(c.perValue.size).toBe(0); // no per-state breakdown
    expect(c.filtered).toBe(false);
  });
});
