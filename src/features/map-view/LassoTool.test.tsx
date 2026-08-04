// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchTable, Layout, PhyloGraph } from '../../lib/phylo/types';
import { useSelectionStore } from '../../store/selection';
import { useUiStore } from '../../store/ui';
import { computeLassoTaxa, LassoTool } from './LassoTool';

function makeBranchTable(
  entries: Array<{ branchId: number; isInternal: boolean; endLon: number; endLat: number }>,
): BranchTable {
  const count = entries.length;
  const branchId = new Int32Array(entries.map((e) => e.branchId));
  const parentBranch = new Int32Array(count);
  const isInternal = new Uint8Array(entries.map((e) => (e.isInternal ? 1 : 0)));
  const startTime = new Float32Array(count);
  const endTime = new Float32Array(count);
  const startLat = new Float32Array(count);
  const startLon = new Float32Array(count);
  const endLat = new Float32Array(entries.map((e) => e.endLat));
  const endLon = new Float32Array(entries.map((e) => e.endLon));
  const stateWeight = new Float32Array(count).fill(1);
  return {
    count,
    branchId,
    parentBranch,
    isInternal,
    startTime,
    endTime,
    startLat,
    startLon,
    endLat,
    endLon,
    stateWeight,
  };
}

function makeGraph(tips: Array<{ idx: number; origId: string }>): PhyloGraph {
  return {
    nodes: tips.map(({ idx, origId }) => ({
      idx,
      origId,
      name: origId,
      label: null,
      annotations: {},
      adjacents: [],
      lengths: [],
    })),
    root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
    origIdToIdx: new Map(tips.map(({ idx, origId }) => [origId, idx])),
    rooted: true,
    hiddenNodeIds: new Set(),
    collapsedCladeIds: new Map(),
  };
}

function makeLayout(tipIds: string[]): Layout {
  const nodes = tipIds.map((id) => ({
    id,
    x: 0,
    y: 0,
    isTip: true,
    parentId: null,
    children: [],
    annotations: {},
  }));
  return {
    nodes,
    nodeMap: new Map(nodes.map((n) => [n.id, n])),
    maxX: 10,
    maxY: tipIds.length,
    xAxisMode: 'date',
  };
}

beforeEach(() => {
  useUiStore.setState({ lassoMode: false, lassoVertices: [] });
  useSelectionStore.setState({ focusedTaxa: [] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('computeLassoTaxa', () => {
  it('returns empty array when fewer than 3 vertices', () => {
    const bt = makeBranchTable([{ branchId: 0, isInternal: false, endLon: 5, endLat: 5 }]);
    const graph = makeGraph([{ idx: 0, origId: 'taxon_A' }]);
    const layout = makeLayout(['taxon_A']);
    expect(
      computeLassoTaxa(
        [
          [0, 0],
          [10, 0],
        ],
        bt,
        graph,
        layout,
      ),
    ).toEqual([]);
  });

  it('returns origIds of tips whose endpoints fall inside the polygon', () => {
    const bt = makeBranchTable([
      { branchId: 0, isInternal: false, endLon: 5, endLat: 5 },
      { branchId: 1, isInternal: false, endLon: 15, endLat: 5 },
    ]);
    const graph = makeGraph([
      { idx: 0, origId: 'inside_tip' },
      { idx: 1, origId: 'outside_tip' },
    ]);
    const layout = makeLayout(['inside_tip', 'outside_tip']);
    const poly: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const result = computeLassoTaxa(poly, bt, graph, layout);
    expect(result).toContain('inside_tip');
    expect(result).not.toContain('outside_tip');
  });

  it('skips internal branches', () => {
    const bt = makeBranchTable([
      { branchId: 0, isInternal: true, endLon: 5, endLat: 5 },
      { branchId: 1, isInternal: false, endLon: 5, endLat: 5 },
    ]);
    const graph = makeGraph([
      { idx: 0, origId: 'internal_node' },
      { idx: 1, origId: 'tip_A' },
    ]);
    const layout = makeLayout(['tip_A']);
    const poly: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const result = computeLassoTaxa(poly, bt, graph, layout);
    expect(result).not.toContain('internal_node');
    expect(result).toContain('tip_A');
  });

  it('skips null-island (0,0) endpoints', () => {
    const bt = makeBranchTable([{ branchId: 0, isInternal: false, endLon: 0, endLat: 0 }]);
    const graph = makeGraph([{ idx: 0, origId: 'null_island' }]);
    const layout = makeLayout(['null_island']);
    const poly: Array<[number, number]> = [
      [-5, -5],
      [5, -5],
      [5, 5],
      [-5, 5],
    ];
    const result = computeLassoTaxa(poly, bt, graph, layout);
    expect(result).not.toContain('null_island');
  });
});

describe('LassoTool component', () => {
  it('renders null when lasso is not active', () => {
    useUiStore.setState({ lassoMode: false, lassoVertices: [] });
    render(<LassoTool branchTable={null} graph={null} layout={null} />);
    expect(screen.queryByTestId('lasso-vertex-count')).toBeNull();
  });

  it('renders null when lasso is active but no vertices', () => {
    useUiStore.setState({ lassoMode: true, lassoVertices: [] });
    render(<LassoTool branchTable={null} graph={null} layout={null} />);
    expect(screen.queryByTestId('lasso-vertex-count')).toBeNull();
  });

  it('shows vertex count when lasso is active with vertices', () => {
    useUiStore.setState({
      lassoMode: true,
      lassoVertices: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
    });
    render(<LassoTool branchTable={null} graph={null} layout={null} />);
    const el = screen.getByTestId('lasso-vertex-count');
    expect(el.textContent).toContain('3 vertices');
  });

  it('Esc key clears lasso mode', () => {
    useUiStore.setState({ lassoMode: true, lassoVertices: [[0, 0]] });
    render(<LassoTool branchTable={null} graph={null} layout={null} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(useUiStore.getState().lassoMode).toBe(false);
    expect(useUiStore.getState().lassoVertices).toEqual([]);
  });

  it('Enter key commits lasso and populates focusedTaxa', () => {
    const bt = makeBranchTable([{ branchId: 0, isInternal: false, endLon: 5, endLat: 5 }]);
    const graph = makeGraph([{ idx: 0, origId: 'my_tip' }]);
    const layout = makeLayout(['my_tip']);
    const poly: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    useUiStore.setState({ lassoMode: true, lassoVertices: poly });
    render(<LassoTool branchTable={bt} graph={graph} layout={layout} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(useSelectionStore.getState().focusedTaxa).toContain('my_tip');
    expect(useUiStore.getState().lassoMode).toBe(false);
  });
});
