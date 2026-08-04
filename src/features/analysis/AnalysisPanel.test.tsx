// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchTable, Layout, PhyloGraph } from '../../lib/phylo/types';
import { paletteColorFor } from '../../lib/tree-render/palettes';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { DEFAULT_VISIBLE_VIEWS, useUiStore } from '../../store/ui';
import { AnalysisPanel } from './AnalysisPanel';

function branchTable(): BranchTable {
  return {
    count: 2,
    branchId: new Int32Array([0, 1]),
    parentBranch: new Int32Array([-1, 0]),
    isInternal: new Uint8Array([0, 0]),
    startTime: new Float32Array([0, 1]),
    endTime: new Float32Array([2, 3]),
    startLat: new Float32Array([10, 30]),
    startLon: new Float32Array([20, 40]),
    endLat: new Float32Array([11, 31]),
    endLon: new Float32Array([21, 41]),
    stateWeight: new Float32Array([1, 1]),
  };
}

// A 3-state (A,B,C) symmetric BSSVS log: 3 indicator columns → prior q≈0.90.
function bssvsLogTable() {
  return {
    columnNames: [
      'state',
      'location.indicators.0',
      'location.indicators.1',
      'location.indicators.2',
    ],
    columns: [
      new Float64Array([0]),
      new Float64Array([1]),
      new Float64Array([1]),
      new Float64Array([0]),
    ],
    rowCount: 1,
  };
}

