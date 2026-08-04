// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { ProjectFile } from './lib/persist/project';
import { useEnvStore } from './store/env';
import { useSelectionStore } from './store/selection';
import { useTimelineStore } from './store/timeline';
import { useTreeStore } from './store/tree';
import { useUiStore } from './store/ui';

const projectState = vi.hoisted(() => {
  const graphNodes = [
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
  const layoutNodes = [
    {
      id: 'root',
      x: 0,
      y: 1,
      isTip: false,
      parentId: null,
      children: ['tip_a', 'tip_b'],
      annotations: graphNodes[0]?.annotations ?? {},
    },
    {
      id: 'tip_a',
      x: 1,
      y: 0,
      isTip: true,
      parentId: 'root',
      children: [],
      annotations: graphNodes[1]?.annotations ?? {},
    },
    {
      id: 'tip_b',
      x: 1,
      y: 2,
      isTip: true,
      parentId: 'root',
      children: [],
      annotations: graphNodes[2]?.annotations ?? {},
    },
  ];
  const parsedResult = {
    graph: {
      nodes: graphNodes,
      root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
      origIdToIdx: new Map(graphNodes.map((node) => [node.origId, node.idx])),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    },
    layout: {
      nodes: layoutNodes,
      nodeMap: new Map(layoutNodes.map((node) => [node.id, node])),
      maxX: 1,
      maxY: 2,
      xAxisMode: 'date' as const,
    },
    branchTable: {
      count: 0,
      branchId: new Int32Array(0),
      parentBranch: new Int32Array(0),
      isInternal: new Uint8Array(0),
      startTime: new Float32Array(0),
      endTime: new Float32Array(0),
      startLat: new Float32Array(0),
      startLon: new Float32Array(0),
      endLat: new Float32Array(0),
      endLon: new Float32Array(0),
      stateWeight: new Float32Array(0),
    },
    dateRange: [2010, 2020] as [number, number],
    traitInfo: { kind: 'unrecognized' as const, reason: 'test fixture' },
    nodeHpds: [],
    allDiscreteKeys: [],
    nodeMultiHpds: [],
    tipDateRows: [
      {
        nodeId: 'tip_a',
        taxon: 'Alpha|2010',
        parsedSubstring: '2010',
        decimalYear: 2010,
        format: 'year-pipe' as const,
        source: 'parsed' as const,
      },
      {
        nodeId: 'tip_b',
        taxon: 'Beta|2012',
        parsedSubstring: '2012',
        decimalYear: 2012,
        format: 'year-pipe' as const,
        source: 'parsed' as const,
      },
    ],
  };
  return { parsedResult, projectFile: null as ProjectFile | null };
});

vi.mock('comlink', () => ({
  wrap: () => ({}),
  transfer: (val: unknown) => val,
  proxy: (fn: unknown) => fn,
}));

vi.mock('./features/timeline/playback', () => ({
  usePlaybackLoop: () => {},
}));

vi.mock('./features/viewer/Viewer', () => ({
  Viewer: () => <div data-testid="viewer-mock" />,
}));

vi.mock('./features/loader/Loader', () => ({
  Loader: ({
    autoLoadExampleId,
    onParsed,
    onProjectFileDrop,
  }: {
    autoLoadExampleId?: string | null;
    onParsed?: (result: typeof projectState.parsedResult) => void;
    onProjectFileDrop?: (file: ProjectFile) => void;
  }) => (
    <button
      type="button"
      data-testid="loader-project-file"
      onClick={() => {
        onProjectFileDrop?.(projectState.projectFile ?? PROJECT_FILE);
        onParsed?.(projectState.parsedResult);
      }}
    >
      {autoLoadExampleId ?? 'none'}
    </button>
  ),
}));

const PROJECT_FILE: ProjectFile = {
  version: 1,
  treeSourceRef: {
    fileName: 'tree.nex',
    exampleId: 'pedv',
    confirmedTraitKey: 'location',
    confirmedTipDatePattern: null,
  },
  timeline: {
    playhead: 2020,
    window: null,
    windowSize: null,
    speed: 1,
    mode: 'Trail',
    arcs: true,
    clade: false,
    subtreeRootIds: [],
    subtreeRootId: null,
  },
  selection: { selectedIds: [], selectedBranchIds: [] },
  filters: { focusedTaxa: ['tip-a'], deselectedValues: ['Beijing'], posteriorThreshold: 0.42 },
  panels: {
    activePanel: null,
    visibleViews: { tree: true, map: true, analysis: true },
    layerVisibility: { branches: false, 'environment-pedv': true },
    layerOpacity: { branches: 40, 'environment-pedv': 65 },
  },
  style: {
    colorByKey: 'location',
    glyphByKey: 'none',
    palette: 'okabe-ito',
    paletteReverse: false,
    showBranches: false,
    branchWidth: 3,
    arcWidth: 75,
    showTips: false,
    tipRadius: 5,
    treeOpacity: 60,
    treeSortOrder: 'file',
    theme: 'dark',
  },
  environment: { activeKey: 'temperature', paletteOverride: { temperature: 'cool-warm' } },
  dateOverrides: [],
};

beforeEach(() => {
  projectState.projectFile = PROJECT_FILE;
  useTreeStore.getState().reset();
  useSelectionStore.setState({
    selectedIds: [],
    selectedBranchIds: [],
    focusedTaxa: [],
    selectedScrollTarget: null,
  });
  useTimelineStore.setState({
    playhead: 2003,
    window: null,
    windowSize: null,
    speed: 1,
    mode: 'Trail',
    arcs: true,
    clade: false,
    subtreeRootId: null,
    isPlaying: false,
    bounds: null,
  });
  useUiStore.setState({
    activePanel: null,
    colorByKey: 'single-color',
    glyphByKey: 'none',
    palette: 'okabe-ito',
    paletteReverse: false,
    showBranches: true,
    branchWidth: 1.5,
    arcWidth: 50,
    showTips: true,
    tipRadius: 2.5,
    treeOpacity: 100,
    posteriorThreshold: 0,
    deselectedValues: new Set<string>(),
    layerVisibility: { branches: true },
    layerOpacity: { branches: 100 },
  });
  useEnvStore.setState({ columns: [], activeKey: null, paletteOverride: {} });
  vi.stubGlobal(
    'Worker',
    class FakeWorker {
      terminate() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App project file restore', () => {
  it('keeps autoLoadExampleId prop independent from project restore state', () => {
    render(<App />);
    expect(screen.getByTestId('loader-project-file').textContent).toBe('none');

    cleanup();

    render(<App autoLoadExampleId="pedv" />);
    expect(screen.getByTestId('loader-project-file').textContent).toBe('pedv');
  });

  it('restores filter and visualization state after a project file parses', async () => {
    useEnvStore.setState({ paletteOverride: { humidity: 'magma' } });

    render(<App />);

    fireEvent.click(screen.getByTestId('loader-project-file'));

    await waitFor(() => {
      expect(screen.getByTestId('viewer-mock')).toBeTruthy();
    });

    const ui = useUiStore.getState();
    expect(useSelectionStore.getState().focusedTaxa).toEqual(['tip-a']);
    expect(ui.posteriorThreshold).toBe(0.42);
    expect(Array.from(ui.deselectedValues)).toEqual(['Beijing']);
    expect(ui.layerVisibility.branches).toBe(false);
    expect(ui.layerOpacity['environment-pedv']).toBe(65);
    expect(ui.showBranches).toBe(false);
    expect(ui.branchWidth).toBe(3);
    expect(ui.arcWidth).toBe(75);
    expect(ui.showTips).toBe(false);
    expect(ui.tipRadius).toBe(5);
    expect(ui.treeOpacity).toBe(60);
    expect(useEnvStore.getState().activeKey).toBe('temperature');
    expect(useEnvStore.getState().paletteOverride.temperature).toBe('cool-warm');
    expect(useEnvStore.getState().paletteOverride.humidity).toBeUndefined();
  });

  it('restores saved date overrides before applying timeline state', async () => {
    projectState.projectFile = {
      ...PROJECT_FILE,
      timeline: { ...PROJECT_FILE.timeline, playhead: 2018 },
      dateOverrides: [
        {
          nodeId: 'tip_b',
          taxon: 'Beta|2012',
          parsedSubstring: '2015',
          decimalYear: 2015,
          format: 'year-only',
          source: 'manual',
        },
      ],
    };

    render(<App />);

    fireEvent.click(screen.getByTestId('loader-project-file'));

    await waitFor(() => {
      expect(screen.getByTestId('viewer-mock')).toBeTruthy();
    });

    const tree = useTreeStore.getState();
    expect(tree.graph?.nodes[2]?.annotations.date).toBe('2015');
    expect(tree.tipDateRows[1]).toMatchObject({
      nodeId: 'tip_b',
      parsedSubstring: '2015',
      decimalYear: 2015,
      source: 'manual',
    });
    expect(Array.from(tree.branchTable?.endTime ?? [])).toContain(2015);
    expect(useTimelineStore.getState().playhead).toBe(2018);
  });

  it('restores shared Window mode with a real trailing window for animation layers', async () => {
    projectState.projectFile = {
      ...PROJECT_FILE,
      timeline: {
        ...PROJECT_FILE.timeline,
        playhead: 2018,
        window: null,
        windowSize: 1.5,
        mode: 'Window',
      },
    };
    useTimelineStore.setState({ bounds: { min: 2010, max: 2020 } });

    render(<App />);

    fireEvent.click(screen.getByTestId('loader-project-file'));

    await waitFor(() => {
      expect(screen.getByTestId('viewer-mock')).toBeTruthy();
    });

    let timeline = useTimelineStore.getState();
    expect(timeline.mode).toBe('Window');
    expect(timeline.windowSize).toBeCloseTo(1.5);
    expect(timeline.window).toEqual({ start: 2016.5, end: 2018 });

    act(() => {
      timeline.setPlayhead(2019);
    });

    timeline = useTimelineStore.getState();
    expect(timeline.window).toEqual({ start: 2017.5, end: 2019 });
  });
});
