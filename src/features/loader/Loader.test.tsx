// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixturesManifest } from '../../lib/format/fixture-meta';
import { serializeProject } from '../../lib/persist/project';
import { useTreeStore } from '../../store/tree';
import type { TipDateSample, WireParseResult } from '../../workers/wire';
import { rehydrate } from '../../workers/wire';
import { Loader } from './Loader';

const MANIFEST: FixturesManifest = {
  examples: [
    {
      id: 'pedv',
      label: 'PEDV',
      tipCount: 769,
      traitName: 'location',
      traitKind: 'discrete',
      dateSpan: [2010, 2018],
      blurb: 'PEDV',
      treePath: 'examples/pedv/tree.nex',
    },
  ],
};

const WIRE_RESULT: WireParseResult = {
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
  traitInfo: { kind: 'unrecognized', reason: 'no geo annotations' },
  stringTable: [],
  nodeHpds: [],
  allDiscreteKeys: [],
  nodeMultiHpds: [],
};

const CONTINUOUS_WIRE_RESULT: WireParseResult = {
  ...WIRE_RESULT,
  graph: {
    ...WIRE_RESULT.graph,
    nodes: [
      {
        idx: 0,
        origId: 'node-0',
        name: null,
        label: null,
        annotations: {
          location1: 10,
          location2: 20,
          latitude: 11,
          longitude: 21,
          'location1_95%_HPD': [9, 10, 11],
          'location2_95%_HPD': [19, 20, 21],
        },
        adjacents: [1, 2],
        lengths: [1, 1],
      },
    ],
    origIds: ['node-0'],
  },
  layout: {
    ...WIRE_RESULT.layout,
    nodes: [
      {
        id: 'node-0',
        x: 0,
        y: 0,
        isTip: false,
        parentId: null,
        children: [],
        annotations: {
          location1: 10,
          location2: 20,
          latitude: 11,
          longitude: 21,
          'location1_95%_HPD': [9, 10, 11],
          'location2_95%_HPD': [19, 20, 21],
        },
      },
    ],
  },
  dateRange: [2019, 2022],
  traitInfo: {
    kind: 'continuous',
    keyFamily: { lat: 'location1', lon: 'location2' },
    wgs84: true,
  },
  allDiscreteKeys: ['location', 'region'],
};

const DISCRETE_MULTI_TRAIT_WIRE_RESULT: WireParseResult = {
  ...WIRE_RESULT,
  traitInfo: {
    kind: 'discrete',
    key: 'location',
    values: ['A', 'B'],
    ambiguous: false,
  },
  allDiscreteKeys: ['location', 'region'],
};

const AMBIGUOUS_WIRE_RESULT: WireParseResult = {
  ...WIRE_RESULT,
  traitInfo: {
    kind: 'discrete-ambiguous',
    candidates: [
      { key: 'location', values: ['A', 'B'] },
      { key: 'region', values: ['North', 'South'] },
    ],
  },
  allDiscreteKeys: ['location', 'region'],
};

const TIP_DATE_SAMPLES: TipDateSample[] = [
  {
    label: 'Sample_A|2019',
    result: { decimalYear: 2019, confidence: 'medium', pattern: 'year-pipe', raw: '2019' },
  },
  {
    label: 'Sample_B|2020',
    result: { decimalYear: 2020, confidence: 'medium', pattern: 'year-pipe', raw: '2020' },
  },
  {
    label: 'Sample_C|2021',
    result: { decimalYear: 2021, confidence: 'medium', pattern: 'year-pipe', raw: '2021' },
  },
];

const mockParseWithProgress = vi.fn().mockResolvedValue(WIRE_RESULT);

vi.mock('comlink', () => ({
  wrap: () => ({ parseWithProgress: mockParseWithProgress }),
  transfer: (val: unknown) => val,
  proxy: (fn: unknown) => fn,
}));

