/** @original SpreadGL2 - subtree selection and time-slice tests. */

import { describe, expect, it } from 'vitest';
import {
  branchesActiveAt,
  buildSubtreeBranchIdsForRoots,
  buildTimeSliceIndexes,
  isActive,
} from './slice';
import type { BranchTable, Layout, PhyloGraph } from './types';

function makeTable(starts: number[], ends: number[]): BranchTable {
  const count = starts.length;
  return {
    count,
    branchId: Int32Array.from(starts.map((_, i) => i)),
    parentBranch: new Int32Array(count),
    isInternal: new Uint8Array(count),
    startTime: Float32Array.from(starts),
    endTime: Float32Array.from(ends),
    startLat: new Float32Array(count),
    startLon: new Float32Array(count),
    endLat: new Float32Array(count),
    endLon: new Float32Array(count),
    stateWeight: new Float32Array(count).fill(1.0),
  };
}

const table = makeTable([0, 1, 2, 3, 4], [3, 4, 5, 6, 7]);

describe('buildTimeSliceIndexes', () => {
  it('sorts branch IDs by startTime ascending', () => {
    const { startTimeSorted } = buildTimeSliceIndexes(table);
    const times: number[] = Array.from(startTimeSorted).map((id) => table.startTime[id] ?? 0);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1] as number);
    }
  });

  it('sorts branch IDs by endTime ascending', () => {
    const { endTimeSorted } = buildTimeSliceIndexes(table);
    const times: number[] = Array.from(endTimeSorted).map((id) => table.endTime[id] ?? 0);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1] as number);
    }
  });
});

describe('branchesActiveAt', () => {
  const indexes = buildTimeSliceIndexes(table);

  it('returns IDs with startTime ≤ playhead at interior time 2.5', () => {
    const active = Array.from(branchesActiveAt(2.5, indexes, table)).sort();
    expect(active).toEqual([0, 1, 2]);
  });

  it('returns branch 0 at boundary playhead 0', () => {
    const active = Array.from(branchesActiveAt(0, indexes, table)).sort();
    expect(active).toEqual([0]);
  });

  it('returns all branches at boundary playhead 7', () => {
    const active = Array.from(branchesActiveAt(7, indexes, table)).sort();
    expect(active).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns empty array when playhead is before all branches', () => {
    const active = branchesActiveAt(-1, indexes, table);
    expect(active.length).toBe(0);
  });
});

describe('buildSubtreeBranchIdsForRoots', () => {
  it('returns the union of multiple directed subtrees', () => {
    const nodes = ['r', 'a', 't1', 't2', 'b', 't3'].map((origId, idx) => ({
      idx,
      origId,
      name: null,
      label: null,
      annotations: {},
      adjacents: [],
      lengths: [],
    }));
    const graph: PhyloGraph = {
      nodes,
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map(nodes.map((n) => [n.origId, n.idx])),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
    const layoutNodes = [
      { id: 'r', x: 0, y: 1, isTip: false, parentId: null, children: ['a', 'b'], annotations: {} },
      {
        id: 'a',
        x: 1,
        y: 0.5,
        isTip: false,
        parentId: 'r',
        children: ['t1', 't2'],
        annotations: {},
      },
      { id: 't1', x: 2, y: 0, isTip: true, parentId: 'a', children: [], annotations: {} },
      { id: 't2', x: 2, y: 1, isTip: true, parentId: 'a', children: [], annotations: {} },
      { id: 'b', x: 1, y: 2, isTip: false, parentId: 'r', children: ['t3'], annotations: {} },
      { id: 't3', x: 2, y: 2, isTip: true, parentId: 'b', children: [], annotations: {} },
    ];
    const layout: Layout = {
      nodes: layoutNodes,
      nodeMap: new Map(layoutNodes.map((n) => [n.id, n])),
      maxX: 2,
      maxY: 2,
      xAxisMode: 'date',
    };

    expect(Array.from(buildSubtreeBranchIdsForRoots(graph, layout, ['a', 't3'])).sort()).toEqual([
      1, 2, 3, 5,
    ]);
  });
});

// 5-branch fixture: branchId 0..4, startTime 0..4, endTime 5..9
// branch 0: start=0, end=5
// branch 1: start=1, end=6
// branch 2: start=2, end=7
// branch 3: start=3, end=8
// branch 4: start=4, end=9
const b = (id: number) => ({
  branchId: id,
  startTime: id,
  endTime: id + 5,
});

describe('isActive — Trail mode', () => {
  it('returns true when startTime ≤ playhead', () => {
    expect(isActive(b(2), 3, null, 'Trail')).toBe(true);
  });

  it('returns true at exact startTime boundary', () => {
    expect(isActive(b(2), 2, null, 'Trail')).toBe(true);
  });

  it('returns false when startTime > playhead', () => {
    expect(isActive(b(3), 2, null, 'Trail')).toBe(false);
  });

  it('active even when playhead > endTime (cumulative)', () => {
    expect(isActive(b(0), 20, null, 'Trail')).toBe(true);
  });
});

describe('isActive — Window mode', () => {
  const win = { start: 2, end: 4 };

  it('active when branch overlaps window', () => {
    expect(isActive(b(1), 4, win, 'Window')).toBe(true);
  });

  it('inactive when branch ends before window start', () => {
    // branch 0: [0,5]. playhead 10, window width 2 → winStart 8; endTime 5 < 8.
    expect(isActive(b(0), 10, { start: 8, end: 10 }, 'Window')).toBe(false);
  });

  it('inactive when branch starts after playhead', () => {
    expect(isActive(b(4), 3, { start: 1, end: 3 }, 'Window')).toBe(false);
  });

  it('falls back to the Trail predicate when window is null', () => {
    expect(isActive(b(2), 3, null, 'Window')).toBe(true);
    expect(isActive(b(4), 3, null, 'Window')).toBe(false);
  });

  it('a near-zero window behaves like an instant slice', () => {
    // branch 2: [2,7]. Zero-width window → active iff startTime ≤ playhead ≤ endTime.
    expect(isActive(b(2), 4, { start: 4, end: 4 }, 'Window')).toBe(true);
    expect(isActive(b(2), 8, { start: 8, end: 8 }, 'Window')).toBe(false);
    expect(isActive(b(2), 1, { start: 1, end: 1 }, 'Window')).toBe(false);
  });
});

describe('isActive — clade isolation', () => {
  it('active when in the clade and startTime ≤ playhead', () => {
    expect(isActive(b(1), 3, null, 'Trail', new Set([0, 1, 2]))).toBe(true);
  });

  it('inactive when outside the clade', () => {
    expect(isActive(b(3), 4, null, 'Trail', new Set([0, 1, 2]))).toBe(false);
  });

  it('inactive when in the clade but startTime > playhead', () => {
    expect(isActive(b(4), 3, null, 'Trail', new Set([0, 1, 2, 3, 4]))).toBe(false);
  });

  it('no clade filter when cladeBranchIds is undefined', () => {
    expect(isActive(b(2), 3, null, 'Trail', undefined)).toBe(true);
    expect(isActive(b(4), 3, null, 'Trail', undefined)).toBe(false);
  });

  it('clade isolation composes with Window mode', () => {
    const clade = new Set([0, 1, 2]);
    expect(isActive(b(1), 4, { start: 2, end: 4 }, 'Window', clade)).toBe(true);
    expect(isActive(b(3), 4, { start: 2, end: 4 }, 'Window', clade)).toBe(false);
  });
});
