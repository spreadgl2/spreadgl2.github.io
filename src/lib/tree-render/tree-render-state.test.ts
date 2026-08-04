// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import type { BranchTable, Layout, PhyloGraph } from '../phylo/types';
import { computeDimmedNodeIds, computeTreeRenderState } from './tree-render-state';

function makeMinimalGraph(count: number): PhyloGraph {
  const nodes = Array.from({ length: count }, (_, i) => ({
    idx: i,
    origId: `n${i}`,
    name: null,
    label: null,
    annotations: {},
    adjacents: [],
    lengths: [],
  }));
  return {
    nodes,
    root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
    origIdToIdx: new Map(nodes.map((n) => [n.origId, n.idx])),
    rooted: true,
    hiddenNodeIds: new Set(),
    collapsedCladeIds: new Map(),
  };
}

function makeMinimalLayout(count: number): Layout {
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    x: 1,
    y: i,
    isTip: true,
    parentId: null,
    children: [],
    annotations: {},
  }));
  return {
    nodes,
    nodeMap: new Map(nodes.map((n) => [n.id, n])),
    maxX: 1,
    maxY: count,
    xAxisMode: 'date' as const,
  };
}

function makeBranchTable(posteriorValues: number[]): BranchTable {
  const count = posteriorValues.length;
  return {
    count,
    branchId: new Int32Array(Array.from({ length: count }, (_, i) => i)),
    parentBranch: new Int32Array(count),
    isInternal: new Uint8Array(count),
    startTime: new Float32Array(count),
    endTime: new Float32Array(count),
    startLat: new Float32Array(count),
    startLon: new Float32Array(count),
    endLat: new Float32Array(count),
    endLon: new Float32Array(count),
    stateWeight: new Float32Array(count).fill(1),
    posterior: new Float32Array(posteriorValues),
  };
}

beforeEach(() => {
  useTreeStore.setState({
    graph: null,
    layout: null,
    branchTable: null,
    traitInfo: null,
    allDiscreteKeys: [],
  });
  useUiStore.setState({
    colorByKey: 'single-color',
    glyphByKey: 'none',
    posteriorThreshold: 0,
    deselectedValues: new Set(),
  });
  useTimelineStore.setState({
    isPlaying: false,
    clade: false,
    subtreeRootIds: [],
    subtreeRootId: null,
  });
  useSelectionStore.setState({ focusedTaxa: [], highlightedBranchIds: [] });
});

describe('computeTreeRenderState posterior threshold', () => {
  it('threshold=0 → no dimmed nodes (all visible)', () => {
    const count = 3;
    useTreeStore.setState({
      graph: makeMinimalGraph(count),
      layout: makeMinimalLayout(count),
      branchTable: makeBranchTable([0.9, 0.3, 0.7]),
    });
    useUiStore.setState({ posteriorThreshold: 0 });
    const { dimmedNodeIds } = computeTreeRenderState();
    expect(dimmedNodeIds).toBeUndefined();
  });

  it('threshold=0.5 → branches with posterior<0.5 dimmed', () => {
    const count = 3;
    useTreeStore.setState({
      graph: makeMinimalGraph(count),
      layout: makeMinimalLayout(count),
      branchTable: makeBranchTable([0.9, 0.3, 0.7]),
    });
    useUiStore.setState({ posteriorThreshold: 0.5 });
    const { dimmedNodeIds } = computeTreeRenderState();
    expect(dimmedNodeIds).toBeDefined();
    expect(dimmedNodeIds?.has('n1')).toBe(true);
    expect(dimmedNodeIds?.has('n0')).toBe(false);
    expect(dimmedNodeIds?.has('n2')).toBe(false);
  });

  it('posterior dims the branch set but NOT the tip-glyph set (tip = support 1)', () => {
    const count = 3; // makeBranchTable marks every branch a tip (isInternal 0)
    useTreeStore.setState({
      graph: makeMinimalGraph(count),
      layout: makeMinimalLayout(count),
      branchTable: makeBranchTable([0.9, 0.3, 0.7]),
    });
    useUiStore.setState({ posteriorThreshold: 0.5 });
    const { dimmedNodeIds, dimmedTipIds } = computeTreeRenderState();
    // n1's uptending branch dims...
    expect(dimmedNodeIds?.has('n1')).toBe(true);
    // ...but its tip glyph stays lit — posterior is the only active filter, so
    // the tip-glyph dim set is empty.
    expect(dimmedTipIds).toBeUndefined();
  });

  it('threshold=1 → all branches with posterior<1 dimmed', () => {
    const count = 3;
    useTreeStore.setState({
      graph: makeMinimalGraph(count),
      layout: makeMinimalLayout(count),
      branchTable: makeBranchTable([0.9, 0.3, 0.7]),
    });
    useUiStore.setState({ posteriorThreshold: 1 });
    const { dimmedNodeIds } = computeTreeRenderState();
    expect(dimmedNodeIds).toBeDefined();
    expect(dimmedNodeIds?.size).toBe(3);
  });

  it('no posterior array → threshold has no effect', () => {
    const count = 3;
    const bt = makeBranchTable([0.9, 0.3, 0.7]);
    const { posterior: _posterior, ...btNoPosterior } = bt;
    useTreeStore.setState({
      graph: makeMinimalGraph(count),
      layout: makeMinimalLayout(count),
      branchTable: btNoPosterior,
    });
    useUiStore.setState({ posteriorThreshold: 0.5 });
    const { dimmedNodeIds } = computeTreeRenderState();
    expect(dimmedNodeIds).toBeUndefined();
  });

  it('highlighted branch IDs dim non-highlighted branches', () => {
    const count = 4;
    useTreeStore.setState({
      graph: makeMinimalGraph(count),
      layout: makeMinimalLayout(count),
      branchTable: makeBranchTable([1, 1, 1, 1]),
    });
    useSelectionStore.setState({ highlightedBranchIds: [1, 3] });

    const { dimmedNodeIds } = computeTreeRenderState();

    expect(dimmedNodeIds).toBeDefined();
    expect(dimmedNodeIds?.has('n0')).toBe(true);
    expect(dimmedNodeIds?.has('n1')).toBe(false);
    expect(dimmedNodeIds?.has('n2')).toBe(true);
    expect(dimmedNodeIds?.has('n3')).toBe(false);
  });

  it('highlighted branch IDs stay visible when another filter would dim them', () => {
    const count = 3;
    useTreeStore.setState({
      graph: makeMinimalGraph(count),
      layout: makeMinimalLayout(count),
      branchTable: makeBranchTable([0.2, 0.2, 0.9]),
    });
    useSelectionStore.setState({ highlightedBranchIds: [1] });
    useUiStore.setState({ posteriorThreshold: 0.5 });

    const { dimmedNodeIds } = computeTreeRenderState();

    expect(dimmedNodeIds).toBeDefined();
    expect(dimmedNodeIds?.has('n0')).toBe(true);
    expect(dimmedNodeIds?.has('n1')).toBe(false);
    expect(dimmedNodeIds?.has('n2')).toBe(true);
  });
});