vi.mock('../../workers/wire', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../workers/wire')>();
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
      traitInfo: { kind: 'unrecognized', reason: 'no geo annotations' },
      nodeHpds: [],
      allDiscreteKeys: [],
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
        json: () => Promise.resolve(MANIFEST),
      });
    }
    if (url === '/examples/pedv/tree.nex') {
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve('#NEXUS\n'),
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockParseWithProgress.mockClear();
});

async function acceptImportSettings() {
  await waitFor(() => {
    expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
  });
  await userEvent.click(screen.getByTestId('import-settings-confirm'));
}

describe('Loader', () => {
  it('renders drop zone', async () => {
    render(<Loader onParsed={vi.fn()} />);
    expect(screen.getByTestId('drop-zone')).toBeTruthy();
    expect(screen.getByText(/Drop a BEAST X tree or SpreadGL2 project here/)).toBeTruthy();
  });

  it('renders the landing title, product description, privacy claim, and resources', () => {
    render(<Loader onParsed={vi.fn()} />);
    expect(screen.getByTestId('landing-brand-link').getAttribute('href')).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: 'SpreadGL2' })).toBeTruthy();
    expect(
      screen.getByText(
        'High-performance interactive visualization for BEAST X phylogeographic analyses',
      ),
    ).toBeTruthy();
    expect(screen.getByText(/SpreadGL2 uses/)).toBeTruthy();
    expect(screen.getByText('Your research data stays on your device')).toBeTruthy();
    expect(screen.getByTestId('landing-citation-btn')).toBeTruthy();
    expect(screen.getByTestId('landing-credits-btn')).toBeTruthy();
  });

  it('renders PEDV example button after manifest loads', async () => {
    render(<Loader onParsed={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });
    expect(screen.getByText(/769 tips · discrete · 2010–2018/)).toBeTruthy();
  });

  it('keeps landing content and examples out of the replacement dialog', async () => {
    render(<Loader onParsed={vi.fn()} replacement onCancel={vi.fn()} />);
    expect(screen.getByTestId('replace-file-modal')).toBeTruthy();
    expect(screen.queryByTestId('landing-page')).toBeNull();
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/examples/examples.json');
    });
    expect(screen.queryByTestId('example-pedv')).toBeNull();
  });

  it('clicking PEDV example fires fetch and worker parse', async () => {
    const onParsed = vi.fn();
    render(<Loader onParsed={onParsed} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/examples/pedv/tree.nex');
      expect(mockParseWithProgress).toHaveBeenCalled();
    });
    expect(onParsed).not.toHaveBeenCalled();
    await acceptImportSettings();
    expect(onParsed).toHaveBeenCalled();
  });

  it('fetches example environment CSV and forwards it with parsed options', async () => {
    const environmentCsv = 'location,temperature\nAnhui,16\n';
    const pedvExample = MANIFEST.examples[0];
    if (!pedvExample) throw new Error('missing PEDV test fixture');

    mockFetch.mockImplementation((url: string) => {
      if (url === '/examples/examples.json') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              examples: [
                {
                  ...pedvExample,
                  environmentPath: 'examples/pedv/environment.csv',
                },
              ],
            } satisfies FixturesManifest),
        });
      }
      if (url === '/examples/pedv/tree.nex') {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('#NEXUS\n') });
      }
      if (url === '/examples/pedv/environment.csv') {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(environmentCsv) });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    const onParsed = vi.fn();
    render(<Loader onParsed={onParsed} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/examples/pedv/environment.csv');
    });
    await acceptImportSettings();
    expect(onParsed).toHaveBeenCalled();
    expect(onParsed.mock.calls[0]?.[1]?.pendingEnvironment).toMatchObject({
      id: 'environment-pedv',
      name: 'environment.csv',
      text: environmentCsv,
    });
  });

  it('simulating file drop triggers worker parse', async () => {
    const onParsed = vi.fn();
    render(<Loader onParsed={onParsed} />);

    const zone = screen.getByTestId('drop-zone');
    const file = new File(['#NEXUS\n'], 'tree.nex', { type: 'text/plain' });

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(mockParseWithProgress).toHaveBeenCalled();
    });
  });

  it('shows import settings instead of confirming tip-date samples', async () => {
    const onParsed = vi.fn();
    mockParseWithProgress.mockResolvedValueOnce({
      ...CONTINUOUS_WIRE_RESULT,
      tipDateSamples: TIP_DATE_SAMPLES,
    });

    render(<Loader onParsed={onParsed} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));
    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });

    expect(screen.queryByTestId('tip-date-modal')).toBeNull();
    expect(screen.queryByText('Annotation keys')).toBeNull();
    expect(screen.getByText('Root date')).toBeTruthy();
    expect(screen.getByText('2019-01-01 (2019.000)')).toBeTruthy();
    expect((screen.getByTestId('import-analysis-select') as HTMLSelectElement).value).toBe(
      'continuous',
    );
    expect((screen.getByTestId('import-latitude-select') as HTMLSelectElement).value).toBe(
      'location1',
    );
    expect((screen.getByTestId('import-longitude-select') as HTMLSelectElement).value).toBe(
      'location2',
    );
    expect((screen.getByTestId('import-hpd-select') as HTMLSelectElement).value).toBe(
      'location1_95%_HPD|location2_95%_HPD',
    );
    await userEvent.click(screen.getByTestId('import-settings-confirm'));

    await waitFor(() => {
      expect(mockParseWithProgress).toHaveBeenCalledTimes(1);
      expect(onParsed).toHaveBeenCalled();
    });
  });

  it('keeps import settings mounted through one covered handoff frame', async () => {
    const rafCallbacks = new Map<number, FrameRequestCallback>();
    let rafId = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = ++rafId;
      rafCallbacks.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafCallbacks.delete(id);
    });
    const flushRaf = () => {
      const callbacks = [...rafCallbacks.values()];
      rafCallbacks.clear();
      for (const callback of callbacks) callback(0);
    };

    const onParsed = vi.fn();
    const onImportHandoffStart = vi.fn();
    const onImportHandoffComplete = vi.fn();

    render(
      <Loader
        onParsed={onParsed}
        onImportHandoffStart={onImportHandoffStart}
        onImportHandoffComplete={onImportHandoffComplete}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));
    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });
    await userEvent.click(screen.getByTestId('import-settings-confirm'));

    expect(onParsed).toHaveBeenCalledOnce();
    expect(onImportHandoffStart).toHaveBeenCalledOnce();
    expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    await waitFor(() => {
      expect(rafCallbacks.size).toBe(1);
    });

    flushRaf();
    expect(screen.getByTestId('import-settings-modal')).toBeTruthy();

    flushRaf();
    await waitFor(() => {
      expect(screen.queryByTestId('import-settings-modal')).toBeNull();
    });
    expect(onImportHandoffComplete).toHaveBeenCalledOnce();
  });

  it('can set continuous HPD polygons to none', async () => {
    const onParsed = vi.fn();
    mockParseWithProgress.mockResolvedValueOnce(CONTINUOUS_WIRE_RESULT).mockResolvedValueOnce({
      ...CONTINUOUS_WIRE_RESULT,
      nodeHpds: [],
    });

    render(<Loader onParsed={onParsed} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));
    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });

    await userEvent.selectOptions(screen.getByTestId('import-hpd-select'), '');
    await userEvent.click(screen.getByTestId('import-settings-confirm'));

    await waitFor(() => {
      expect(mockParseWithProgress).toHaveBeenCalledTimes(2);
    });
    expect(mockParseWithProgress.mock.calls[1]?.[7]).toBeNull();
  });

  it('applies an MRSD override in a single confirm without reopening the modal', async () => {
    // Mirror App.handleParsed: a real parse ends with parseStatus 'done', which
    // is what swaps the loader for the viewer.
    useTreeStore.getState().setParseStatus('idle');
    const onParsed = vi.fn(() => {
      useTreeStore.getState().setParseStatus('done');
    });
    mockParseWithProgress
      .mockResolvedValueOnce(CONTINUOUS_WIRE_RESULT)
      .mockResolvedValueOnce(CONTINUOUS_WIRE_RESULT);

    render(<Loader onParsed={onParsed} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));
    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });

    await userEvent.type(screen.getByTestId('import-mrsd-override'), '2020-05-01');
    await userEvent.click(screen.getByTestId('import-settings-confirm'));

    // Re-parses once with the manual MRSD (arg index 4 = manualMrsdIso)...
    await waitFor(() => {
      expect(mockParseWithProgress).toHaveBeenCalledTimes(2);
    });
    expect(mockParseWithProgress.mock.calls[1]?.[4]).toBe('2020-05-01');

    // ...and completes in one click: the modal does not reopen.
    await waitFor(() => {
      expect(onParsed).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('import-settings-modal')).toBeNull();

    // Regression: the auto-accept path must not reset parseStatus back to
    // 'idle', which would bounce the user to the loader landing page.
    expect(useTreeStore.getState().parseStatus).toBe('done');
  });

  it('can switch mixed continuous/discrete imports to a discrete trait', async () => {
    const onParsed = vi.fn();
    mockParseWithProgress.mockResolvedValueOnce(CONTINUOUS_WIRE_RESULT).mockResolvedValueOnce({
      ...WIRE_RESULT,
      traitInfo: { kind: 'discrete', key: 'region', values: ['North', 'South'], ambiguous: false },
      allDiscreteKeys: ['location', 'region'],
    });

    render(<Loader onParsed={onParsed} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));
    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });

    await userEvent.selectOptions(screen.getByTestId('import-analysis-select'), 'discrete');
    expect(screen.getByTestId('import-geo-select')).toBeTruthy();
    await userEvent.selectOptions(screen.getByTestId('import-geo-select'), 'region');
    await userEvent.click(screen.getByTestId('import-settings-confirm'));

    await waitFor(() => {
      expect(mockParseWithProgress).toHaveBeenCalledTimes(2);
    });
    expect(mockParseWithProgress.mock.calls[1]?.[2]).toBe('region');
    expect(mockParseWithProgress.mock.calls[1]?.[6]).toBe('discrete');
  });

  it('defaults to the detected discrete location trait while listing all traits', async () => {
    const onParsed = vi.fn();
    mockParseWithProgress.mockResolvedValueOnce(DISCRETE_MULTI_TRAIT_WIRE_RESULT);

    render(<Loader onParsed={onParsed} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));
    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });

    const select = screen.getByTestId('import-geo-select');
    expect((select as HTMLSelectElement).value).toBe('location');
    expect(screen.getByRole('option', { name: 'region' })).toBeTruthy();
    expect(screen.getByText('Detected locations')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();

    await userEvent.selectOptions(select, 'region');
    await userEvent.click(screen.getByTestId('import-settings-confirm'));

    await waitFor(() => {
      expect(onParsed).toHaveBeenCalledOnce();
    });
    expect(mockParseWithProgress).toHaveBeenCalledTimes(1);
  });

  it('changing the discrete location trait in import settings continues without a second modal', async () => {
    const onParsed = vi.fn();
    mockParseWithProgress.mockResolvedValueOnce(AMBIGUOUS_WIRE_RESULT);

    render(<Loader onParsed={onParsed} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));
    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });

    await userEvent.selectOptions(screen.getByTestId('import-geo-select'), 'region');
    await userEvent.click(screen.getByTestId('import-settings-confirm'));

    await waitFor(() => {
      expect(onParsed).toHaveBeenCalledOnce();
    });
    expect(mockParseWithProgress).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('import-settings-modal')).toBeNull();
  });

  it('confirming a default ambiguous discrete trait continues as a concrete discrete import', async () => {
    const onParsed = vi.fn();
    mockParseWithProgress.mockResolvedValueOnce(AMBIGUOUS_WIRE_RESULT);

    render(<Loader onParsed={onParsed} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));
    await waitFor(() => {
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });

    expect((screen.getByTestId('import-geo-select') as HTMLSelectElement).value).toBe('location');
    await userEvent.click(screen.getByTestId('import-settings-confirm'));

    await waitFor(() => {
      expect(onParsed).toHaveBeenCalledOnce();
    });
    expect(vi.mocked(rehydrate).mock.calls.at(-1)?.[0].traitInfo).toMatchObject({
      kind: 'discrete',
      key: 'location',
    });
    expect(screen.queryByTestId('import-settings-modal')).toBeNull();
  });

  it('requires manual MRSD and reparses with YYYY-MM-DD when none is detected', async () => {
    const onParsed = vi.fn();
    mockParseWithProgress
      .mockRejectedValueOnce(new Error('PARSE_ERROR:{"code":"needs_mrsd"}'))
      .mockResolvedValueOnce(WIRE_RESULT);

    render(<Loader onParsed={onParsed} />);
    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));
    await waitFor(() => {
      expect(screen.getByTestId('mrsd-modal')).toBeTruthy();
    });

    await userEvent.type(screen.getByTestId('mrsd-input'), '2022-01-31');
    await userEvent.click(screen.getByTestId('mrsd-confirm'));

    await waitFor(() => {
      expect(mockParseWithProgress).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('import-settings-modal')).toBeTruthy();
    });
    expect(mockParseWithProgress.mock.calls[1]?.[4]).toBe('2022-01-31');
    expect(onParsed).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('import-settings-confirm'));
    expect(onParsed).toHaveBeenCalled();
  });

  it('drop zone hints list .spreadgl2.json', async () => {
    render(<Loader onParsed={vi.fn()} />);
    expect(screen.getByText(/\.spreadgl2\.json/)).toBeTruthy();
  });
});

