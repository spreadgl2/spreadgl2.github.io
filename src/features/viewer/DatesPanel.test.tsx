// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Layout, PhyloGraph } from '../../lib/phylo/types';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { DatesPanel } from './DatesPanel';

function graph(): PhyloGraph {
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
      origId: 'tip_a',
      name: 'Alpha|2010',
      label: null,
      annotations: { date: '2010' },
      adjacents: [0],
      lengths: [1],
    },
    {
      idx: 2,
      origId: 'tip_b',
      name: 'Beta|2012',
      label: null,
      annotations: { date: '2012' },
      adjacents: [0],
      lengths: [1],
    },
  ];
  return {
    nodes,
    root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
    origIdToIdx: new Map(nodes.map((node) => [node.origId, node.idx])),
    rooted: true,
    hiddenNodeIds: new Set(),
    collapsedCladeIds: new Map(),
  };
}

function layout(graph: PhyloGraph): Layout {
  const nodes: Layout['nodes'] = [
    {
      id: 'root',
      x: 0,
      y: 1,
      isTip: false,
      parentId: null,
      children: ['tip_a', 'tip_b'],
      annotations: graph.nodes[0]?.annotations ?? {},
    },
    {
      id: 'tip_a',
      x: 1,
      y: 0,
      isTip: true,
      parentId: 'root',
      children: [],
      annotations: graph.nodes[1]?.annotations ?? {},
    },
    {
      id: 'tip_b',
      x: 1,
      y: 2,
      isTip: true,
      parentId: 'root',
      children: [],
      annotations: graph.nodes[2]?.annotations ?? {},
    },
  ];
  return {
    nodes,
    nodeMap: new Map(nodes.map((node) => [node.id, node])),
    maxX: 1,
    maxY: 2,
    xAxisMode: 'date',
  };
}

beforeEach(() => {
  const g = graph();
  useTreeStore.setState({
    graph: g,
    layout: layout(g),
    traitInfo: { kind: 'unrecognized', reason: 'test' },
    tipDateRows: [
      {
        nodeId: 'tip_a',
        taxon: 'Alpha|2010',
        parsedSubstring: '2010',
        decimalYear: 2010,
        format: 'year-pipe',
        source: 'parsed',
      },
      {
        nodeId: 'tip_b',
        taxon: 'Beta|2012',
        parsedSubstring: '2012',
        decimalYear: 2012,
        format: 'year-pipe',
        source: 'parsed',
      },
    ],
  });
  useTimelineStore.setState({ bounds: { min: 2009, max: 2012 }, playhead: 2009 });
});

afterEach(() => {
  cleanup();
  useTreeStore.getState().reset();
});

