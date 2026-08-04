// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useTimelineStore } from './store/timeline';
import { useTreeStore } from './store/tree';
import type { WireParseResult } from './workers/wire';

vi.mock('./features/viewer/Viewer', () => ({
  Viewer: ({ onReplaceFile }: { onReplaceFile?: () => void }) => (
    <div data-testid="viewer-mock">
      <button type="button" data-testid="viewer-replace" onClick={onReplaceFile}>
        Replace file
      </button>
    </div>
  ),
}));

vi.mock('./features/timeline/playback', () => ({
  usePlaybackLoop: () => {},
}));

const DISCRETE_WIRE_RESULT: WireParseResult = {
  graph: {
    nodes: [],
    root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
    origIds: [],
    rooted: true,
  },
  layout: { nodes: [], maxX: 0, maxY: 0, xAxisMode: 'date' },
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
  dateRange: [0, 0],
  traitInfo: {
    kind: 'discrete',
    key: 'region',
    values: ['Xanadu', 'Neverland', 'Eldorado'],
    ambiguous: false,
  },
  stringTable: [],
  nodeHpds: [],
  allDiscreteKeys: ['region'],
  nodeMultiHpds: [],
};

const mockParseWithProgress = vi.fn().mockResolvedValue(DISCRETE_WIRE_RESULT);

vi.mock('comlink', () => ({
  wrap: () => ({ parseWithProgress: mockParseWithProgress }),
  transfer: (val: unknown) => val,
  proxy: (fn: unknown) => fn,
}));

vi.mock('./workers/wire', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workers/wire')>();
  return {
    ...actual,
    rehydrate: vi.fn().mockReturnValue({
      graph: {
        nodes: [],
        root: {},
        origIdToIdx: new Map(),
        rooted: true,
        hiddenNodeIds: new Set(),
        collapsedCladeIds: new Map(),
      },
      layout: { nodes: [], nodeMap: new Map(), maxX: 0, maxY: 0, xAxisMode: 'date' },
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
      dateRange: [0, 0],
      traitInfo: {
        kind: 'discrete',
        key: 'region',
        values: ['Xanadu', 'Neverland', 'Eldorado'],
        ambiguous: false,
      },
      nodeHpds: [],
      allDiscreteKeys: ['region'],
      nodeMultiHpds: [],
    }),
  };
});

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/examples/examples.json') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ examples: [] }),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal(
    'Worker',
    class FakeWorker {
      terminate() {}
      addEventListener() {}
    },
  );
  useTreeStore.getState().reset();
  useTimelineStore.setState({ playhead: 0, bounds: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockParseWithProgress.mockClear();
});

describe('App — guarded tree replacement', () => {
  it('keeps the active session mounted and unchanged when replacement parsing fails', async () => {
    useTreeStore.setState({
      parseStatus: 'done',
      fileName: 'current.tree',
      rawTreeText: '#NEXUS\nold',
    });
    mockParseWithProgress.mockRejectedValueOnce(new Error('invalid replacement'));

    render(<App />);
    fireEvent.click(screen.getByTestId('viewer-replace'));

    expect(screen.getByTestId('viewer-mock')).toBeTruthy();
    expect(screen.getByTestId('replace-file-modal').getAttribute('aria-modal')).toBe('true');
    expect(screen.queryByTestId('example-chips')).toBeNull();

    const replacement = new File(['not a tree'], 'broken.tree', { type: 'text/plain' });
    fireEvent.drop(screen.getByTestId('drop-zone'), {
      dataTransfer: { files: [replacement] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('loader-error').textContent).toContain('invalid replacement');
    });
    expect(useTreeStore.getState()).toMatchObject({
      parseStatus: 'done',
      fileName: 'current.tree',
      rawTreeText: '#NEXUS\nold',
    });
    expect(screen.getByTestId('viewer-mock')).toBeTruthy();

    fireEvent.click(screen.getByTestId('replace-file-cancel'));
    expect(screen.queryByTestId('replace-file-modal')).toBeNull();
    expect(screen.getByTestId('viewer-mock')).toBeTruthy();
  });

  it('commits the replacement source only after import confirmation succeeds', async () => {
    useTreeStore.setState({
      parseStatus: 'done',
      fileName: 'current.tree',
      rawTreeText: '#NEXUS\nold',
    });

    render(<App />);
    fireEvent.click(screen.getByTestId('viewer-replace'));
    const replacement = new File(['#NEXUS\nnew'], 'replacement.tree', {
      type: 'text/plain',
    });
    fireEvent.drop(screen.getByTestId('drop-zone'), {
      dataTransfer: { files: [replacement] },
    });

    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });
    expect(useTreeStore.getState()).toMatchObject({
      parseStatus: 'done',
      fileName: 'current.tree',
      rawTreeText: '#NEXUS\nold',
    });

    fireEvent.click(screen.getByTestId('import-settings-confirm'));

    await waitFor(() => {
      expect(useTreeStore.getState()).toMatchObject({
        parseStatus: 'done',
        fileName: 'replacement.tree',
        rawTreeText: '#NEXUS\nnew',
      });
    });
    await waitFor(() => {
      expect(screen.queryByTestId('replace-file-modal')).toBeNull();
    });
  });
});