const PROJECT_WITH_EXAMPLE = JSON.stringify(
  serializeProject({
    treeSourceRef: {
      fileName: 'tree.nex',
      exampleId: 'pedv',
      confirmedTraitKey: 'location',
      confirmedTipDatePattern: null,
    },
    timeline: {
      playhead: 2003.5,
      window: null,
      speed: 1,
      mode: 'Trail',
      arcs: false,
      clade: false,
      subtreeRootId: null,
    },
    selection: { selectedIds: [], selectedBranchIds: [] },
    panels: {
      activePanel: null,
      visibleViews: { tree: true, map: true, analysis: true },
      layerVisibility: {},
      layerOpacity: {},
    },
    style: {
      colorByKey: 'location',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      branchWidth: 1,
      tipRadius: 2,
      treeOpacity: 100,

      treeSortOrder: 'file',
      theme: 'dark',
    },
  }),
);

const PROJECT_NO_EXAMPLE = JSON.stringify(
  serializeProject({
    treeSourceRef: {
      fileName: 'my-tree.nex',
      exampleId: null,
      confirmedTraitKey: null,
      confirmedTipDatePattern: null,
    },
    timeline: {
      playhead: 2003.5,
      window: null,
      speed: 1,
      mode: 'Trail',
      arcs: false,
      clade: false,
      subtreeRootId: null,
    },
    selection: { selectedIds: [], selectedBranchIds: [] },
    panels: {
      activePanel: null,
      visibleViews: { tree: true, map: true, analysis: true },
      layerVisibility: {},
      layerOpacity: {},
    },
    style: {
      colorByKey: 'single-color',
      glyphByKey: 'none',
      palette: 'okabe-ito',
      paletteReverse: false,
      branchWidth: 1,
      tipRadius: 2,
      treeOpacity: 100,

      treeSortOrder: 'file',
      theme: 'dark',
    },
  }),
);

