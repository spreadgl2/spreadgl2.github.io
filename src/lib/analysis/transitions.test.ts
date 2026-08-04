import { describe, expect, it } from 'vitest';
import type { BranchTable, Layout, PhyloGraph } from '../phylo/types';
import {
  buildTransitions,
  filterByInducedSubtree,
  summariseTransitions,
  transitionBinAtTime,
  transitionBinSizeDays,
} from './transitions';

function branchTable(branchIds: number[], endTimes: number[]): BranchTable {
  const count = branchIds.length;
  return {
    count,
    branchId: new Int32Array(branchIds),
    parentBranch: new Int32Array(count).fill(-1),
    isInternal: new Uint8Array(count),
    startTime: new Float32Array(count),
    endTime: new Float32Array(endTimes),
    startLat: new Float32Array(count),
    startLon: new Float32Array(count),
    endLat: new Float32Array(count),
    endLon: new Float32Array(count),
    stateWeight: new Float32Array(count).fill(1),
  };
}

function graph(states: string[]): PhyloGraph {
  const nodes = states.map((state, idx) => ({
    idx,
    origId: `n${idx}`,
    name: idx === 0 ? null : `n${idx}`,
    label: null,
    annotations: { location: state },
    adjacents: [],
    lengths: [],
  }));
  return {
    nodes,
    root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
    origIdToIdx: new Map(nodes.map((node) => [node.origId, node.idx])),
    rooted: true,
    hiddenNodeIds: new Set(),
    collapsedCladeIds: new Map(),
  };
}

function layout(edges: Array<[id: string, parentId: string | null]>): Layout {
  const nodes = edges.map(([id, parentId]) => ({
    id,
    x: parentId === null ? 0 : 1,
    y: 0,
    isTip: true,
    parentId,
    children: edges.filter(([, p]) => p === id).map(([childId]) => childId),
    annotations: {},
  }));
  return {
    nodes,
    nodeMap: new Map(nodes.map((node) => [node.id, node])),
    maxX: 1,
    maxY: 1,
    xAxisMode: 'date',
  };
}

describe('buildTransitions', () => {
  it('counts parent-to-child state changes at child-node time', () => {
    const transitions = buildTransitions(
      branchTable([1, 2], [1, 2]),
      graph(['A', 'B', 'B']),
      layout([
        ['n0', null],
        ['n1', 'n0'],
        ['n2', 'n1'],
      ]),
      'location',
    );

    expect(transitions).toEqual([{ from: 'A', to: 'B', time: 1, weight: 1, branchId: 1 }]);
  });

  it('splits modal ties fractionally and skips same-state products', () => {
    const transitions = buildTransitions(
      branchTable([1], [3]),
      graph(['TX+CA', 'NY+CA']),
      layout([
        ['n0', null],
        ['n1', 'n0'],
      ]),
      'location',
    );

    expect(transitions).toHaveLength(3);
    expect(transitions.map((transition) => transition.weight)).toEqual([0.25, 0.25, 0.25]);
    expect(transitions.map((transition) => `${transition.from}->${transition.to}`)).toEqual([
      'TX->NY',
      'TX->CA',
      'CA->NY',
    ]);
  });

  it('filters branches before counting transitions', () => {
    const transitions = buildTransitions(
      branchTable([1, 2], [1, 2]),
      graph(['A', 'B', 'C']),
      layout([
        ['n0', null],
        ['n1', 'n0'],
        ['n2', 'n0'],
      ]),
      'location',
      (_row, branchId) => branchId !== 2,
    );

    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.branchId).toBe(1);
  });
});

