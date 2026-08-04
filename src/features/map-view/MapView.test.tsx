// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WebMercatorViewport } from 'deck.gl';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHpdRenderData, buildMultiHpdRenderData } from '../../lib/geo/hpd-render-data';
import type {
  BranchTable,
  GeoJSONPolygon,
  IntrospectResult,
  PhyloGraph,
} from '../../lib/phylo/types';
import { getRangeRelativePlayheadBucket } from '../../lib/tree-render/playhead-bucket';
import { useRasterStore } from '../../store/raster';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { type TreeStore, useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { MapView, useMapDeckModel } from './MapView';

let capturedLayers: unknown[] = [];
let capturedDeckGLId: string | undefined;
let capturedInitialViewState: unknown;
let capturedOnViewStateChange:
  | ((e: {
      viewState: unknown;
      interactionState?: { isPanning?: boolean; isZooming?: boolean };
    }) => void)
  | undefined;
let capturedDeckOnClick:
  | ((info: { object?: unknown; srcEvent?: { metaKey?: boolean; ctrlKey?: boolean } }) => boolean)
  | undefined;

// Deck.gl and maplibre require WebGL/canvas; mock at module level for jsdom.
vi.mock('@deck.gl/react', () => ({
  DeckGL: ({
    id,
    layers,
    children,
    initialViewState,
    onViewStateChange,
    onClick,
  }: {
    id?: string;
    layers: unknown[];
    children?: React.ReactNode;
    initialViewState?: unknown;
    onViewStateChange?: (e: {
      viewState: unknown;
      interactionState?: { isPanning?: boolean; isZooming?: boolean };
    }) => void;
    onClick?: (info: {
      object?: unknown;
      srcEvent?: { metaKey?: boolean; ctrlKey?: boolean };
    }) => boolean;
  }) => {
    capturedLayers = layers;
    capturedDeckGLId = id;
    capturedInitialViewState = initialViewState;
    capturedOnViewStateChange = onViewStateChange;
    capturedDeckOnClick = onClick;
    return (
      <div data-testid="deckgl" data-layer-count={layers.length}>
        {children}
      </div>
    );
  },
}));

let capturedMapStyle: string | undefined;

vi.mock('react-map-gl/maplibre', () => ({
  Map: (props: { mapStyle?: string }) => {
    capturedMapStyle = props.mapStyle;
    return <div data-testid="maplibre-map" />;
  },
}));

vi.mock('@deck.gl/geo-layers', () => ({
  TripsLayer: class TripsLayer {
    constructor(props: Record<string, unknown>) {
      Object.assign(this, props);
    }
  },
}));

vi.mock('@deck.gl/extensions', () => ({
  DataFilterExtension: class DataFilterExtension {
    filterSize: number;
    constructor(props: { filterSize: number }) {
      this.filterSize = props.filterSize;
    }
  },
  DataFilterExtensionProps: {},
}));

vi.mock('@deck.gl/layers', () => ({
  ArcLayer: class ArcLayer {
    constructor(props: Record<string, unknown>) {
      Object.assign(this, props);
    }
  },
  PolygonLayer: class PolygonLayer {
    constructor(props: Record<string, unknown>) {
      Object.assign(this, props);
    }
  },
}));

// deck.gl is a barrel re-exporting from @deck.gl/layers. Mock it directly to
// ensure PolygonLayer, ArcLayer etc. from the `deck.gl` import path use our
// test stubs (Vitest doesn't always chain mocks through re-exports).
vi.mock('deck.gl', async () => {
  const { WebMercatorViewport } = await vi.importActual<typeof import('deck.gl')>('deck.gl');
  return {
    WebMercatorViewport,
    ArcLayer: class ArcLayer {
      constructor(props: Record<string, unknown>) {
        Object.assign(this, props);
      }
    },
    BitmapLayer: class BitmapLayer {
      constructor(props: Record<string, unknown>) {
        Object.assign(this, props);
      }
    },
    PolygonLayer: class PolygonLayer {
      constructor(props: Record<string, unknown>) {
        Object.assign(this, props);
      }
    },
    ScatterplotLayer: class ScatterplotLayer {
      constructor(props: Record<string, unknown>) {
        Object.assign(this, props);
      }
    },
    TextLayer: class TextLayer {
      constructor(props: Record<string, unknown>) {
        Object.assign(this, props);
      }
    },
    GeoJsonLayer: class GeoJsonLayer {
      constructor(props: Record<string, unknown>) {
        Object.assign(this, props);
      }
    },
    Layer: class Layer {},
  };
});

vi.mock('@deck.gl/core', () => ({}));

// maplibre-gl CSS import stub
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

// jsdom does not implement ResizeObserver — stub it so components that use it don't throw.
// Fires the callback with 800x600 so containerDims is non-zero.
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
  }
  observe(el: Element) {
    this.callback(
      [
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
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
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

function makeBranchTable(count: number): BranchTable {
  return {
    count,
    branchId: new Int32Array(count).map((_, i) => i),
    parentBranch: new Int32Array(count),
    isInternal: new Uint8Array(count),
    startTime: new Float32Array(count).map((_, i) => 2003.0 + i * 0.5),
    endTime: new Float32Array(count).map((_, i) => 2004.0 + i * 0.5),
    startLat: new Float32Array(count).map((_, i) => 40.0 + i),
    startLon: new Float32Array(count).map((_, i) => -100.0 + i),
    endLat: new Float32Array(count).map((_, i) => 41.0 + i),
    endLon: new Float32Array(count).map((_, i) => -99.0 + i),
    stateWeight: new Float32Array(count).fill(1.0),
  };
}

function makeGraph(count: number): PhyloGraph {
  return {
    nodes: Array.from({ length: count }, (_, i) => ({
      idx: i,
      origId: `node_${i}`,
      name: null,
      label: null,
      annotations: {},
      adjacents: [],
      lengths: [],
    })),
    root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
    origIdToIdx: new Map(Array.from({ length: count }, (_, i) => [`node_${i}`, i])),
    rooted: true,
    hiddenNodeIds: new Set(),
    collapsedCladeIds: new Map(),
  };
}

function setTreeState(partial: Partial<TreeStore>) {
  const current = useTreeStore.getState();
  const branchTable = Object.hasOwn(partial, 'branchTable')
    ? (partial.branchTable ?? null)
    : current.branchTable;
  const nodeHpds = Object.hasOwn(partial, 'nodeHpds')
    ? (partial.nodeHpds ?? null)
    : current.nodeHpds;
  const nodeMultiHpds = Object.hasOwn(partial, 'nodeMultiHpds')
    ? (partial.nodeMultiHpds ?? null)
    : current.nodeMultiHpds;
  const updates: Partial<TreeStore> = { ...partial };

  if (Object.hasOwn(partial, 'branchTable') || Object.hasOwn(partial, 'nodeHpds')) {
    updates.hpdRenderData = buildHpdRenderData(nodeHpds, branchTable);
  }
  if (Object.hasOwn(partial, 'branchTable') || Object.hasOwn(partial, 'nodeMultiHpds')) {
    updates.multiHpdRenderData = buildMultiHpdRenderData(nodeMultiHpds, branchTable);
  }

  useTreeStore.setState(updates);
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => {},
  } as DOMRect;
}

function expectFiniteArcFilterRange(
  filterRange: [[number, number], [number, number]] | undefined,
): asserts filterRange is [[number, number], [number, number]] {
  expect(filterRange).toBeDefined();
  if (!filterRange) return;
  for (const [lo, hi] of filterRange) {
    expect(Number.isFinite(lo)).toBe(true);
    expect(Number.isFinite(hi)).toBe(true);
  }
}

function CameraKeyProbe({ onKey }: { onKey: (key: number) => void }) {
  const model = useMapDeckModel();
  useEffect(() => {
    onKey(model.deckProps.key);
  }, [model.deckProps.key, onKey]);
  return null;
}

beforeEach(() => {
  useUiStore.setState({ renderQuality: 'quality' });
});

describe('MapView', () => {
  beforeEach(() => {
    capturedLayers = [];
    capturedDeckGLId = undefined;
    capturedInitialViewState = undefined;
    capturedMapStyle = undefined;
    capturedOnViewStateChange = undefined;
    capturedDeckOnClick = undefined;
    setTreeState({
      branchTable: null,
      graph: null,
      layout: null,
      nodeHpds: null,
      nodeMultiHpds: null,
      traitInfo: null,
      parseStatus: 'idle',
      parseError: null,
      discreteGeoLookup: new Map(),
      discreteGeoSource: new Map(),
    });
    useTimelineStore.setState({
      playhead: 2003.0,
      bounds: null,
      isPlaying: false,
      speed: 1,
      mode: 'Trail',
      arcs: false,
      clade: false,
      subtreeRootId: null,
      window: null,
    });
    useSelectionStore.setState({ hoveredBranchId: null, hoveredId: null, focusedTaxa: [] });
    useRasterStore.setState({ raster: null });
    useUiStore.setState({
      theme: 'dark',
      lassoMode: false,
      lassoVertices: [],
      pickLocationName: null,
      pinnedSelection: null,
      compareSelection: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders MapLibreMap and DeckGL with empty layers when no tree is loaded', () => {
    render(<MapView />);
    expect(screen.getByTestId('deckgl')).toBeTruthy();
    expect(screen.getByTestId('maplibre-map')).toBeTruthy();
    expect(screen.getByTestId('deckgl').getAttribute('data-layer-count')).toBe('0');
  });

  it('renders a TripsLayer when BranchTable is in the store', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    render(<MapView />);
    // 2-stack TripsLayer copies (Fix 3: reduced 4→2). The top pickable
    // stack (s===0) keeps the canonical id 'branches-trail'.
    expect(screen.getByTestId('deckgl').getAttribute('data-layer-count')).toBe('2');
    expect(capturedLayers[0]).toMatchObject({ id: 'branches-trail' });
  });

  it('uses one TripsLayer pass in performance mode', () => {
    setTreeState({ branchTable: makeBranchTable(3) });
    useUiStore.setState({ renderQuality: 'performance' });
    render(<MapView />);

    expect(screen.getByTestId('deckgl').getAttribute('data-layer-count')).toBe('1');
    expect(capturedLayers[0]).toMatchObject({ id: 'branches-trail' });
  });

  it('does not reset the camera for a same-dataset BranchTable coordinate rebuild', async () => {
    const cameraKeys: number[] = [];
    const onKey = (key: number) => cameraKeys.push(key);
    setTreeState({
      fileName: 'tree.nex',
      graph: makeGraph(3),
      branchTable: makeBranchTable(3),
    });

    render(<CameraKeyProbe onKey={onKey} />);
    await act(async () => {});
    expect(cameraKeys.at(-1)).toBe(1);

    const rebuiltSameDataset = makeBranchTable(3);
    rebuiltSameDataset.endLat[0] = 55;
    rebuiltSameDataset.endLon[0] = -3;
    act(() => {
      setTreeState({ branchTable: rebuiltSameDataset });
    });
    await act(async () => {});
    expect(cameraKeys.at(-1)).toBe(1);

    act(() => {
      setTreeState({ graph: makeGraph(3), branchTable: makeBranchTable(3) });
    });
    await act(async () => {});
    expect(cameraKeys.at(-1)).toBe(2);

    act(() => {
      setTreeState({ branchTable: makeBranchTable(4) });
    });
    await act(async () => {});
    expect(cameraKeys.at(-1)).toBe(3);
  });

  it('skips branches marked with the old SpreadGL B117 map-cleaning mask in TripsLayer data', () => {
    const branchTable = makeBranchTable(3);
    const graph = makeGraph(3);
    graph.nodes[1]!.annotations.spreadgl_map_exclude = 1;
    setTreeState({ branchTable, graph });
    render(<MapView />);

    const layer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { data: { branchId: number }[] }
      | undefined;
    expect(layer?.data.map((d) => d.branchId)).toEqual([0, 2]);
  });

  it('omits branches with unresolved geographic endpoints from TripsLayer data', () => {
    const branchTable = makeBranchTable(3);
    branchTable.startGeoResolved = new Uint8Array([1, 0, 1]);
    branchTable.endGeoResolved = new Uint8Array([1, 1, 1]);
    setTreeState({ branchTable });
    render(<MapView />);

    const layer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { data: { branchId: number }[] }
      | undefined;
    expect(layer?.data.map((d) => d.branchId)).toEqual([0, 2]);
  });

  it('skips branches marked with the old SpreadGL B117 map-cleaning mask in ArcLayer data', () => {
    const branchTable = makeBranchTable(3);
    const graph = makeGraph(3);
    graph.nodes[1]!.annotations.spreadgl_map_exclude = 1;
    setTreeState({ branchTable, graph });
    useTimelineStore.setState({ arcs: true });
    render(<MapView />);

    const layer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-slice') as
      | { data: { branchId: number }[] }
      | undefined;
    expect(layer?.data.map((d) => d.branchId)).toEqual([0, 2]);
  });

  it('omits branches with unresolved geographic endpoints from ArcLayer data', () => {
    const branchTable = makeBranchTable(3);
    branchTable.startGeoResolved = new Uint8Array([1, 1, 1]);
    branchTable.endGeoResolved = new Uint8Array([1, 0, 1]);
    setTreeState({ branchTable });
    useTimelineStore.setState({ arcs: true });
    render(<MapView />);

    const layer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-slice') as
      | { data: { branchId: number }[] }
      | undefined;
    expect(layer?.data.map((d) => d.branchId)).toEqual([0, 2]);
  });

  it('maps branch layer opacity 100 to the former 25% rendered opacity', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useUiStore.setState({
      layerVisibility: {
        branches: true,
        'hpd-polygons': true,
        'cluster-endpoints': true,
        'raster-overlay': true,
      },
      layerOpacity: {
        branches: 100,
        'hpd-polygons': 100,
        'cluster-endpoints': 100,
        'raster-overlay': 50,
      },
    });
    render(<MapView />);

    const layer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { opacity?: number }
      | undefined;
    expect(layer?.opacity).toBeCloseTo(0.25, 5);
  });

  it('shows the no-geo notice and renders no layers for an unrecognized trait', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({
      branchTable,
      traitInfo: { kind: 'unrecognized', reason: 'no geo annotations' },
    });
    render(<MapView />);
    // getByTestId throws if absent — presence is the assertion.
    expect(screen.getByTestId('map-no-geo-notice')).not.toBeNull();
    expect(screen.getByTestId('deckgl').getAttribute('data-layer-count')).toBe('0');
  });

  it('TripsLayer currentTime equals playhead (no fallback) — animation plays forward root → tips', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    // Default playhead in beforeEach is 2003.0.
    render(<MapView />);

    const layer = capturedLayers[0] as { currentTime: number };
    expect(Math.abs(layer.currentTime - 2003.0)).toBeLessThan(0.001);
  });

  it('TripsLayer currentTime reflects Zustand playhead when bounds is set and playhead > bounds.min', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({
      playhead: 2007.5,
      bounds: { min: 2003.0, max: 2010.0 },
    });
    render(<MapView />);

    const layer = capturedLayers[0] as { currentTime: number };
    expect(Math.abs(layer.currentTime - 2007.5)).toBeLessThan(0.001);
  });

  it('at bounds.min, currentTime tracks playhead (map empty until animation advances)', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({
      playhead: 2003.0,
      bounds: { min: 2003.0, max: 2010.0 },
    });
    render(<MapView />);

    const layer = capturedLayers[0] as { currentTime: number };
    expect(Math.abs(layer.currentTime - 2003.0)).toBeLessThan(0.001);
  });

  it('T041: container mousemove does not hover branch arcs', () => {
    const branchTable = makeBranchTable(3);
    const graph = makeGraph(3);
    setTreeState({ branchTable, graph });
    render(<MapView />);

    const container = screen.getByTestId('map-view');
    act(() => {
      fireEvent.mouseMove(container, { clientX: 100, clientY: 100 });
    });

    expect(useSelectionStore.getState().hoveredBranchId).toBeNull();
  });

  it('T041: container mousemove preserves existing branch hover while cluster hover runs', () => {
    const branchTable = makeBranchTable(3);
    const graph = makeGraph(3);
    setTreeState({ branchTable, graph });
    useSelectionStore.setState({ hoveredBranchId: 1, hoveredId: 'node_1' });
    render(<MapView />);

    const container = screen.getByTestId('map-view');
    act(() => {
      fireEvent.mouseMove(container, { clientX: 100, clientY: 100 });
    });

    expect(useSelectionStore.getState().hoveredBranchId).toBe(1);
    expect(useSelectionStore.getState().hoveredId).toBe('node_1');
  });

  it('T041: deck click on a branch sets pinnedSelection in UiStore', () => {
    const branchTable = makeBranchTable(3);
    const graph = makeGraph(3);
    setTreeState({ branchTable, graph });
    render(<MapView />);

    act(() => {
      capturedDeckOnClick?.({ object: { branchId: 0 } });
    });

    expect(useUiStore.getState().pinnedSelection?.branchId).toBe(0);
  });

  it('T041: container mouseleave clears hoveredBranchId', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useSelectionStore.setState({ hoveredBranchId: 5, hoveredId: null });
    render(<MapView />);

    const container = screen.getByTestId('map-view');
    act(() => {
      fireEvent.mouseLeave(container);
    });

    expect(useSelectionStore.getState().hoveredBranchId).toBeNull();
  });

  it('T053: adds PolygonLayer when nodeHpds has non-null entries active at playhead', () => {
    const branchTable = makeBranchTable(2);
    // branchId[0]=0, endTime[0]=2004.0 → node 0 active when playhead ≥ 2004.0
    const nodeHpds: (GeoJSONPolygon | null)[] = [
      {
        type: 'Polygon',
        coordinates: [
          [
            [-100, 40],
            [-99, 40],
            [-99, 41],
            [-100, 40],
          ],
        ],
      },
      null,
    ];
    setTreeState({ branchTable, nodeHpds });
    // HPDs default OFF — must opt in for them to render.
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    // Advance playhead past node 0's endTime (2004.0) so its polygon is active.
    useTimelineStore.setState({ playhead: 2004.5 });
    render(<MapView />);

    // 1 HPD polygon layer (full data, DataFilterExtension) + 2-stack TripsLayer = 3 total.
    expect(screen.getByTestId('deckgl').getAttribute('data-layer-count')).toBe('3');
    // Z-order: HPD polygons render underneath branches so translucent fills
    // don't wash arcs out.
    expect(capturedLayers[0]).toMatchObject({ id: 'hpd-polygons' });
    expect(capturedLayers[1]).toMatchObject({ id: 'branches-trail' });
    // filterRange must include nodeTime 2004.0 at playhead 2004.5 (Trail mode).
    const hpdLayer = capturedLayers[0] as { filterRange: [number, number] };
    expect(hpdLayer.filterRange[1]).toBeGreaterThanOrEqual(2004.0);
  });

  it('T053: no PolygonLayer when nodeHpds is empty or unset', () => {
    const branchTable = makeBranchTable(2);
    const allNull: (GeoJSONPolygon | null)[] = [null, null];
    setTreeState({ branchTable, nodeHpds: allNull });
    const { rerender } = render(<MapView />);

    // allHpdData is empty (all null entries) so HPD layer is omitted; 2-stack TripsLayer = 2.
    expect(screen.getByTestId('deckgl').getAttribute('data-layer-count')).toBe('2');

    setTreeState({ branchTable, nodeHpds: null });
    rerender(<MapView />);

    // No nodeHpds → allHpdData empty → no HPD layer; 2-stack TripsLayer = 2.
    expect(screen.getByTestId('deckgl').getAttribute('data-layer-count')).toBe('2');
  });

  it('T066: multi-modal HPD nodes render as a separate PolygonLayer with same fill style', () => {
    const branchTable = makeBranchTable(2);
    // branchId[0]=0, endTime[0]=2004.0 → node 0 active when playhead ≥ 2004.0
    const poly1: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    const poly2: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-105, 45],
          [-104, 45],
          [-104, 46],
          [-105, 45],
        ],
      ],
    };
    const nodeMultiHpds: (GeoJSONPolygon[] | null)[] = [[poly1, poly2], null];
    setTreeState({ branchTable, nodeMultiHpds });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    // Advance playhead past node 0's endTime (2004.0) so its polygons are active.
    useTimelineStore.setState({ playhead: 2004.5 });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).toContain('hpd-polygons-multi');
    // Z-order: multi-HPD renders before branches (same as unimodal HPD layer).
    const multiIdx = layerIds.indexOf('hpd-polygons-multi');
    const branchIdx = layerIds.indexOf('branches-trail');
    expect(multiIdx).toBeLessThan(branchIdx);
  });

  it('T066: multi-modal HPD layer absent when hpd-polygons visibility is false', () => {
    const branchTable = makeBranchTable(2);
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    const nodeMultiHpds: (GeoJSONPolygon[] | null)[] = [[poly]];
    setTreeState({ branchTable, nodeMultiHpds });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': false, 'cluster-endpoints': true },
    });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).not.toContain('hpd-polygons-multi');
  });

  it('T066: multi-modal HPD layer present when node has N ≥ 1 polygons', () => {
    const branchTable = makeBranchTable(1);
    // branchId[0]=0, endTime[0]=2004.0 → node 0 active when playhead ≥ 2004.0
    const makePolygon = (offset: number): GeoJSONPolygon => ({
      type: 'Polygon',
      coordinates: [
        [
          [-100 + offset, 40],
          [-99 + offset, 40],
          [-99 + offset, 41],
          [-100 + offset, 40],
        ],
      ],
    });
    const nodeMultiHpds: (GeoJSONPolygon[] | null)[] = [
      [makePolygon(0), makePolygon(5), makePolygon(10)],
    ];
    setTreeState({ branchTable, nodeMultiHpds });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    // Advance playhead past node 0's endTime (2004.0).
    useTimelineStore.setState({ playhead: 2004.5 });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).toContain('hpd-polygons-multi');
  });

  it('fix/hpd-time-gate: HPD polygon hidden (GPU-filtered) before playhead reaches node time (Trail mode)', () => {
    // makeBranchTable: branchId[0]=0, endTime[0]=2004.0.
    // Fix 2: layer is always present when allHpdData has entries; visibility is
    // controlled by filterRange (a GPU uniform). At playhead 2003.0, filterRange
    // upper bound is 2003.0, which excludes nodeTime 2004.0.
    const branchTable = makeBranchTable(2);
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    setTreeState({ branchTable, nodeHpds: [poly, null] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    // playhead 2003.0 < nodeTime 2004.0 → filterRange excludes the polygon GPU-side
    useTimelineStore.setState({ mode: 'Trail', playhead: 2003.0 });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    // Layer is present (Fix 2: full data, DataFilterExtension)
    expect(layerIds).toContain('hpd-polygons');
    // filterRange upper bound must be ≤ nodeTime 2004.0 so the polygon is GPU-filtered out
    const hpdLayer = capturedLayers.find((l) => (l as { id: string }).id === 'hpd-polygons') as {
      filterRange: [number, number];
    };
    expect(hpdLayer.filterRange[1]).toBeLessThan(2004.0);
  });

  it('fix/hpd-time-gate: HPD polygon active (filterRange includes node time) once playhead passes (Trail mode)', () => {
    const branchTable = makeBranchTable(2);
    // branchId[0]=0, endTime[0]=2004.0 → active at playhead ≥ 2004.0
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    setTreeState({ branchTable, nodeHpds: [poly, null] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    // playhead 2004.0 = nodeTime → filterRange upper bound = 2004.0 includes nodeTime
    useTimelineStore.setState({ mode: 'Trail', playhead: 2004.0 });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).toContain('hpd-polygons');
    // 1 HPD layer + 2-stack TripsLayer = 3 total layers
    expect(screen.getByTestId('deckgl').getAttribute('data-layer-count')).toBe('3');
    const hpdLayer = capturedLayers.find((l) => (l as { id: string }).id === 'hpd-polygons') as {
      filterRange: [number, number];
    };
    expect(hpdLayer.filterRange[1]).toBeGreaterThanOrEqual(2004.0);
  });

  it('fix/trail-time-gate: TripsLayer data is static and GPU-filtered before future caps draw', () => {
    // Tier 2 perf fix: tripData is now built once per branchTable (static).
    // TripsLayer uses currentTime for trail fade and DataFilterExtension for
    // start/end-time visibility, so future endpoints are discarded before draw.
    // This eliminates ~5 MB/frame GPU buffer re-uploads at max active-set.
    const branchTable = makeBranchTable(3);
    // makeBranchTable: startTime[i]=2003.0+0.5i, so min startTime = 2003.0.
    // App.tsx sets playhead = min - PRE_TMRCA_BUFFER (0.01) at t=0.
    setTreeState({ branchTable });
    useTimelineStore.setState({ mode: 'Trail', playhead: 2002.99 });
    render(<MapView />);

    // Static data: all 3 trips are present in data (GPU masks them via currentTime).
    const trailLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | {
          data: { timestamps: [number, number] }[];
          currentTime: number;
          filterRange: [[number, number], [number, number]];
          getFilterValue: (d: { timestamps: [number, number] }) => [number, number];
          extensions?: Array<{ filterSize?: number }>;
        }
      | undefined;
    expect(trailLayer).toBeDefined();
    if (!trailLayer) throw new Error('branches-trail layer missing');
    expect(trailLayer.data).toHaveLength(3);
    expect(trailLayer.extensions?.[0]?.filterSize).toBe(2);
    // currentTime = playhead for the trail shader.
    expect(trailLayer.currentTime).toBeCloseTo(2002.99, 3);
    // DataFilter dim-0 removes future trips by startTime before their caps draw.
    expect(trailLayer.filterRange[0][1]).toBeCloseTo(2002.99, 3);
    expect(trailLayer.filterRange[1][0]).toBeLessThanOrEqual(2002.99);
    // Each trip's minimum timestamp must equal branch.startTime (never 0 from a null fallback).
    for (let i = 0; i < 3; i++) {
      const datum = trailLayer.data[i];
      if (!datum) throw new Error(`trip datum ${i} missing`);
      const timestamps = datum.timestamps;
      const expectedStart = 2003.0 + i * 0.5;
      expect(timestamps[0]).toBeCloseTo(expectedStart, 3);
      expect(trailLayer.getFilterValue(datum)[0]).toBeCloseTo(expectedStart, 3);
    }
  });

  it('fix/hpd-time-gate: HPD polygon GPU-filtered in Window mode when node time falls outside window', () => {
    const branchTable = makeBranchTable(2);
    // node 0: endTime = 2004.0. Window [2005.0, 2007.0] at playhead 2007.0
    // → filterRange = [2005.0, 2007.0]; nodeTime 2004.0 < 2005.0 → GPU-filtered out
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    setTreeState({ branchTable, nodeHpds: [poly, null] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    useTimelineStore.setState({
      mode: 'Window',
      playhead: 2007.0,
      window: { start: 2005.0, end: 2007.0 },
    });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    // Layer is present (Fix 2: full data); filterRange excludes nodeTime 2004.0
    expect(layerIds).toContain('hpd-polygons');
    const hpdLayer = capturedLayers.find((l) => (l as { id: string }).id === 'hpd-polygons') as {
      filterRange: [number, number];
    };
    // filterRange lower bound = playhead - w = 2005.0 > nodeTime 2004.0
    expect(hpdLayer.filterRange[0]).toBeGreaterThan(2004.0);
    expect(hpdLayer.filterRange[1]).toBe(2007.0);
  });

  it('fix/hpd-time-gate: HPD polygon active (filterRange includes) in Window mode when node time is inside window', () => {
    const branchTable = makeBranchTable(2);
    // node 0: endTime = 2004.0. Window of width 2.0 at playhead 2005.5
    // → filterRange = [2003.5, 2005.5]; nodeTime 2004.0 ∈ [2003.5, 2005.5] → active
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    setTreeState({ branchTable, nodeHpds: [poly, null] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    useTimelineStore.setState({
      mode: 'Window',
      playhead: 2005.5,
      window: { start: 2003.5, end: 2005.5 },
    });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).toContain('hpd-polygons');
    const hpdLayer = capturedLayers.find((l) => (l as { id: string }).id === 'hpd-polygons') as {
      filterRange: [number, number];
    };
    // filterRange = [2003.5, 2005.5] includes nodeTime 2004.0
    expect(hpdLayer.filterRange[0]).toBeLessThanOrEqual(2004.0);
    expect(hpdLayer.filterRange[1]).toBeGreaterThanOrEqual(2004.0);
  });

  it('fix/hpd-time-gate: multi-modal HPD layer present with filterRange excluding early playhead', () => {
    const branchTable = makeBranchTable(2);
    // node 0: endTime = 2004.0. playhead 2003.0 → upper filter bound excludes nodeTime 2004.0
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    setTreeState({ branchTable, nodeMultiHpds: [[poly], null] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    useTimelineStore.setState({ mode: 'Trail', playhead: 2003.0 });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    // Layer is present (Fix 2: full data); filterRange GPU-filters out nodeTime 2004.0
    expect(layerIds).toContain('hpd-polygons-multi');
    const multiLayer = capturedLayers.find(
      (l) => (l as { id: string }).id === 'hpd-polygons-multi',
    ) as { filterRange: [number, number] };
    expect(multiLayer.filterRange[1]).toBeLessThan(2004.0);
  });

  it('fix/hpd-index-align: multi-HPD active when branchId values skip the root index (real-tree layout)', () => {
    // Regression for the real-tree case where graph.nodes[0] is the root and has no
    // branch entry. branchId[0..2] = [1, 2, 3] (non-zero, skipping root=0).
    // nodeMultiHpds is indexed by graph position; HPD data is at positions 1, 2, 3.
    // If nodeEndTimeMap were built using row indices (0,1,2) instead of branchId values
    // (1,2,3) the map would miss the HPD nodes entirely and the layer would not render.
    const count = 3;
    const bt: BranchTable = {
      count,
      branchId: new Int32Array([1, 2, 3]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array([2003.0, 2003.5, 2003.8]),
      endTime: new Float32Array([2004.0, 2004.5, 2005.0]),
      startLat: new Float32Array(count).fill(40),
      startLon: new Float32Array(count).fill(-100),
      endLat: new Float32Array(count).fill(41),
      endLon: new Float32Array(count).fill(-99),
      stateWeight: new Float32Array(count).fill(1),
    };
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    // positions: 0 = root (no branch entry, no HPD), 1..3 = real nodes with HPD
    const nodeMultiHpds: (GeoJSONPolygon[] | null)[] = [null, [poly], [poly], [poly]];
    setTreeState({ branchTable: bt, nodeMultiHpds });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    // End playhead: all nodes active
    useTimelineStore.setState({ mode: 'Trail', playhead: 2006.0 });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).toContain('hpd-polygons-multi');
  });

  it('fix/root-hpd-t0: root HPD polygon hidden at t=0 (playhead before minStartTime)', () => {
    // Regression: root node (index 0) has no branch row, so nodeEndTimeMap used to
    // fall through to ?? 0. nodeTime=0 passes filterRange at every playhead, leaking
    // the root's HPD polygon(s) at t=0 before any node is active.
    // Fix: root index is resolved to minStartTime; fallback is +Infinity (always hidden).
    const count = 3;
    const bt: BranchTable = {
      count,
      branchId: new Int32Array([1, 2, 3]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array([2015.0, 2016.0, 2017.0]),
      endTime: new Float32Array([2016.0, 2017.0, 2018.0]),
      startLat: new Float32Array(count).fill(40),
      startLon: new Float32Array(count).fill(-100),
      endLat: new Float32Array(count).fill(41),
      endLon: new Float32Array(count).fill(-99),
      stateWeight: new Float32Array(count).fill(1),
    };
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    // Root (index 0) has multi-HPD polygons; child nodes 1-3 do not.
    const nodeMultiHpds: (GeoJSONPolygon[] | null)[] = [[poly, poly], null, null, null];
    setTreeState({ branchTable: bt, nodeMultiHpds });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    // t=0: playhead is a hair before the TMRCA (minStartTime = 2015.0).
    useTimelineStore.setState({ mode: 'Trail', playhead: 2014.99 });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).toContain('hpd-polygons-multi');
    const multiLayer = capturedLayers.find(
      (l) => (l as { id: string }).id === 'hpd-polygons-multi',
    ) as { filterRange: [number, number] };
    // filterRange upper = 2014.99; root nodeTime = 2015.0 → GPU-filtered out
    expect(multiLayer.filterRange[1]).toBeLessThan(2015.0);
  });

  it('fix/root-hpd-t0: root HPD polygon visible once playhead reaches root time', () => {
    const count = 3;
    const bt: BranchTable = {
      count,
      branchId: new Int32Array([1, 2, 3]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array([2015.0, 2016.0, 2017.0]),
      endTime: new Float32Array([2016.0, 2017.0, 2018.0]),
      startLat: new Float32Array(count).fill(40),
      startLon: new Float32Array(count).fill(-100),
      endLat: new Float32Array(count).fill(41),
      endLon: new Float32Array(count).fill(-99),
      stateWeight: new Float32Array(count).fill(1),
    };
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    const nodeMultiHpds: (GeoJSONPolygon[] | null)[] = [[poly, poly], null, null, null];
    setTreeState({ branchTable: bt, nodeMultiHpds });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    // Playhead at root time (2015.0) → filterRange upper = 2015.0 ≥ rootNodeTime 2015.0
    useTimelineStore.setState({ mode: 'Trail', playhead: 2015.0 });
    render(<MapView />);

    const multiLayer = capturedLayers.find(
      (l) => (l as { id: string }).id === 'hpd-polygons-multi',
    ) as { filterRange: [number, number] };
    expect(multiLayer).toBeDefined();
    expect(multiLayer.filterRange[1]).toBeGreaterThanOrEqual(2015.0);
  });

  it('T054: ScatterplotLayer present for discrete-trait tree', () => {
    const branchTable = makeBranchTable(3);
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      values: ['A', 'B', 'C'],
      ambiguous: false,
    };
    // Cluster universe is keyed off trait values + their coordinates; the
    // coords here match makeBranchTable's endLat/endLon (41+i, -99+i).
    const discreteGeoLookup = new Map<string, [number, number]>([
      ['A', [41, -99]],
      ['B', [42, -98]],
      ['C', [43, -97]],
    ]);
    setTreeState({ branchTable, traitInfo, discreteGeoLookup });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).toContain('cluster-endpoints');
  });

  it('T054: no ScatterplotLayer for continuous-trait tree (YFV)', () => {
    const branchTable = makeBranchTable(3);
    const traitInfo: IntrospectResult = {
      kind: 'continuous',
      keyFamily: { lat: 'location1', lon: 'location2' },
      wgs84: true,
    };
    setTreeState({ branchTable, traitInfo });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).not.toContain('cluster-endpoints');
  });

  it('T054: no ScatterplotLayer when traitInfo is null', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable, traitInfo: null });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).not.toContain('cluster-endpoints');
  });

  it('cluster opacity slider re-runs getFillColor/getLineColor via updateTriggers', () => {
    const branchTable = makeBranchTable(3);
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      values: ['A', 'B', 'C'],
      ambiguous: false,
    };
    const discreteGeoLookup = new Map<string, [number, number]>([
      ['A', [41, -99]],
      ['B', [42, -98]],
      ['C', [43, -97]],
    ]);
    setTreeState({ branchTable, traitInfo, discreteGeoLookup });
    useUiStore.setState({
      layerVisibility: { branches: true, 'cluster-endpoints': true },
      layerOpacity: { 'cluster-endpoints': 50 },
    });
    render(<MapView />);
    const cluster = (
      capturedLayers as { id: string; updateTriggers?: Record<string, unknown> }[]
    ).find((l) => l.id === 'cluster-endpoints');
    expect(cluster?.updateTriggers?.getFillColor).toBe(50);
  });

  it('stacks duplicate DTA jump arcs for the same location pair at increasing heights', () => {
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      values: ['A', 'B'],
      ambiguous: false,
    };
    const discreteGeoLookup = new Map<string, [number, number]>([
      ['A', [40, -100]],
      ['B', [41, -99]],
    ]);
    setTreeState({
      traitInfo,
      discreteGeoLookup,
      logTable: {
        columnNames: ['state', 'location.count.A.B', 'location.count.B.A'],
        columns: [new Float64Array([0]), new Float64Array([2]), new Float64Array([1])],
        rowCount: 1,
      },
    });
    useUiStore.setState({ dtaMapOverlay: 'jumps' });

    render(<MapView />);

    const layer = capturedLayers.find((l) => (l as { id?: string }).id === 'markov-jump-arcs') as
      | {
          data: Array<{
            sourcePosition: [number, number];
            targetPosition: [number, number];
            stackIndex: number;
            stackCount: number;
          }>;
          getHeight: (d: {
            sourcePosition: [number, number];
            targetPosition: [number, number];
            stackIndex: number;
            stackCount: number;
          }) => number;
        }
      | undefined;
    expect(layer).toBeDefined();
    if (!layer) return;
    const first = layer.data[0];
    const second = layer.data[1];
    expect(layer.data).toHaveLength(2);
    expect(layer.data.map((d) => d.stackIndex)).toEqual([0, 1]);
    expect(layer.data.map((d) => d.stackCount)).toEqual([2, 2]);
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    expect(layer.getHeight(first)).toBeCloseTo(0.6);
    expect(layer.getHeight(second)).toBeCloseTo(0.7);
  });

  it('BF overlay: draws coloured arcs and hoverable location points with in/out counts', () => {
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      // C has coordinates but no supported route → it must NOT get a point.
      values: ['A', 'B', 'C'],
      ambiguous: false,
    };
    const discreteGeoLookup = new Map<string, [number, number]>([
      ['A', [40, -100]],
      ['B', [41, -99]],
      ['C', [42, -98]],
    ]);
    setTreeState({
      traitInfo,
      discreteGeoLookup,
      logTable: {
        columnNames: ['state', 'location.indicators.0'],
        columns: [new Float64Array([0]), new Float64Array([1])],
        rowCount: 1,
      },
    });
    useUiStore.setState({ dtaMapOverlay: 'bf', symmetryMode: 'symmetric', bssvsBfThreshold: 0 });

    render(<MapView />);

    const arcs = capturedLayers.find((l) => (l as { id?: string }).id === 'bssvs-bf-arcs') as
      | { data: Array<{ color: [number, number, number] }> }
      | undefined;
    expect(arcs).toBeDefined();
    expect(arcs?.data[0]?.color).toHaveLength(3);

    const points = capturedLayers.find((l) => (l as { id?: string }).id === 'bssvs-bf-locations') as
      | { data: Array<{ name: string; incoming: number; outgoing: number }> }
      | undefined;
    expect(points).toBeDefined();
    // Only A and B are touched by the single A→B route; C is omitted.
    expect(points?.data.map((d) => d.name).sort()).toEqual(['A', 'B']);
    expect(points?.data.find((d) => d.name === 'A')).toMatchObject({ outgoing: 1, incoming: 0 });
    expect(points?.data.find((d) => d.name === 'B')).toMatchObject({ outgoing: 0, incoming: 1 });
  });

  it('stacks duplicate main map arcs for the same location pair at increasing heights', () => {
    const branchTable: BranchTable = {
      count: 2,
      branchId: new Int32Array([0, 1]),
      parentBranch: new Int32Array(2),
      isInternal: new Uint8Array(2),
      startTime: new Float32Array([2000, 2001]),
      endTime: new Float32Array([2001, 2002]),
      startLat: new Float32Array([40, 41]),
      startLon: new Float32Array([-100, -99]),
      endLat: new Float32Array([41, 40]),
      endLon: new Float32Array([-99, -100]),
      stateWeight: new Float32Array(2).fill(1),
    };
    setTreeState({ branchTable });
    useTimelineStore.setState({ arcs: true, playhead: 2002 });

    render(<MapView />);

    const layer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-slice') as
      | {
          data: Array<{
            sourcePosition: [number, number];
            targetPosition: [number, number];
            stackIndex: number;
            stackCount: number;
          }>;
          getHeight: (d: {
            sourcePosition: [number, number];
            targetPosition: [number, number];
            stackIndex: number;
            stackCount: number;
          }) => number;
        }
      | undefined;
    expect(layer).toBeDefined();
    if (!layer) return;
    const first = layer.data[0];
    const second = layer.data[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    expect(layer.data.map((d) => d.stackIndex)).toEqual([0, 1]);
    expect(layer.data.map((d) => d.stackCount)).toEqual([2, 2]);
    expect(layer.getHeight(first)).toBeCloseTo(0.6);
    expect(layer.getHeight(second)).toBeCloseTo(0.7);
  });

  it('T055b: Trail mode → trailLength is effectively infinite (1e9 to avoid Infinity-as-uniform GPU bug)', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ mode: 'Trail', window: null });
    render(<MapView />);

    const layer = capturedLayers[0] as { trailLength: number };
    expect(layer.trailLength).toBeGreaterThanOrEqual(1e9);
    expect(Number.isFinite(layer.trailLength)).toBe(true);
  });

  it('T055b: Window mode with window set → trailLength = window.end - window.start', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ mode: 'Window', window: { start: 2003.0, end: 2008.5 } });
    render(<MapView />);

    const layer = capturedLayers[0] as { trailLength: number };
    expect(Math.abs(layer.trailLength - 5.5)).toBeLessThan(0.001);
  });

  it('fix/arcs-default: on first mount with branchTable + arcs=true (default), ArcLayer with id branches-slice is in layers array without any toggle', () => {
    // Regression for Bug A: arcs hidden by default on B.1.1.7.
    // Root cause was that the zoom-value debounce in onViewStateChange (PR #194) fired
    // a false-positive zoom-start on the initial camera-fit viewState change, setting
    // wasInteractingRef and potentially corrupting the auto-pause state machine on first load.
    // The structural fix moves wheel-zoom detection to a DOM wheel listener so camera-fit
    // viewState changes (which don't emit wheel events) can't trigger a false positive.
    // This test verifies that arc layer is present with data on the very first render —
    // no toggle required.
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ arcs: true, playhead: 2003.0 });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).toContain('branches-slice');
    const arcLayer = capturedLayers.find((l) => (l as { id: string }).id === 'branches-slice') as
      | { data: unknown[] }
      | undefined;
    expect(arcLayer).toBeDefined();
    expect(arcLayer!.data).toHaveLength(3);
  });

  it('T055c: Arcs toggle → primary layers are ArcLayers (10-stack core)', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ arcs: true, playhead: 2003.0 });
    render(<MapView />);

    // 10 stacked core passes. The top pickable pass keeps the canonical
    // 'branches-slice' id; the rest carry 'branches-slice-stack-N' ids.
    expect(capturedLayers).toHaveLength(10);
    expect(capturedLayers[0]?.constructor?.name).toBe('ArcLayer');
    expect(capturedLayers[0]).toMatchObject({ id: 'branches-slice' });
    // Spot-check the deepest stack copy.
    expect(capturedLayers[9]).toMatchObject({ id: 'branches-slice-stack-9' });
  });

  it('perf/B117: large arc datasets use a single ArcLayer pass', () => {
    const branchTable = makeBranchTable(10_001);
    setTreeState({ branchTable });
    useTimelineStore.setState({ arcs: true, playhead: 2003.0 });
    render(<MapView />);

    const branchLayers = (capturedLayers as { id: string }[]).filter((layer) =>
      layer.id.startsWith('branches-slice'),
    );
    expect(branchLayers).toHaveLength(1);
    expect(branchLayers[0]).toMatchObject({ id: 'branches-slice' });
  });

  it('T055c: Arcs toggle → arc data is static (full array), GPU-masked by filterRange (Tier 2)', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    // Tier 2 perf fix: arcData is now static; DataFilterExtension (filterSize=2) gates visibility GPU-side.
    // Trail mode: dim-0 gates startTime ≤ playhead; dim-1 is a finite no-op.
    // At playhead 2003.0, only branches with startTime ≤ 2003.0 are visible GPU-side.
    useTimelineStore.setState({ arcs: true, playhead: 2003.0 });
    render(<MapView />);

    // Static data: all 3 arcs present in JS-side data array.
    const layer = capturedLayers[0] as {
      data: unknown[];
      filterRange?: [[number, number], [number, number]];
    };
    expect(layer.data).toHaveLength(3);
    // dim-0 upper = playhead (2003.0) → GPU masks arcs with startTime > 2003.0.
    const fr = layer.filterRange;
    expectFiniteArcFilterRange(fr);
    expect(fr[0][1]).toBeCloseTo(2003.0, 3);
    // dim-1 is no-op for all finite branch end times.
    expect(fr[1][0]).toBeLessThanOrEqual(2004.0);
    expect(fr[1][1]).toBeGreaterThanOrEqual(2005.0);
  });

  it('T055c: ArcLayer DataFilterExtension matches the Trail activity predicate', () => {
    // 3 branches with known times:
    //   #0: startTime=2000.0, endTime=2003.0  → in-flight at playhead=2001.5 (startTime ≤ 2001.5)
    //   #1: startTime=2002.0, endTime=2002.5  → not yet started at playhead=2001.5
    //   #2: startTime=2004.0, endTime=2005.0  → not yet started at playhead=2001.5
    // filterSize=2 always; Trail uses dim-1 as a finite no-op.
    const count = 3;
    const bt: BranchTable = {
      count,
      branchId: new Int32Array([0, 1, 2]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array([2000.0, 2002.0, 2004.0]),
      endTime: new Float32Array([2003.0, 2002.5, 2005.0]),
      startLat: new Float32Array(count).fill(40),
      startLon: new Float32Array(count).fill(-100),
      endLat: new Float32Array(count).fill(41),
      endLon: new Float32Array(count).fill(-99),
      stateWeight: new Float32Array(count).fill(1),
    };
    setTreeState({ branchTable: bt });
    useTimelineStore.setState({ arcs: true, mode: 'Trail', playhead: 2001.5 });
    render(<MapView />);

    const arcLayer = capturedLayers[0] as {
      data: { startTime: number; endTime: number }[];
      filterRange?: [[number, number], [number, number]];
      getFilterValue?: (d: { startTime: number; endTime: number }) => [number, number];
    };
    expect(arcLayer).toBeDefined();
    // Trail predicate: visible iff startTime ≤ playhead; dim-0 upper = playhead.
    const fr = arcLayer.filterRange;
    expectFiniteArcFilterRange(fr);
    expect(fr[0][1]).toBeCloseTo(2001.5, 3);
    // dim-1 is no-op.
    expect(fr[1][0]).toBeLessThanOrEqual(2002.5);
    expect(fr[1][1]).toBeGreaterThanOrEqual(2005.0);

    // Verify getFilterValue returns [startTime, endTime] for each datum.
    const gfv = arcLayer.getFilterValue;
    expect(gfv).toBeDefined();
    const d0 = arcLayer.data[0]!;
    const d1 = arcLayer.data[1]!;
    const d2 = arcLayer.data[2]!;
    expect(gfv!(d0)[0]).toBeCloseTo(d0.startTime, 3); // dim-0 = startTime
    expect(gfv!(d0)[1]).toBeCloseTo(d0.endTime, 3); // dim-1 = endTime
    expect(gfv!(d1)[0]).toBeCloseTo(d1.startTime, 3);
    expect(gfv!(d2)[0]).toBeCloseTo(d2.startTime, 3);

    // Confirm correct visibility per datum via dim-0 (startTime) predicate.
    const [lo0, hi0] = fr[0];
    expect(lo0 <= gfv!(d0)[0] && gfv!(d0)[0] <= hi0).toBe(true); // visible
    expect(lo0 <= gfv!(d1)[0] && gfv!(d1)[0] <= hi0).toBe(false); // GPU-hidden
    expect(lo0 <= gfv!(d2)[0] && gfv!(d2)[0] <= hi0).toBe(false); // GPU-hidden
  });

  it('T055c: ArcLayer DataFilterExtension matches the Window activity predicate', () => {
    // Window mode predicate: startTime ≤ playhead AND endTime ≥ (playhead - windowSize)
    // windowSize = 0.5, playhead = 2003.0 → window = [2002.5, 2003.0]
    //   #0: startTime=2000.0, endTime=2002.4 → endTime < 2002.5 → outside window (pre-window)
    //   #1: startTime=2002.0, endTime=2002.8 → startTime ≤ 2003.0 AND endTime ≥ 2002.5 → inside
    //   #2: startTime=2003.5, endTime=2004.0 → startTime > 2003.0 → not yet started
    const count = 3;
    const bt: BranchTable = {
      count,
      branchId: new Int32Array([0, 1, 2]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array([2000.0, 2002.0, 2003.5]),
      endTime: new Float32Array([2002.4, 2002.8, 2004.0]),
      startLat: new Float32Array(count).fill(40),
      startLon: new Float32Array(count).fill(-100),
      endLat: new Float32Array(count).fill(41),
      endLon: new Float32Array(count).fill(-99),
      stateWeight: new Float32Array(count).fill(1),
    };
    setTreeState({ branchTable: bt });
    useTimelineStore.setState({
      arcs: true,
      mode: 'Window',
      playhead: 2003.0,
      window: { start: 2002.5, end: 2003.0 },
    });
    render(<MapView />);

    const arcLayer = capturedLayers[0] as {
      data: { startTime: number; endTime: number }[];
      filterRange?: [[number, number], [number, number]];
      getFilterValue?: (d: { startTime: number; endTime: number }) => [number, number];
    };
    expect(arcLayer).toBeDefined();

    // Window mode uses 2D filter: dim-0 = startTime, dim-1 = endTime.
    const fr = arcLayer.filterRange;
    expectFiniteArcFilterRange(fr);
    // dim-0 range upper = playhead → gates startTime ≤ playhead
    expect(fr[0][1]).toBeCloseTo(2003.0, 3);
    // dim-1 range lower = playhead - w = 2002.5 → gates endTime ≥ 2002.5
    expect(fr[1][0]).toBeCloseTo(2002.5, 3);

    const gfv = arcLayer.getFilterValue;
    expect(gfv).toBeDefined();
    const d0 = arcLayer.data[0]!; // endTime=2002.4 < 2002.5 → dim-1 fails → hidden
    const d1 = arcLayer.data[1]!; // both dims pass → visible
    const d2 = arcLayer.data[2]!; // startTime=2003.5 > 2003.0 → dim-0 fails → hidden

    const [st0, et0] = gfv!(d0);
    const [st1, et1] = gfv!(d1);
    const [st2, _et2] = gfv!(d2);

    // d0: pre-window (endTime expired)
    expect(fr[0][0] <= st0 && st0 <= fr[0][1]).toBe(true); // startTime passes dim-0
    expect(fr[1][0] <= et0 && et0 <= fr[1][1]).toBe(false); // endTime fails dim-1 → hidden

    // d1: inside window
    expect(fr[0][0] <= st1 && st1 <= fr[0][1]).toBe(true); // startTime passes dim-0
    expect(fr[1][0] <= et1 && et1 <= fr[1][1]).toBe(true); // endTime passes dim-1 → visible

    // d2: not yet started
    expect(fr[0][0] <= st2 && st2 <= fr[0][1]).toBe(false); // startTime fails dim-0 → hidden
  });

  it('fix/window-mode-arcs: DataFilterExtension filterSize=2 in Trail mode', () => {
    // Regression: before this fix, Trail used filterSize=1 and Window used filterSize=2.
    // deck.gl reuses layer instances by ID; the GPU shader binding stayed at filterSize=1
    // when mode switched Trail→Window, silently filtering out all arcs in Window mode.
    // Now filterSize=2 is constant; the layer instance never needs to change its shader binding.
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ arcs: true, mode: 'Trail', playhead: 2003.0 });
    render(<MapView />);

    const layer = capturedLayers[0] as { extensions?: { filterSize: number }[] };
    expect(layer.extensions).toBeDefined();
    const ext = layer.extensions ?? [];
    expect(ext[0]?.filterSize).toBe(2);
  });

  it('fix/window-mode-arcs: DataFilterExtension filterSize=2 in Window mode', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({
      arcs: true,
      mode: 'Window',
      playhead: 2003.0,
      window: { start: 2002.5, end: 2003.0 },
    });
    render(<MapView />);

    const layer = capturedLayers[0] as { extensions?: { filterSize: number }[] };
    expect(layer.extensions).toBeDefined();
    const ext = layer.extensions ?? [];
    expect(ext[0]?.filterSize).toBe(2);
  });

  it('fix/arcs-time-gate: ArcLayers reuse a stable DataFilterExtension instance', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ arcs: true, mode: 'Trail', playhead: 2003.0 });
    render(<MapView />);

    const first = capturedLayers[0] as { extensions?: unknown[] };
    const second = capturedLayers[1] as { extensions?: unknown[] };
    expect(first.extensions?.[0]).toBeDefined();
    expect(first.extensions?.[0]).toBe(second.extensions?.[0]);
  });

  it('fix/window-mode-arcs: Window mode with null timeWindow falls back to Trail-like no-op dim-1', () => {
    // When Window mode is active but timeWindow is null (not yet initialized),
    // dim-1 must be a finite no-op range so no arcs are hidden by the second dimension.
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({
      arcs: true,
      mode: 'Window',
      playhead: 2003.0,
      window: null,
    });
    render(<MapView />);

    const layer = capturedLayers[0] as {
      filterRange?: [[number, number], [number, number]];
    };
    const fr = layer.filterRange;
    expectFiniteArcFilterRange(fr);
    // dim-0 still gates startTime ≤ playhead
    expect(fr[0][1]).toBeCloseTo(2003.0, 3);
    // dim-1 is no-op
    expect(fr[1][0]).toBeLessThanOrEqual(2004.0);
    expect(fr[1][1]).toBeGreaterThanOrEqual(2005.0);
  });

  it('T055c: Trail mode → TripsLayer present, no ArcLayer', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ mode: 'Trail' });
    render(<MapView />);

    // [0] is the top pickable stack with the canonical 'branches-trail' id.
    expect(capturedLayers[0]?.constructor?.name).toBe('TripsLayer');
    expect(capturedLayers[0]).toMatchObject({ id: 'branches-trail' });
  });

  it('T055c: Clade toggle with subtreeRootId → data filtered to subtree branches', () => {
    // Tree (directed): node_0 → node_1 → node_2. Selecting node_1 as the
    // subtree root should pick {node_1, node_2}, dropping node_0 (the root).
    const branchTable = makeBranchTable(3);
    const graph: PhyloGraph = {
      nodes: [
        {
          idx: 0,
          origId: 'node_0',
          name: null,
          label: null,
          annotations: {},
          adjacents: [1],
          lengths: [],
        },
        {
          idx: 1,
          origId: 'node_1',
          name: null,
          label: null,
          annotations: {},
          adjacents: [0, 2],
          lengths: [1],
        },
        {
          idx: 2,
          origId: 'node_2',
          name: null,
          label: null,
          annotations: {},
          adjacents: [1],
          lengths: [1],
        },
      ],
      root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
      origIdToIdx: new Map([
        ['node_0', 0],
        ['node_1', 1],
        ['node_2', 2],
      ]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
    const layout = {
      nodes: [
        {
          id: 'node_0',
          x: 0,
          y: 0,
          isTip: false,
          parentId: null,
          children: ['node_1'],
          annotations: {},
        },
        {
          id: 'node_1',
          x: 1,
          y: 0,
          isTip: false,
          parentId: 'node_0',
          children: ['node_2'],
          annotations: {},
        },
        {
          id: 'node_2',
          x: 2,
          y: 0,
          isTip: true,
          parentId: 'node_1',
          children: [],
          annotations: {},
        },
      ],
      nodeMap: new Map([
        [
          'node_0',
          {
            id: 'node_0',
            x: 0,
            y: 0,
            isTip: false,
            parentId: null,
            children: ['node_1'],
            annotations: {},
          },
        ],
        [
          'node_1',
          {
            id: 'node_1',
            x: 1,
            y: 0,
            isTip: false,
            parentId: 'node_0',
            children: ['node_2'],
            annotations: {},
          },
        ],
        [
          'node_2',
          {
            id: 'node_2',
            x: 2,
            y: 0,
            isTip: true,
            parentId: 'node_1',
            children: [],
            annotations: {},
          },
        ],
      ]),
      maxX: 2,
      maxY: 0,
      xAxisMode: 'date' as const,
    };
    setTreeState({ branchTable, graph, layout });
    // Advance playhead past all branch start times so isBranchActive (the
    // JS-side time-gate now applied universally to trips after fix/trail-
    // and-hpd-time-gate-at-t0) doesn't drop branches; the Clade filter is
    // the only filter under test here.
    useTimelineStore.setState({ clade: true, subtreeRootId: 'node_1', playhead: 2005.0 });
    render(<MapView />);

    // TripsLayer (mock) stores data directly in this.data
    const layer = capturedLayers[0] as { data: unknown[] };
    // Filtered to branchIds 1 and 2 (subtree rooted at node_1); node_0 excluded
    expect(layer.data).toHaveLength(2);
  });

  it('T060: GeoJsonLayer added when customOverlay is visible', () => {
    const branchTable = makeBranchTable(2);
    const geojsonData = {
      type: 'FeatureCollection' as const,
      features: [],
    };
    setTreeState({
      branchTable,
      customOverlays: [{ id: 'overlay-1', name: 'china', data: geojsonData }],
    });
    useUiStore.setState({
      layerVisibility: {
        branches: true,
        'hpd-polygons': true,
        'cluster-endpoints': true,
        'overlay-1': true,
      },
    });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).toContain('overlay-1');
    const geoLayer = capturedLayers.find((l) => (l as { id: string }).id === 'overlay-1');
    expect(geoLayer?.constructor?.name).toBe('GeoJsonLayer');
  });

  it('T060: GeoJsonLayer absent when customOverlay visibility is false', () => {
    const branchTable = makeBranchTable(2);
    const geojsonData = {
      type: 'FeatureCollection' as const,
      features: [],
    };
    setTreeState({
      branchTable,
      customOverlays: [{ id: 'overlay-1', name: 'china', data: geojsonData }],
    });
    useUiStore.setState({
      layerVisibility: {
        branches: true,
        'hpd-polygons': true,
        'cluster-endpoints': true,
        'overlay-1': false,
      },
    });
    render(<MapView />);

    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).not.toContain('overlay-1');
  });

  it('fix/bug-93: MapView DeckGL receives id="map-view-deck" so concurrent tree-view-deck instance does not share DOM IDs', () => {
    // Unique DeckGL ids prevent concurrent map/tree instances from sharing default DOM ids.
    render(<MapView />);
    expect(capturedDeckGLId).toBe('map-view-deck');
  });

  it('T082.5: deselecting a geographic trait value drops its arcs from the TripsLayer data', () => {
    // 3 branches: branchId 0 → location A, branchId 1 → location B, branchId 2 → location A.
    // Deselect "A" → only branchId 1 (location B) should remain in trip data.
    const count = 3;
    const branchTable: BranchTable = {
      count,
      branchId: new Int32Array([0, 1, 2]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array([2003.0, 2003.0, 2003.0]),
      endTime: new Float32Array([2004.0, 2004.0, 2004.0]),
      startLat: new Float32Array(count).fill(40),
      startLon: new Float32Array(count).fill(-100),
      endLat: new Float32Array(count).fill(41),
      endLon: new Float32Array(count).fill(-99),
      stateWeight: new Float32Array(count).fill(1),
    };
    const graph: PhyloGraph = {
      nodes: [
        {
          idx: 0,
          origId: 'n0',
          name: null,
          label: null,
          annotations: { location: 'A' },
          adjacents: [],
          lengths: [],
        },
        {
          idx: 1,
          origId: 'n1',
          name: null,
          label: null,
          annotations: { location: 'B' },
          adjacents: [],
          lengths: [],
        },
        {
          idx: 2,
          origId: 'n2',
          name: null,
          label: null,
          annotations: { location: 'A' },
          adjacents: [],
          lengths: [],
        },
      ],
      root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
      origIdToIdx: new Map([
        ['n0', 0],
        ['n1', 1],
        ['n2', 2],
      ]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      values: ['A', 'B'],
      ambiguous: false,
    };
    setTreeState({ branchTable, graph, traitInfo });
    useTimelineStore.setState({ playhead: 2005.0 });
    useUiStore.setState({
      colorByKey: 'location',
      deselectedValues: new Set(['A']),
    });

    render(<MapView />);

    const trailLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { data: { branchId: number }[] }
      | undefined;
    expect(trailLayer).toBeDefined();
    expect(trailLayer!.data).toHaveLength(1);
    expect(trailLayer!.data[0]?.branchId).toBe(1);
  });

  it('T082.5: deselecting a value does NOT filter map arcs when colorByKey is a non-geographic secondary trait', () => {
    const count = 2;
    const branchTable: BranchTable = {
      count,
      branchId: new Int32Array([0, 1]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array([2003.0, 2003.0]),
      endTime: new Float32Array([2004.0, 2004.0]),
      startLat: new Float32Array(count).fill(40),
      startLon: new Float32Array(count).fill(-100),
      endLat: new Float32Array(count).fill(41),
      endLon: new Float32Array(count).fill(-99),
      stateWeight: new Float32Array(count).fill(1),
    };
    const graph: PhyloGraph = {
      nodes: [
        {
          idx: 0,
          origId: 'n0',
          name: null,
          label: null,
          annotations: { location1: '40', location2: '-100', ecoregion: 'Tropical' },
          adjacents: [],
          lengths: [],
        },
        {
          idx: 1,
          origId: 'n1',
          name: null,
          label: null,
          annotations: { location1: '41', location2: '-99', ecoregion: 'Arid' },
          adjacents: [],
          lengths: [],
        },
      ],
      root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
      origIdToIdx: new Map([
        ['n0', 0],
        ['n1', 1],
      ]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
    const traitInfo: IntrospectResult = {
      kind: 'continuous',
      keyFamily: { lat: 'location1', lon: 'location2' },
      wgs84: false,
    };
    setTreeState({ branchTable, graph, traitInfo, allDiscreteKeys: ['ecoregion'] });
    useTimelineStore.setState({ playhead: 2005.0 });
    useUiStore.setState({
      colorByKey: 'ecoregion',
      deselectedValues: new Set(['Tropical']),
    });

    render(<MapView />);

    const trailLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { data: unknown[] }
      | undefined;
    expect(trailLayer).toBeDefined();
    expect(trailLayer!.data).toHaveLength(2);
  });

  it('chore/theme-basemap: flipping theme from dark to light switches basemap', () => {
    useUiStore.setState({ theme: 'dark' });
    const { rerender } = render(<MapView />);
    expect(capturedMapStyle).toBe(
      'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    );

    useUiStore.setState({ theme: 'light' });
    rerender(<MapView />);
    expect(capturedMapStyle).toBe('https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json');
  });

  it('chore/theme-basemap: system theme OS flip dark→light re-styles the basemap', () => {
    let changeListener: ((e: MediaQueryListEvent) => void) | null = null;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => {
          changeListener = fn;
        },
        removeEventListener: vi.fn(),
      })),
    });
    useUiStore.setState({ theme: 'system' });
    render(<MapView />);
    expect(capturedMapStyle).toBe(
      'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    );

    act(() => {
      changeListener?.({ matches: false } as MediaQueryListEvent);
    });
    expect(capturedMapStyle).toBe('https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json');
  });

  it('fix/hpd-polygon-visibility: HPD opacity tracks the layer slider without a multiplier', () => {
    const branchTable = makeBranchTable(2);
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    setTreeState({ branchTable, nodeHpds: [poly, null] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
      layerOpacity: { 'hpd-polygons': 100 },
    });
    useTimelineStore.setState({ mode: 'Trail', playhead: 2004.5 });
    const { rerender } = render(<MapView />);

    const getHpdOpacity = () =>
      (
        capturedLayers.find((l) => (l as { id: string }).id === 'hpd-polygons') as
          | { opacity: number }
          | undefined
      )?.opacity;
    // At slider 100: opacity must be exactly 1.0 (not 0.18 × 1.0).
    expect(getHpdOpacity()).toBeCloseTo(1.0, 5);

    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
      layerOpacity: { 'hpd-polygons': 50 },
    });
    rerender(<MapView />);
    expect(getHpdOpacity()).toBeCloseTo(0.5, 5);
  });

  // Shared fixture for focus-filter tests: 4-node tree (root + internal + 2 tips).
  // branchIds [1, 2, 3] skip the root (node 0 has no branch row).
  // Focusing on tip 'node_2' traces path: node_2 → node_1 → node_0 → indices {0,1,2}.
  // Branch with branchId=3 (node_3 / tip_B) is off-lineage and should be hidden.
  function makeFocusFixture() {
    const count = 3;
    const branchTable: BranchTable = {
      count,
      branchId: new Int32Array([1, 2, 3]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array([2003.0, 2003.5, 2003.5]),
      endTime: new Float32Array([2004.5, 2005.0, 2005.0]),
      startLat: new Float32Array(count).fill(40),
      startLon: new Float32Array(count).fill(-100),
      endLat: new Float32Array(count).fill(41),
      endLon: new Float32Array(count).fill(-99),
      stateWeight: new Float32Array(count).fill(1),
    };
    const graph: PhyloGraph = {
      nodes: [
        {
          idx: 0,
          origId: 'node_0',
          name: null,
          label: null,
          annotations: {},
          adjacents: [1],
          lengths: [1],
        },
        {
          idx: 1,
          origId: 'node_1',
          name: null,
          label: null,
          annotations: {},
          adjacents: [0, 2, 3],
          lengths: [1, 1, 1],
        },
        {
          idx: 2,
          origId: 'node_2',
          name: null,
          label: null,
          annotations: {},
          adjacents: [1],
          lengths: [1],
        },
        {
          idx: 3,
          origId: 'node_3',
          name: null,
          label: null,
          annotations: {},
          adjacents: [1],
          lengths: [1],
        },
      ],
      root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
      origIdToIdx: new Map([
        ['node_0', 0],
        ['node_1', 1],
        ['node_2', 2],
        ['node_3', 3],
      ]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
    const layout = {
      nodes: [
        {
          id: 'node_0',
          x: 0,
          y: 0,
          isTip: false,
          parentId: null,
          children: ['node_1'],
          annotations: {},
        },
        {
          id: 'node_1',
          x: 1,
          y: 1,
          isTip: false,
          parentId: 'node_0',
          children: ['node_2', 'node_3'],
          annotations: {},
        },
        {
          id: 'node_2',
          x: 2,
          y: 0,
          isTip: true,
          parentId: 'node_1',
          children: [],
          annotations: {},
        },
        {
          id: 'node_3',
          x: 2,
          y: 2,
          isTip: true,
          parentId: 'node_1',
          children: [],
          annotations: {},
        },
      ],
      nodeMap: new Map([
        [
          'node_0',
          {
            id: 'node_0',
            x: 0,
            y: 0,
            isTip: false,
            parentId: null,
            children: ['node_1'],
            annotations: {},
          },
        ],
        [
          'node_1',
          {
            id: 'node_1',
            x: 1,
            y: 1,
            isTip: false,
            parentId: 'node_0',
            children: ['node_2', 'node_3'],
            annotations: {},
          },
        ],
        [
          'node_2',
          {
            id: 'node_2',
            x: 2,
            y: 0,
            isTip: true,
            parentId: 'node_1',
            children: [],
            annotations: {},
          },
        ],
        [
          'node_3',
          {
            id: 'node_3',
            x: 2,
            y: 2,
            isTip: true,
            parentId: 'node_1',
            children: [],
            annotations: {},
          },
        ],
      ]),
      maxX: 2,
      maxY: 2,
      xAxisMode: 'date' as const,
    };
    return { branchTable, graph, layout };
  }

  it('change/filter-focus: empty focus set → all active trips present', () => {
    const { branchTable, graph, layout } = makeFocusFixture();
    setTreeState({ branchTable, graph, layout });
    useSelectionStore.setState({ focusedTaxa: [] });
    useTimelineStore.setState({ playhead: 2006.0 });
    render(<MapView />);

    const trailLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { data: unknown[] }
      | undefined;
    expect(trailLayer).toBeDefined();
    expect(trailLayer!.data).toHaveLength(3);
  });

  it('change/filter-focus: single-tip focus → only branches on root-to-tip path in trips data', () => {
    const { branchTable, graph, layout } = makeFocusFixture();
    setTreeState({ branchTable, graph, layout });
    useSelectionStore.setState({ focusedTaxa: ['node_2'] });
    useTimelineStore.setState({ playhead: 2006.0 });
    render(<MapView />);

    // focusedTaxa=['node_2'] traces: node_2→node_1→node_0 → indices {0,1,2}
    // branchIds [1,2,3]: 1∈{0,1,2} ✓, 2∈{0,1,2} ✓, 3∉ → 2 trips
    const trailLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { data: unknown[] }
      | undefined;
    expect(trailLayer).toBeDefined();
    expect(trailLayer!.data).toHaveLength(2);
  });

  it('change/filter-focus: multi-tip focus → union of lineage branches in trips data', () => {
    const { branchTable, graph, layout } = makeFocusFixture();
    setTreeState({ branchTable, graph, layout });
    useSelectionStore.setState({ focusedTaxa: ['node_2', 'node_3'] });
    useTimelineStore.setState({ playhead: 2006.0 });
    render(<MapView />);

    // Both tips share root→node_1, then each adds their own tip branch → all 3 branches
    const trailLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { data: unknown[] }
      | undefined;
    expect(trailLayer).toBeDefined();
    expect(trailLayer!.data).toHaveLength(3);
  });

  it('change/filter-focus: empty focus set → HPD layer data length equals full input', () => {
    const { branchTable, graph, layout } = makeFocusFixture();
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    // 4 non-null HPD entries (one per node 0..3)
    setTreeState({ branchTable, graph, layout, nodeHpds: [poly, poly, poly, poly] });
    useSelectionStore.setState({ focusedTaxa: [] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    useTimelineStore.setState({ playhead: 2006.0 });
    render(<MapView />);

    const hpdLayer = capturedLayers.find((l) => (l as { id: string }).id === 'hpd-polygons') as
      | { data: unknown[] }
      | undefined;
    expect(hpdLayer).toBeDefined();
    expect(hpdLayer!.data).toHaveLength(4);
  });

  it('change/filter-focus: single-tip focus → HPD data includes only nodes on lineage', () => {
    const { branchTable, graph, layout } = makeFocusFixture();
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    setTreeState({ branchTable, graph, layout, nodeHpds: [poly, poly, poly, poly] });
    useSelectionStore.setState({ focusedTaxa: ['node_2'] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    useTimelineStore.setState({ playhead: 2006.0 });
    render(<MapView />);

    // lineage for node_2: {node_0(0), node_1(1), node_2(2)} → 3 HPD entries; node_3(3) excluded
    const hpdLayer = capturedLayers.find((l) => (l as { id: string }).id === 'hpd-polygons') as
      | { data: unknown[] }
      | undefined;
    expect(hpdLayer).toBeDefined();
    expect(hpdLayer!.data).toHaveLength(3);
  });

  it('change/filter-focus: multi-tip focus → HPD data includes union of lineage nodes', () => {
    const { branchTable, graph, layout } = makeFocusFixture();
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    setTreeState({ branchTable, graph, layout, nodeHpds: [poly, poly, poly, poly] });
    useSelectionStore.setState({ focusedTaxa: ['node_2', 'node_3'] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    useTimelineStore.setState({ playhead: 2006.0 });
    render(<MapView />);

    // union: node_0(0), node_1(1), node_2(2), node_3(3) → all 4 HPD entries
    const hpdLayer = capturedLayers.find((l) => (l as { id: string }).id === 'hpd-polygons') as
      | { data: unknown[] }
      | undefined;
    expect(hpdLayer).toBeDefined();
    expect(hpdLayer!.data).toHaveLength(4);
  });

  it('change/filter-clade: clade selection filters HPD data to subtree nodes', () => {
    const { branchTable, graph, layout } = makeFocusFixture();
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    setTreeState({ branchTable, graph, layout, nodeHpds: [poly, poly, poly, poly] });
    useSelectionStore.setState({ focusedTaxa: [] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    useTimelineStore.setState({ clade: true, subtreeRootId: 'node_2', playhead: 2006.0 });
    render(<MapView />);

    const hpdLayer = capturedLayers.find((l) => (l as { id: string }).id === 'hpd-polygons') as
      | { data: Array<{ nodeIdx: number }> }
      | undefined;
    expect(hpdLayer).toBeDefined();
    expect(hpdLayer?.data.map((d) => d.nodeIdx)).toEqual([2]);
  });

  it('change/filter-clade: clade selection filters multi-HPD data to subtree nodes', () => {
    const { branchTable, graph, layout } = makeFocusFixture();
    const poly: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-100, 40],
          [-99, 40],
          [-99, 41],
          [-100, 40],
        ],
      ],
    };
    setTreeState({
      branchTable,
      graph,
      layout,
      nodeMultiHpds: [[poly], [poly], [poly, poly], [poly]],
    });
    useSelectionStore.setState({ focusedTaxa: [] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    });
    useTimelineStore.setState({ clade: true, subtreeRootId: 'node_2', playhead: 2006.0 });
    render(<MapView />);

    const hpdLayer = capturedLayers.find(
      (l) => (l as { id: string }).id === 'hpd-polygons-multi',
    ) as { data: Array<{ nodeIdx: number }> } | undefined;
    expect(hpdLayer).toBeDefined();
    expect(hpdLayer?.data.map((d) => d.nodeIdx)).toEqual([2, 2]);
  });
});

describe('MapView cluster filter', () => {
  // Tree: node_0 (root, loc A) → node_1 (internal, loc B) → node_2 (tip, loc C)
  //                                                         → node_3 (tip, loc D)
  // branchIds 1, 2, 3 → nodes 1, 2, 3. Cluster universe: A, B, C, D at distinct coords.
  function makeClusterFixture() {
    const count = 3;
    const branchTable: BranchTable = {
      count,
      branchId: new Int32Array([1, 2, 3]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array([1, 0, 0]),
      startTime: new Float32Array([2003.0, 2003.5, 2003.5]),
      endTime: new Float32Array([2004.5, 2005.0, 2005.0]),
      startLat: new Float32Array([10, 10, 10]),
      startLon: new Float32Array([10, 10, 10]),
      endLat: new Float32Array([20, 30, 40]),
      endLon: new Float32Array([20, 30, 40]),
      stateWeight: new Float32Array(count).fill(1),
    };
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      values: ['A', 'B', 'C', 'D'],
      ambiguous: false,
    };
    const graph: PhyloGraph = {
      nodes: [
        {
          idx: 0,
          origId: 'node_0',
          name: null,
          label: null,
          annotations: { location: 'A' },
          adjacents: [1],
          lengths: [1],
        },
        {
          idx: 1,
          origId: 'node_1',
          name: null,
          label: null,
          annotations: { location: 'B' },
          adjacents: [0, 2, 3],
          lengths: [1, 1, 1],
        },
        {
          idx: 2,
          origId: 'node_2',
          name: null,
          label: null,
          annotations: { location: 'C' },
          adjacents: [1],
          lengths: [1],
        },
        {
          idx: 3,
          origId: 'node_3',
          name: null,
          label: null,
          annotations: { location: 'D' },
          adjacents: [1],
          lengths: [1],
        },
      ],
      root: { nodeA: 0, nodeB: 1, lenA: 0, lenB: 1, annotations: {} },
      origIdToIdx: new Map([
        ['node_0', 0],
        ['node_1', 1],
        ['node_2', 2],
        ['node_3', 3],
      ]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
    const layout = {
      nodes: [
        {
          id: 'node_0',
          x: 0,
          y: 0,
          isTip: false,
          parentId: null,
          children: ['node_1'],
          annotations: {},
        },
        {
          id: 'node_1',
          x: 1,
          y: 1,
          isTip: false,
          parentId: 'node_0',
          children: ['node_2', 'node_3'],
          annotations: {},
        },
        {
          id: 'node_2',
          x: 2,
          y: 0,
          isTip: true,
          parentId: 'node_1',
          children: [],
          annotations: {},
        },
        {
          id: 'node_3',
          x: 2,
          y: 2,
          isTip: true,
          parentId: 'node_1',
          children: [],
          annotations: {},
        },
      ],
      nodeMap: new Map([
        [
          'node_0',
          {
            id: 'node_0',
            x: 0,
            y: 0,
            isTip: false,
            parentId: null,
            children: ['node_1'],
            annotations: {},
          },
        ],
        [
          'node_1',
          {
            id: 'node_1',
            x: 1,
            y: 1,
            isTip: false,
            parentId: 'node_0',
            children: ['node_2', 'node_3'],
            annotations: {},
          },
        ],
        [
          'node_2',
          {
            id: 'node_2',
            x: 2,
            y: 0,
            isTip: true,
            parentId: 'node_1',
            children: [],
            annotations: {},
          },
        ],
        [
          'node_3',
          {
            id: 'node_3',
            x: 2,
            y: 2,
            isTip: true,
            parentId: 'node_1',
            children: [],
            annotations: {},
          },
        ],
      ]),
      maxX: 2,
      maxY: 2,
      xAxisMode: 'date' as const,
    };
    // One distinct coordinate per location value
    const discreteGeoLookup = new Map<string, [number, number]>([
      ['A', [10, 10]],
      ['B', [20, 20]],
      ['C', [30, 30]],
      ['D', [40, 40]],
    ]);
    return { branchTable, traitInfo, graph, layout, discreteGeoLookup };
  }

  beforeEach(() => {
    capturedLayers = [];
    setTreeState({
      branchTable: null,
      graph: null,
      layout: null,
      nodeHpds: null,
      nodeMultiHpds: null,
      traitInfo: null,
      parseStatus: 'idle',
      parseError: null,
      discreteGeoLookup: new Map(),
      discreteGeoSource: new Map(),
    });
    useTimelineStore.setState({
      playhead: 2006.0,
      bounds: null,
      isPlaying: false,
      speed: 1,
      mode: 'Trail',
      arcs: false,
      clade: false,
      subtreeRootId: null,
      window: null,
    });
    useSelectionStore.setState({ hoveredBranchId: null, hoveredId: null, focusedTaxa: [] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
      colorByKey: 'location',
      deselectedValues: new Set(),
    });
  });

  it('empty focus set → all cluster locations shown', () => {
    const { branchTable, traitInfo, graph, layout, discreteGeoLookup } = makeClusterFixture();
    setTreeState({ branchTable, traitInfo, graph, layout, discreteGeoLookup });
    render(<MapView />);

    const clusterLayer = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    expect(clusterLayer).toBeDefined();
    // All 3 active branches contribute to B, C, D — 3 cluster entries
    expect(clusterLayer!.data).toHaveLength(3);
  });

  it('single-tip focus → cluster data only includes locations on that lineage', () => {
    const { branchTable, traitInfo, graph, layout, discreteGeoLookup } = makeClusterFixture();
    setTreeState({ branchTable, traitInfo, graph, layout, discreteGeoLookup });
    useSelectionStore.setState({ focusedTaxa: ['node_2'] });
    render(<MapView />);

    // lineage node_2→node_1→node_0 has locations C, B, A
    // Active cluster endpoints are B, C, D (from branchIds 1→B, 2→C, 3→D)
    // After focus filter: B (lineage) and C (lineage) kept; D (node_3, not on lineage) removed
    const clusterLayer = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    expect(clusterLayer).toBeDefined();
    const names = (clusterLayer!.data as { name: string }[]).map((d) => d.name).sort();
    expect(names).toEqual(['B', 'C']);
  });

  it('multi-tip focus → cluster data is union of lineage locations', () => {
    const { branchTable, traitInfo, graph, layout, discreteGeoLookup } = makeClusterFixture();
    setTreeState({ branchTable, traitInfo, graph, layout, discreteGeoLookup });
    useSelectionStore.setState({ focusedTaxa: ['node_2', 'node_3'] });
    render(<MapView />);

    // Both tips share node_0(A) and node_1(B); each adds their own tip location C/D
    // Active clusters: B, C, D. All three are on at least one lineage.
    const clusterLayer = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    expect(clusterLayer).toBeDefined();
    const names = (clusterLayer!.data as { name: string }[]).map((d) => d.name).sort();
    expect(names).toEqual(['B', 'C', 'D']);
  });

  it('legend deselected value → corresponding cluster hidden', () => {
    const { branchTable, traitInfo, graph, layout, discreteGeoLookup } = makeClusterFixture();
    setTreeState({ branchTable, traitInfo, graph, layout, discreteGeoLookup });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
      colorByKey: 'location',
      deselectedValues: new Set(['C']),
    });
    render(<MapView />);

    const clusterLayer = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    expect(clusterLayer).toBeDefined();
    const names = (clusterLayer!.data as { name: string }[]).map((d) => d.name);
    expect(names).not.toContain('C');
    expect(names).toContain('B');
    expect(names).toContain('D');
  });

  it('combined focus + legend deselect → intersection applied', () => {
    const { branchTable, traitInfo, graph, layout, discreteGeoLookup } = makeClusterFixture();
    setTreeState({ branchTable, traitInfo, graph, layout, discreteGeoLookup });
    useSelectionStore.setState({ focusedTaxa: ['node_2'] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
      colorByKey: 'location',
      deselectedValues: new Set(['B']),
    });
    render(<MapView />);

    // focus keeps B,C; deselect removes B → only C remains
    const clusterLayer = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    expect(clusterLayer).toBeDefined();
    const names = (clusterLayer!.data as { name: string }[]).map((d) => d.name);
    expect(names).toEqual(['C']);
  });
});

describe('perf/T092 — clusterData throttle', () => {
  // Cluster throttling is relative to the loaded tree's time range, not fixed
  // decimal years. This keeps short-span trees like B.1.1.7 smooth while
  // still avoiding redundant recomputes within sub-frame movements.

  beforeEach(() => {
    capturedLayers = [];
    setTreeState({
      branchTable: null,
      graph: null,
      layout: null,
      nodeHpds: null,
      nodeMultiHpds: null,
      traitInfo: null,
      parseStatus: 'idle',
      parseError: null,
      discreteGeoLookup: new Map(),
      discreteGeoSource: new Map(),
    });
    useTimelineStore.setState({
      playhead: 2003.0,
      bounds: { min: 2003, max: 2004 },
      isPlaying: true,
      speed: 1,
      mode: 'Trail',
      arcs: false,
      clade: false,
      subtreeRootId: null,
      window: null,
    });
    useSelectionStore.setState({ hoveredBranchId: null, hoveredId: null, focusedTaxa: [] });
    useUiStore.setState({
      layerVisibility: { branches: true, 'cluster-endpoints': true },
      colorByKey: 'location',
      deselectedValues: new Set(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('sub-bucket playhead steps stay in the same range-relative bucket', () => {
    const bounds = { min: 2003, max: 2004 };

    expect(getRangeRelativePlayheadBucket(2003.0, bounds, true)).toBe(
      getRangeRelativePlayheadBucket(2003.0005, bounds, true),
    );
    expect(getRangeRelativePlayheadBucket(2003.002, bounds, true)).not.toBe(
      getRangeRelativePlayheadBucket(2003.0, bounds, true),
    );
  });

  it('cluster data count stays stable when playhead steps within a bucket', () => {
    // 2 branches, both active from 2003.0. No branch crosses this sub-bucket step.
    const count = 2;
    const branchTable: BranchTable = {
      count,
      branchId: new Int32Array([1, 2]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array([1, 0]),
      startTime: new Float32Array([2003.0, 2003.0]),
      endTime: new Float32Array([2004.0, 2004.0]),
      startLat: new Float32Array([10, 10]),
      startLon: new Float32Array([10, 10]),
      endLat: new Float32Array([20, 30]),
      endLon: new Float32Array([20, 30]),
      stateWeight: new Float32Array(count).fill(1),
    };
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      values: ['A', 'B'],
      ambiguous: false,
    };
    const discreteGeoLookup = new Map<string, [number, number]>([
      ['A', [20, 20]],
      ['B', [30, 30]],
    ]);
    setTreeState({ branchTable, traitInfo, discreteGeoLookup });
    useTimelineStore.setState({ playhead: 2003.0 });
    render(<MapView />);

    const clusterBefore = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    expect(clusterBefore?.data).toHaveLength(2);

    // Sub-bucket step: range-relative bucket remains unchanged.
    act(() => {
      useTimelineStore.setState({ playhead: 2003.0005 });
    });

    const clusterAfter = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    // Same active set → same cluster count
    expect(clusterAfter?.data).toHaveLength(2);
  });

  it('cluster data reference is stable across sub-bucket playhead steps (useMemo bucket dep)', () => {
    // Verify that the range-relative bucket prevents clusterData from
    // recomputing on sub-bucket steps.
    const count = 2;
    const branchTable: BranchTable = {
      count,
      branchId: new Int32Array([1, 2]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array([1, 0]),
      startTime: new Float32Array([2003.0, 2003.0]),
      endTime: new Float32Array([2004.0, 2004.0]),
      startLat: new Float32Array([10, 10]),
      startLon: new Float32Array([10, 10]),
      endLat: new Float32Array([20, 30]),
      endLon: new Float32Array([20, 30]),
      stateWeight: new Float32Array(count).fill(1),
    };
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      values: ['A', 'B'],
      ambiguous: false,
    };
    const discreteGeoLookup = new Map<string, [number, number]>([
      ['A', [20, 20]],
      ['B', [30, 30]],
    ]);
    setTreeState({ branchTable, traitInfo, discreteGeoLookup });
    useTimelineStore.setState({ playhead: 2003.0 });
    render(<MapView />);

    const clusterBefore = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    const dataBefore = clusterBefore?.data;
    expect(dataBefore).toBeDefined();

    act(() => {
      useTimelineStore.setState({ playhead: 2003.0005 });
    });

    const clusterAfter = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    // Same array reference: useMemo did not recompute (playheadBucket unchanged)
    expect(clusterAfter?.data).toBe(dataBefore);

    act(() => {
      useTimelineStore.setState({
        mode: 'Window',
        playhead: 2003.2,
        window: { start: 2003.1, end: 2003.2 },
        windowSize: 0.1,
      });
    });
    const windowDataBefore = (
      capturedLayers.find((l) => (l as { id: string }).id === 'cluster-endpoints') as
        | { data: unknown[] }
        | undefined
    )?.data;

    act(() => {
      useTimelineStore.setState({
        playhead: 2003.2005,
        window: { start: 2003.1005, end: 2003.2005 },
      });
    });
    const windowDataAfter = (
      capturedLayers.find((l) => (l as { id: string }).id === 'cluster-endpoints') as
        | { data: unknown[] }
        | undefined
    )?.data;
    expect(windowDataAfter).toBe(windowDataBefore);
  });

  it('cluster bucket-boundary step changes clusterData reference identity', () => {
    // A sub-bucket step keeps the memoized cluster array; crossing a
    // range-relative bucket boundary recomputes it.
    const count = 2;
    const branchTable: BranchTable = {
      count,
      branchId: new Int32Array([1, 2]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array([1, 0]),
      startTime: new Float32Array([2003.0, 2003.0]),
      endTime: new Float32Array([2004.0, 2004.0]),
      startLat: new Float32Array([10, 10]),
      startLon: new Float32Array([10, 10]),
      endLat: new Float32Array([20, 30]),
      endLon: new Float32Array([20, 30]),
      stateWeight: new Float32Array(count).fill(1),
    };
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      values: ['A', 'B'],
      ambiguous: false,
    };
    const discreteGeoLookup = new Map<string, [number, number]>([
      ['A', [20, 20]],
      ['B', [30, 30]],
    ]);
    setTreeState({ branchTable, traitInfo, discreteGeoLookup });
    useTimelineStore.setState({ playhead: 2003.0 });
    render(<MapView />);

    const clusterAt2003 = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    const dataAt2003 = clusterAt2003?.data;
    expect(dataAt2003).toBeDefined();

    // Sub-bucket step: ref unchanged.
    act(() => {
      useTimelineStore.setState({ playhead: 2003.0005 });
    });
    const clusterAtSubBucket = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    expect(clusterAtSubBucket?.data).toBe(dataAt2003);

    // Bucket-boundary step: ref changed.
    act(() => {
      useTimelineStore.setState({ playhead: 2003.002 });
    });
    const clusterAtBoundary = capturedLayers.find(
      (l) => (l as { id: string }).id === 'cluster-endpoints',
    ) as { data: unknown[] } | undefined;
    expect(clusterAtBoundary?.data).not.toBe(dataAt2003);
  });
});

describe('perf/T092-tier2 — static tripData/arcData + GPU time-mask', () => {
  // Regression tests for Tier 2 perf fix: tripData and arcData built once per
  // branchTable instead of rebuilt per frame. Reference identity must be stable
  // across playhead changes (only non-time predicates gate JS-side data rebuild).

  beforeEach(() => {
    capturedLayers = [];
    setTreeState({
      branchTable: null,
      graph: null,
      layout: null,
      nodeHpds: null,
      nodeMultiHpds: null,
      traitInfo: null,
      parseStatus: 'idle',
      parseError: null,
    });
    useTimelineStore.setState({
      playhead: 2003.0,
      bounds: null,
      isPlaying: false,
      speed: 1,
      mode: 'Trail',
      arcs: false,
      clade: false,
      subtreeRootId: null,
      window: null,
    });
    useSelectionStore.setState({ hoveredBranchId: null, hoveredId: null, focusedTaxa: [] });
  });

  afterEach(() => {
    cleanup();
    useTimelineStore.setState({ arcs: false });
  });

  it('tripData reference is stable when playhead advances (no branchTable change)', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ playhead: 2020.0 });
    const { rerender } = render(<MapView />);

    const layerAt2020 = capturedLayers.find(
      (l) => (l as { id?: string }).id === 'branches-trail',
    ) as { data: unknown[] } | undefined;
    const dataBefore = layerAt2020?.data;
    expect(dataBefore).toBeDefined();

    act(() => {
      useTimelineStore.setState({ playhead: 2020.5 });
    });
    rerender(<MapView />);
    const layerAt2020_5 = capturedLayers.find(
      (l) => (l as { id?: string }).id === 'branches-trail',
    ) as { data: unknown[] } | undefined;
    expect(layerAt2020_5?.data).toBe(dataBefore);

    act(() => {
      useTimelineStore.setState({ playhead: 2021.0 });
    });
    rerender(<MapView />);
    const layerAt2021 = capturedLayers.find(
      (l) => (l as { id?: string }).id === 'branches-trail',
    ) as { data: unknown[] } | undefined;
    expect(layerAt2021?.data).toBe(dataBefore);
  });

  it('tripData reference changes when branchTable is replaced', () => {
    const bt1 = makeBranchTable(3);
    setTreeState({ branchTable: bt1 });
    useTimelineStore.setState({ playhead: 2020.0 });
    const { rerender } = render(<MapView />);

    const layer1 = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { data: unknown[] }
      | undefined;
    const dataBefore = layer1?.data;
    expect(dataBefore).toBeDefined();

    const bt2 = makeBranchTable(4);
    act(() => {
      setTreeState({ branchTable: bt2 });
    });
    rerender(<MapView />);
    const layer2 = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { data: unknown[] }
      | undefined;
    expect(layer2?.data).not.toBe(dataBefore);
    expect(layer2?.data).toHaveLength(4);
  });

  it('arcData reference is stable when playhead advances (no branchTable change)', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ arcs: true, playhead: 2020.0 });
    const { rerender } = render(<MapView />);

    const layerAt2020 = capturedLayers.find(
      (l) => (l as { id?: string }).id === 'branches-slice',
    ) as { data: unknown[] } | undefined;
    const dataBefore = layerAt2020?.data;
    expect(dataBefore).toBeDefined();

    act(() => {
      useTimelineStore.setState({ playhead: 2020.5 });
    });
    rerender(<MapView />);
    const layerAt2020_5 = capturedLayers.find(
      (l) => (l as { id?: string }).id === 'branches-slice',
    ) as { data: unknown[] } | undefined;
    expect(layerAt2020_5?.data).toBe(dataBefore);

    act(() => {
      useTimelineStore.setState({ playhead: 2021.0 });
    });
    rerender(<MapView />);
    const layerAt2021 = capturedLayers.find(
      (l) => (l as { id?: string }).id === 'branches-slice',
    ) as { data: unknown[] } | undefined;
    expect(layerAt2021?.data).toBe(dataBefore);
  });

  it('arcData reference changes when branchTable is replaced', () => {
    const bt1 = makeBranchTable(3);
    setTreeState({ branchTable: bt1 });
    useTimelineStore.setState({ arcs: true, playhead: 2020.0 });
    const { rerender } = render(<MapView />);

    const layer1 = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-slice') as
      | { data: unknown[] }
      | undefined;
    const dataBefore = layer1?.data;
    expect(dataBefore).toBeDefined();

    const bt2 = makeBranchTable(5);
    act(() => {
      setTreeState({ branchTable: bt2 });
    });
    rerender(<MapView />);
    const layer2 = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-slice') as
      | { data: unknown[] }
      | undefined;
    expect(layer2?.data).not.toBe(dataBefore);
    expect(layer2?.data).toHaveLength(5);
  });

  it('ArcLayer carries DataFilterExtension and tracks playhead in filterRange', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ arcs: true, playhead: 2003.0 });
    const { rerender } = render(<MapView />);

    const getArcLayer = () =>
      capturedLayers.find((l) => (l as { id?: string }).id === 'branches-slice') as
        | { extensions?: unknown[]; filterRange?: [[number, number], [number, number]] }
        | undefined;
    const arcLayer = getArcLayer();
    expect(arcLayer).toBeDefined();
    expect(Array.isArray(arcLayer?.extensions)).toBe(true);
    expect(arcLayer?.extensions?.length).toBeGreaterThan(0);
    // filterSize=2 always; dim-0 upper gates startTime ≤ playhead.
    expect(arcLayer?.filterRange?.[0][1]).toBeCloseTo(2003.0, 3);

    act(() => {
      useTimelineStore.setState({ playhead: 2003.7 });
    });
    rerender(<MapView />);
    expect(getArcLayer()?.filterRange?.[0][1]).toBeCloseTo(2003.7, 3);

    act(() => {
      useTimelineStore.setState({ playhead: 2004.2 });
    });
    rerender(<MapView />);
    expect(getArcLayer()?.filterRange?.[0][1]).toBeCloseTo(2004.2, 3);
  });
});

describe('T088 polish fixes', () => {
  it('fix3/cluster-stroke: cluster-endpoints ScatterplotLayer has stroked: false', () => {
    const branchTable = makeBranchTable(3);
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      values: ['A', 'B', 'C'],
      ambiguous: false,
    };
    const discreteGeoLookup = new Map<string, [number, number]>([
      ['A', [41, -99]],
      ['B', [42, -98]],
      ['C', [43, -97]],
    ]);
    setTreeState({ branchTable, traitInfo, discreteGeoLookup });
    useTimelineStore.setState({ playhead: 2005.0 });
    render(<MapView />);

    const cluster = capturedLayers.find((l) => (l as { id: string }).id === 'cluster-endpoints') as
      | { stroked: boolean }
      | undefined;
    expect(cluster).toBeDefined();
    expect(cluster!.stroked).toBe(false);
  });

  it('fix4/arc-width: TripsLayer updateTriggers.getWidth includes arcWidth value', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useUiStore.setState({ arcWidth: 75 });
    render(<MapView />);

    const trailLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { updateTriggers?: { getWidth?: unknown[] } }
      | undefined;
    expect(trailLayer).toBeDefined();
    expect(Array.isArray(trailLayer!.updateTriggers?.getWidth)).toBe(true);
    expect(trailLayer!.updateTriggers?.getWidth).toContain(0.75);
  });

  it('fix4/arc-width: at arcWidth=50 trip getWidth returns half the base width', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useUiStore.setState({ arcWidth: 50 });
    useTimelineStore.setState({ playhead: 2005.0 });
    render(<MapView />);

    const trailLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { getWidth?: (d: { branchId: number }) => number }
      | undefined;
    expect(trailLayer).toBeDefined();
    const width = trailLayer!.getWidth?.({ branchId: 999 });
    expect(width).toBeCloseTo(6 * 0.5, 5);
  });

  it('change/remove-branch-halo: arcWidth=100 produces DEFAULT_WIDTH for trail layer', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useUiStore.setState({ arcWidth: 100 });
    useTimelineStore.setState({ playhead: 2005.0 });
    render(<MapView />);

    const trailLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { getWidth?: (d: { branchId: number }) => number }
      | undefined;
    expect(trailLayer).toBeDefined();
    const width = trailLayer!.getWidth?.({ branchId: 999 });
    expect(width).toBeCloseTo(6, 5);
  });

  it('change/remove-branch-halo: arcWidth=100 (arc mode) produces SLICE_WIDTH per arc datum', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ arcs: true, playhead: 2005.0 });
    useUiStore.setState({ arcWidth: 100 });
    render(<MapView />);

    const arcLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-slice') as
      | { getWidth?: (d: { branchId: number; sourcePosition: [number, number] }) => number }
      | undefined;
    expect(arcLayer).toBeDefined();
    const width = arcLayer!.getWidth?.({ branchId: 999, sourcePosition: [0, 0] });
    expect(width).toBeCloseTo(4, 5);
  });

  it('change/remove-branch-halo: arcWidth=10 trips width is clamped to widthMinPixels=1 floor via slider', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useUiStore.setState({ arcWidth: 10 });
    useTimelineStore.setState({ arcs: false, mode: 'Trail', playhead: 2005.0 });
    render(<MapView />);

    const trailLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-trail') as
      | { getWidth?: (d: { branchId: number }) => number; widthMinPixels?: number }
      | undefined;
    expect(trailLayer).toBeDefined();
    // At arcWidth=10, getWidth returns 6 * 0.1 = 0.6, below widthMinPixels=1
    const rawWidth = trailLayer!.getWidth?.({ branchId: 999 });
    expect(rawWidth).toBeCloseTo(0.6, 5);
    // widthMinPixels floor ensures the line renders at ≥ 1px
    expect(trailLayer!.widthMinPixels).toBe(1);
  });
});