describe('Loader — project file import', () => {
  it('dropping a .spreadgl2.json with a valid exampleId calls onProjectFileDrop and loads the example', async () => {
    const onParsed = vi.fn();
    const onProjectFileDrop = vi.fn();

    render(<Loader onParsed={onParsed} onProjectFileDrop={onProjectFileDrop} />);

    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    const zone = screen.getByTestId('drop-zone');
    const file = new File([PROJECT_WITH_EXAMPLE], 'my-session.spreadgl2.json', {
      type: 'application/json',
    });

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(onProjectFileDrop).toHaveBeenCalledOnce();
      expect(onProjectFileDrop.mock.calls[0]?.[0]).toMatchObject({
        version: 1,
        treeSourceRef: { exampleId: 'pedv' },
      });
      expect(mockParseWithProgress).toHaveBeenCalled();
    });
    expect(onParsed).not.toHaveBeenCalled();
    await acceptImportSettings();
    expect(onParsed).toHaveBeenCalled();
  });

  it('dropping a .spreadgl2.json with no exampleId shows an error, does not parse', async () => {
    const onParsed = vi.fn();
    const onProjectFileDrop = vi.fn();

    render(<Loader onParsed={onParsed} onProjectFileDrop={onProjectFileDrop} />);

    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    const zone = screen.getByTestId('drop-zone');
    const file = new File([PROJECT_NO_EXAMPLE], 'local.spreadgl2.json', {
      type: 'application/json',
    });

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('loader-error')).toBeTruthy();
      expect(screen.getByTestId('loader-error').textContent).toMatch(/user-uploaded tree/);
    });

    expect(onProjectFileDrop).not.toHaveBeenCalled();
    expect(mockParseWithProgress).not.toHaveBeenCalled();
    expect(onParsed).not.toHaveBeenCalled();
  });

  it('dropping a .spreadgl2.json with invalid JSON shows an error', async () => {
    const onParsed = vi.fn();

    render(<Loader onParsed={onParsed} />);

    const zone = screen.getByTestId('drop-zone');
    const file = new File(['not valid json }{'], 'bad.spreadgl2.json', {
      type: 'application/json',
    });

    fireEvent.drop(zone, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId('loader-error')).toBeTruthy();
      expect(screen.getByTestId('loader-error').textContent).toMatch(/Invalid project file/);
    });

    expect(onParsed).not.toHaveBeenCalled();
  });
});