describe('summariseTransitions', () => {
  it('counts every route in total mode', () => {
    const summary = summariseTransitions(
      [
        { from: 'A', to: 'B', time: 0.5, weight: 1, branchId: 1 },
        { from: 'B', to: 'C', time: 1.5, weight: 0.5, branchId: 2 },
      ],
      { bounds: { min: 0, max: 2 }, values: ['A', 'B', 'C'], binCount: 2 },
    );

    expect(summary.mode).toBe('total');
    expect(summary.totals.total).toBeCloseTo(1.5, 5);
    expect(summary.bins[0]?.total).toBeCloseTo(1, 5);
    expect(summary.bins[1]?.total).toBeCloseTo(0.5, 5);
    expect(summary.topSegments.map((route) => `${route.from}->${route.to}`)).toEqual([
      'A->B',
      'B->C',
    ]);
    expect(summary.bins[0]?.totalBranchIds).toEqual([1]);
    expect(summary.bins[1]?.totalBranchIds).toEqual([2]);
    expect(summary.bins[0]?.totalStacks).toEqual([{ location: 'B', weight: 1, branchIds: [1] }]);
    expect(summary.bins[1]?.totalStacks).toEqual([{ location: 'C', weight: 0.5, branchIds: [2] }]);
  });

  it('uses selected legend values as the focal set for introductions and exports', () => {
    const summary = summariseTransitions(
      [
        { from: 'A', to: 'B', time: 0.5, weight: 1, branchId: 1 },
        { from: 'C', to: 'B', time: 1.5, weight: 1, branchId: 2 },
        { from: 'B', to: 'A', time: 2.5, weight: 1, branchId: 3 },
        { from: 'B', to: 'C', time: 3.5, weight: 1, branchId: 4 },
        { from: 'A', to: 'C', time: 3.5, weight: 1, branchId: 5 },
      ],
      {
        bounds: { min: 0, max: 4 },
        values: ['A', 'B', 'C'],
        deselectedValues: new Set(['A', 'C']),
        binCount: 4,
      },
    );

    expect(summary.mode).toBe('focal');
    expect(summary.focalValues).toEqual(['B']);
    expect(summary.totals.introductions).toBe(2);
    expect(summary.totals.exports).toBe(2);
    expect(summary.totals.net).toBe(0);
    expect(summary.totals.total).toBe(4);
    expect(summary.bins[0]?.introductions).toBe(1);
    expect(summary.bins[3]?.exports).toBe(1);
    expect(summary.bins[0]?.introductionBranchIds).toEqual([1]);
    expect(summary.bins[3]?.exportBranchIds).toEqual([4]);
    expect(summary.bins[0]?.introductionStacks).toEqual([
      { location: 'B', weight: 1, branchIds: [1] },
    ]);
    expect(summary.bins[3]?.exportStacks).toEqual([{ location: 'B', weight: 1, branchIds: [4] }]);
    expect(summary.topSegments.map((route) => `${route.from}->${route.to}`)).toEqual([
      'A->B',
      'B->A',
      'B->C',
      'C->B',
    ]);
  });

  it('stacks focal introductions and exports by the selected legend locations', () => {
    const summary = summariseTransitions(
      [
        { from: 'A', to: 'B', time: 0.5, weight: 1, branchId: 1 },
        { from: 'A', to: 'C', time: 0.5, weight: 0.5, branchId: 2 },
        { from: 'B', to: 'A', time: 0.75, weight: 1, branchId: 3 },
        { from: 'C', to: 'A', time: 0.75, weight: 0.5, branchId: 4 },
        { from: 'B', to: 'C', time: 0.5, weight: 1, branchId: 5 },
        { from: 'C', to: 'B', time: 0.75, weight: 1, branchId: 6 },
      ],
      {
        bounds: { min: 0, max: 1 },
        values: ['A', 'B', 'C'],
        deselectedValues: new Set(['A']),
        binCount: 1,
      },
    );

    expect(summary.mode).toBe('focal');
    expect(summary.focalValues).toEqual(['B', 'C']);
    expect(summary.totals.introductions).toBe(3.5);
    expect(summary.totals.exports).toBe(3.5);
    expect(summary.totals.total).toBe(5);
    expect(summary.bins[0]?.introductionStacks).toEqual([
      { location: 'B', weight: 2, branchIds: [1, 6] },
      { location: 'C', weight: 1.5, branchIds: [2, 5] },
    ]);
    expect(summary.bins[0]?.exportStacks).toEqual([
      { location: 'B', weight: 2, branchIds: [3, 5] },
      { location: 'C', weight: 1.5, branchIds: [4, 6] },
    ]);
    expect(summary.bins[0]?.bySegment.get('B\u0000C')).toBe(1);
    expect(summary.bins[0]?.totalStacks).toEqual([
      { location: 'B', weight: 2, branchIds: [1, 6] },
      { location: 'C', weight: 1.5, branchIds: [2, 5] },
      { location: 'A', weight: 1.5, branchIds: [3, 4] },
    ]);
  });

  it('chooses biologically meaningful day-scale bins from the analysis span', () => {
    expect(transitionBinSizeDays({ min: 2020, max: 2020.5 })).toBe(15);
    expect(transitionBinSizeDays({ min: 2020, max: 2021.5 })).toBe(30);
    expect(transitionBinSizeDays({ min: 2020, max: 2023 })).toBe(45);
    expect(transitionBinSizeDays({ min: 2020, max: 2026 })).toBe(60);

    const summary = summariseTransitions(
      [{ from: 'A', to: 'B', time: 2022, weight: 1, branchId: 1 }],
      { bounds: { min: 2020, max: 2026 }, values: ['A', 'B'] },
    );

    expect(summary.binSizeDays).toBe(60);
    expect(summary.bins.length).toBeGreaterThan(30);
  });
});

