// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PhyloNode } from '../../lib/phylo/types';
import { useSelectionStore } from '../../store/selection';
import { useTreeStore } from '../../store/tree';
import { HoverTooltip } from './HoverTooltip';

function makeGraph() {
  const nodes: PhyloNode[] = [
    {
      idx: 0,
      origId: 'tip_a',
      name: 'tip_a',
      label: null,
      annotations: { region: 'NorthAmerica', posterior: 0.97 },
      adjacents: [1],
      lengths: [0.1],
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
    {
      idx: 2,
      origId: 'tip_b',
      name: 'tip_b',
      label: null,
      annotations: { region: 'Asia', posterior: 0.61 },
      adjacents: [1],
      lengths: [0.2],
    },
  ];

  return {
    nodes,
    root: { nodeA: 0, nodeB: 2, lenA: 0.1, lenB: 0.2, annotations: {} },
    origIdToIdx: new Map([
      ['tip_a', 0],
      ['internal_0', 1],
      ['tip_b', 2],
    ]),
    rooted: true,
    hiddenNodeIds: new Set<string>(),
    collapsedCladeIds: new Map(),
  };
}

function makeBranchTable() {
  const count = 3;
  return {
    count,
    branchId: new Int32Array([0, 1, 2]),
    parentBranch: new Int32Array([-1, 0, 0]),
    isInternal: new Uint8Array([0, 1, 0]),
    startTime: new Float32Array([2015.0, 2014.0, 2015.0]),
    endTime: new Float32Array([2017.0, 2015.0, 2017.0]),
    startLat: new Float32Array([0, 0, 0]),
    startLon: new Float32Array([0, 0, 0]),
    endLat: new Float32Array([0, 0, 0]),
    endLon: new Float32Array([0, 0, 0]),
    stateWeight: new Float32Array([1, 1, 1]),
    posterior: new Float32Array([0.97, 0.85, 0.61]),
  };
}

beforeEach(() => {
  useSelectionStore.setState({ hoveredId: null });
  useTreeStore.setState({
    graph: null,
    branchTable: null,
    traitInfo: null,
  });
});

afterEach(() => {
  cleanup();
});

describe('HoverTooltip', () => {
  it('renders nothing when hoveredId is null', () => {
    render(<HoverTooltip mouseX={100} mouseY={200} />);
    expect(screen.queryByTestId('hover-tooltip')).toBeNull();
  });

  it('renders tooltip with taxon name and date when hoveredId is set', () => {
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    useSelectionStore.setState({ hoveredId: 'tip_a' });

    render(<HoverTooltip mouseX={100} mouseY={200} />);

    const tooltip = screen.getByTestId('hover-tooltip');
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toContain('tip_a');
    expect(tooltip.textContent).toContain('2017-01-01');
  });

  it('renders posterior when branchTable.posterior is present', () => {
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    useSelectionStore.setState({ hoveredId: 'tip_a' });

    render(<HoverTooltip mouseX={100} mouseY={200} />);

    const tooltip = screen.getByTestId('hover-tooltip');
    expect(tooltip.textContent).toContain('posterior 0.97');
  });

  it('renders location from discrete traitInfo', () => {
    useTreeStore.setState({
      graph: makeGraph(),
      branchTable: makeBranchTable(),
      traitInfo: {
        kind: 'discrete',
        key: 'region',
        values: ['NorthAmerica', 'Europe', 'Asia'],
        ambiguous: false,
      },
    });
    useSelectionStore.setState({ hoveredId: 'tip_a' });

    render(<HoverTooltip mouseX={100} mouseY={200} />);

    const tooltip = screen.getByTestId('hover-tooltip');
    expect(tooltip.textContent).toContain('NorthAmerica');
  });

  it('hides tooltip when hoveredId set back to null', () => {
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    useSelectionStore.setState({ hoveredId: 'tip_a' });

    const { rerender } = render(<HoverTooltip mouseX={100} mouseY={200} />);
    expect(screen.getByTestId('hover-tooltip')).toBeTruthy();

    useSelectionStore.setState({ hoveredId: null });
    rerender(<HoverTooltip mouseX={100} mouseY={200} />);

    expect(screen.queryByTestId('hover-tooltip')).toBeNull();
  });

  it('positions tooltip offset from mouse coordinates', () => {
    useTreeStore.setState({ graph: makeGraph(), branchTable: makeBranchTable() });
    useSelectionStore.setState({ hoveredId: 'tip_a' });

    render(<HoverTooltip mouseX={300} mouseY={400} />);

    const tooltip = screen.getByTestId('hover-tooltip') as HTMLElement;
    expect(tooltip.style.left).toBe('314px');
    expect(tooltip.style.top).toBe('414px');
  });

  it('displays node.name when it differs from origId', () => {
    const graph = makeGraph();
    const node0 = graph.nodes[0]!;
    node0.origId = 'n547';
    node0.name = 'Pending1|Brazil|MG|2012';
    graph.origIdToIdx.delete('tip_a');
    graph.origIdToIdx.set('n547', 0);

    useTreeStore.setState({ graph, branchTable: makeBranchTable() });
    useSelectionStore.setState({ hoveredId: 'n547' });

    render(<HoverTooltip mouseX={100} mouseY={200} />);

    const tooltip = screen.getByTestId('hover-tooltip');
    expect(tooltip.textContent).toContain('Pending1|Brazil|MG|2012');
    expect(tooltip.textContent).not.toContain('n547');
  });

  it('falls back to origId when node.name is null', () => {
    const graph = makeGraph();
    graph.nodes[1]!.name = null;

    useTreeStore.setState({ graph, branchTable: makeBranchTable() });
    useSelectionStore.setState({ hoveredId: 'internal_0' });

    render(<HoverTooltip mouseX={100} mouseY={200} />);

    const tooltip = screen.getByTestId('hover-tooltip');
    expect(tooltip.textContent).toContain('internal_0');
  });
});
