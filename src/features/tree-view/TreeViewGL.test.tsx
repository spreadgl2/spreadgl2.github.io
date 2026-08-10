// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchTable, Layout, LayoutNode, PhyloGraph } from '../../lib/phylo/types';
import { computeDimmedNodeIds } from '../../lib/tree-render/tree-render-state';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { TreeViewGL, useTreeGlDeckModel } from './TreeViewGL';

let capturedLayers: unknown[] = [];
let capturedViewState: unknown = null;

vi.mock('@deck.gl/react', () => ({
  DeckGL: ({
    layers,
    viewState,
    children,
  }: {
    layers: unknown[];
    viewState?: unknown;
    children?: React.ReactNode;
  }) => {
    capturedLayers = layers;
    capturedViewState = viewState ?? null;
    return (
      <div data-testid="deckgl" data-layer-count={layers.length}>
        {children}
      </div>
    );
  },
}));

vi.mock('@deck.gl/core', () => ({
  COORDINATE_SYSTEM: { CARTESIAN: 0 },
  OrthographicView: class OrthographicView {
    constructor(props: Record<string, unknown>) {
      Object.assign(this, props);
    }
  },
}));

vi.mock('@deck.gl/layers', () => ({
  LineLayer: class LineLayer {
    constructor(props: Record<string, unknown>) {
      Object.assign(this, props);
    }
  },
  ScatterplotLayer: class ScatterplotLayer {
    constructor(props: Record<string, unknown>) {
      Object.assign(this, props);
    }
  },
  IconLayer: class IconLayer {
    constructor(props: Record<string, unknown>) {
      Object.assign(this, props);
    }
  },
  SolidPolygonLayer: class SolidPolygonLayer {
    constructor(props: Record<string, unknown>) {
      Object.assign(this, props);
    }
  },
}));

vi.mock('../../lib/tree-render/glyph-atlas', () => ({
  buildGlyphAtlas: () => ({
    iconAtlas: document.createElement('canvas'),
    iconMapping: {
      circle: { x: 0, y: 0, width: 64, height: 64, mask: true },
      triangle: { x: 64, y: 0, width: 64, height: 64, mask: true },
      square: { x: 128, y: 0, width: 64, height: 64, mask: true },
      diamond: { x: 192, y: 0, width: 64, height: 64, mask: true },
    },
  }),
}));

// Mock ResizeObserver with a 500x900 panel so pre-scale math is deterministic.
const PANEL_W = 500;
const PANEL_H = 900;
let resizeObserveCount = 0;
let resizeDisconnectCount = 0;