describe('filterByInducedSubtree', () => {
  const TRANSITIONS = [
    { from: 'A', to: 'B', time: 0.5, weight: 1, branchId: 1 },
    { from: 'B', to: 'C', time: 1.5, weight: 1, branchId: 2 },
    { from: 'C', to: 'A', time: 2.5, weight: 1, branchId: 3 },
  ];

  it('keeps only transitions on the selected branches', () => {
    const kept = filterByInducedSubtree(TRANSITIONS, new Set([1, 3]));
    expect(kept.map((t) => t.branchId)).toEqual([1, 3]);
  });

  it('treats null and empty selections as "no filter", not "select nothing"', () => {
    // A cleared selection must show the whole tree, not an empty chart.
    expect(filterByInducedSubtree(TRANSITIONS, null)).toEqual(TRANSITIONS);
    expect(filterByInducedSubtree(TRANSITIONS, undefined)).toEqual(TRANSITIONS);
    expect(filterByInducedSubtree(TRANSITIONS, new Set())).toEqual(TRANSITIONS);
  });

  it('returns an empty list when no branch matches', () => {
    expect(filterByInducedSubtree(TRANSITIONS, new Set([99]))).toEqual([]);
  });

  it('does not mutate the input', () => {
    const before = [...TRANSITIONS];
    filterByInducedSubtree(TRANSITIONS, new Set([2]));
    expect(TRANSITIONS).toEqual(before);
  });
});

describe('transitionBinAtTime', () => {
  const summary = summariseTransitions(
    [
      { from: 'A', to: 'B', time: 0.5, weight: 1, branchId: 1 },
      { from: 'B', to: 'C', time: 3.5, weight: 1, branchId: 2 },
    ],
    { values: ['A', 'B', 'C'], bounds: { min: 0, max: 4 }, binCount: 4 },
  );

  it('returns the bin whose span contains the time', () => {
    const bin = transitionBinAtTime(summary, 0.5);
    expect(bin).not.toBeNull();
    expect(bin?.t0).toBeLessThanOrEqual(0.5);
    expect(bin?.t1).toBeGreaterThanOrEqual(0.5);
  });

  it('maps the two transition times into different bins', () => {
    const first = transitionBinAtTime(summary, 0.5);
    const last = transitionBinAtTime(summary, 3.5);
    expect(first).not.toBeNull();
    expect(last).not.toBeNull();
    expect(first?.t0).not.toBe(last?.t0);
  });

  it('returns null outside the summarised bounds', () => {
    expect(transitionBinAtTime(summary, -10)).toBeNull();
    expect(transitionBinAtTime(summary, 99)).toBeNull();
  });

  it('resolves the playhead at the exact lower bound to the first bin', () => {
    const bin = transitionBinAtTime(summary, 0);
    expect(bin).not.toBeNull();
    expect(bin?.t0).toBeCloseTo(summary.bounds.min, 6);
  });
});