function rect(left: number, width: number, height = 100): DOMRect {
  return {
    left,
    right: left + width,
    width,
    top: 0,
    bottom: height,
    height,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function cssRgb(hex: string): string {
  const value = hex.replace('#', '');
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function focusedBranchTable(): BranchTable {
  return {
    ...branchTable(),
    branchId: new Int32Array([1, 2]),
  };
}

function focusedGraph(): PhyloGraph {
  return {
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
        origId: 'tipA',
        name: 'tipA',
        label: null,
        annotations: {},
        adjacents: [0],
        lengths: [1],
      },
      {
        idx: 2,
        origId: 'tipB',
        name: 'tipB',
        label: null,
        annotations: {},
        adjacents: [0],
        lengths: [1],
      },
    ],
    root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
    origIdToIdx: new Map([
      ['root', 0],
      ['tipA', 1],
      ['tipB', 2],
    ]),
    rooted: true,
    hiddenNodeIds: new Set(),
    collapsedCladeIds: new Map(),
  };
}

function focusedLayout(): Layout {
  const nodes: Layout['nodes'] = [
    {
      id: 'root',
      x: 0,
      y: 1,
      isTip: false,
      parentId: null,
      children: ['tipA', 'tipB'],
      annotations: {},
    },
    { id: 'tipA', x: 1, y: 0, isTip: true, parentId: 'root', children: [], annotations: {} },
    { id: 'tipB', x: 1, y: 2, isTip: true, parentId: 'root', children: [], annotations: {} },
  ];
  return {
    nodes,
    nodeMap: new Map(nodes.map((node) => [node.id, node])),
    maxX: 1,
    maxY: 2,
    xAxisMode: 'date',
  };
}

function transitionBranchTable(): BranchTable {
  return {
    ...branchTable(),
    count: 3,
    branchId: new Int32Array([1, 2, 3]),
    parentBranch: new Int32Array([-1, -1, 0]),
    isInternal: new Uint8Array([1, 0, 0]),
    startTime: new Float32Array([0, 0, 1]),
    endTime: new Float32Array([1, 2, 3]),
    startLat: new Float32Array([10, 10, 30]),
    startLon: new Float32Array([20, 20, 40]),
    endLat: new Float32Array([30, 50, 10]),
    endLon: new Float32Array([40, 60, 20]),
    stateWeight: new Float32Array([1, 1, 1]),
  };
}

function stackedTransitionBranchTable(): BranchTable {
  return {
    ...transitionBranchTable(),
    endTime: new Float32Array([1, 1, 1.5]),
  };
}

function transitionGraph(): PhyloGraph {
  return {
    nodes: [
      {
        idx: 0,
        origId: 'root',
        name: null,
        label: null,
        annotations: { location: 'A' },
        adjacents: [1, 2],
        lengths: [1, 2],
      },
      {
        idx: 1,
        origId: 'internalB',
        name: null,
        label: null,
        annotations: { location: 'B' },
        adjacents: [0, 3],
        lengths: [1, 2],
      },
      {
        idx: 2,
        origId: 'tipC',
        name: 'tipC',
        label: null,
        annotations: { location: 'C' },
        adjacents: [0],
        lengths: [2],
      },
      {
        idx: 3,
        origId: 'tipA',
        name: 'tipA',
        label: null,
        annotations: { location: 'A' },
        adjacents: [1],
        lengths: [2],
      },
    ],
    root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
    origIdToIdx: new Map([
      ['root', 0],
      ['internalB', 1],
      ['tipC', 2],
      ['tipA', 3],
    ]),
    rooted: true,
    hiddenNodeIds: new Set(),
    collapsedCladeIds: new Map(),
  };
}

function transitionLayout(): Layout {
  const nodes: Layout['nodes'] = [
    {
      id: 'root',
      x: 0,
      y: 1,
      isTip: false,
      parentId: null,
      children: ['internalB', 'tipC'],
      annotations: {},
    },
    {
      id: 'internalB',
      x: 1,
      y: 0,
      isTip: false,
      parentId: 'root',
      children: ['tipA'],
      annotations: {},
    },
    { id: 'tipC', x: 2, y: 2, isTip: true, parentId: 'root', children: [], annotations: {} },
    {
      id: 'tipA',
      x: 3,
      y: 0,
      isTip: true,
      parentId: 'internalB',
      children: [],
      annotations: {},
    },
  ];
  return {
    nodes,
    nodeMap: new Map(nodes.map((node) => [node.id, node])),
    maxX: 3,
    maxY: 2,
    xAxisMode: 'date',
  };
}

beforeEach(() => {
  useTreeStore.setState({
    branchTable: branchTable(),
    graph: null,
    layout: null,
    traitInfo: {
      kind: 'discrete',
      key: 'location',
      values: ['A', 'B', 'C'],
      ambiguous: false,
    },
    discreteGeoLookup: new Map<string, [number, number]>([
      ['A', [10, 20]],
      ['B', [30, 40]],
      ['C', [50, 60]],
    ]),
  });
  useTimelineStore.setState({ bounds: { min: 0, max: 3 }, playhead: 1, isPlaying: false });
  useUiStore.setState({
    visibleViews: { ...DEFAULT_VISIBLE_VIEWS },
    deselectedValues: new Set(),
    palette: 'okabe-ito',
    paletteReverse: false,
    // activeTab now lives in the store (was local state); reset it so tab order
    // doesn't leak between tests.
    analysisTab: 'ltt',
  });
  useSelectionStore.setState({ focusedTaxa: [], highlightedBranchIds: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AnalysisPanel', () => {
  it('renders an LTT plot without the old cursor line or legend-selection readout', () => {
    render(<AnalysisPanel />);

    expect(screen.getByTestId('analysis-tab-ltt')).toBeTruthy();
    expect(screen.getByTestId('analysis-ltt-plot')).toBeTruthy();
    expect(screen.queryByTestId('analysis-ltt-cursor')).toBeNull();
    expect(screen.queryByTestId('analysis-ltt-location-label')).toBeNull();
    expect(screen.queryByTestId('analysis-ltt-count')).toBeNull();
  });

  it('renders a cumulative LTT curve when the legend is unfiltered', () => {
    render(<AnalysisPanel />);

    expect(screen.queryByTestId('analysis-ltt-location-select')).toBeNull();
    const series = screen.getAllByTestId('analysis-ltt-series-base');
    const activeSeries = screen.getAllByTestId('analysis-ltt-series-active');
    expect(series).toHaveLength(1);
    expect(activeSeries).toHaveLength(1);
    expect(series[0]?.getAttribute('data-location')).toBe('All lineages');
    expect(series[0]?.getAttribute('stroke')).toBe('var(--accent)');
    expect(activeSeries[0]?.getAttribute('clip-path')).toMatch(/^url\(#ltt-active-/);
  });

  it('shows the full saturated LTT curve while playback is paused', () => {
    render(<AnalysisPanel />);

    const plot = screen.getByTestId('analysis-ltt-plot');
    const clipRect = plot.querySelector('clipPath rect');
    expect(clipRect?.getAttribute('x')).toBe('0');
    expect(clipRect?.getAttribute('width')).toBe('800');
  });

  it('renders focused discrete taxa as stacked location-colored curves', () => {
    useTreeStore.setState({
      branchTable: focusedBranchTable(),
      graph: focusedGraph(),
      layout: focusedLayout(),
    });
    useSelectionStore.setState({ focusedTaxa: ['tipA', 'tipB'] });
    render(<AnalysisPanel />);

    const series = screen.getAllByTestId('analysis-ltt-series-base');
    expect(series).toHaveLength(2);
    expect(series[0]?.getAttribute('data-location')).toBe('A');
    expect(series[0]?.getAttribute('stroke')).toBe(
      paletteColorFor('A', ['A', 'B', 'C'], 'okabe-ito', false),
    );
    expect(series[1]?.getAttribute('data-location')).toBe('B');
    expect(series[1]?.getAttribute('stroke')).toBe(
      paletteColorFor('B', ['A', 'B', 'C'], 'okabe-ito', false),
    );
  });

  it('can follow legend selection without changing map or tree filters', () => {
    useUiStore.setState({ deselectedValues: new Set(['B']) });
    render(<AnalysisPanel />);

    const series = screen.getAllByTestId('analysis-ltt-series-base');
    expect(series).toHaveLength(1);
    expect(series[0]?.getAttribute('data-location')).toBe('A');
    expect(series[0]?.getAttribute('stroke')).toBe(
      paletteColorFor('A', ['A', 'B', 'C'], 'okabe-ito', false),
    );
  });

  it('renders a dashed playhead marker with a lineage-count tooltip', () => {
    render(<AnalysisPanel />);

    const marker = screen.getByTestId('analysis-ltt-playhead');
    expect(marker.querySelector('title')?.textContent).toContain('2 lineages');
    expect(screen.getByTestId('analysis-ltt-playhead-line')).toBeTruthy();
  });

  it('hides the LTT playhead marker after 3 seconds paused and shows it when playback resumes', () => {
    vi.useFakeTimers();
    render(<AnalysisPanel />);

    expect(screen.getByTestId('analysis-ltt-playhead')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByTestId('analysis-ltt-playhead')).toBeNull();

    act(() => {
      useTimelineStore.setState({ isPlaying: true });
    });
    expect(screen.getByTestId('analysis-ltt-playhead')).toBeTruthy();
  });

  it('shows the LTT playhead marker again when scrubbing while paused', () => {
    vi.useFakeTimers();
    render(<AnalysisPanel />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByTestId('analysis-ltt-playhead')).toBeNull();

    act(() => {
      useTimelineStore.setState({ playhead: 1.5 });
    });
    expect(screen.getByTestId('analysis-ltt-playhead')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByTestId('analysis-ltt-playhead')).toBeNull();
  });

  it('renders month x-axis ticks and integer y-axis ticks', () => {
    useTreeStore.setState({
      branchTable: {
        ...branchTable(),
        startTime: new Float32Array([2020.0, 2020.25]),
        endTime: new Float32Array([2020.35, 2020.75]),
      },
    });
    useTimelineStore.setState({ bounds: { min: 2020.0, max: 2020.75 }, playhead: 2020.35 });
    render(<AnalysisPanel />);

    const xLabels = screen.getAllByTestId('analysis-ltt-x-tick').map((node) => node.textContent);
    const yLabels = screen.getAllByTestId('analysis-ltt-y-tick').map((node) => node.textContent);
    expect(xLabels.length).toBeGreaterThan(0);
    expect(xLabels.every((label) => /^\d{4}-\d{2}$/.test(label ?? ''))).toBe(true);
    expect(yLabels.length).toBeGreaterThan(0);
    expect(yLabels.every((label) => /^\d+$/.test(label ?? ''))).toBe(true);
  });

  it('sizes the LTT data plot to the playback track rectangle', () => {
    const track = document.createElement('div');
    track.dataset.testid = 'timeline-track';
    document.body.appendChild(track);
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue(rect(120, 800));

    render(<AnalysisPanel />);

    const wrap = screen.getByTestId('analysis-ltt-plot-wrap');
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue(rect(20, 1000));
    fireEvent.resize(window);

    const plot = screen.getByTestId('analysis-ltt-plot');
    expect(plot.style.marginLeft).toBe('100px');
    expect(plot.style.width).toBe('800px');
    expect(plot.style.height).toBe('100px');
    expect(plot.getAttribute('viewBox')).toBe('0 0 800 100');

    track.remove();
  });

  it('shows a discrete Jumps tab and switches to the jumps chart', () => {
    useTreeStore.setState({
      branchTable: transitionBranchTable(),
      graph: transitionGraph(),
      layout: transitionLayout(),
    });
    render(<AnalysisPanel />);

    expect(screen.getByTestId('analysis-tab-jumps').textContent).toBe('Jumps');
    fireEvent.click(screen.getByTestId('analysis-tab-jumps'));

    expect(screen.getByTestId('analysis-transitions-plot')).toBeTruthy();
    expect(screen.getByTestId('analysis-transitions-stats').textContent).toContain('Jumps');
    expect(screen.getByTestId('analysis-transitions-stats').textContent).toContain('3');
    expect(screen.getByTestId('analysis-transitions-stats').textContent).toContain(
      'counted on the MCC tree',
    );
  });

  it('does not show the Jumps tab for continuous phylogeography', () => {
    useTreeStore.setState({
      traitInfo: {
        kind: 'continuous',
        keyFamily: { lat: 'location1', lon: 'location2' },
        wgs84: true,
      },
      discreteGeoLookup: null,
    });
    render(<AnalysisPanel />);

    expect(screen.queryByTestId('analysis-tab-jumps')).toBeNull();
  });

  it('uses legend solo state as the Jumps focal set', () => {
    useTreeStore.setState({
      branchTable: transitionBranchTable(),
      graph: transitionGraph(),
      layout: transitionLayout(),
    });
    useUiStore.setState({ deselectedValues: new Set(['A', 'C']) });
    render(<AnalysisPanel />);

    fireEvent.click(screen.getByTestId('analysis-tab-jumps'));

    const stats = screen.getByTestId('analysis-transitions-stats').textContent;
    expect(stats).toContain('Introductions');
    expect(stats).toContain('Exports');
    expect(stats).toContain('Net');
    expect(stats).toContain('1');
  });

  it('clicking a Jumps bar highlights its branches in the tree selection store', () => {
    useTreeStore.setState({
      branchTable: transitionBranchTable(),
      graph: transitionGraph(),
      layout: transitionLayout(),
    });
    useUiStore.setState({ deselectedValues: new Set(['A', 'C']) });
    render(<AnalysisPanel />);

    fireEvent.click(screen.getByTestId('analysis-tab-jumps'));
    const introBar = screen
      .getAllByTestId('analysis-jumps-intro-bar')
      .find((node) => node.querySelector('title')?.textContent?.includes('1 introductions'));
    expect(introBar).toBeTruthy();
    fireEvent.click(introBar as Element);

    expect(useSelectionStore.getState().highlightedBranchIds).toEqual([1]);

    const selectedIntroBar = screen
      .getAllByTestId('analysis-jumps-intro-bar')
      .find((node) => node.querySelector('title')?.textContent?.includes('1 introductions'));
    expect(selectedIntroBar?.getAttribute('class')).toContain('transitionBarSelected');

    fireEvent.click(selectedIntroBar as Element);
    expect(useSelectionStore.getState().highlightedBranchIds).toEqual([]);
  });

  it('colors stacked Jumps bar segments by legend location', () => {
    useTreeStore.setState({
      branchTable: stackedTransitionBranchTable(),
      graph: transitionGraph(),
      layout: transitionLayout(),
    });
    useUiStore.setState({ deselectedValues: new Set(['A']) });
    render(<AnalysisPanel />);

    fireEvent.click(screen.getByTestId('analysis-tab-jumps'));

    const introBars = screen.getAllByTestId('analysis-jumps-intro-bar');
    expect(new Set(introBars.map((node) => node.getAttribute('data-location')))).toEqual(
      new Set(['B', 'C']),
    );

    const bBar = introBars.find((node) => node.getAttribute('data-location') === 'B');
    const cBar = introBars.find((node) => node.getAttribute('data-location') === 'C');
    expect(bBar?.getAttribute('style')).toContain(
      cssRgb(paletteColorFor('B', ['A', 'B', 'C'], 'okabe-ito', false)),
    );
    expect(cBar?.getAttribute('style')).toContain(
      cssRgb(paletteColorFor('C', ['A', 'B', 'C'], 'okabe-ito', false)),
    );

    fireEvent.click(cBar as Element);
    expect(useSelectionStore.getState().highlightedBranchIds).toEqual([2]);
  });

  it('keeps Jumps branch highlights when leaving the Jumps tab', () => {
    useTreeStore.setState({
      branchTable: transitionBranchTable(),
      graph: transitionGraph(),
      layout: transitionLayout(),
    });
    useUiStore.setState({ deselectedValues: new Set(['A', 'C']) });
    render(<AnalysisPanel />);

    fireEvent.click(screen.getByTestId('analysis-tab-jumps'));
    const introBar = screen
      .getAllByTestId('analysis-jumps-intro-bar')
      .find((node) => node.querySelector('title')?.textContent?.includes('1 introductions'));
    fireEvent.click(introBar as Element);

    fireEvent.click(screen.getByTestId('analysis-tab-ltt'));
    expect(useSelectionStore.getState().highlightedBranchIds).toEqual([1]);
  });

  it('hides the BSSVS tab when no BEAST log is loaded', () => {
    render(<AnalysisPanel />);
    expect(screen.queryByTestId('analysis-tab-bssvs')).toBeNull();
  });

  it('shows a BSSVS tab for a discrete tree once a log is loaded', () => {
    useTreeStore.setState({ logStatus: 'loaded', logTable: bssvsLogTable() });
    render(<AnalysisPanel />);
    expect(screen.getByTestId('analysis-tab-bssvs').textContent).toBe('BSSVS');
  });

  it('does not show the BSSVS tab for continuous phylogeography even with a log', () => {
    useTreeStore.setState({
      traitInfo: {
        kind: 'continuous',
        keyFamily: { lat: 'location1', lon: 'location2' },
        wgs84: true,
      },
      discreteGeoLookup: null,
      logStatus: 'loaded',
      logTable: bssvsLogTable(),
    });
    render(<AnalysisPanel />);
    expect(screen.queryByTestId('analysis-tab-bssvs')).toBeNull();
  });

  it('switching to the BSSVS tab shows the Bayes factor table with a Prior column', () => {
    useTreeStore.setState({ logStatus: 'loaded', logTable: bssvsLogTable() });
    render(<AnalysisPanel />);

    fireEvent.click(screen.getByTestId('analysis-tab-bssvs'));

    expect(screen.getByTestId('analysis-bssvs')).toBeTruthy();
    expect(screen.getByTestId('dta-table')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Prior/ })).toBeTruthy();
    expect(screen.getByTestId('dta-model-kind').textContent).toContain('Symmetric');
  });

  it('sorts the BSSVS table when a column header is clicked', () => {
    useTreeStore.setState({ logStatus: 'loaded', logTable: bssvsLogTable() });
    render(<AnalysisPanel />);
    fireEvent.click(screen.getByTestId('analysis-tab-bssvs'));

    const firstFromCell = () =>
      screen.getByTestId('dta-table').querySelector('tbody tr td')?.textContent ?? '';

    // Routes are A→B, A→C, B→C. Sorting by From (desc first) puts 'B' on top.
    fireEvent.click(screen.getByRole('button', { name: /From/ }));
    expect(firstFromCell()).toBe('B');
    // Clicking again toggles to ascending.
    fireEvent.click(screen.getByRole('button', { name: /From/ }));
    expect(firstFromCell()).toBe('A');
  });
});