vi.mock('../../lib/native-dialog', () => ({
  openFilePicker: vi.fn(),
}));

describe('Loader — rawTreeText stale regression', () => {
  it('load example then open file via ArrayBuffer path → rawTreeText is null (no stale embed)', async () => {
    const { openFilePicker } = await import('../../lib/native-dialog');
    const mockOpenFilePicker = vi.mocked(openFilePicker);

    const onParsed = vi.fn();
    render(<Loader onParsed={onParsed} />);

    await waitFor(() => {
      expect(screen.getByTestId('example-pedv')).toBeTruthy();
    });

    await userEvent.click(screen.getByTestId('example-pedv'));
    await acceptImportSettings();
    expect(onParsed).toHaveBeenCalledOnce();

    const rawAfterExample = useTreeStore.getState().rawTreeText;
    expect(typeof rawAfterExample).toBe('string');

    const fakeBuffer = new ArrayBuffer(16);
    mockOpenFilePicker.mockResolvedValueOnce({
      name: 'large-tree.nex',
      text: async () => '',
      arrayBuffer: async () => fakeBuffer,
    });

    await userEvent.click(screen.getByTestId('loader-open-btn'));
    await acceptImportSettings();
    expect(onParsed).toHaveBeenCalledTimes(2);

    expect(useTreeStore.getState().rawTreeText).toBeNull();
  });
});

describe('Loader — openFilePicker error handling', () => {
  it('shows error banner when openFilePicker rejects', async () => {
    const { openFilePicker } = await import('../../lib/native-dialog');
    const mockOpenFilePicker = vi.mocked(openFilePicker);
    mockOpenFilePicker.mockRejectedValueOnce(
      new Error('Native file dialog failed: permission denied'),
    );

    render(<Loader onParsed={vi.fn()} />);

    await userEvent.click(screen.getByTestId('loader-open-btn'));

    await waitFor(() => {
      const errorEl = screen.getByTestId('loader-error');
      expect(errorEl.textContent).toMatch(/Failed to open file/);
      expect(errorEl.textContent).toMatch(/Native file dialog failed/);
    });
  });
});