class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
  }
  observe(el: Element) {
    resizeObserveCount += 1;
    this.callback(
      [
        {
          contentRect: { width: PANEL_W, height: PANEL_H } as DOMRectReadOnly,
          target: el,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {
    resizeDisconnectCount += 1;
  }
}

function TreeModelRefProbe({ visible }: { visible: boolean }) {
  const model = useTreeGlDeckModel();
  return visible ? <div ref={model.containerRef} data-testid="tree-model-ref-probe" /> : null;
}

// A PEDV-scale layout: X in [0, 1], Y in [0, 769] — representative of the
// aspect-ratio problem that caused the thin-strip bug.
function buildLargeLayout(tipCount: number): Layout {
  const nodes: LayoutNode[] = [];
  const nodeMap = new Map<string, LayoutNode>();

  const root: LayoutNode = {
    id: 'root',
    x: 0,
    y: tipCount / 2,
    isTip: false,
    parentId: null,
    children: [],
    annotations: {},
  };
  nodes.push(root);
  nodeMap.set('root', root);

  for (let i = 0; i < tipCount; i++) {
    const tip: LayoutNode = {
      id: `tip_${i}`,
      x: 1,
      y: i,
      isTip: true,
      parentId: 'root',
      children: [],
      annotations: {},
    };
    nodes.push(tip);
    nodeMap.set(tip.id, tip);
    root.children.push(tip.id);
  }

  return { nodes, nodeMap, maxX: 1, maxY: tipCount - 1, xAxisMode: 'divergence' };
}

const ROOT_NODE: LayoutNode = {
  id: 'root',
  x: 0,
  y: 0,
  isTip: false,
  parentId: null,
  children: ['tip_a', 'tip_b'],
  annotations: {},
};

const TIP_A_NODE: LayoutNode = {
  id: 'tip_a',
  x: 2,
  y: 0,
  isTip: true,
  parentId: 'root',
  children: [],
  annotations: {},
};

const TIP_B_NODE: LayoutNode = {
  id: 'tip_b',
  x: 2,
  y: 1,
  isTip: true,
  parentId: 'root',
  children: [],
  annotations: {},
};

const MOCK_LAYOUT: Layout = {
  nodes: [ROOT_NODE, TIP_A_NODE, TIP_B_NODE],
  nodeMap: new Map([
    ['root', ROOT_NODE],
    ['tip_a', TIP_A_NODE],
    ['tip_b', TIP_B_NODE],
  ]),
  maxX: 2,
  maxY: 1,
  xAxisMode: 'divergence',
};

const MOCK_GRAPH: PhyloGraph = {
  nodes: [
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
      origId: 'tip_a',
      name: 'tip_a',
      label: null,
      annotations: {},
      adjacents: [0],
      lengths: [1],
    },
    {
      idx: 2,
      origId: 'tip_b',
      name: 'tip_b',
      label: null,
      annotations: {},
      adjacents: [0],
      lengths: [1],
    },
  ],
  root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
  origIdToIdx: new Map([
    ['root', 0],
    ['tip_a', 1],
    ['tip_b', 2],
  ]),
  rooted: true,
  hiddenNodeIds: new Set(),
  collapsedCladeIds: new Map(),
};

function getBranchDatum(branchId: string):
  | {
      branchId: string;
      sourcePosition: [number, number];
      targetPosition: [number, number];
    }
  | undefined {
  const branchesLayer = (
    capturedLayers as {
      id: string;
      data?: {
        branchId: string;
        sourcePosition: [number, number];
        targetPosition: [number, number];
      }[];
    }[]
  ).find((l) => l.id === 'branches');
  return branchesLayer?.data?.find((d) => d.branchId === branchId);
}

const MOCK_GRAPH_WITH_LOCATION: PhyloGraph = {
  nodes: [
    {
      idx: 0,
      origId: 'root',
      name: null,
      label: null,
      annotations: { location: 'Beijing' },
      adjacents: [1, 2],
      lengths: [1, 1],
    },
    {
      idx: 1,
      origId: 'tip_a',
      name: 'tip_a',
      label: null,
      annotations: { location: 'Beijing' },
      adjacents: [0],
      lengths: [1],
    },
    {
      idx: 2,
      origId: 'tip_b',
      name: 'tip_b',
      label: null,
      annotations: { location: 'Shanghai' },
      adjacents: [0],
      lengths: [1],
    },
  ],
  root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
  origIdToIdx: new Map([
    ['root', 0],
    ['tip_a', 1],
    ['tip_b', 2],
  ]),
  rooted: true,
  hiddenNodeIds: new Set(),
  collapsedCladeIds: new Map(),
};

describe('TreeViewGL', () => {
  beforeEach(() => {
    capturedLayers = [];
    capturedViewState = null;
    resizeObserveCount = 0;
    resizeDisconnectCount = 0;

    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    // Stub clientWidth/clientHeight so the initial setState in useEffect returns the panel size.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return PANEL_W;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return PANEL_H;
      },
    });

    useTreeStore.setState({
      layout: MOCK_LAYOUT,
      graph: MOCK_GRAPH,
      branchTable: null,
      traitInfo: null,
    });
    useTimelineStore.setState({
      playhead: 2020.0,
      bounds: null,
      isPlaying: false,
      speed: 1,
      mode: 'Trail',
      arcs: false,
      clade: false,
      subtreeRootIds: [],
      subtreeRootId: null,
      window: null,
    });
    useSelectionStore.setState({
      hoveredId: null,
      selectedIds: [],
      hoveredBranchId: null,
      selectedBranchIds: [],
      highlightedBranchIds: [],
      compareSelection: [],
      focusedTaxa: [],
    });
    useUiStore.setState({
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      pinnedSelection: null,
      compareSelection: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a DeckGL container', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    expect(screen.getByTestId('deckgl')).toBeTruthy();
    expect(screen.getByTestId('tree-view-gl')).toBeTruthy();
  });

  it('reattaches panel measurement when the tree container remounts', () => {
    const { rerender } = render(<TreeModelRefProbe visible={true} />);

    expect(screen.getByTestId('tree-model-ref-probe')).toBeTruthy();
    expect(resizeObserveCount).toBe(1);

    act(() => {
      rerender(<TreeModelRefProbe visible={false} />);
    });

    expect(screen.queryByTestId('tree-model-ref-probe')).toBeNull();
    expect(resizeDisconnectCount).toBe(1);

    act(() => {
      rerender(<TreeModelRefProbe visible={true} />);
    });

    expect(screen.getByTestId('tree-model-ref-probe')).toBeTruthy();
    expect(resizeObserveCount).toBe(2);
  });

  it('renders LineLayer for branches with N-1 entries (N = total nodes)', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    // 3 nodes, 2 have parentId → 2 branch entries
    const branchesLayer = (capturedLayers as { id: string; data?: unknown[] }[]).find(
      (l) => l.id === 'branches',
    );
    expect(branchesLayer).toBeDefined();
    expect(branchesLayer?.data).toHaveLength(2);
  });

  it('renders ScatterplotLayer for tips with correct count', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const tipsLayer = (capturedLayers as { id: string; data?: unknown[] }[]).find(
      (l) => l.id === 'tips',
    );
    expect(tipsLayer).toBeDefined();
    // 2 tip nodes
    expect(tipsLayer?.data).toHaveLength(2);
  });

  it('branches-pickable layer removed — deck.gl picking replaced by kd-tree', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const pickableLayer = (capturedLayers as { id: string }[]).find(
      (l) => l.id === 'branches-pickable',
    );
    expect(pickableLayer).toBeUndefined();
    const ids = (capturedLayers as { id: string; pickable?: boolean }[]).map((l) => l.id);
    expect(ids).toContain('branches');
    expect(ids).toContain('elbows');
  });

  it('adds the hover ring only while a node is hovered', () => {
    const { rerender } = render(<TreeViewGL />);
    const hasHoverRing = () =>
      (capturedLayers as { id: string }[]).some((layer) => layer.id === 'hover-ring');
    expect(hasHoverRing()).toBe(false);

    useSelectionStore.setState({ hoveredId: 'tip_a' });
    rerender(<TreeViewGL />);
    expect(hasHoverRing()).toBe(true);
  });

  it('adds the selection accent only while nodes are selected', () => {
    const { rerender } = render(<TreeViewGL />);
    const hasSelectionAccent = () =>
      (capturedLayers as { id: string }[]).some((layer) => layer.id === 'selection-accent');
    expect(hasSelectionAccent()).toBe(false);

    useSelectionStore.setState({ selectedIds: ['tip_a'] });
    rerender(<TreeViewGL />);
    expect(hasSelectionAccent()).toBe(true);
  });

  it('selected clade root rings appear only while Shift peek is active', () => {
    useTimelineStore.setState({
      clade: true,
      subtreeRootIds: ['root'],
      subtreeRootId: 'root',
    });
    act(() => {
      render(<TreeViewGL />);
    });
    expect((capturedLayers as { id: string }[]).find((l) => l.id === 'selected-clade-roots')).toBe(
      undefined,
    );

    act(() => {
      fireEvent.keyDown(window, { key: 'Shift' });
    });
    const layer = (capturedLayers as { id: string; data?: Array<{ id: string }> }[]).find(
      (l) => l.id === 'selected-clade-roots',
    );
    expect(layer).toBeDefined();
    expect(layer?.data?.map((d) => d.id)).toEqual(['root']);

    act(() => {
      fireEvent.keyUp(window, { key: 'Shift' });
    });
    expect((capturedLayers as { id: string }[]).find((l) => l.id === 'selected-clade-roots')).toBe(
      undefined,
    );
  });

  it('playhead layer absent when calibration is inactive (no date annotations)', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const playhead = (capturedLayers as { id: string }[]).find((l) => l.id === 'playhead');
    expect(playhead).toBeUndefined();
  });

  it('playhead layer uses the exact playhead while animation is playing', () => {
    const calibTipA = { ...TIP_A_NODE, annotations: { date: '2015' } };
    const calibTipB = { ...TIP_B_NODE, annotations: { date: '2015' } };
    const calibLayout: Layout = {
      ...MOCK_LAYOUT,
      nodes: [ROOT_NODE, calibTipA, calibTipB],
      nodeMap: new Map([
        ['root', ROOT_NODE],
        ['tip_a', calibTipA],
        ['tip_b', calibTipB],
      ]),
    };
    useTreeStore.setState({ layout: calibLayout });
    useTimelineStore.setState({ playhead: 2014.91, isPlaying: true });

    act(() => {
      render(<TreeViewGL />);
    });

    const playhead = (
      capturedLayers as {
        id: string;
        data?: { sourcePosition: [number, number]; targetPosition: [number, number] }[];
      }[]
    ).find((l) => l.id === 'playhead');
    const x = playhead?.data?.[0]?.sourcePosition[0];

    expect(x).toBeCloseTo(448.4, 1);
    expect(x).not.toBeCloseTo(424.4, 1);
  });

  it('mousemove near branch midpoint sets hoveredId via kd-tree', () => {
    vi.useFakeTimers();
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    // Stub getBoundingClientRect so container origin is (0,0).
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    // tip_a branch: horizontal from (32,16) to (468,16); midpoint ≈ (250,16).
    act(() => {
      fireEvent.mouseMove(container, { clientX: 250, clientY: 16 });
      vi.runAllTimers();
    });
    vi.useRealTimers();
    expect(useSelectionStore.getState().hoveredId).toBe('tip_a');
  });

  it('mouseleave clears hoveredId', () => {
    useSelectionStore.setState({ hoveredId: 'tip_b' });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    act(() => {
      fireEvent.mouseLeave(container);
    });
    expect(useSelectionStore.getState().hoveredId).toBeNull();
  });

  it('click near branch midpoint toggles selectedId via kd-tree', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    // tip_b branch: horizontal from (32,884) to (468,884); midpoint ≈ (250,884).
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 884 });
    });
    expect(useSelectionStore.getState().selectedIds).toContain('tip_b');
  });

  it('3B: mousemove near tip_a sets hoveredBranchId via graph.origIdToIdx', () => {
    vi.useFakeTimers();
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.mouseMove(container, { clientX: 250, clientY: 16 });
      vi.runAllTimers();
    });
    vi.useRealTimers();
    expect(useSelectionStore.getState().hoveredBranchId).toBe(1);
  });

  it('3B: mouseleave clears hoveredBranchId', () => {
    useSelectionStore.setState({ hoveredBranchId: 2 });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    act(() => {
      fireEvent.mouseLeave(container);
    });
    expect(useSelectionStore.getState().hoveredBranchId).toBeNull();
  });

  it('3B: plain click near tip_a replaces branch selection and sets pinnedSelection', () => {
    useSelectionStore.setState({
      selectedIds: ['tip_b'],
      selectedBranchIds: [2],
      highlightedBranchIds: [2],
    });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 16 });
    });
    expect(useSelectionStore.getState().selectedIds).toEqual(['tip_a']);
    expect(useSelectionStore.getState().selectedBranchIds).toEqual([1]);
    expect(useSelectionStore.getState().highlightedBranchIds).toEqual([]);
    expect(useUiStore.getState().pinnedSelection).toEqual({ branchId: 1, source: 'tree' });
  });

  it('3B: double-click on empty background clears the selection', () => {
    useSelectionStore.setState({
      selectedIds: ['tip_a'],
      selectedBranchIds: [1],
      highlightedBranchIds: [1],
    });
    useUiStore.setState({ pinnedSelection: { branchId: 1, source: 'tree' } });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    // (250, 450) is between the two horizontal tip branches — empty background.
    act(() => {
      fireEvent.doubleClick(container, { clientX: 250, clientY: 450 });
    });
    expect(useSelectionStore.getState().selectedIds).toEqual([]);
    expect(useSelectionStore.getState().selectedBranchIds).toEqual([]);
    expect(useSelectionStore.getState().highlightedBranchIds).toEqual([]);
    expect(useUiStore.getState().pinnedSelection).toBeNull();
  });

  it('3B: double-click on a branch does not clear the selection', () => {
    useSelectionStore.setState({ selectedIds: ['tip_a'], selectedBranchIds: [1] });
    useUiStore.setState({ pinnedSelection: { branchId: 1, source: 'tree' } });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    // (250, 884) is on the tip_b branch — a hit, so the selection is preserved.
    act(() => {
      fireEvent.doubleClick(container, { clientX: 250, clientY: 884 });
    });
    expect(useUiStore.getState().pinnedSelection).toEqual({ branchId: 1, source: 'tree' });
  });

  it('3B: Shift+click near tip_b adds to the current branch selection', () => {
    useSelectionStore.setState({
      selectedIds: ['tip_a'],
      selectedBranchIds: [1],
    });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 884, shiftKey: true });
    });
    expect(useSelectionStore.getState().selectedIds).toEqual(['tip_a', 'tip_b']);
    expect(useSelectionStore.getState().selectedBranchIds).toEqual([1, 2]);
    expect(useUiStore.getState().pinnedSelection).toEqual({ branchId: 2, source: 'tree' });
  });

  it('3B: Cmd+click near tip_a sets compareSelection, does not toggle selectedIds', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 16, metaKey: true });
    });
    expect(useUiStore.getState().compareSelection).toEqual({ branchId: 1, source: 'tree' });
    expect(useSelectionStore.getState().selectedIds).not.toContain('tip_a');
  });

  it('3B: Ctrl+click near tip_b sets compareSelection', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 884, ctrlKey: true });
    });
    expect(useUiStore.getState().compareSelection).toEqual({ branchId: 2, source: 'tree' });
  });

  it('3B: clade mode, clicking tip_a walks up to root and calls setSubtreeRootId', () => {
    useTimelineStore.setState({ clade: true, subtreeRootId: null });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 16 });
    });
    expect(useTimelineStore.getState().subtreeRootId).toBe('root');
  });

  it('clade mode, Shift-click toggles a clade in the multi-clade set', () => {
    useTimelineStore.setState({ clade: true, subtreeRootIds: [], subtreeRootId: null });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 16, shiftKey: true });
    });
    expect(useTimelineStore.getState().subtreeRootIds).toEqual(['root']);
    expect(useTimelineStore.getState().subtreeRootId).toBe('root');
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 16, shiftKey: true });
    });
    expect(useTimelineStore.getState().subtreeRootIds).toEqual([]);
    expect(useTimelineStore.getState().subtreeRootId).toBe(null);
  });

  it('3B: clade mode, clicking tip_b walks up to root and calls setSubtreeRootId', () => {
    useTimelineStore.setState({ clade: true, subtreeRootId: null });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 884 });
    });
    expect(useTimelineStore.getState().subtreeRootId).toBe('root');
  });

  it('3B: clade mode, clicking the current subtree root again clears the selection', () => {
    // Subtree already scoped to 'root'; clicking it again toggles the selection
    // off so the whole tree returns to full colour (no dimming).
    useTimelineStore.setState({ clade: true, subtreeRootId: 'root' });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 16 });
    });
    expect(useTimelineStore.getState().subtreeRootId).toBe(null);
  });

  it('3B: clade mode, clicking the vertical connector (not the node point) selects nothing', () => {
    // The elbow spans root's full child y-range; clicking its midpoint (far from
    // any node point or horizontal branch) must not resolve to root — the
    // connector is no longer part of the pickable set.
    useTimelineStore.setState({ clade: true, subtreeRootId: null });
    act(() => {
      render(<TreeViewGL />);
    });
    const elbowsLayer = (
      capturedLayers as {
        id: string;
        data?: { sourcePosition: number[]; targetPosition: number[] }[];
      }[]
    ).find((l) => l.id === 'elbows');
    const elbow = elbowsLayer?.data?.[0];
    if (!elbow) throw new Error('expected a rendered elbow connector');
    const midX = elbow.sourcePosition[0] ?? 0;
    const midY = ((elbow.sourcePosition[1] ?? 0) + (elbow.targetPosition[1] ?? 0)) / 2;
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: midX, clientY: midY });
    });
    expect(useTimelineStore.getState().subtreeRootId).toBe(null);
  });

  it('3B: clade mode, the root IS selectable via its node point (it has no branch)', () => {
    // Place the root's y between its children so its point is clear of both tip
    // branches — here it coincides with the elbow midpoint. The root has no
    // incoming branch (absent from branchData), so only its node point makes it
    // pickable; clicking that point must select it.
    const rootMid = { ...ROOT_NODE, y: 0.5 };
    useTreeStore.setState({
      layout: {
        nodes: [rootMid, TIP_A_NODE, TIP_B_NODE],
        nodeMap: new Map([
          ['root', rootMid],
          ['tip_a', TIP_A_NODE],
          ['tip_b', TIP_B_NODE],
        ]),
        maxX: 2,
        maxY: 1,
        xAxisMode: 'divergence',
      },
    });
    useTimelineStore.setState({ clade: true, subtreeRootId: null });
    act(() => {
      render(<TreeViewGL />);
    });
    const elbowsLayer = (
      capturedLayers as {
        id: string;
        data?: { sourcePosition: number[]; targetPosition: number[] }[];
      }[]
    ).find((l) => l.id === 'elbows');
    const elbow = elbowsLayer?.data?.[0];
    if (!elbow) throw new Error('expected a rendered elbow connector');
    const rootX = elbow.sourcePosition[0] ?? 0;
    const rootY = ((elbow.sourcePosition[1] ?? 0) + (elbow.targetPosition[1] ?? 0)) / 2;
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: rootX, clientY: rootY });
    });
    expect(useTimelineStore.getState().subtreeRootId).toBe('root');
  });

  it('3B: when storeClade=false, Cmd+click near tip_a sets compareSelection not subtreeRootId', () => {
    useTimelineStore.setState({ clade: false, subtreeRootId: null });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 16, metaKey: true });
    });
    expect(useTimelineStore.getState().subtreeRootId).toBeNull();
    expect(useUiStore.getState().compareSelection).toEqual({ branchId: 1, source: 'tree' });
  });

  it('renders correctly with null layout (no crash)', () => {
    useTreeStore.setState({ layout: null, graph: null });
    expect(() =>
      act(() => {
        render(<TreeViewGL />);
      }),
    ).not.toThrow();
    const branchesLayer = (capturedLayers as { id: string; data?: unknown[] }[]).find(
      (l) => l.id === 'branches',
    );
    expect(branchesLayer?.data).toHaveLength(0);
  });

  it('uses zoom=0 and pixel-center target in the controlled DeckGL viewState', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const vs = capturedViewState as { zoom: number; target: number[] } | null;
    expect(vs).not.toBeNull();
    expect(vs?.zoom).toBe(0);
    // target should be near panel center
    expect(vs?.target[0]).toBeCloseTo(PANEL_W / 2, 0);
    expect(vs?.target[1]).toBeCloseTo(PANEL_H / 2, 0);
  });

  it('pre-scaled branch positions span nearly the full panel width for asymmetric layout', () => {
    // 769-tip layout: X in [0,1], Y in [0,768] — the PEDV-scale aspect ratio.
    const TIP_COUNT = 769;
    const largeLayout = buildLargeLayout(TIP_COUNT);
    useTreeStore.setState({ layout: largeLayout, graph: null });

    act(() => {
      render(<TreeViewGL />);
    });

    const branchesLayer = (
      capturedLayers as {
        id: string;
        data?: { sourcePosition: [number, number]; targetPosition: [number, number] }[];
      }[]
    ).find((l) => l.id === 'branches');
    expect(branchesLayer?.data).toBeDefined();
    const data = branchesLayer?.data ?? [];

    // Collect all X and Y pixel positions.
    const allX: number[] = [];
    const allY: number[] = [];
    for (const d of data) {
      allX.push(d.sourcePosition[0], d.targetPosition[0]);
      allY.push(d.sourcePosition[1], d.targetPosition[1]);
    }

    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    const usableW = PANEL_W - 2 * 32; // PAD_X = 32
    const usableH = PANEL_H - 2 * 16; // PAD_Y = 16

    // Both axes must span > 90% of their usable extents.
    expect(maxX - minX).toBeGreaterThan(usableW * 0.9);
    expect(maxY - minY).toBeGreaterThan(usableH * 0.9);
  });

  it('elbows layer rendered for inner nodes', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const elbowsLayer = (capturedLayers as { id: string; data?: unknown[] }[]).find(
      (l) => l.id === 'elbows',
    );
    // root has 2 children → 1 elbow entry
    expect(elbowsLayer).toBeDefined();
    expect(elbowsLayer?.data).toHaveLength(1);
  });

  // B1: when isPlaying is false, computeDimmedNodeIds must not add time-window-inactive branches.
  it('B1: dimmedNodeIds is empty when isPlaying is false, even with time-inactive branches', () => {
    const branchTable: BranchTable = {
      count: 2,
      branchId: new Int32Array([0, 1]),
      parentBranch: new Int32Array([-1, 0]),
      isInternal: new Uint8Array([1, 0]),
      startTime: new Float32Array([2010.0, 2010.0]),
      endTime: new Float32Array([2015.0, 2015.0]),
      startLat: new Float32Array([0, 0]),
      startLon: new Float32Array([0, 0]),
      endLat: new Float32Array([0, 0]),
      endLon: new Float32Array([0, 0]),
      stateWeight: new Float32Array([1, 1]),
    };
    useTreeStore.setState({ layout: MOCK_LAYOUT, graph: MOCK_GRAPH, branchTable });
    // playhead at 2020.0, branches end at 2015 — would be inactive in Trail mode
    // but isPlaying is false → should NOT dim
    useTimelineStore.setState({
      playhead: 2020.0,
      isPlaying: false,
      mode: 'Trail',
      clade: false,
      subtreeRootId: null,
      window: null,
      bounds: null,
      speed: 1,
      arcs: false,
    });
    useUiStore.setState({
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      deselectedValues: new Set(),
      posteriorThreshold: 0,
    });
    useSelectionStore.setState({ focusedTaxa: [] });

    const { dimmedNodeIds } = computeDimmedNodeIds(2020.0, [], MOCK_LAYOUT);
    // No dim when not playing — branches should all be undimmed
    expect(dimmedNodeIds).toBeUndefined();
  });

  // B2: dimmed branch getColor desaturates toward grey and drops to 5% alpha.
  it('B2: dimmed branch getColor greys the colour and uses 5% alpha', () => {
    const branchTable: BranchTable = {
      count: 2,
      branchId: new Int32Array([0, 1]),
      parentBranch: new Int32Array([-1, 0]),
      isInternal: new Uint8Array([1, 0]),
      startTime: new Float32Array([2010.0, 2010.0]),
      endTime: new Float32Array([2015.0, 2015.0]),
      startLat: new Float32Array([0, 0]),
      startLon: new Float32Array([0, 0]),
      endLat: new Float32Array([0, 0]),
      endLon: new Float32Array([0, 0]),
      stateWeight: new Float32Array([1, 1]),
    };
    useTreeStore.setState({ layout: MOCK_LAYOUT, graph: MOCK_GRAPH, branchTable });
    useTimelineStore.setState({
      playhead: 2012.0,
      isPlaying: true,
      mode: 'Trail',
      clade: false,
      subtreeRootId: null,
      window: null,
      bounds: null,
      speed: 1,
      arcs: false,
    });
    useUiStore.setState({
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      deselectedValues: new Set(),
      posteriorThreshold: 0,
    });
    useSelectionStore.setState({ focusedTaxa: [] });

    act(() => {
      render(<TreeViewGL />);
    });

    const branchesLayer = (
      capturedLayers as {
        id: string;
        data?: { branchId: string }[];
        getColor?: (d: { branchId: string }) => number[];
      }[]
    ).find((l) => l.id === 'branches');
    expect(branchesLayer).toBeDefined();
    expect(typeof branchesLayer?.getColor).toBe('function');

    // tip_a is dimmed (endTime 2015 > playhead 2012 but startTime 2010 ≤ 2012, active in Trail)
    // Actually Trail mode: active if startTime ≤ playhead — both branches have startTime 2010 ≤ 2012
    // So neither is dimmed. Let's test with playhead before all branches start.
    // Restructure: use playhead 2009 so branches (startTime 2010) are NOT active in Trail mode.
    cleanup();
    useTimelineStore.setState({ playhead: 2009.0 });

    act(() => {
      render(<TreeViewGL />);
    });

    const bl2 = (
      capturedLayers as {
        id: string;
        data?: { branchId: string }[];
        getColor?: (d: { branchId: string }) => number[];
      }[]
    ).find((l) => l.id === 'branches');

    if (bl2?.getColor) {
      const color = bl2.getColor({ branchId: 'tip_a' });
      // Dimmed branches drop to 5% of the base alpha (200 → 10). The default
      // branch colour is already grey, so desaturation leaves its RGB at 136.
      const expectedAlpha = Math.round(200 * 0.05); // 10
      expect(color[3]).toBe(expectedAlpha);
      expect(color[0]).toBe(136);
      expect(color[1]).toBe(136);
      expect(color[2]).toBe(136);
    }
  });

  // B3: sort toolbar is rendered in the GL tree pane.
  it('B3: sort toolbar is present in TreeViewGL', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    expect(screen.getByTestId('tree-sort-toolbar')).toBeTruthy();
    expect(screen.queryByTestId('tree-clear-selection')).toBeNull();
  });

  it('B3: clicking sort button dispatches setTreeSortOrder', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const toolbar = screen.getByTestId('tree-sort-toolbar');
    const ascButton = toolbar.querySelector('[title="Ladderize ascending (small clades on top)"]');
    expect(ascButton).toBeTruthy();
    act(() => {
      fireEvent.click(ascButton as Element);
    });
    expect(useUiStore.getState().treeSortOrder).toBe('asc');
  });

  it('toggles tree focus mode from the tree toolbar', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    const container = screen.getByTestId('tree-view-gl');
    const focusButton = screen.getByTestId('tree-focus-toggle');
    const resetButton = screen.getByTestId('tree-zoom-reset') as HTMLButtonElement;

    expect(focusButton.getAttribute('aria-pressed')).toBe('false');
    expect((container as HTMLElement).style.cursor).toBe('default');
    expect(resetButton.disabled).toBe(true);

    act(() => {
      fireEvent.click(focusButton);
    });

    expect(focusButton.getAttribute('aria-pressed')).toBe('true');
    expect((container as HTMLElement).style.cursor).toBe('crosshair');
  });

  it('uses focus-mode arrows for vertical spacing with a 1x lower bound', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    const focusButton = screen.getByTestId('tree-focus-toggle');
    const resetButton = screen.getByTestId('tree-zoom-reset') as HTMLButtonElement;
    expect(focusButton.getAttribute('aria-pressed')).toBe('false');
    expect(resetButton.disabled).toBe(true);

    act(() => {
      fireEvent.click(focusButton);
    });
    expect(focusButton.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp' });
    });

    expect(getBranchDatum('tip_a')?.targetPosition[1]).toBeLessThan(16);
    expect(getBranchDatum('tip_b')?.targetPosition[1]).toBeGreaterThan(PANEL_H - 16);
    expect(resetButton.disabled).toBe(false);

    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
    });

    expect(getBranchDatum('tip_a')?.targetPosition[1]).toBeCloseTo(16);
    expect(getBranchDatum('tip_b')?.targetPosition[1]).toBeCloseTo(PANEL_H - 16);
    expect(resetButton.disabled).toBe(true);
  });

  it('caps vertical spacing at 5x', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    act(() => {
      fireEvent.click(screen.getByTestId('tree-focus-toggle'));
    });
    for (let i = 0; i < 30; i++) {
      act(() => {
        fireEvent.keyDown(window, { key: 'ArrowUp' });
      });
    }

    const tipA = getBranchDatum('tip_a');
    const tipB = getBranchDatum('tip_b');
    expect(tipA?.targetPosition[1]).toBeCloseTo(-1720);
    expect(tipB?.targetPosition[1]).toBeCloseTo(2620);
  });

  it('scrolls vertically with the mouse wheel when the expanded tree is taller than the pane', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    const container = screen.getByTestId('tree-view-gl');
    act(() => {
      fireEvent.click(screen.getByTestId('tree-focus-toggle'));
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp' });
    });

    const before = getBranchDatum('tip_b')?.targetPosition[1];
    expect(before).toBeGreaterThan(PANEL_H - 16);

    act(() => {
      fireEvent.wheel(container, { deltaY: 80 });
    });

    expect(getBranchDatum('tip_b')?.targetPosition[1]).toBeCloseTo((before ?? 0) - 80);
  });

  it('draws a box zoom rectangle and zooms the transformed tree coordinates on release', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    const container = screen.getByTestId('tree-view-gl');
    const focusButton = screen.getByTestId('tree-focus-toggle');
    act(() => {
      fireEvent.click(focusButton);
    });

    act(() => {
      fireEvent.mouseDown(container, { clientX: 200, clientY: 0, button: 0 });
    });
    act(() => {
      fireEvent.mouseMove(container, { clientX: 500, clientY: 200 });
    });

    const box = screen.getByTestId('tree-zoom-box') as HTMLElement;
    expect(box.style.left).toBe('200px');
    expect(box.style.top).toBe('0px');
    expect(box.style.width).toBe('300px');
    expect(box.style.height).toBe('200px');

    act(() => {
      fireEvent.mouseUp(container, { clientX: 500, clientY: 200, button: 0 });
    });

    expect(screen.queryByTestId('tree-zoom-box')).toBeNull();
    expect((screen.getByTestId('tree-zoom-reset') as HTMLButtonElement).disabled).toBe(false);

    const branchesLayer = (
      capturedLayers as {
        id: string;
        data?: {
          branchId: string;
          sourcePosition: [number, number];
          targetPosition: [number, number];
        }[];
      }[]
    ).find((l) => l.id === 'branches');
    const tipABranch = branchesLayer?.data?.find((d) => d.branchId === 'tip_a');
    expect(tipABranch?.targetPosition[0]).toBeGreaterThan(400);
    expect(tipABranch?.targetPosition[0]).toBeLessThan(PANEL_W);
    expect(tipABranch?.targetPosition[1]).toBeGreaterThan(300);
  });

  it('can reset box zoom and vertical spacing back to the full tree', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    const container = screen.getByTestId('tree-view-gl');
    act(() => {
      fireEvent.click(screen.getByTestId('tree-focus-toggle'));
    });
    act(() => {
      fireEvent.mouseDown(container, { clientX: 200, clientY: 0, button: 0 });
    });
    act(() => {
      fireEvent.mouseMove(container, { clientX: 500, clientY: 200 });
    });
    act(() => {
      fireEvent.mouseUp(container, { clientX: 500, clientY: 200, button: 0 });
    });
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowUp' });
    });

    const resetButton = screen.getByTestId('tree-zoom-reset') as HTMLButtonElement;
    expect(resetButton.disabled).toBe(false);

    act(() => {
      fireEvent.click(resetButton);
    });

    expect(resetButton.disabled).toBe(true);
    const tipABranch = getBranchDatum('tip_a');
    expect(tipABranch?.sourcePosition[0]).toBeCloseTo(32);
    expect(tipABranch?.targetPosition[0]).toBeCloseTo(PANEL_W - 32);
    expect(tipABranch?.targetPosition[1]).toBeCloseTo(16);
  });

  it('continues picking branches at their transformed positions after zooming', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    const container = screen.getByTestId('tree-view-gl');
    const focusButton = screen.getByTestId('tree-focus-toggle');
    act(() => {
      fireEvent.click(focusButton);
    });
    act(() => {
      fireEvent.mouseDown(container, { clientX: 200, clientY: 0, button: 0 });
    });
    act(() => {
      fireEvent.mouseMove(container, { clientX: 500, clientY: 200 });
    });
    act(() => {
      fireEvent.mouseUp(container, { clientX: 500, clientY: 200, button: 0 });
    });
    act(() => {
      fireEvent.click(focusButton);
    });

    const branchesLayer = (
      capturedLayers as {
        id: string;
        data?: { branchId: string; targetPosition: [number, number] }[];
      }[]
    ).find((l) => l.id === 'branches');
    const tipABranch = branchesLayer?.data?.find((d) => d.branchId === 'tip_a');
    if (!tipABranch) throw new Error('expected transformed tip_a branch');

    act(() => {
      fireEvent.click(container, {
        clientX: tipABranch.targetPosition[0],
        clientY: tipABranch.targetPosition[1],
      });
    });

    expect(useSelectionStore.getState().selectedIds).toEqual(['tip_a']);
    expect(useSelectionStore.getState().selectedBranchIds).toEqual([1]);
  });

  it('exits tree focus mode and cancels an active rectangle on Escape', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    const container = screen.getByTestId('tree-view-gl');
    const focusButton = screen.getByTestId('tree-focus-toggle');
    act(() => {
      fireEvent.click(focusButton);
    });
    act(() => {
      fireEvent.mouseDown(container, { clientX: 120, clientY: 120, button: 0 });
    });
    act(() => {
      fireEvent.mouseMove(container, { clientX: 240, clientY: 260 });
    });

    expect(screen.getByTestId('tree-zoom-box')).toBeTruthy();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(screen.queryByTestId('tree-zoom-box')).toBeNull();
    expect(focusButton.getAttribute('aria-pressed')).toBe('false');
    expect((container as HTMLElement).style.cursor).toBe('default');
  });

  it('exits tree focus mode on Escape without an active rectangle', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    const focusButton = screen.getByTestId('tree-focus-toggle');
    act(() => {
      fireEvent.click(focusButton);
    });
    expect(focusButton.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(focusButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('does not select tree branches while tree focus mode is active', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    const container = screen.getByTestId('tree-view-gl');
    act(() => {
      fireEvent.click(screen.getByTestId('tree-focus-toggle'));
    });
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 16 });
    });

    expect(useSelectionStore.getState().selectedIds).toEqual([]);
    expect(useSelectionStore.getState().selectedBranchIds).toEqual([]);
  });

  it('shows the top-right clear button when only selected tree node ids are populated', () => {
    useSelectionStore.setState({ selectedIds: ['tip_a'] });

    act(() => {
      render(<TreeViewGL />);
    });

    expect(screen.getByTestId('tree-clear-selection').textContent).toContain('Clear selection');
  });

  it('clears branch selections from the top-right tree button', () => {
    useSelectionStore.setState({
      selectedIds: ['tip_a'],
      selectedBranchIds: [1],
      highlightedBranchIds: [2],
    });
    useUiStore.setState({
      pinnedSelection: { branchId: 1, source: 'tree' },
      compareSelection: { branchId: 2, source: 'tree' },
    });

    act(() => {
      render(<TreeViewGL />);
    });

    const clearButton = screen.getByTestId('tree-clear-selection');
    expect(clearButton.textContent).toContain('Clear selection');

    act(() => {
      fireEvent.click(clearButton);
    });

    expect(useSelectionStore.getState().selectedIds).toEqual([]);
    expect(useSelectionStore.getState().selectedBranchIds).toEqual([]);
    expect(useSelectionStore.getState().highlightedBranchIds).toEqual([]);
    expect(useUiStore.getState().pinnedSelection).toBeNull();
    expect(useUiStore.getState().compareSelection).toBeNull();
    expect(screen.queryByTestId('tree-clear-selection')).toBeNull();
  });

  // Phase 4: tree controls guard prevents kd-tree picking when events originate inside the toolbar.
  it('Phase 4: hover/click inside SortToolbar does NOT fire kd-tree picking', () => {
    // Pre-seed hoveredId and selectedIds so we can detect mutation.
    useSelectionStore.setState({ hoveredId: 'tip_a', selectedIds: ['tip_a'] });
    act(() => {
      render(<TreeViewGL />);
    });
    const toolbar = screen.getByTestId('tree-sort-toolbar');
    const ascButton = toolbar.querySelector('[title="Ladderize ascending (small clades on top)"]');
    expect(ascButton).toBeTruthy();

    // clientX=250, clientY=16 lands on the tip_a branch midpoint in pixel space
    // (scaleX=218, scaleY=868, originX=32, originY=16 → midpoint=(250,16)).
    // Without the guard, handleHover would hit the kd-tree → setHoveredId('tip_a')
    // overwrites with the same value, but more importantly any miss would clear it.
    act(() => {
      fireEvent.mouseMove(ascButton as Element, { clientX: 250, clientY: 16 });
    });
    // Guard must fire before kd-tree query; hoveredId stays 'tip_a'.
    expect(useSelectionStore.getState().hoveredId).toBe('tip_a');

    act(() => {
      fireEvent.click(ascButton as Element, { clientX: 250, clientY: 16 });
    });
    // Without the guard, handleClick would hit the kd-tree → toggleSelectedId('tip_a')
    // → selectedIds becomes []. The guard must prevent this.
    expect(useSelectionStore.getState().selectedIds).toEqual(['tip_a']);
  });

  // V7: showBranches = false → no branches/elbows/branches-pickable layers.
  it('V7: showBranches=false removes branch layers', () => {
    useUiStore.setState({
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      showBranches: false,
      showTips: true,
    });
    act(() => {
      render(<TreeViewGL />);
    });
    const ids = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(ids).not.toContain('branches');
    expect(ids).not.toContain('elbows');
    expect(ids).not.toContain('branches-pickable');
    expect(ids).not.toContain('selection-accent');
    expect(ids).toContain('tips');
  });

  // V7: showTips = false → no tips/hover-ring layers.
  it('V7: showTips=false removes tip layers', () => {
    useUiStore.setState({
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      showBranches: true,
      showTips: false,
    });
    act(() => {
      render(<TreeViewGL />);
    });
    const ids = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(ids).not.toContain('tips');
    expect(ids).toContain('branches');
    expect(ids).toContain('elbows');
  });

  // Dim-dep tests: legend filter, posterior slider, mode switch, clade pin.

  it('dim: deselectedValues causes branches with matching trait to be dimmed', () => {
    const branchTable: BranchTable = {
      count: 2,
      branchId: new Int32Array([0, 1]),
      parentBranch: new Int32Array([-1, 0]),
      isInternal: new Uint8Array([1, 0]),
      startTime: new Float32Array([2010.0, 2010.0]),
      endTime: new Float32Array([2020.0, 2020.0]),
      startLat: new Float32Array([0, 0]),
      startLon: new Float32Array([0, 0]),
      endLat: new Float32Array([0, 0]),
      endLon: new Float32Array([0, 0]),
      stateWeight: new Float32Array([1, 1]),
    };

    useTreeStore.setState({ layout: MOCK_LAYOUT, graph: MOCK_GRAPH_WITH_LOCATION, branchTable });
    useTimelineStore.setState({
      playhead: 2015.0,
      isPlaying: false,
      mode: 'Trail',
      clade: false,
      subtreeRootId: null,
      window: null,
      bounds: null,
      speed: 1,
      arcs: false,
    });
    useUiStore.setState({
      treeSortOrder: 'file',
      colorByKey: 'location',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      deselectedValues: new Set(['Beijing']),
      posteriorThreshold: 0,
    });

    act(() => {
      render(<TreeViewGL />);
    });

    const branchesLayer = (
      capturedLayers as {
        id: string;
        data?: { branchId: string }[];
        getColor?: (d: { branchId: string }) => number[];
        updateTriggers?: { getColor?: unknown };
      }[]
    ).find((l) => l.id === 'branches');
    expect(branchesLayer).toBeDefined();
    expect(typeof branchesLayer?.getColor).toBe('function');

    // tip_a has location='Beijing' which is deselected → alpha must be dimmed (10 = 200 * 0.05)
    const colorDimmed = branchesLayer?.getColor?.({ branchId: 'tip_a' });
    expect(colorDimmed?.[3]).toBe(Math.round(200 * 0.05));

    // tip_b has location='Shanghai' which is not deselected → full alpha (200)
    const colorFull = branchesLayer?.getColor?.({ branchId: 'tip_b' });
    expect(colorFull?.[3]).toBe(200);
    const dimmedCount = (globalThis as unknown as Record<string, number>).__treeDimmedCount ?? 0;
    expect(dimmedCount).toBeGreaterThan(0);
  });

  it('dim: posteriorThreshold subscription present in dep array (store mutation re-renders)', () => {
    const branchTable: BranchTable = {
      count: 2,
      branchId: new Int32Array([0, 1]),
      parentBranch: new Int32Array([-1, 0]),
      isInternal: new Uint8Array([1, 0]),
      startTime: new Float32Array([2010.0, 2010.0]),
      endTime: new Float32Array([2020.0, 2020.0]),
      startLat: new Float32Array([0, 0]),
      startLon: new Float32Array([0, 0]),
      endLat: new Float32Array([0, 0]),
      endLon: new Float32Array([0, 0]),
      stateWeight: new Float32Array([1, 1]),
      posterior: new Float32Array([0.5, 0.5]),
    };
    useTreeStore.setState({ layout: MOCK_LAYOUT, graph: MOCK_GRAPH, branchTable });
    useUiStore.setState({
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      deselectedValues: new Set(),
      posteriorThreshold: 0,
    });

    act(() => {
      render(<TreeViewGL />);
    });

    const getLayer = () =>
      (
        capturedLayers as {
          id: string;
          getColor?: (d: { branchId: string }) => number[];
        }[]
      ).find((l) => l.id === 'branches');

    // With threshold=0, posterior=0.5 is above it → no dimming → alpha 200.
    expect(getLayer()?.getColor?.({ branchId: 'tip_a' })?.[3]).toBe(200);

    act(() => {
      useUiStore.setState({ posteriorThreshold: 0.9 });
    });

    // posterior=0.5 < threshold=0.9 → tip_a is dimmed → alpha Math.round(200 * 0.05) = 10.
    expect(getLayer()?.getColor?.({ branchId: 'tip_a' })?.[3]).toBe(Math.round(200 * 0.05));
  });

  it('dim: storeMode Window triggers re-render of dim state', () => {
    useTimelineStore.setState({
      playhead: 2015.0,
      isPlaying: false,
      mode: 'Trail',
      clade: false,
      subtreeRootId: null,
      window: null,
      bounds: null,
      speed: 1,
      arcs: false,
    });
    useUiStore.setState({
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      deselectedValues: new Set(),
      posteriorThreshold: 0,
    });

    act(() => {
      render(<TreeViewGL />);
    });

    act(() => {
      useTimelineStore.setState({
        mode: 'Window',
        window: { start: 2012.0, end: 2018.0 },
      });
    });

    const branchesLayer = (capturedLayers as { id: string }[]).find((l) => l.id === 'branches');
    expect(branchesLayer).toBeDefined();
  });

  // Phase 2B: slider effect tests

  it('F1: branchWidth drives branch and elbow widths and their update trigger', () => {
    useUiStore.setState({ branchWidth: 3 });
    act(() => {
      render(<TreeViewGL />);
    });
    const bl = (
      capturedLayers as {
        id: string;
        getWidth?: number | ((...args: unknown[]) => number);
        updateTriggers?: { getWidth?: unknown[] };
      }[]
    ).find((l) => l.id === 'branches');
    const el = (
      capturedLayers as { id: string; getWidth?: number | ((...args: unknown[]) => number) }[]
    ).find((l) => l.id === 'elbows');
    expect(bl).toBeDefined();
    expect(el).toBeDefined();
    const branchWidth = typeof bl?.getWidth === 'function' ? bl.getWidth({}) : bl?.getWidth;
    const elbowWidth = typeof el?.getWidth === 'function' ? el.getWidth({}) : el?.getWidth;
    expect(branchWidth).toBe(3);
    expect(elbowWidth).toBe(3);
    expect(bl?.updateTriggers?.getWidth).toContain(3);
  });

  it('F2: tipRadius drives tip size and its update trigger', () => {
    useUiStore.setState({ tipRadius: 4, showTips: true });
    act(() => {
      render(<TreeViewGL />);
    });
    const tl = (
      capturedLayers as {
        id: string;
        getSize?: () => number;
        updateTriggers?: { getSize?: unknown[] };
      }[]
    ).find((l) => l.id === 'tips');
    expect(tl).toBeDefined();
    expect(typeof tl?.getSize).toBe('function');
    expect(tl?.getSize?.()).toBe(8);
    expect(tl?.updateTriggers?.getSize).toContain(4);
  });

  it('F3: treeOpacity=50 halves branch color alpha (non-dimmed)', () => {
    useUiStore.setState({ treeOpacity: 50 });
    act(() => {
      render(<TreeViewGL />);
    });
    const bl = (
      capturedLayers as {
        id: string;
        getColor?: (d: { branchId: string }) => number[];
      }[]
    ).find((l) => l.id === 'branches');
    expect(bl).toBeDefined();
    expect(typeof bl?.getColor).toBe('function');
    if (bl?.getColor) {
      const color = bl.getColor({ branchId: 'tip_a' });
      // DEFAULT_BRANCH_COLOR alpha=200; 50% opacity → Math.round(200 * 0.5) = 100
      expect(color[3]).toBe(Math.round(200 * 0.5));
    }
  });

  it('F3: treeOpacity=50 halves tip color alpha (non-dimmed)', () => {
    useUiStore.setState({ treeOpacity: 50, showTips: true });
    act(() => {
      render(<TreeViewGL />);
    });
    const tl = (
      capturedLayers as {
        id: string;
        getColor?: (n: { id: string }) => number[];
      }[]
    ).find((l) => l.id === 'tips');
    expect(tl).toBeDefined();
    expect(typeof tl?.getColor).toBe('function');
    if (tl?.getColor) {
      const color = tl.getColor({ id: 'tip_a' });
      // DEFAULT_TIP_COLOR alpha=200; 50% opacity → Math.round(200 * 0.5) = 100
      expect(color[3]).toBe(Math.round(200 * 0.5));
    }
  });

  it('F3: treeOpacity combines multiplicatively with dim alpha', () => {
    const branchTable: BranchTable = {
      count: 2,
      branchId: new Int32Array([0, 1]),
      parentBranch: new Int32Array([-1, 0]),
      isInternal: new Uint8Array([1, 0]),
      startTime: new Float32Array([2010.0, 2010.0]),
      endTime: new Float32Array([2020.0, 2020.0]),
      startLat: new Float32Array([0, 0]),
      startLon: new Float32Array([0, 0]),
      endLat: new Float32Array([0, 0]),
      endLon: new Float32Array([0, 0]),
      stateWeight: new Float32Array([1, 1]),
    };
    useTreeStore.setState({ layout: MOCK_LAYOUT, graph: MOCK_GRAPH, branchTable });
    // playhead before branches start → Trail mode → all branches dimmed
    useTimelineStore.setState({
      playhead: 2009.0,
      isPlaying: true,
      mode: 'Trail',
      clade: false,
      subtreeRootId: null,
      window: null,
      bounds: null,
      speed: 1,
      arcs: false,
    });
    useUiStore.setState({
      treeOpacity: 50,
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      deselectedValues: new Set(),
      posteriorThreshold: 0,
    });
    act(() => {
      render(<TreeViewGL />);
    });

    const bl = (
      capturedLayers as {
        id: string;
        getColor?: (d: { branchId: string }) => number[];
      }[]
    ).find((l) => l.id === 'branches');
    expect(bl).toBeDefined();
    if (bl?.getColor) {
      const color = bl.getColor({ branchId: 'tip_a' });
      // dimmed: 0.05 × opacity: 0.5 → Math.round(200 * 0.05 * 0.5) = 5
      expect(color[3]).toBe(Math.round(200 * 0.05 * 0.5));
    }
  });

  it('F3: treeOpacity updateTriggers contains treeOpacity on branches', () => {
    useUiStore.setState({ treeOpacity: 75 });
    act(() => {
      render(<TreeViewGL />);
    });
    const bl = (capturedLayers as { id: string; updateTriggers?: { getColor?: unknown[] } }[]).find(
      (l) => l.id === 'branches',
    );
    expect(bl?.updateTriggers?.getColor).toContain(75);
  });

  it('root elbow and stub dim outside the Window without a root branch row', () => {
    const calibTipA = { ...TIP_A_NODE, annotations: { date: '2015' } };
    const calibTipB = { ...TIP_B_NODE, annotations: { date: '2015' } };
    const calibLayout: Layout = {
      ...MOCK_LAYOUT,
      nodes: [ROOT_NODE, calibTipA, calibTipB],
      nodeMap: new Map([
        ['root', ROOT_NODE],
        ['tip_a', calibTipA],
        ['tip_b', calibTipB],
      ]),
    };
    const branchTable: BranchTable = {
      count: 2,
      branchId: new Int32Array([1, 2]),
      parentBranch: new Int32Array([-1, -1]),
      isInternal: new Uint8Array([0, 0]),
      startTime: new Float32Array([2013.0, 2013.0]),
      endTime: new Float32Array([2015.0, 2015.0]),
      startLat: new Float32Array([0, 0]),
      startLon: new Float32Array([0, 0]),
      endLat: new Float32Array([0, 0]),
      endLon: new Float32Array([0, 0]),
      stateWeight: new Float32Array([1, 1]),
    };
    useTreeStore.setState({ layout: calibLayout, graph: MOCK_GRAPH, branchTable });
    useTimelineStore.setState({
      playhead: 2015.0,
      isPlaying: true,
      mode: 'Window',
      clade: false,
      subtreeRootId: null,
      window: { start: 2014.0, end: 2015.0 },
      windowSize: 1,
      bounds: null,
      speed: 1,
      arcs: false,
    });
    useUiStore.setState({
      treeOpacity: 50,
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      deselectedValues: new Set(),
      posteriorThreshold: 0,
      showBranches: true,
    });
    act(() => {
      render(<TreeViewGL />);
    });

    const elbows = (
      capturedLayers as {
        id: string;
        getColor?: (d: { branchId: string }) => number[];
      }[]
    ).find((l) => l.id === 'elbows');
    const sl = (
      capturedLayers as {
        id: string;
        getColor?: (d: { nodeId: string }) => number[];
      }[]
    ).find((l) => l.id === 'root-stub');
    expect(elbows).toBeDefined();
    expect(sl).toBeDefined();
    if (elbows?.getColor) {
      const color = elbows.getColor({ branchId: 'root' });
      expect(color[3]).toBe(Math.round(200 * 0.05 * 0.5));
    }
    if (sl?.getColor) {
      const color = sl.getColor({ nodeId: 'root' });
      expect(color[3]).toBe(Math.round(200 * 0.05 * 0.5));
    }
  });

  it('root-stub: getWidth uses branchWidth and updateTriggers contains branchWidth', () => {
    useUiStore.setState({ branchWidth: 2, showBranches: true });
    act(() => {
      render(<TreeViewGL />);
    });
    const sl = (
      capturedLayers as {
        id: string;
        getWidth?: number | ((...args: unknown[]) => number);
        updateTriggers?: { getWidth?: unknown[]; getColor?: unknown[] };
      }[]
    ).find((l) => l.id === 'root-stub');
    expect(sl).toBeDefined();
    const w = typeof sl?.getWidth === 'function' ? sl.getWidth({}) : sl?.getWidth;
    expect(w).toBe(2);
    expect(sl?.updateTriggers?.getWidth).toContain(2);
  });

  // Phase 2C: glyph shape tests

  it('glyph: tips layer is IconLayer with iconAtlas and iconMapping', () => {
    useUiStore.setState({ showTips: true });
    act(() => {
      render(<TreeViewGL />);
    });
    const tipsLayer = (
      capturedLayers as {
        id: string;
        iconAtlas?: HTMLCanvasElement;
        iconMapping?: Record<string, unknown>;
      }[]
    ).find((l) => l.id === 'tips');
    expect(tipsLayer).toBeDefined();
    expect(tipsLayer?.iconAtlas).toBeInstanceOf(HTMLCanvasElement);
    expect(tipsLayer?.iconMapping).toBeDefined();
  });

  it('glyph: getIcon returns circle by default when glyphByKey is none', () => {
    useUiStore.setState({
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      showTips: true,
    });
    act(() => {
      render(<TreeViewGL />);
    });
    const tipsLayer = (
      capturedLayers as {
        id: string;
        getIcon?: (n: { id: string }) => string;
      }[]
    ).find((l) => l.id === 'tips');
    expect(tipsLayer).toBeDefined();
    expect(typeof tipsLayer?.getIcon).toBe('function');
    expect(tipsLayer?.getIcon?.({ id: 'tip_a' })).toBe('circle');
  });

  it('glyph: getIcon returns non-circle glyph when glyphByKey matches a real annotation key', () => {
    useTreeStore.setState({
      layout: MOCK_LAYOUT,
      graph: MOCK_GRAPH_WITH_LOCATION,
      branchTable: null,
    });
    useUiStore.setState({
      treeSortOrder: 'file',
      colorByKey: 'single-color',
      glyphByKey: 'location',
      palette: 'okabe-ito',
      paletteReverse: false,
      showTips: true,
    });
    act(() => {
      render(<TreeViewGL />);
    });
    const tipsLayer = (
      capturedLayers as {
        id: string;
        getIcon?: (n: { id: string }) => string;
      }[]
    ).find((l) => l.id === 'tips');
    expect(tipsLayer).toBeDefined();
    expect(typeof tipsLayer?.getIcon).toBe('function');
    // tip_b has location='Shanghai' → sorted index 1 → 'triangle' (non-circle)
    expect(tipsLayer?.getIcon?.({ id: 'tip_b' })).toBe('triangle');
  });

  // Phase 3A: Inspector mount + hover/click wiring tests

  it('3A: Inspector is mounted when pinnedSelection is set (source=tree)', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    act(() => {
      render(<TreeViewGL />);
    });
    expect(screen.getByTestId('inspector')).toBeTruthy();
    expect(screen.getByLabelText('Pinned inspector')).toBeTruthy();
  });

  it('3A: mousemove near tip_a sets hoveredBranchId to numeric index via origIdToIdx', () => {
    vi.useFakeTimers();
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.mouseMove(container, { clientX: 250, clientY: 16 });
      vi.runAllTimers();
    });
    vi.useRealTimers();
    expect(useSelectionStore.getState().hoveredBranchId).toBe(1);
  });

  it('3A: mouseleave clears hoveredBranchId', () => {
    useSelectionStore.setState({ hoveredBranchId: 2 });
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    act(() => {
      fireEvent.mouseLeave(container);
    });
    expect(useSelectionStore.getState().hoveredBranchId).toBeNull();
  });

  it('3A: click near tip_b sets pinnedSelection with numeric branchId and source tree', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 884 });
    });
    const sel = useUiStore.getState().pinnedSelection;
    expect(sel).not.toBeNull();
    expect(sel?.branchId).toBe(2);
    expect(sel?.source).toBe('tree');
  });

  it('3A: click near tip_a stores a numeric selectedBranchId', () => {
    act(() => {
      render(<TreeViewGL />);
    });
    const container = screen.getByTestId('tree-view-gl');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: PANEL_W,
      bottom: PANEL_H,
      width: PANEL_W,
      height: PANEL_H,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    act(() => {
      fireEvent.click(container, { clientX: 250, clientY: 16 });
    });
    expect(useSelectionStore.getState().selectedBranchIds).toContain(1);
  });

  // Phase 2D: window-band and window-edges tests

  it('2D: Window mode places band and edge layers behind branches', () => {
    const calibTipA = { ...TIP_A_NODE, annotations: { date: '2015' } };
    const calibTipB = { ...TIP_B_NODE, annotations: { date: '2015' } };
    const calibLayout: Layout = {
      ...MOCK_LAYOUT,
      nodes: [ROOT_NODE, calibTipA, calibTipB],
      nodeMap: new Map([
        ['root', ROOT_NODE],
        ['tip_a', calibTipA],
        ['tip_b', calibTipB],
      ]),
    };
    useTreeStore.setState({ layout: calibLayout });
    useTimelineStore.setState({ mode: 'Window', window: { start: 2012.0, end: 2014.0 } });

    act(() => {
      render(<TreeViewGL />);
    });

    const layers = capturedLayers as { id: string; coordinateSystem?: number }[];
    const layerIds = layers.map((l) => l.id);
    expect(layerIds).toContain('window-band');
    expect(layerIds).toContain('window-edges');
    expect(layerIds.indexOf('window-band')).toBeLessThan(layerIds.indexOf('branches'));
    expect(layers.find((layer) => layer.id === 'window-band')?.coordinateSystem).toBe(0);
  });

  it('2D: Trail mode omits window band and edge layers', () => {
    act(() => {
      render(<TreeViewGL />);
    });

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).not.toContain('window-band');
    expect(layerIds).not.toContain('window-edges');
  });
});