describe('computeTreeRenderState clade subtree dimming', () => {
  // r → a → (t1, t2); r → t3. Selecting a's subtree must dim everything outside
  // it — including the root r, which has no branch-table row.
  function makeGraphNode(idx: number, origId: string) {
    return { idx, origId, name: null, label: null, annotations: {}, adjacents: [], lengths: [] };
  }
  function makeLayoutNode(
    id: string,
    y: number,
    isTip: boolean,
    parentId: string | null,
    children: string[],
  ) {
    return { id, x: isTip ? 2 : 1, y, isTip, parentId, children, annotations: {} };
  }

  function setUpTree() {
    const gNodes = [
      makeGraphNode(0, 'r'),
      makeGraphNode(1, 'a'),
      makeGraphNode(2, 't1'),
      makeGraphNode(3, 't2'),
      makeGraphNode(4, 't3'),
    ];
    const graph = {
      nodes: gNodes,
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map(gNodes.map((n) => [n.origId, n.idx])),
      rooted: true,
      hiddenNodeIds: new Set<string>(),
      collapsedCladeIds: new Map(),
    };
    const lNodes = [
      makeLayoutNode('r', 1, false, null, ['a', 't3']),
      makeLayoutNode('a', 0.5, false, 'r', ['t1', 't2']),
      makeLayoutNode('t1', 0, true, 'a', []),
      makeLayoutNode('t2', 1, true, 'a', []),
      makeLayoutNode('t3', 2, true, 'r', []),
    ];
    const layout = {
      nodes: lNodes,
      nodeMap: new Map(lNodes.map((n) => [n.id, n])),
      maxX: 2,
      maxY: 2,
      xAxisMode: 'date' as const,
    };
    // One row per edge (child-keyed): a, t1, t2, t3. The root r has no row.
    const count = 4;
    const branchTable = {
      count,
      branchId: new Int32Array([1, 2, 3, 4]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array([1, 0, 0, 0]),
      startTime: new Float32Array(count),
      endTime: new Float32Array(count),
      startLat: new Float32Array(count),
      startLon: new Float32Array(count),
      endLat: new Float32Array(count),
      endLon: new Float32Array(count),
      stateWeight: new Float32Array(count).fill(1),
      posterior: new Float32Array(count).fill(1),
    };
    useTreeStore.setState({ graph, layout, branchTable });
  }

  it('dims the root and its connector (and the sibling clade) but not the selection', () => {
    setUpTree();
    useTimelineStore.setState({ clade: true, subtreeRootId: 'a' });
    const { dimmedNodeIds } = computeTreeRenderState();
    // Root r has no branch row, yet must dim so its vertical connector fades.
    expect(dimmedNodeIds?.has('r')).toBe(true);
    expect(dimmedNodeIds?.has('t3')).toBe(true);
    // The selected clade and its members stay lit.
    expect(dimmedNodeIds?.has('a')).toBe(false);
    expect(dimmedNodeIds?.has('t1')).toBe(false);
    expect(dimmedNodeIds?.has('t2')).toBe(false);
  });

  it('keeps every selected clade lit when multiple roots are selected', () => {
    setUpTree();
    useTimelineStore.setState({ clade: true, subtreeRootIds: ['a', 't3'], subtreeRootId: 'a' });
    const { dimmedNodeIds } = computeTreeRenderState();

    expect(dimmedNodeIds?.has('r')).toBe(true);
    expect(dimmedNodeIds?.has('a')).toBe(false);
    expect(dimmedNodeIds?.has('t1')).toBe(false);
    expect(dimmedNodeIds?.has('t2')).toBe(false);
    expect(dimmedNodeIds?.has('t3')).toBe(false);
  });

  it('suppresses clade dimming while Shift peek is active', () => {
    setUpTree();
    useTimelineStore.setState({ clade: true, subtreeRootIds: ['a'], subtreeRootId: 'a' });
    const rawLayout = useTreeStore.getState().layout;
    const { dimmedNodeIds } = computeDimmedNodeIds(0, [], rawLayout, [], true);

    expect(dimmedNodeIds).toBeUndefined();
  });

  it('selecting the whole-tree root dims nothing', () => {
    setUpTree();
    useTimelineStore.setState({ clade: true, subtreeRootId: 'r' });
    const { dimmedNodeIds } = computeTreeRenderState();
    expect(dimmedNodeIds).toBeUndefined();
  });
});
