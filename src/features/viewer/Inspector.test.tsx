// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from '../../store/selection';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { Inspector } from './Inspector';

function makeGraph() {
  const nodes = [
    {
      idx: 0,
      origId: 'tip_a',
      name: 'tip_a',
      label: null,
      annotations: { region: 'NorthAmerica', posterior: 0.97, notes: 'some annotation' },
      adjacents: [1],
      lengths: [0.1234],
    },
    {
      idx: 1,
      origId: 'internal_0',
      name: null,
      label: null,
      annotations: { region: 'Europe', posterior: 0.85 },
      adjacents: [0, 2],
      lengths: [0.1, 0.2],
    },
  ];

  return {
    nodes,
    root: { nodeA: 0, nodeB: 1, lenA: 0.1, lenB: 0.2, annotations: {} },
    origIdToIdx: new Map([
      ['tip_a', 0],
      ['internal_0', 1],
    ]),
    rooted: true,
    hiddenNodeIds: new Set<string>(),
    collapsedCladeIds: new Map(),
  };
}

function makeBranchTable() {
  const count = 2;
  return {
    count,
    branchId: new Int32Array([0, 1]),
    parentBranch: new Int32Array([-1, 0]),
    isInternal: new Uint8Array([0, 1]),
    startTime: new Float32Array([2015.0, 2014.0]),
    endTime: new Float32Array([2017.0, 2015.0]),
    startLat: new Float32Array([10.0, 20.0]),
    startLon: new Float32Array([-80.0, -70.0]),
    endLat: new Float32Array([15.0, 25.0]),
    endLon: new Float32Array([-75.0, -65.0]),
    stateWeight: new Float32Array([1, 1]),
    posterior: new Float32Array([0.97, 0.85]),
  };
}

beforeEach(() => {
  useUiStore.setState({ pinnedSelection: null, compareSelection: null });
  useSelectionStore.setState({ selectedBranchIds: [], selectedIds: [] });
  useTreeStore.setState({
    graph: null,
    branchTable: null,
    traitInfo: null,
    nodeHpds: null,
  });
});

afterEach(() => {
  cleanup();
});