describe('App — discrete tree with unmatched gazetteer values', () => {
  it('shows location CSV drop zone after loading discrete tree with unknown locations', async () => {
    render(<App />);

    const dropZone = screen.getByTestId('drop-zone');
    const file = new File(['#NEXUS\n'], 'tree.nex', { type: 'text/plain' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('import-settings-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('location-csv-drop-zone')).toBeTruthy();
    });
    expect(screen.getByTestId('csv-drop-target')).toBeTruthy();
    expect(screen.queryByTestId('viewer-mock')).toBeNull();
  });

  it('transitions to viewer after dropping a valid location CSV', async () => {
    render(<App />);

    const dropZone = screen.getByTestId('drop-zone');
    const treeFile = new File(['#NEXUS\n'], 'tree.nex', { type: 'text/plain' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [treeFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('import-settings-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('location-csv-drop-zone')).toBeTruthy();
    });

    const csvContent =
      'region,latitude,longitude\nXanadu,39.0,117.0\nNeverland,-33.0,151.0\nEldorado,4.0,-74.0\n';
    const csvFile = new File([csvContent], 'locations.csv', { type: 'text/csv' });
    const csvDropTarget = screen.getByTestId('csv-drop-target');
    fireEvent.drop(csvDropTarget, { dataTransfer: { files: [csvFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('csv-column-picker')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('csv-column-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('viewer-mock')).toBeTruthy();
    });
    expect(screen.queryByTestId('location-csv-drop-zone')).toBeNull();
  });
});

describe('App — missing internal location annotations', () => {
  it('blocks with a clear warning before continuing to the viewer', () => {
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
        origId: 'tip-a',
        name: 'tip-a',
        label: null,
        annotations: { region: 'Xanadu' },
        adjacents: [0],
        lengths: [1],
      },
      {
        idx: 2,
        origId: 'tip-b',
        name: 'tip-b',
        label: null,
        annotations: { region: 'Neverland' },
        adjacents: [0],
        lengths: [1],
      },
    ];
    useTreeStore.setState({
      parseStatus: 'done',
      needsLocationCsv: false,
      graph: {
        nodes,
        root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
        origIdToIdx: new Map(nodes.map((node) => [node.origId, node.idx])),
        rooted: true,
        hiddenNodeIds: new Set(),
        collapsedCladeIds: new Map(),
      },
      traitInfo: {
        kind: 'discrete',
        key: 'region',
        values: ['Xanadu', 'Neverland'],
        ambiguous: false,
      },
    });

    render(<App />);
    expect(screen.getByTestId('location-annotation-warning').textContent).toContain(
      '1 internal node has no region annotation',
    );
    fireEvent.click(screen.getByTestId('location-annotation-warning-continue'));
    expect(screen.queryByTestId('location-annotation-warning')).toBeNull();
    expect(screen.getByTestId('viewer-mock')).toBeTruthy();
  });
});