describe('T096 accessibility', () => {
  beforeEach(() => {
    cleanup();
    capturedLayers = [];
    setTreeState({
      branchTable: null,
      graph: null,
      layout: null,
      nodeHpds: null,
      nodeMultiHpds: null,
      traitInfo: null,
      parseStatus: 'idle',
      parseError: null,
      discreteGeoLookup: new Map(),
      discreteGeoSource: new Map(),
    });
    useTimelineStore.setState({
      playhead: 2003.0,
      bounds: null,
      isPlaying: false,
      speed: 1,
      mode: 'Trail',
      arcs: false,
      clade: false,
      subtreeRootId: null,
      window: null,
    });
    useSelectionStore.setState({ hoveredBranchId: null, hoveredId: null, focusedTaxa: [] });
    useUiStore.setState({
      theme: 'dark',
      lassoMode: false,
      lassoVertices: [],
      pickLocationName: null,
      pinnedSelection: null,
      compareSelection: null,
    });
    useRasterStore.setState({ raster: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('map aria-label follows loaded data and render mode', () => {
    const { rerender } = render(<MapView />);
    const container = screen.getByTestId('map-view');
    expect(container.getAttribute('aria-label')).toContain('no data loaded');

    const branchTable = makeBranchTable(3);
    const layout = {
      nodes: [
        { id: 'root', x: 0, y: 1, isTip: false, parentId: null, children: [], annotations: {} },
        { id: 't1', x: 1, y: 0, isTip: true, parentId: 'root', children: [], annotations: {} },
        { id: 't2', x: 1, y: 2, isTip: true, parentId: 'root', children: [], annotations: {} },
      ],
      nodeMap: new Map(),
      maxX: 1,
      maxY: 2,
      xAxisMode: 'date' as const,
    };
    setTreeState({ branchTable, layout });
    useTimelineStore.setState({ mode: 'Trail', arcs: false });
    rerender(<MapView />);
    expect(container.getAttribute('aria-label')).toContain('2 tips');
    expect(container.getAttribute('aria-label')).toContain('trail');

    useTimelineStore.setState({ arcs: true });
    rerender(<MapView />);
    expect(container.getAttribute('aria-label')).toContain('arcs');
  });

  it('map has polite live region for playhead date when bounds are set', () => {
    const branchTable = makeBranchTable(3);
    setTreeState({ branchTable });
    useTimelineStore.setState({ playhead: 2010.0, bounds: { min: 2005.0, max: 2015.0 } });
    render(<MapView />);
    const liveRegion = screen.getByTestId('map-playhead-live');
    expect(liveRegion.getAttribute('aria-live')).toBe('polite');
    expect(liveRegion.textContent).toContain('2010');
  });

  it('pick-location mode writes clicked map coordinates and clears pick mode', () => {
    useUiStore.setState({ pickLocationName: 'Beijing' });
    setTreeState({
      discreteGeoLookup: new Map(),
      discreteGeoSource: new Map(),
    });
    render(<MapView />);

    const container = screen.getByTestId('map-view');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 800, 600));
    const viewState = { longitude: 12, latitude: 48, zoom: 3, pitch: 0, bearing: 0 };
    act(() => {
      capturedOnViewStateChange?.({ viewState, interactionState: { isPanning: false } });
    });

    fireEvent.click(container, { clientX: 500, clientY: 350 });

    const [expectedLon = 0, expectedLat = 0] = new WebMercatorViewport({
      ...viewState,
      width: 800,
      height: 600,
    }).unproject([400, 300]);
    const coord = useTreeStore.getState().discreteGeoLookup?.get('Beijing');
    expect(coord).toBeDefined();
    expect(coord![0]).toBeCloseTo(expectedLat, 5);
    expect(coord![1]).toBeCloseTo(expectedLon, 5);
    expect(useTreeStore.getState().discreteGeoSource?.get('Beijing')).toBe('manual');
    expect(useUiStore.getState().pickLocationName).toBeNull();
  });

  it('pick-location mode clamps latitude and wraps longitude', () => {
    useUiStore.setState({ pickLocationName: 'Beijing' });
    render(<MapView />);

    const container = screen.getByTestId('map-view');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 800, 600));
    act(() => {
      capturedOnViewStateChange?.({
        viewState: { longitude: 540, latitude: 0, zoom: 2, pitch: 0, bearing: 0 },
        interactionState: { isPanning: false },
      });
    });

    fireEvent.click(container, { clientX: 400, clientY: 300 });

    const coord = useTreeStore.getState().discreteGeoLookup?.get('Beijing');
    expect(coord).toBeDefined();
    expect(coord?.[0]).toBeGreaterThanOrEqual(-90);
    expect(coord?.[0]).toBeLessThanOrEqual(90);
    expect(coord?.[1]).toBeGreaterThanOrEqual(-180);
    expect(coord?.[1]).toBeLessThanOrEqual(180);
    expect(coord?.[1]).toBeCloseTo(-180, 5);
  });

  it('renders a hovered location coordinate marker and label on the map', () => {
    setTreeState({
      discreteGeoLookup: new Map([['NY', [40.7, -74.0]]]),
    });
    useUiStore.setState({ hoveredLocationName: 'NY' });
    render(<MapView />);

    const marker = capturedLayers.find(
      (layer) => (layer as { id?: string }).id === 'location-coordinate-highlight',
    ) as { data: Array<{ name: string; position: [number, number] }> } | undefined;
    const label = capturedLayers.find(
      (layer) => (layer as { id?: string }).id === 'location-coordinate-highlight-label',
    ) as { data: Array<{ label: string }> } | undefined;

    expect(marker?.data[0]).toMatchObject({ name: 'NY', position: [-74.0, 40.7] });
    expect(label?.data[0]?.label).toContain('40.7000, -74.0000');
  });

  it('map-picked coordinates flash as a transient coordinate marker', () => {
    vi.useFakeTimers();
    useUiStore.setState({ pickLocationName: 'Beijing' });
    setTreeState({
      discreteGeoLookup: new Map(),
      discreteGeoSource: new Map(),
    });
    render(<MapView />);

    const container = screen.getByTestId('map-view');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(100, 50, 800, 600));
    fireEvent.click(container, { clientX: 500, clientY: 350 });

    let marker = capturedLayers.find(
      (layer) => (layer as { id?: string }).id === 'location-coordinate-highlight',
    ) as { data: Array<{ name: string; flash: boolean; fading: boolean }> } | undefined;
    expect(marker?.data[0]).toMatchObject({ name: 'Beijing', flash: true, fading: false });

    act(() => {
      vi.advanceTimersByTime(2400);
    });
    marker = capturedLayers.find(
      (layer) => (layer as { id?: string }).id === 'location-coordinate-highlight',
    ) as { data: Array<{ name: string; flash: boolean; fading: boolean }> } | undefined;
    expect(marker?.data[0]).toMatchObject({ name: 'Beijing', flash: true, fading: true });

    act(() => {
      vi.advanceTimersByTime(600);
    });
    marker = capturedLayers.find(
      (layer) => (layer as { id?: string }).id === 'location-coordinate-highlight',
    ) as { data: Array<{ name: string; flash: boolean; fading: boolean }> } | undefined;
    expect(marker).toBeUndefined();
    vi.useRealTimers();
  });

  it('Escape cancels pick-location mode without writing coordinates', () => {
    useUiStore.setState({ pickLocationName: 'Beijing' });
    render(<MapView />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(useUiStore.getState().pickLocationName).toBeNull();
    expect(useTreeStore.getState().discreteGeoLookup?.get('Beijing')).toBeUndefined();
  });

  it('pick-location mode suppresses map hover side effects', () => {
    vi.useFakeTimers();
    const branchTable = makeBranchTable(3);
    const graph = makeGraph(3);
    setTreeState({ branchTable, graph });
    useTimelineStore.setState({ arcs: true });
    useUiStore.setState({ pickLocationName: 'Beijing' });
    render(<MapView />);

    const container = screen.getByTestId('map-view');
    act(() => {
      fireEvent.mouseMove(container, { clientX: 100, clientY: 100 });
      vi.runAllTimers();
    });

    expect(useSelectionStore.getState().hoveredBranchId).toBeNull();
    vi.useRealTimers();
  });

  it('T099: BitmapLayer present at z-order 0 when raster is loaded and visible', () => {
    const branchTable = makeBranchTable(2);
    setTreeState({ branchTable });
    useUiStore.setState({
      layerVisibility: {
        branches: true,
        'hpd-polygons': true,
        'cluster-endpoints': true,
        'raster-overlay': true,
      },
      layerOpacity: { 'raster-overlay': 50 },
    });
    useRasterStore.setState({
      raster: {
        data: new Uint8ClampedArray(4 * 4 * 4),
        width: 4,
        height: 4,
        bounds: [-180, -90, 180, 90],
      },
    });
    render(<MapView />);
    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).toContain('raster-overlay');
    // Z-order: raster is below choropleth and branches (at index 0 of static layers, before branches)
    const rasterIdx = layerIds.indexOf('raster-overlay');
    const branchIdx = layerIds.findIndex((id) => id.startsWith('branches-'));
    expect(rasterIdx).toBeLessThan(branchIdx);
  });

  it('T099: BitmapLayer absent when raster visibility is false', () => {
    const branchTable = makeBranchTable(2);
    setTreeState({ branchTable });
    useUiStore.setState({
      layerVisibility: {
        branches: true,
        'hpd-polygons': true,
        'cluster-endpoints': true,
        'raster-overlay': false,
      },
    });
    useRasterStore.setState({
      raster: {
        data: new Uint8ClampedArray(4 * 4 * 4),
        width: 4,
        height: 4,
        bounds: [-180, -90, 180, 90],
      },
    });
    render(<MapView />);
    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).not.toContain('raster-overlay');
  });

  it('T099: BitmapLayer absent when no raster is loaded', () => {
    const branchTable = makeBranchTable(2);
    setTreeState({ branchTable });
    useUiStore.setState({
      layerVisibility: { 'raster-overlay': true },
    });
    render(<MapView />);
    const layerIds = (capturedLayers as { id: string }[]).map((l) => l.id);
    expect(layerIds).not.toContain('raster-overlay');
  });

  it('T099: BitmapLayer opacity equals layerOpacity[raster-overlay] / 100', () => {
    const branchTable = makeBranchTable(2);
    setTreeState({ branchTable });
    useUiStore.setState({
      layerVisibility: { branches: true, 'raster-overlay': true },
      layerOpacity: { 'raster-overlay': 75 },
    });
    useRasterStore.setState({
      raster: {
        data: new Uint8ClampedArray(4 * 4 * 4),
        width: 4,
        height: 4,
        bounds: [-180, -90, 180, 90],
      },
    });
    render(<MapView />);
    const rasterLayer = (capturedLayers as { id: string; opacity?: number }[]).find(
      (l) => l.id === 'raster-overlay',
    );
    expect(rasterLayer).toBeDefined();
    expect(rasterLayer!.opacity).toBeCloseTo(0.75, 5);
  });

  it('overlay guard: mousemove on the Inspector does NOT mutate hoveredBranchId', () => {
    const branchTable = makeBranchTable(3);
    const graph = makeGraph(3);
    setTreeState({ branchTable, graph });
    useTimelineStore.setState({ arcs: true });
    render(<MapView />);

    const container = screen.getByTestId('map-view');
    act(() => {
      fireEvent.mouseMove(container, { clientX: 50, clientY: 50 });
    });
    expect(useSelectionStore.getState().hoveredBranchId).toBeNull();
  });

  it('overlay guard: click on a direct child element of the inspector container does NOT pin selection', () => {
    const branchTable = makeBranchTable(3);
    const graph = makeGraph(3);
    setTreeState({ branchTable, graph });

    // Render with a pinned selection so Inspector shows (Inspector renders when
    // pinnedSelection is set in UiStore).
    useUiStore.setState({ pinnedSelection: { branchId: 0, source: 'map' } });
    render(<MapView />);

    const container = screen.getByTestId('map-view');
    const inspector = container.querySelector('[data-testid="inspector"]');
    const prevPinned = useUiStore.getState().pinnedSelection;

    // A DOM click on the inspector overlay (or the container) must not pin a new
    // selection — arc selection only happens via deck.gl canvas picking, not DOM
    // clicks on the map container/overlays.
    act(() => {
      fireEvent.click(inspector ?? container, { clientX: 50, clientY: 50, bubbles: true });
    });

    expect(useUiStore.getState().pinnedSelection).toEqual(prevPinned);
  });

  describe('T090: auto-pause on map drag/zoom', () => {
    function simulateInteractionStart() {
      act(() => {
        capturedOnViewStateChange?.({
          viewState: { longitude: 0, latitude: 0, zoom: 2, pitch: 0, bearing: 0 },
          interactionState: { isPanning: true },
        });
      });
    }

    function simulateInteractionEnd() {
      act(() => {
        capturedOnViewStateChange?.({
          viewState: { longitude: 0, latitude: 0, zoom: 2, pitch: 0, bearing: 0 },
          interactionState: { isPanning: false },
        });
      });
    }

    it('animation playing + map drag start → animation pauses', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      simulateInteractionStart();
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      vi.useRealTimers();
    });

    it('animation paused (manually) + map drag start → no change (stays paused)', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: false });
      render(<MapView />);
      simulateInteractionStart();
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      vi.useRealTimers();
    });

    it('animation playing + drag start + drag end + 500ms wait → animation resumes', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      simulateInteractionStart();
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      simulateInteractionEnd();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      vi.useRealTimers();
    });

    it('drag end commits the user camera for later layout resizes', () => {
      vi.useFakeTimers();
      render(<MapView />);
      const userViewState = { longitude: 12, latitude: 51, zoom: 6, pitch: 25, bearing: 7 };

      simulateInteractionStart();
      act(() => {
        capturedOnViewStateChange?.({
          viewState: userViewState,
          interactionState: { isPanning: false },
        });
      });

      expect(capturedInitialViewState).toEqual(userViewState);
      vi.useRealTimers();
    });

    it('wheel zoom end commits the user camera for later layout resizes', () => {
      vi.useFakeTimers();
      render(<MapView />);
      const container = screen.getByTestId('map-view');
      const userViewState = { longitude: -3, latitude: 55, zoom: 7, pitch: 30, bearing: 0 };

      act(() => {
        fireEvent.wheel(container, { deltaY: -100 });
        capturedOnViewStateChange?.({
          viewState: userViewState,
          interactionState: { isPanning: false },
        });
        vi.advanceTimersByTime(200);
      });

      expect(capturedInitialViewState).toEqual(userViewState);
      vi.useRealTimers();
    });

    it('animation playing + drag start + drag end + drag start within 500ms → resume cancelled, stays paused', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      simulateInteractionStart();
      simulateInteractionEnd();
      act(() => {
        vi.advanceTimersByTime(200);
      });
      simulateInteractionStart();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      vi.useRealTimers();
    });

    it('after second drag end, resumes 500ms later', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      simulateInteractionStart();
      simulateInteractionEnd();
      act(() => {
        vi.advanceTimersByTime(200);
      });
      simulateInteractionStart();
      simulateInteractionEnd();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      vi.useRealTimers();
    });

    it('animation playing + drag start + user manually presses Play → flag cleared, no double-action', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      simulateInteractionStart();
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      act(() => {
        useTimelineStore.getState().setIsPlaying(true);
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      vi.useRealTimers();
    });

    it('wheel-zoom: playing + DOM wheel event → pauses immediately', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      const container = screen.getByTestId('map-view');
      act(() => {
        fireEvent.wheel(container, { deltaY: 100 });
      });
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      vi.useRealTimers();
    });

    it('wheel-zoom: playing + wheel + 200ms quiet + 500ms → resumes (total 700ms)', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      const container = screen.getByTestId('map-view');
      act(() => {
        fireEvent.wheel(container, { deltaY: 100 });
      });
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      vi.useRealTimers();
    });

    it('wheel-zoom: rapid wheel bursts within 200ms treated as one zoom, resumes after 200ms+500ms quiet', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      const container = screen.getByTestId('map-view');
      act(() => {
        fireEvent.wheel(container, { deltaY: 100 });
      });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      act(() => {
        fireEvent.wheel(container, { deltaY: 100 });
      });
      // Only 100ms since second wheel event; 200ms debounce hasn't fired yet
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      // 200ms after last wheel event → zoom debounce fires → 500ms resume timer
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      vi.useRealTimers();
    });

    it('wheel-zoom: playing + wheel + manual Play click → flag cleared, no auto-resume', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      const container = screen.getByTestId('map-view');
      act(() => {
        fireEvent.wheel(container, { deltaY: 100 });
      });
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      act(() => {
        useTimelineStore.getState().setIsPlaying(true);
      });
      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      vi.useRealTimers();
    });

    it('pan + wheel-zoom interleaved: wheel zoom does not interfere with pan resume', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      simulateInteractionStart();
      expect(useTimelineStore.getState().isPlaying).toBe(false);
      simulateInteractionEnd();
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      vi.useRealTimers();
    });

    it('camera-fit viewState change (zoom != initial) does NOT trigger auto-pause', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      render(<MapView />);
      act(() => {
        capturedOnViewStateChange?.({
          viewState: { longitude: 10, latitude: 20, zoom: 5, pitch: 35, bearing: 0 },
          interactionState: { isPanning: false },
        });
      });
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      vi.useRealTimers();
    });

    it('tree click does NOT trigger auto-pause (only map gestures do)', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      const branchTable = makeBranchTable(3);
      const graph = makeGraph(3);
      setTreeState({ branchTable, graph });
      render(<MapView />);
      const container = screen.getByTestId('map-view');
      act(() => {
        fireEvent.click(container, { clientX: 100, clientY: 100 });
      });
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      vi.useRealTimers();
    });

    it('tree hover does NOT trigger auto-pause', () => {
      vi.useFakeTimers();
      useTimelineStore.setState({ isPlaying: true });
      const branchTable = makeBranchTable(3);
      setTreeState({ branchTable });
      render(<MapView />);
      const container = screen.getByTestId('map-view');
      act(() => {
        fireEvent.mouseMove(container, { clientX: 100, clientY: 100 });
        vi.runAllTimers();
      });
      expect(useTimelineStore.getState().isPlaying).toBe(true);
      vi.useRealTimers();
    });
  });

  it('deck picking integration: branch ArcLayer is pickable for click selection only', () => {
    const count = 3;
    const bt: BranchTable = {
      count,
      branchId: new Int32Array([10, 20, 30]),
      parentBranch: new Int32Array(count),
      isInternal: new Uint8Array(count),
      startTime: new Float32Array([2001.0, 2001.0, 2001.0]),
      endTime: new Float32Array([2002.0, 2002.0, 2002.0]),
      // Arc 0: (0°, 0°) → (10°, 0°); midpoint (5°, 0°)
      startLon: new Float32Array([0, 20, 40]),
      startLat: new Float32Array([0, 0, 0]),
      endLon: new Float32Array([10, 30, 50]),
      endLat: new Float32Array([0, 0, 0]),
      stateWeight: new Float32Array(count).fill(1),
    };
    const graph = makeGraph(3);
    setTreeState({ branchTable: bt, graph });
    useTimelineStore.setState({
      arcs: true,
      playhead: 2002.0,
      bounds: { min: 2001.0, max: 2002.0 },
    });

    render(<MapView />);

    const arcLayer = capturedLayers.find((l) => (l as { id?: string }).id === 'branches-slice') as
      | { data: Array<{ branchId: number }>; pickable?: boolean }
      | undefined;
    expect(arcLayer).toBeDefined();
    expect(arcLayer?.pickable).toBe(true);
    expect(arcLayer?.data[0]?.branchId).toBe(10);

    act(() => {
      capturedDeckOnClick?.({ object: arcLayer?.data[0] });
    });

    expect(useSelectionStore.getState().hoveredBranchId).toBeNull();
    expect(useUiStore.getState().pinnedSelection?.branchId).toBe(10);
  });
});