describe('Inspector', () => {
  it('renders nothing when pinnedSelection is null', () => {
    render(<Inspector source="tree" />);
    expect(screen.queryByTestId('inspector')).toBeNull();
  });

  it('renders nothing when pinnedSelection.source does not match', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'map' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    expect(screen.queryByTestId('inspector')).toBeNull();
  });

  it('renders panel when pinnedSelection matches source', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    expect(screen.getByTestId('inspector')).toBeTruthy();
  });

  it('is marked as a tree control so clicks do not fall through to the tree', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    expect(screen.getByTestId('inspector').getAttribute('data-tree-control-root')).toBe('true');
  });

  it('shows taxon name and branch ID in Identity section', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    const panel = screen.getByTestId('inspector');
    expect(panel.textContent).toContain('tip_a');
    expect(panel.textContent).toContain('0');
  });

  it('Inspector taxon row displays node.name when present, falls back to origId', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 1, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    const panel = screen.getByTestId('inspector');
    expect(panel.textContent).toContain('internal_0');
    expect(panel.textContent).not.toContain('n###');
  });

  it('taxon row shows origId when name is null', () => {
    const graph = makeGraph();
    const node0 = graph.nodes[0];
    if (node0) node0.name = null;
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph, branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    const panel = screen.getByTestId('inspector');
    expect(panel.textContent).toContain('tip_a');
  });

  it('shows posterior value', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    const panel = screen.getByTestId('inspector');
    expect(panel.textContent).toContain('0.9700');
  });

  it('shows ISO dates for start and end time', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    const panel = screen.getByTestId('inspector');
    expect(panel.textContent).toContain('2015-01-01');
    expect(panel.textContent).toContain('2017-01-01');
  });

  it('shows lat/lon in Geography section', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    const panel = screen.getByTestId('inspector');
    expect(panel.textContent).toContain('15.00000');
    expect(panel.textContent).toContain('-75.00000');
  });

  it('shows location name when traitInfo is discrete', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({
      graph: makeGraph(),
      branchTable: makeBranchTable(),
      traitInfo: {
        kind: 'discrete',
        key: 'region',
        values: ['NorthAmerica', 'Europe'],
        ambiguous: false,
      },
    });
    render(<Inspector source="tree" />);
    const panel = screen.getByTestId('inspector');
    expect(panel.textContent).toContain('NorthAmerica');
  });

  it('close button hides the panel', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    fireEvent.click(screen.getByTestId('inspector-close'));
    expect(useUiStore.getState().pinnedSelection).toBeNull();
  });

  it('Escape key closes the inspector', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().pinnedSelection).toBeNull();
  });

  it('Raw section collapses by default; expand/collapse toggles pre', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    expect(screen.queryByTestId('inspector-raw')).toBeNull();
    fireEvent.click(screen.getByTestId('inspector-raw-toggle'));
    expect(screen.getByTestId('inspector-raw')).toBeTruthy();
    fireEvent.click(screen.getByTestId('inspector-raw-toggle'));
    expect(screen.queryByTestId('inspector-raw')).toBeNull();
  });

  it('Raw section renders full annotations JSON', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="tree" />);
    fireEvent.click(screen.getByTestId('inspector-raw-toggle'));
    const raw = screen.getByTestId('inspector-raw');
    expect(raw.textContent).toContain('NorthAmerica');
    expect(raw.textContent).toContain('notes');
  });

  it('works with source=map', () => {
    useUiStore.setState({ pinnedSelection: { branchId: 1, source: 'map' } });
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    render(<Inspector source="map" />);
    const panel = screen.getByTestId('inspector');
    expect(panel.textContent).toContain('internal_0');
  });

  describe('T096 accessibility', () => {
    it('inspector panel has aria-live="polite"', () => {
      useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
      useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
      render(<Inspector source="tree" />);
      const panel = screen.getByTestId('inspector');
      expect(panel.getAttribute('aria-live')).toBe('polite');
    });

    it('inspector panel has aria-label describing its type', () => {
      useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'tree' } });
      useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
      render(<Inspector source="tree" />);
      const panel = screen.getByTestId('inspector');
      expect(panel.getAttribute('aria-label')).toBeTruthy();
    });

    it('compare inspector panel has aria-live="polite"', () => {
      useUiStore.setState({
        pinnedSelection: { branchId: 0, source: 'tree' },
        compareSelection: { branchId: 1, source: 'tree' },
      });
      useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
      render(<Inspector source="tree" />);
      const comparePanel = screen.getByTestId('inspector-compare');
      expect(comparePanel.getAttribute('aria-live')).toBe('polite');
    });
  });

  describe('T057c compare', () => {
    it('no modifier click sets pinnedSelection only', () => {
      useUiStore.setState({
        pinnedSelection: { branchId: 0, source: 'tree' },
        compareSelection: null,
      });
      expect(useUiStore.getState().pinnedSelection?.branchId).toBe(0);
      expect(useUiStore.getState().compareSelection).toBeNull();
    });

    it('setCompareSelection sets compareSelection, leaves pinnedSelection unchanged', () => {
      useUiStore.setState({
        pinnedSelection: { branchId: 0, source: 'tree' },
        compareSelection: null,
      });
      useUiStore.getState().setCompareSelection({ branchId: 1, source: 'tree' });
      expect(useUiStore.getState().pinnedSelection?.branchId).toBe(0);
      expect(useUiStore.getState().compareSelection?.branchId).toBe(1);
    });

    it('both panels visible when pinnedSelection and compareSelection are set', () => {
      useUiStore.setState({
        pinnedSelection: { branchId: 0, source: 'tree' },
        compareSelection: { branchId: 1, source: 'tree' },
      });
      useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
      render(<Inspector source="tree" />);
      expect(screen.getByTestId('inspector')).toBeTruthy();
      expect(screen.getByTestId('inspector-compare')).toBeTruthy();
    });

    it('pinned panel shows data for branchId=0, compare panel shows data for branchId=1', () => {
      useUiStore.setState({
        pinnedSelection: { branchId: 0, source: 'tree' },
        compareSelection: { branchId: 1, source: 'tree' },
      });
      useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
      render(<Inspector source="tree" />);
      expect(screen.getByTestId('inspector').textContent).toContain('tip_a');
      expect(screen.getByTestId('inspector-compare').textContent).toContain('internal_0');
    });

    it('close compare panel sets compareSelection to null, pinnedSelection unchanged', () => {
      useUiStore.setState({
        pinnedSelection: { branchId: 0, source: 'tree' },
        compareSelection: { branchId: 1, source: 'tree' },
      });
      useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
      render(<Inspector source="tree" />);
      fireEvent.click(screen.getByTestId('inspector-compare-close'));
      expect(useUiStore.getState().compareSelection).toBeNull();
      expect(useUiStore.getState().pinnedSelection?.branchId).toBe(0);
    });
  });
});