describe('DatesPanel', () => {
  it('derives rows from the loaded graph when stored metadata is absent', async () => {
    useTreeStore.setState({ tipDateRows: [] });

    render(<DatesPanel />);

    expect(screen.getByTestId('date-row-tip_a').textContent).toContain('Alpha|2010');
    await waitFor(() => {
      expect(useTreeStore.getState().tipDateRows).toHaveLength(2);
    });
  });

  it('renders parsed substrings, dates, formats, and sources', () => {
    render(<DatesPanel />);

    expect(screen.getByTestId('dates-panel')).toBeTruthy();
    expect(screen.getByTestId('date-row-tip_a').textContent).toContain('Alpha|2010');
    expect(screen.getByTestId('date-row-tip_a').textContent).toContain('2010');
    expect(screen.getByTestId('date-row-tip_a').textContent).toContain('YYYY');
    expect(screen.getByTestId('date-row-tip_a').textContent).toContain('parsed');
  });

  it('rounds decimal date inputs to 3 decimal places', () => {
    useTreeStore.setState({
      tipDateRows: useTreeStore
        .getState()
        .tipDateRows.map((row) =>
          row.nodeId === 'tip_b' ? { ...row, decimalYear: 2012.123456 } : row,
        ),
    });

    render(<DatesPanel />);

    const input = screen.getByLabelText('Date for Beta|2012') as HTMLInputElement;
    expect(input.value).toBe('2012.123');
  });

  it('edits a tip date and rebuilds branch times', () => {
    render(<DatesPanel />);

    const input = screen.getByLabelText('Date for Beta|2012');
    fireEvent.change(input, { target: { value: '2013' } });
    fireEvent.blur(input);

    const state = useTreeStore.getState();
    expect(state.graph?.nodes[2]?.annotations.date).toBe('2013');
    expect(state.tipDateRows[1]?.source).toBe('manual');
    expect(state.branchTable?.endTime[1]).toBeCloseTo(2013, 4);
    expect(useTimelineStore.getState().bounds?.min).toBeCloseTo(2011.99, 4);
  });

  it('clears a tip date as an edit while keeping at least one valid date', () => {
    render(<DatesPanel />);

    const input = screen.getByLabelText('Date for Beta|2012');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    const row = useTreeStore.getState().tipDateRows[1];
    expect(useTreeStore.getState().graph?.nodes[2]?.annotations.date).toBeUndefined();
    expect(row?.decimalYear).toBeNull();
    expect(row?.source).toBe('manual');
    expect(screen.getByTestId('date-row-tip_b').textContent).toContain('edited');
  });

  it('imports matching dates from CSV', async () => {
    render(<DatesPanel />);

    const file = new File(['taxon,date\nAlpha|2010,2010-06\nBeta|2012,2012'], 'dates.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByTestId('dates-csv-input'), { target: { files: [file] } });

    await waitFor(() => {
      expect(useTreeStore.getState().tipDateRows[0]?.source).toBe('csv');
    });
    expect(useTreeStore.getState().tipDateRows[0]?.format).toBe('year-month');
    expect(screen.queryByTestId('dates-import-error')).toBeNull();
  });

  it('renders a colgroup and a resize handle per column', () => {
    render(<DatesPanel />);
    const table = screen.getByTestId('dates-panel').querySelector('table');
    const cols = table?.querySelectorAll('colgroup col');
    expect(cols?.length).toBe(5);
    expect((cols?.[0] as HTMLElement).style.width).toBe('150px');
    for (const col of ['taxon', 'substring', 'date', 'format', 'source']) {
      expect(screen.getByTestId(`dates-col-resize-${col}`)).toBeTruthy();
    }
  });

  it('dragging a column handle changes only that column width', () => {
    render(<DatesPanel />);
    const table = screen.getByTestId('dates-panel').querySelector('table') as HTMLTableElement;
    const cols = () => table.querySelectorAll('colgroup col');

    fireEvent.mouseDown(screen.getByTestId('dates-col-resize-taxon'), { clientX: 150 });
    fireEvent.mouseMove(window, { clientX: 320 });
    fireEvent.mouseUp(window);

    // Taxon widened by +170 (150 -> 320); the others keep their defaults.
    expect((cols()[0] as HTMLElement).style.width).toBe('320px');
    expect((cols()[1] as HTMLElement).style.width).toBe('95px');
  });

  it('clamps a column to the minimum width when dragged far left', () => {
    render(<DatesPanel />);
    const table = screen.getByTestId('dates-panel').querySelector('table') as HTMLTableElement;

    fireEvent.mouseDown(screen.getByTestId('dates-col-resize-source'), { clientX: 80 });
    fireEvent.mouseMove(window, { clientX: -500 });
    fireEvent.mouseUp(window);

    const cols = table.querySelectorAll('colgroup col');
    expect((cols[4] as HTMLElement).style.width).toBe('48px');
  });

  it('does not trigger a sort when the resize handle is pressed', () => {
    render(<DatesPanel />);
    // Pressing the handle (not the sort button) must not sort — the default
    // source-ranked order keeps tip_a (parsed) present without a sort arrow.
    fireEvent.mouseDown(screen.getByTestId('dates-col-resize-taxon'), { clientX: 150 });
    fireEvent.mouseUp(window);
    expect(screen.getByTestId('dates-sort-taxon').textContent).not.toContain('▲');
    expect(screen.getByTestId('dates-sort-taxon').textContent).not.toContain('▼');
  });
});
