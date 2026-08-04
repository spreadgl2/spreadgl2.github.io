// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchTable, Layout, PhyloGraph } from '../../lib/phylo/types';
import { paletteColorFor } from '../../lib/tree-render/palettes';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { type GeoSource, useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { Sidebar } from './Sidebar';

const MOCK_GRAPH: PhyloGraph = {
  nodes: [
    {
      idx: 0,
      origId: 'root',
      name: null,
      label: null,
      annotations: {},
      adjacents: [1],
      lengths: [0.1],
    },
    {
      idx: 1,
      origId: 'tip_a',
      name: 'tip_a',
      label: null,
      annotations: {},
      adjacents: [0],
      lengths: [0.1],
    },
  ],
  root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
  origIdToIdx: new Map([
    ['root', 0],
    ['tip_a', 1],
  ]),
  rooted: true,
  hiddenNodeIds: new Set(),
  collapsedCladeIds: new Map(),
};

const MOCK_LAYOUT: Layout = {
  nodes: [
    { id: 'root', x: 0, y: 1, isTip: false, parentId: null, children: ['tip_a'], annotations: {} },
    { id: 'tip_a', x: 1, y: 0, isTip: true, parentId: 'root', children: [], annotations: {} },
  ],
  nodeMap: new Map(),
  maxX: 2,
  maxY: 2,
  xAxisMode: 'date',
};

const DISCRETE_TRAIT = {
  kind: 'discrete' as const,
  key: 'Location',
  values: ['Anhui', 'Beijing'],
  ambiguous: false as const,
};

beforeEach(() => {
  useTreeStore.setState({
    graph: null,
    layout: null,
    fileName: null,
    parseStatus: 'idle',
    traitInfo: null,
    confirmedTraitKey: null,
    discreteGeoLookup: null,
    discreteGeoSource: null,
    customOverlays: [],
    allDiscreteKeys: [],
  });
  useUiStore.setState({
    activePanel: null,
    colorByKey: '__time__',
    glyphByKey: 'none',
    palette: 'okabe-ito',
    paletteReverse: false,
  });
  useTimelineStore.setState({ bounds: null });
  useSelectionStore.setState({
    hoveredId: null,
    selectedIds: [],
    compareSelection: [],
    hoveredBranchId: null,
    selectedBranchIds: [],
    selectedScrollTarget: null,
    focusedTaxa: [],
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Sidebar', () => {
  it('Data → Tree row is informational and preserves the loaded tree', () => {
    useTreeStore.setState({ graph: MOCK_GRAPH, layout: MOCK_LAYOUT, fileName: 'rabv.tree' });
    render(<Sidebar />);
    const treeRow = screen.getByTestId('sidebar-tree-row');
    expect(treeRow.tagName).toBe('DIV');
    fireEvent.click(treeRow);
    expect(useTreeStore.getState().fileName).toBe('rabv.tree');
  });

  it('Data → Layers row opens the Layers panel', () => {
    useTreeStore.setState({ graph: MOCK_GRAPH, layout: MOCK_LAYOUT, fileName: 'rabv.tree' });
    render(<Sidebar />);
    const row = screen.getByTestId('sidebar-layers-row');
    expect(row.textContent).toContain('Layers');
    fireEvent.click(row);
    expect(useUiStore.getState().activePanel).toBe('layers');
  });

  it('places Layers after Log in the Data section', () => {
    useTreeStore.setState({ graph: MOCK_GRAPH, layout: MOCK_LAYOUT, fileName: 'rabv.tree' });
    render(<Sidebar />);
    const log = screen.getByTestId('sidebar-log-row');
    const layers = screen.getByTestId('sidebar-layers-row');
    expect(log.compareDocumentPosition(layers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Layers row counts boundary and region overlays together', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      customOverlays: [
        { id: 'b1', name: 'a', data: { type: 'FeatureCollection', features: [] } },
        { id: 'b2', name: 'b', data: { type: 'FeatureCollection', features: [] } },
      ],
      choroplethOverlays: [
        {
          id: 'c1',
          name: 'env',
          data: { type: 'FeatureCollection', features: [] },
          valueByLocation: new Map(),
          valueColumn: 'x',
          locationCol: 'loc',
        },
      ],
    });
    render(<Sidebar />);
    expect(screen.getByTestId('sidebar-layers-row').textContent).toContain('3 loaded');
  });

  it('shows legend placeholder when no trait loaded', () => {
    render(<Sidebar />);
    expect(screen.getByTestId('sidebar-legend-placeholder')).toBeTruthy();
  });

  it('hides the project trait summary when no graph is loaded', () => {
    render(<Sidebar />);
    expect(screen.queryByTestId('sidebar-project-trait')).toBeNull();
  });

  it('shows file name in project section when fileName is set', () => {
    useTreeStore.setState({ fileName: 'rabv.tree' });
    render(<Sidebar />);
    expect(screen.getByTestId('sidebar-file-name').textContent).toBe('rabv.tree');
  });

  it('Replace file requests the guardrail without resetting active state', () => {
    const onReplaceFile = vi.fn();
    useTreeStore.setState({ fileName: 'test.tree', graph: MOCK_GRAPH, parseStatus: 'done' });
    render(<Sidebar onReplaceFile={onReplaceFile} />);
    fireEvent.click(screen.getByTestId('sidebar-replace-btn'));

    expect(onReplaceFile).toHaveBeenCalledOnce();
    expect(useTreeStore.getState()).toMatchObject({
      fileName: 'test.tree',
      graph: MOCK_GRAPH,
      parseStatus: 'done',
    });
  });

  it('renders the tip count inside the project section', () => {
    useTreeStore.setState({ graph: MOCK_GRAPH, layout: MOCK_LAYOUT, fileName: 'rabv.tree' });
    render(<Sidebar />);
    const tipCount = screen.getByTestId('sidebar-tip-count');
    expect(tipCount.textContent).toBe('1 tips');
    expect(screen.getByTestId('sidebar-project').contains(tipCount)).toBe(true);
  });

  it('shows the trait summary inside the project section', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: { ...DISCRETE_TRAIT, key: 'state' },
      confirmedTraitKey: 'state',
    });
    render(<Sidebar />);
    const project = screen.getByTestId('sidebar-project');
    expect(project.contains(screen.getByTestId('sidebar-project-trait'))).toBe(true);
    expect(screen.getByTestId('sidebar-trait-name').textContent).toBe('state');
    expect(screen.getByTestId('sidebar-project-trait').textContent).toContain('Trait:');
    expect(screen.queryByTestId('sidebar-trait-auto')).toBeNull();
    expect(screen.getByTestId('sidebar-trait-kind').textContent).toBe('discrete');
    expect(screen.getByTestId('sidebar-trait-meta').textContent).toContain('·');
    expect(screen.getByTestId('sidebar-trait-meta').textContent).toContain('2 states');
  });

  it('shows the live trait key, not a stale confirmedTraitKey from a prior import', () => {
    // confirmedTraitKey persists across imports; the label must follow the
    // currently loaded traitInfo, not the leftover discrete key.
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'yfv.tree',
      traitInfo: { kind: 'continuous', keyFamily: { lat: 'lat', lon: 'lon' }, wgs84: true },
      confirmedTraitKey: 'state',
    });
    render(<Sidebar />);
    expect(screen.getByTestId('sidebar-trait-name').textContent).toBe('lat, lon');
    expect(screen.getByTestId('sidebar-trait-kind').textContent).toBe('continuous');
  });

  it('shows the derived date range in the data section', () => {
    useTreeStore.setState({ graph: MOCK_GRAPH, layout: MOCK_LAYOUT, fileName: 'rabv.tree' });
    useTimelineStore.setState({ bounds: { min: 1995.99, max: 2017.01 } });
    render(<Sidebar />);
    const text = screen.getByTestId('sidebar-dates-row').textContent ?? '';
    expect(text).toContain('1996');
    expect(text).toContain('2017');
  });

  it('clicking the dates row opens the dates panel', () => {
    useTreeStore.setState({ graph: MOCK_GRAPH, layout: MOCK_LAYOUT, fileName: 'rabv.tree' });
    useTimelineStore.setState({ bounds: { min: 1995.99, max: 2017.01 } });
    render(<Sidebar />);
    fireEvent.click(screen.getByTestId('sidebar-dates-row'));
    expect(useUiStore.getState().activePanel).toBe('dates');
  });

  it('shows the gazetteer source on the coordinates row', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
      discreteGeoLookup: new Map<string, [number, number]>([
        ['Anhui', [31.8, 117.2]],
        ['Beijing', [39.9, 116.4]],
      ]),
      discreteGeoSource: new Map<string, GeoSource>([
        ['Anhui', 'gazetteer'],
        ['Beijing', 'gazetteer'],
      ]),
    });
    render(<Sidebar />);
    expect(screen.getByTestId('sidebar-coordinates-row').textContent).toContain('gazetteer');
  });

  it('flags unmatched locations on the coordinates row', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
      discreteGeoLookup: new Map<string, [number, number]>([['Anhui', [31.8, 117.2]]]),
    });
    render(<Sidebar />);
    expect(screen.getByTestId('sidebar-coordinates-row').textContent).toContain('1/2 located');
  });

  it('flags missing internal-node location annotations on the coordinates row', () => {
    const nodes = [
      {
        ...MOCK_GRAPH.nodes[0]!,
        annotations: {},
        adjacents: [1, 2],
        lengths: [0.1, 0.1],
      },
      {
        ...MOCK_GRAPH.nodes[1]!,
        annotations: { Location: 'Anhui' },
      },
      {
        ...MOCK_GRAPH.nodes[1]!,
        idx: 2,
        origId: 'tip_b',
        name: 'tip_b',
        annotations: { Location: 'Beijing' },
      },
    ];
    const graph: PhyloGraph = {
      ...MOCK_GRAPH,
      nodes,
      origIdToIdx: new Map(nodes.map((node) => [node.origId, node.idx])),
    };
    useTreeStore.setState({
      graph,
      layout: MOCK_LAYOUT,
      fileName: 'incomplete.tree',
      traitInfo: DISCRETE_TRAIT,
      discreteGeoLookup: new Map<string, [number, number]>([
        ['Anhui', [31.8, 117.2]],
        ['Beijing', [39.9, 116.4]],
      ]),
    });
    render(<Sidebar />);
    const row = screen.getByTestId('sidebar-coordinates-row');
    expect(row.textContent).toContain('1 node unannotated');
    expect(row.getAttribute('title')).toContain('1 internal node has no Location annotation');
  });

  it('flags the coordinates row red when no locations have coordinates', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
      discreteGeoLookup: null,
    });
    render(<Sidebar />);
    const row = screen.getByTestId('sidebar-coordinates-row');
    expect(row.textContent).toContain('missing');
    expect(row.innerHTML).toContain('dataIconError');
  });

  it('clicking the coordinates row toggles the locations panel', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
      discreteGeoLookup: new Map<string, [number, number]>([
        ['Anhui', [31.8, 117.2]],
        ['Beijing', [39.9, 116.4]],
      ]),
    });
    render(<Sidebar />);
    const row = screen.getByTestId('sidebar-coordinates-row');
    fireEvent.click(row);
    expect(useUiStore.getState().activePanel).toBe('locations');
    fireEvent.click(row);
    expect(useUiStore.getState().activePanel).toBeNull();
  });

  it('renders categorical legend entries for a continuous tree colored by a discrete secondary key', () => {
    const graphWithEcoregion: PhyloGraph = {
      nodes: [
        {
          idx: 0,
          origId: 'root',
          name: null,
          label: null,
          annotations: { ecoregion: 'Tropical' },
          adjacents: [1, 2],
          lengths: [0.1, 0.2],
        },
        {
          idx: 1,
          origId: 'tip_a',
          name: 'tip_a',
          label: null,
          annotations: { ecoregion: 'Tropical' },
          adjacents: [0],
          lengths: [0.1],
        },
        {
          idx: 2,
          origId: 'tip_b',
          name: 'tip_b',
          label: null,
          annotations: { ecoregion: 'Arid' },
          adjacents: [0],
          lengths: [0.2],
        },
      ],
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map([
        ['root', 0],
        ['tip_a', 1],
        ['tip_b', 2],
      ]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };

    useTreeStore.setState({
      graph: graphWithEcoregion,
      layout: MOCK_LAYOUT,
      fileName: 'yfv.tree',
      traitInfo: {
        kind: 'continuous',
        keyFamily: { lat: 'location1', lon: 'location2' },
        wgs84: false,
      },
      allDiscreteKeys: ['ecoregion'],
    });
    useUiStore.setState({ colorByKey: 'ecoregion', palette: 'okabe-ito', paletteReverse: false });

    render(<Sidebar />);

    const legendList = screen.getByTestId('sidebar-legend-list');
    expect(legendList).toBeTruthy();

    // Sorted distinct values: ['Arid', 'Tropical']
    const sortedValues = ['Arid', 'Tropical'];
    const items = legendList.querySelectorAll('li');
    expect(items.length).toBe(2);

    for (const [i, value] of sortedValues.entries()) {
      const item = items[i];
      expect(item?.textContent).toContain(value);
      const swatch = item?.querySelector('[aria-hidden]') as HTMLElement | null;
      // paletteColorFor returns hex; jsdom normalises hex to rgb() in style.background.
      // Verify the swatch has a non-empty background that corresponds to the expected color
      // by checking the swatch was painted (non-empty) and that the same paletteColorFor
      // call used by the Sidebar produces a unique-per-value color (round-trip check).
      const expectedHex = paletteColorFor(value, sortedValues, 'okabe-ito', false);
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(expectedHex);
      const expectedRgb =
        m && m[1] !== undefined && m[2] !== undefined && m[3] !== undefined
          ? `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`
          : expectedHex;
      expect(swatch?.style.background).toBe(expectedRgb);
    }
  });

  it('discrete-primary legend still works unchanged with a discrete trait', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
    });
    useUiStore.setState({ colorByKey: 'Location', palette: 'okabe-ito', paletteReverse: false });

    render(<Sidebar />);

    const legendList = screen.getByTestId('sidebar-legend-list');
    const items = legendList.querySelectorAll('li');
    expect(items.length).toBe(2);
    expect(items[0]?.textContent).toContain('Anhui');
    expect(items[1]?.textContent).toContain('Beijing');
  });

  it('glyph legend is absent from Sidebar when glyphByKey is none', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
    });
    useUiStore.setState({ glyphByKey: 'none' });
    render(<Sidebar />);
    expect(screen.queryByTestId('glyph-legend')).toBeNull();
  });

  it('glyph legend appears in Sidebar Legend section when glyphByKey is set', () => {
    const graphWithHost: PhyloGraph = {
      ...MOCK_GRAPH,
      nodes: [
        {
          idx: 0,
          origId: 'root',
          name: null,
          label: null,
          annotations: {},
          adjacents: [1, 2],
          lengths: [0.1, 0.2],
        },
        {
          idx: 1,
          origId: 'tip_bat',
          name: 'tip_bat',
          label: null,
          annotations: { host_type: 'bat' },
          adjacents: [0],
          lengths: [0.1],
        },
        {
          idx: 2,
          origId: 'tip_dog',
          name: 'tip_dog',
          label: null,
          annotations: { host_type: 'dog' },
          adjacents: [0],
          lengths: [0.2],
        },
      ],
      origIdToIdx: new Map([
        ['root', 0],
        ['tip_bat', 1],
        ['tip_dog', 2],
      ]),
    };
    useTreeStore.setState({
      graph: graphWithHost,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
      allDiscreteKeys: ['Location', 'host_type'],
    });
    useUiStore.setState({ glyphByKey: 'host_type' });
    render(<Sidebar />);

    const glyphLegend = screen.getByTestId('glyph-legend');
    expect(glyphLegend).toBeTruthy();

    const legendSection = screen.getByTestId('sidebar-legend');
    expect(legendSection.contains(glyphLegend)).toBe(true);
  });

  it('glyph legend markers use currentColor (neutral), not palette colors', () => {
    const graphWithHost: PhyloGraph = {
      ...MOCK_GRAPH,
      nodes: [
        {
          idx: 0,
          origId: 'root',
          name: null,
          label: null,
          annotations: {},
          adjacents: [1],
          lengths: [0.1],
        },
        {
          idx: 1,
          origId: 'tip_bat',
          name: 'tip_bat',
          label: null,
          annotations: { host_type: 'bat' },
          adjacents: [0],
          lengths: [0.1],
        },
      ],
      origIdToIdx: new Map([
        ['root', 0],
        ['tip_bat', 1],
      ]),
    };
    useTreeStore.setState({
      graph: graphWithHost,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
      allDiscreteKeys: ['Location', 'host_type'],
    });
    useUiStore.setState({ glyphByKey: 'host_type', palette: 'okabe-ito', paletteReverse: false });
    render(<Sidebar />);

    const glyphLegend = screen.getByTestId('glyph-legend');
    const svgs = glyphLegend.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);

    for (const svg of Array.from(svgs)) {
      const shapes = svg.querySelectorAll('circle, polygon, rect');
      for (const shape of Array.from(shapes)) {
        expect(shape.getAttribute('fill')).toBe('currentColor');
      }
    }
  });

  it('time-gradient legend renders for continuous tree with colorByKey=__time__', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'yfv.tree',
      traitInfo: {
        kind: 'continuous',
        keyFamily: { lat: 'location1', lon: 'location2' },
        wgs84: false,
      },
    });
    useUiStore.setState({ colorByKey: '__time__', palette: 'viridis', paletteReverse: false });
    useTimelineStore.setState({ bounds: { min: 2000, max: 2020 } });

    render(<Sidebar />);

    expect(screen.getByTestId('sidebar-legend-gradient')).toBeTruthy();
  });

  it('combined legend when colorByKey === glyphByKey: one legend, shapes filled with palette colors', () => {
    const graphWithHost: PhyloGraph = {
      nodes: [
        {
          idx: 0,
          origId: 'root',
          name: null,
          label: null,
          annotations: {},
          adjacents: [1, 2],
          lengths: [0.1, 0.2],
        },
        {
          idx: 1,
          origId: 'tip_bat',
          name: 'tip_bat',
          label: null,
          annotations: { host_type: 'bat' },
          adjacents: [0],
          lengths: [0.1],
        },
        {
          idx: 2,
          origId: 'tip_dog',
          name: 'tip_dog',
          label: null,
          annotations: { host_type: 'dog' },
          adjacents: [0],
          lengths: [0.2],
        },
      ],
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map([
        ['root', 0],
        ['tip_bat', 1],
        ['tip_dog', 2],
      ]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
    useTreeStore.setState({
      graph: graphWithHost,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: {
        kind: 'discrete' as const,
        key: 'host_type',
        values: ['bat', 'dog'],
        ambiguous: false as const,
      },
      allDiscreteKeys: ['host_type'],
    });
    useUiStore.setState({
      colorByKey: 'host_type',
      glyphByKey: 'host_type',
      palette: 'okabe-ito',
      paletteReverse: false,
    });

    render(<Sidebar />);

    const combined = screen.getByTestId('sidebar-legend-combined');
    expect(combined).toBeTruthy();
    expect(screen.queryByTestId('sidebar-legend-list')).toBeNull();
    expect(screen.queryByTestId('glyph-legend')).toBeNull();

    const sortedValues = ['bat', 'dog'];
    const items = combined.querySelectorAll('li');
    expect(items.length).toBe(2);

    for (const [i, value] of sortedValues.entries()) {
      const item = items[i];
      expect(item?.textContent).toContain(value);

      const shapes = item?.querySelectorAll('svg circle, svg polygon, svg rect');
      expect(shapes && shapes.length > 0).toBe(true);

      const expectedHex = paletteColorFor(value, sortedValues, 'okabe-ito', false);
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(expectedHex);
      const expectedFill = m ? expectedHex.toLowerCase() : expectedHex;
      if (shapes) {
        for (const shape of Array.from(shapes)) {
          const actualFill = shape.getAttribute('fill') ?? '';
          expect(actualFill.toLowerCase()).toBe(expectedFill);
        }
      }
    }
  });

  it('separate legends when colorByKey !== glyphByKey', () => {
    const graphWithHost: PhyloGraph = {
      nodes: [
        {
          idx: 0,
          origId: 'root',
          name: null,
          label: null,
          annotations: {},
          adjacents: [1, 2],
          lengths: [0.1, 0.2],
        },
        {
          idx: 1,
          origId: 'tip_bat',
          name: 'tip_bat',
          label: null,
          annotations: { host_type: 'bat' },
          adjacents: [0],
          lengths: [0.1],
        },
        {
          idx: 2,
          origId: 'tip_dog',
          name: 'tip_dog',
          label: null,
          annotations: { host_type: 'dog' },
          adjacents: [0],
          lengths: [0.2],
        },
      ],
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map([
        ['root', 0],
        ['tip_bat', 1],
        ['tip_dog', 2],
      ]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
    useTreeStore.setState({
      graph: graphWithHost,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
      allDiscreteKeys: ['Location', 'host_type'],
    });
    useUiStore.setState({
      colorByKey: 'Location',
      glyphByKey: 'host_type',
      palette: 'okabe-ito',
      paletteReverse: false,
    });

    render(<Sidebar />);

    expect(screen.queryByTestId('sidebar-legend-combined')).toBeNull();
    expect(screen.getByTestId('sidebar-legend-list')).toBeTruthy();
    expect(screen.getByTestId('glyph-legend')).toBeTruthy();

    const glyphShapes = screen
      .getByTestId('glyph-legend')
      .querySelectorAll('circle, polygon, rect');
    for (const shape of Array.from(glyphShapes)) {
      expect(shape.getAttribute('fill')).toBe('currentColor');
    }
  });

  it('only glyph-by active (colorByKey=single-color): just the monochrome glyph legend', () => {
    const graphWithHost: PhyloGraph = {
      nodes: [
        {
          idx: 0,
          origId: 'root',
          name: null,
          label: null,
          annotations: {},
          adjacents: [1],
          lengths: [0.1],
        },
        {
          idx: 1,
          origId: 'tip_bat',
          name: 'tip_bat',
          label: null,
          annotations: { host_type: 'bat' },
          adjacents: [0],
          lengths: [0.1],
        },
      ],
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map([
        ['root', 0],
        ['tip_bat', 1],
      ]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
    useTreeStore.setState({
      graph: graphWithHost,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
      allDiscreteKeys: ['host_type'],
    });
    useUiStore.setState({ colorByKey: 'single-color', glyphByKey: 'host_type' });

    render(<Sidebar />);

    expect(screen.queryByTestId('sidebar-legend-combined')).toBeNull();
    expect(screen.queryByTestId('sidebar-legend-list')).toBeNull();
    expect(screen.getByTestId('glyph-legend')).toBeTruthy();
  });

  it('only color-by active (glyphByKey=none): just the color swatch legend', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
    });
    useUiStore.setState({ colorByKey: 'Location', glyphByKey: 'none' });

    render(<Sidebar />);

    expect(screen.queryByTestId('sidebar-legend-combined')).toBeNull();
    expect(screen.getByTestId('sidebar-legend-list')).toBeTruthy();
    expect(screen.queryByTestId('glyph-legend')).toBeNull();
  });

  it('T082.5: clicking a legend row solos it (deselects all others)', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
    });
    useUiStore.setState({
      colorByKey: 'Location',
      glyphByKey: 'none',
      deselectedValues: new Set<string>(),
    });

    render(<Sidebar />);

    const anhui = screen.getByTestId('legend-row-Anhui');
    fireEvent.click(anhui);

    const deselected = useUiStore.getState().deselectedValues;
    expect(deselected.has('Anhui')).toBe(false);
    expect(deselected.has('Beijing')).toBe(true);
  });

  it('T082.5: shift-clicking a legend row toggles it individually', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
    });
    useUiStore.setState({
      colorByKey: 'Location',
      glyphByKey: 'none',
      deselectedValues: new Set<string>(),
    });

    render(<Sidebar />);

    const beijing = screen.getByTestId('legend-row-Beijing');
    fireEvent.click(beijing, { shiftKey: true });

    const deselected = useUiStore.getState().deselectedValues;
    expect(deselected.has('Beijing')).toBe(true);
    expect(deselected.has('Anhui')).toBe(false);
  });

  it('T082.5: show-all button resets deselected values', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
    });
    useUiStore.setState({
      colorByKey: 'Location',
      glyphByKey: 'none',
      deselectedValues: new Set(['Beijing']),
    });

    render(<Sidebar />);

    const showAll = screen.getByTestId('legend-show-all');
    fireEvent.click(showAll);

    expect(useUiStore.getState().deselectedValues.size).toBe(0);
  });

  it('T082.5: deselected row has aria-pressed=false, selected row has aria-pressed=true', () => {
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
    });
    useUiStore.setState({
      colorByKey: 'Location',
      glyphByKey: 'none',
      deselectedValues: new Set(['Beijing']),
    });

    render(<Sidebar />);

    const anhui = screen.getByTestId('legend-row-Anhui');
    const beijing = screen.getByTestId('legend-row-Beijing');
    expect(anhui.getAttribute('aria-pressed')).toBe('true');
    expect(beijing.getAttribute('aria-pressed')).toBe('false');
  });

  it('does not render tip counts or a Filtered badge without a branch table', () => {
    // Counts need the branch table; the legend degrades gracefully to labels only.
    useTreeStore.setState({
      graph: MOCK_GRAPH,
      layout: MOCK_LAYOUT,
      fileName: 'rabv.tree',
      traitInfo: DISCRETE_TRAIT,
    });
    useUiStore.setState({
      colorByKey: 'Location',
      glyphByKey: 'none',
      deselectedValues: new Set(['Beijing']),
    });

    render(<Sidebar />);

    expect(screen.queryByTestId('legend-tip-total')).toBeNull();
    expect(screen.queryByTestId('legend-filtered-badge')).toBeNull();
    // Rows still render as labels.
    expect(screen.getByTestId('legend-row-Anhui')).toBeTruthy();
  });

  it('sorts the filtered legend by shown count (numerator) and colours the numerator', () => {
    // Three states; deselect two so shown ≠ total ≠ alphabetical:
    //   Beijing 1/1 (kept), Anhui 0/2, Chongqing 0/3.
    // Sort-by-count while filtered ranks by the shown count, so Beijing (1)
    // leads — even though Chongqing's total (3) is the largest.
    const mkNode = (idx: number, origId: string, loc?: string) => ({
      idx,
      origId,
      name: null,
      label: null,
      annotations: loc ? { Location: loc } : {},
      adjacents: [],
      lengths: [],
    });
    const graph = {
      nodes: [
        mkNode(0, 'root'),
        mkNode(1, 'a', 'Anhui'),
        mkNode(2, 'a2', 'Anhui'),
        mkNode(3, 'b', 'Beijing'),
        mkNode(4, 'c', 'Chongqing'),
        mkNode(5, 'c2', 'Chongqing'),
        mkNode(6, 'c3', 'Chongqing'),
      ],
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map([
        ['root', 0],
        ['a', 1],
        ['a2', 2],
        ['b', 3],
        ['c', 4],
        ['c2', 5],
        ['c3', 6],
      ]),
      rooted: true,
      hiddenNodeIds: new Set<string>(),
      collapsedCladeIds: new Map(),
    } as unknown as PhyloGraph;
    const tipIds = ['a', 'a2', 'b', 'c', 'c2', 'c3'];
    const lNodes = [
      { id: 'root', x: 0, y: 3, isTip: false, parentId: null, children: tipIds, annotations: {} },
      ...tipIds.map((id, i) => ({
        id,
        x: 1,
        y: i,
        isTip: true,
        parentId: 'root',
        children: [],
        annotations: {},
      })),
    ];
    const layout = {
      nodes: lNodes,
      nodeMap: new Map(lNodes.map((n) => [n.id, n])),
      maxX: 1,
      maxY: 5,
      xAxisMode: 'divergence',
    } as unknown as Layout;
    const count = 6;
    const branchTable: BranchTable = {
      count,
      branchId: new Int32Array([1, 2, 3, 4, 5, 6]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array(count),
      endTime: new Float32Array(count),
      startLat: new Float32Array(count),
      startLon: new Float32Array(count),
      endLat: new Float32Array(count),
      endLon: new Float32Array(count),
      stateWeight: new Float32Array(count).fill(1),
      posterior: new Float32Array(count).fill(1),
    };
    useTreeStore.setState({
      graph,
      layout,
      branchTable,
      fileName: 'rabv.tree',
      traitInfo: {
        kind: 'discrete',
        key: 'Location',
        values: ['Anhui', 'Beijing', 'Chongqing'],
        ambiguous: false,
      },
    });
    useUiStore.setState({
      colorByKey: 'Location',
      glyphByKey: 'none',
      deselectedValues: new Set(['Anhui', 'Chongqing']),
    });

    render(<Sidebar />);

    // Row order follows the shown count (Beijing 1, then the zero-shown A–Z).
    const rows = screen.getAllByTestId(/^legend-row-/).map((el) => el.getAttribute('data-testid'));
    expect(rows).toEqual(['legend-row-Beijing', 'legend-row-Anhui', 'legend-row-Chongqing']);
    // The kept state's numerator renders in its own (coloured) span.
    expect(screen.getByTestId('legend-shown-Beijing').textContent).toBe('1');
    // Filtered header: the shown count moves into the badge, next to the title,
    // and the separate shown / total tally is dropped.
    expect(screen.getByTestId('legend-filtered-badge').textContent).toBe('Filtered (1)');
    expect(screen.queryByTestId('legend-tip-total')).toBeNull();
  });

  it('T082.5: switching colorByKey resets deselected values', () => {
    useUiStore.setState({
      colorByKey: 'Location',
      deselectedValues: new Set(['Beijing']),
    });

    useUiStore.getState().setColorByKey('ecoregion');

    expect(useUiStore.getState().deselectedValues.size).toBe(0);
  });

  describe('shift-click multi-select tracking set', () => {
    const THREE_VALUE_TRAIT = {
      kind: 'discrete' as const,
      key: 'Location',
      values: ['Anhui', 'Beijing', 'Shanghai'],
      ambiguous: false as const,
    };

    it('shift-click B after soloing A gives {A, B} visible (everything else deselected)', () => {
      useTreeStore.setState({
        graph: MOCK_GRAPH,
        layout: MOCK_LAYOUT,
        fileName: 'rabv.tree',
        traitInfo: THREE_VALUE_TRAIT,
      });
      useUiStore.setState({
        colorByKey: 'Location',
        glyphByKey: 'none',
        deselectedValues: new Set<string>(),
      });

      render(<Sidebar />);

      // solo A: deselects Beijing and Shanghai
      fireEvent.click(screen.getByTestId('legend-row-Anhui'));
      expect(useUiStore.getState().deselectedValues.has('Anhui')).toBe(false);
      expect(useUiStore.getState().deselectedValues.has('Beijing')).toBe(true);
      expect(useUiStore.getState().deselectedValues.has('Shanghai')).toBe(true);

      // shift-click B: toggles Beijing back into visible set
      fireEvent.click(screen.getByTestId('legend-row-Beijing'), { shiftKey: true });
      const deselected = useUiStore.getState().deselectedValues;
      expect(deselected.has('Anhui')).toBe(false);
      expect(deselected.has('Beijing')).toBe(false);
      expect(deselected.has('Shanghai')).toBe(true);
    });

    it('shift-clicking A again (after A+B visible) removes A from the focus set, leaving {B}', () => {
      useTreeStore.setState({
        graph: MOCK_GRAPH,
        layout: MOCK_LAYOUT,
        fileName: 'rabv.tree',
        traitInfo: THREE_VALUE_TRAIT,
      });
      useUiStore.setState({
        colorByKey: 'Location',
        glyphByKey: 'none',
        // starting state: only Shanghai deselected → Anhui + Beijing visible
        deselectedValues: new Set(['Shanghai']),
      });

      render(<Sidebar />);

      // shift-click A: A was visible → add to deselected
      fireEvent.click(screen.getByTestId('legend-row-Anhui'), { shiftKey: true });
      const deselected = useUiStore.getState().deselectedValues;
      expect(deselected.has('Anhui')).toBe(true);
      expect(deselected.has('Beijing')).toBe(false);
      expect(deselected.has('Shanghai')).toBe(true);
    });

    it('shift-clicking C after B solo gives {B, C} visible', () => {
      useTreeStore.setState({
        graph: MOCK_GRAPH,
        layout: MOCK_LAYOUT,
        fileName: 'rabv.tree',
        traitInfo: THREE_VALUE_TRAIT,
      });
      useUiStore.setState({
        colorByKey: 'Location',
        glyphByKey: 'none',
        // starting state: soloed Beijing (Anhui + Shanghai deselected)
        deselectedValues: new Set(['Anhui', 'Shanghai']),
      });

      render(<Sidebar />);

      // shift-click Shanghai: Shanghai was deselected → remove from deselected (make visible)
      fireEvent.click(screen.getByTestId('legend-row-Shanghai'), { shiftKey: true });
      const deselected = useUiStore.getState().deselectedValues;
      expect(deselected.has('Anhui')).toBe(true);
      expect(deselected.has('Beijing')).toBe(false);
      expect(deselected.has('Shanghai')).toBe(false);
    });

    it('shift-click works in combined color+glyph legend', () => {
      const graphWith3Hosts: PhyloGraph = {
        nodes: [
          {
            idx: 0,
            origId: 'root',
            name: null,
            label: null,
            annotations: {},
            adjacents: [1, 2, 3],
            lengths: [0.1, 0.2, 0.3],
          },
          {
            idx: 1,
            origId: 'tip_bat',
            name: 'tip_bat',
            label: null,
            annotations: { host_type: 'bat' },
            adjacents: [0],
            lengths: [0.1],
          },
          {
            idx: 2,
            origId: 'tip_dog',
            name: 'tip_dog',
            label: null,
            annotations: { host_type: 'dog' },
            adjacents: [0],
            lengths: [0.2],
          },
          {
            idx: 3,
            origId: 'tip_cat',
            name: 'tip_cat',
            label: null,
            annotations: { host_type: 'cat' },
            adjacents: [0],
            lengths: [0.3],
          },
        ],
        root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
        origIdToIdx: new Map([
          ['root', 0],
          ['tip_bat', 1],
          ['tip_dog', 2],
          ['tip_cat', 3],
        ]),
        rooted: true,
        hiddenNodeIds: new Set(),
        collapsedCladeIds: new Map(),
      };

      useTreeStore.setState({
        graph: graphWith3Hosts,
        layout: MOCK_LAYOUT,
        fileName: 'rabv.tree',
        traitInfo: {
          kind: 'discrete' as const,
          key: 'host_type',
          values: ['bat', 'cat', 'dog'],
          ambiguous: false as const,
        },
        allDiscreteKeys: ['host_type'],
      });
      useUiStore.setState({
        colorByKey: 'host_type',
        glyphByKey: 'host_type',
        palette: 'okabe-ito',
        paletteReverse: false,
        // starting state: only bat is visible (cat + dog deselected)
        deselectedValues: new Set(['cat', 'dog']),
      });

      render(<Sidebar />);

      expect(screen.getByTestId('sidebar-legend-combined')).toBeTruthy();

      // shift-click cat in the combined legend: cat was deselected → make visible
      fireEvent.click(screen.getByTestId('legend-row-cat'), { shiftKey: true });
      const deselected = useUiStore.getState().deselectedValues;
      expect(deselected.has('bat')).toBe(false);
      expect(deselected.has('cat')).toBe(false);
      expect(deselected.has('dog')).toBe(true);
    });
  });
});
