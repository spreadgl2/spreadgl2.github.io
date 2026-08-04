/** @original SpreadGL2 - geographic annotation completeness tests. */

import { describe, expect, it } from 'vitest';
import {
  countMissingNodeAnnotations,
  isBranchGeoResolved,
  isEndGeoResolved,
  isStartGeoResolved,
} from './geo-completeness';
import type { BranchTable, PhyloGraph } from './types';

describe('geographic completeness', () => {
  it('counts missing internal and tip annotations separately', () => {
    const nodes = [
      {
        idx: 0,
        origId: 'root',
        name: null,
        label: null,
        annotations: {},
        adjacents: [1, 2],
        lengths: [1, 1],
      },
      {
        idx: 1,
        origId: 'a',
        name: 'a',
        label: null,
        annotations: { location: 'A' },
        adjacents: [0],
        lengths: [1],
      },
      {
        idx: 2,
        origId: 'b',
        name: 'b',
        label: null,
        annotations: {},
        adjacents: [0],
        lengths: [1],
      },
    ];
    const graph: PhyloGraph = {
      nodes,
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map(nodes.map((node) => [node.origId, node.idx])),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };

    expect(countMissingNodeAnnotations(graph, 'location')).toEqual({
      total: 2,
      internal: 1,
      tips: 1,
    });
  });

  it('uses explicit masks while treating legacy mask-less tables as resolved', () => {
    const table = {
      count: 2,
      startGeoResolved: new Uint8Array([1, 0]),
      endGeoResolved: new Uint8Array([1, 1]),
    } as BranchTable;
    expect(isStartGeoResolved(table, 0)).toBe(true);
    expect(isEndGeoResolved(table, 0)).toBe(true);
    expect(isBranchGeoResolved(table, 0)).toBe(true);
    expect(isBranchGeoResolved(table, 1)).toBe(false);
    const { startGeoResolved: _startGeoResolved, ...legacyTable } = table;
    expect(isBranchGeoResolved(legacyTable, 1)).toBe(true);
  });
});
