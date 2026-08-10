// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedDeckSurface } from './UnifiedDeckSurface';

const deckState = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));
const basemapState = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));
const mapState = vi.hoisted(() => ({
  jumpTo: vi.fn(),
  onViewStateChange: vi.fn(),
}));
const treeState = vi.hoisted(() => ({
  onMouseDown: vi.fn(),
  onMouseMove: vi.fn(),
  onMouseUp: vi.fn(),
  onWheel: vi.fn(),
  onMouseLeave: vi.fn(),
  onClick: vi.fn(),
  onDoubleClick: vi.fn(),
  setSortOrder: vi.fn(),
  toggleFocusMode: vi.fn(),
  resetTreeZoom: vi.fn(),
}));

function renderDeckChildren(children: unknown): React.ReactNode {
  if (Array.isArray(children)) return children.map(renderDeckChildren);
  if (children && typeof children === 'object' && 'props' in children) {
    const props = (children as { props?: { children?: unknown; id?: string } }).props;
    if (props?.id === 'map') return renderDeckChildren(props.children);
  }
  return children as React.ReactNode;
}

vi.mock('@deck.gl/react', () => ({
  DeckGL: (props: Record<string, unknown>) => {
    deckState.props = props;
    return (
      <div data-testid="deckgl-root" data-deck-id={String(props.id)}>
        {renderDeckChildren(props.children)}
      </div>
    );
  },
}));

vi.mock('@deck.gl/core', () => ({
  MapView: class MockMapView {
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.props = props;
    }
  },
  OrthographicView: class MockOrthographicView {
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.props = props;
    }
  },
}));

vi.mock('../map-view/MapLibreBasemap', () => ({
  MapLibreBasemap: (props: Record<string, unknown>) => {
    basemapState.props = props;
    return <div data-testid="maplibre-basemap" />;
  },
}));

vi.mock('../map-view/EnvLegendOverlay', () => ({
  EnvLegendOverlay: () => <div data-testid="env-legend-overlay" />,
}));

vi.mock('../map-view/LassoTool', () => ({
  LassoTool: () => <div data-testid="lasso-tool" />,
}));

vi.mock('./Inspector', () => ({
  Inspector: ({ source }: { source: string }) => <div data-testid={`inspector-${source}`} />,
}));

const makeLayer = (id: string) => ({
  id,
  clone: vi.fn((props: Record<string, unknown>) => ({ id: props.id, props })),
});

const mapLayer = makeLayer('branches');
const treeLayer = makeLayer('branches');
const visibleViews = { tree: true, map: true, analysis: false };

vi.mock('../map-view/useMapDeckModel', () => ({
  useMapDeckModel: () => ({
    containerRef: { current: null },
    wheelTargetRef: { current: null },
    mapRef: { current: { getMap: () => ({ jumpTo: mapState.jumpTo }) } },
    sectionProps: {
      'aria-label': 'Map',
      onMouseMove: vi.fn(),
      onMouseLeave: vi.fn(),
      onClick: vi.fn(),
    },
    deckProps: {
      key: 1,
      initialViewState: { longitude: 1, latitude: 2, zoom: 3, pitch: 4, bearing: 5 },
      controller: true,
      layers: [mapLayer],
      onViewStateChange: mapState.onViewStateChange,
      useDevicePixels: 1,
      style: null,
    },
    mapProps: {
      mapStyle: 'style',
      canvasContextAttributes: { preserveDrawingBuffer: true },
      onLoad: vi.fn(),
    },
    overlays: {
      noGeoData: false,
      playheadDateLabel: '2020-01-01',
      clusterTooltip: null,
      branchTable: null,
      graph: null,
      layout: null,
    },
  }),
}));

vi.mock('../tree-view/useTreeGlDeckModel', () => ({
  useTreeGlDeckModel: () => ({
    containerRef: { current: null },
    rootProps: {
      'aria-label': 'Tree',
      style: {
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: 'default',
        userSelect: 'auto',
      },
      onMouseDown: treeState.onMouseDown,
      onMouseMove: treeState.onMouseMove,
      onMouseUp: treeState.onMouseUp,
      onWheel: treeState.onWheel,
      onMouseLeave: treeState.onMouseLeave,
      onClick: treeState.onClick,
      onDoubleClick: treeState.onDoubleClick,
    },
    deckProps: {
      initialViewState: { target: [0, 0, 0], zoom: 1 },
      viewState: { target: [0, 0, 0], zoom: 1 },
      layers: [treeLayer],
    },
    overlays: {
      sortOrder: 'file',
      setSortOrder: treeState.setSortOrder,
      focusMode: false,
      toggleFocusMode: treeState.toggleFocusMode,
      verticalSpacing: 1,
      resetTreeZoom: treeState.resetTreeZoom,
      canResetZoom: true,
      zoomBoxRect: null,
    },
  }),
}));

beforeEach(() => {
  deckState.props = null;
  basemapState.props = null;
  mapState.jumpTo.mockClear();
  mapState.onViewStateChange.mockClear();
  treeState.onMouseDown.mockClear();
  treeState.onMouseMove.mockClear();
  treeState.onMouseUp.mockClear();
  treeState.onWheel.mockClear();
  treeState.onMouseLeave.mockClear();
  treeState.onClick.mockClear();
  treeState.onDoubleClick.mockClear();
  treeState.setSortOrder.mockClear();
  treeState.toggleFocusMode.mockClear();
  treeState.resetTreeZoom.mockClear();
  mapLayer.clone.mockClear();
  treeLayer.clone.mockClear();
  class ResizeObserverMock {
    private readonly cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe() {
      this.cb(
        [{ contentRect: { width: 1000, height: 600 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UnifiedDeckSurface', () => {
  it('renders a single unified DeckGL root with map and tree views', () => {
    const contentRowRef = { current: null as HTMLDivElement | null };
    render(
      <UnifiedDeckSurface
        contentRowRef={contentRowRef}
        treeSplitFraction={0.5}
        onSplitterMouseDown={vi.fn()}
        visibleViews={visibleViews}
      />,
    );

    expect(screen.getByTestId('deckgl-root').dataset.deckId).toBe('unified-deck');
    expect(screen.getByTestId('maplibre-basemap')).toBeTruthy();
    expect(screen.getByTestId('tree-sort-toolbar')).toBeTruthy();
    expect(screen.getByTestId('inspector-tree')).toBeTruthy();
    expect(screen.getByTestId('inspector-map')).toBeTruthy();
    expect(screen.getByTestId('env-legend-overlay')).toBeTruthy();
    expect(screen.getByTestId('lasso-tool')).toBeTruthy();
    expect(screen.getByTestId('deckgl-root').parentElement).toBeTruthy();

    const props = deckState.props;
    expect(props?.id).toBe('unified-deck');
    const views = props?.views as Array<{ props: { controller?: unknown; id: string } }>;
    expect(views.map((view) => view.props.id)).toEqual(['tree', 'map']);
    expect(views[0]?.props.controller).toBe(false);
    expect(views[1]?.props.controller).toBe(true);
    expect(props?.controller).toBeUndefined();
    expect(props?.viewState).toBeUndefined();
    expect(props?.useDevicePixels).toBe(1);
    expect(props?.initialViewState).toEqual({
      tree: { target: [0, 0, 0], zoom: 1 },
      map: { longitude: 1, latitude: 2, zoom: 3, pitch: 4, bearing: 5 },
    });
    expect(basemapState.props).toMatchObject({
      mapStyle: 'style',
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
  });

  it('dims the tree sort toolbar after two seconds without hover or touch', () => {
    vi.useFakeTimers();
    try {
      render(
        <UnifiedDeckSurface
          contentRowRef={{ current: null }}
          treeSplitFraction={0.5}
          onSplitterMouseDown={vi.fn()}
          visibleViews={visibleViews}
        />,
      );

      const toolbar = screen.getByTestId('tree-sort-toolbar');
      expect((toolbar as HTMLElement).style.opacity).toBe('1');

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect((toolbar as HTMLElement).style.opacity).toBe('0.2');

      fireEvent.mouseEnter(toolbar);
      expect((toolbar as HTMLElement).style.opacity).toBe('1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps sort controls first and adds tree view controls', () => {
    render(
      <UnifiedDeckSurface
        contentRowRef={{ current: null }}
        treeSplitFraction={0.5}
        onSplitterMouseDown={vi.fn()}
        visibleViews={visibleViews}
      />,
    );
    const toolbar = screen.getByTestId('tree-sort-toolbar');
    const titles = Array.from(toolbar.querySelectorAll('button')).map((b) =>
      b.getAttribute('title'),
    );
    expect(titles).toEqual([
      'Ladderize descending (large clades on top)',
      'Ladderize ascending (small clades on top)',
      'Tree focus: drag to zoom; Up/Down adjust spacing (1x)',
      'Reset tree view',
    ]);
    expect(toolbar.querySelector('[title="File order (no sort)"]')).toBeNull();
  });

  it('wires unified tree overlay and zoom toolbar events to the tree model', () => {
    render(
      <UnifiedDeckSurface
        contentRowRef={{ current: null }}
        treeSplitFraction={0.5}
        onSplitterMouseDown={vi.fn()}
        visibleViews={visibleViews}
      />,
    );

    fireEvent.click(screen.getByTestId('tree-focus-toggle'));
    fireEvent.click(screen.getByTestId('tree-zoom-reset'));

    const treeOverlay = screen.getByRole('img', { name: 'Tree' });
    fireEvent.mouseDown(treeOverlay, { clientX: 20, clientY: 20, button: 0 });
    fireEvent.mouseUp(treeOverlay, { clientX: 80, clientY: 80, button: 0 });
    fireEvent.wheel(treeOverlay, { deltaY: 80 });

    expect(treeState.toggleFocusMode).toHaveBeenCalledTimes(1);
    expect(treeState.resetTreeZoom).toHaveBeenCalledTimes(1);
    expect(treeState.onMouseDown).toHaveBeenCalledTimes(1);
    expect(treeState.onMouseUp).toHaveBeenCalledTimes(1);
    expect(treeState.onWheel).toHaveBeenCalledTimes(1);
  });

  it('renders the basemap as a DeckGL map-view child instead of a separate fixed layer', () => {
    render(
      <UnifiedDeckSurface
        contentRowRef={{ current: null }}
        treeSplitFraction={0.5}
        onSplitterMouseDown={vi.fn()}
        visibleViews={visibleViews}
      />,
    );

    const child = deckState.props?.children as {
      type?: { name?: string };
      props?: { id?: string; children?: unknown };
    };

    expect(child?.props?.id).toBe('map');
    expect(screen.queryByTestId('unified-basemap')).toBeNull();
    expect(screen.getByTestId('maplibre-basemap')).toBeTruthy();
  });

  it('forwards map camera changes without imperatively moving a separate basemap', () => {
    render(
      <UnifiedDeckSurface
        contentRowRef={{ current: null }}
        treeSplitFraction={0.5}
        onSplitterMouseDown={vi.fn()}
        visibleViews={visibleViews}
      />,
    );

    const onViewStateChange = deckState.props?.onViewStateChange as (e: {
      viewId: string;
      viewState: {
        bearing: number;
        latitude: number;
        longitude: number;
        pitch: number;
        zoom: number;
      };
    }) => void;
    const event = {
      viewId: 'map',
      viewState: { longitude: 10, latitude: 20, zoom: 4, pitch: 5, bearing: 6 },
    };

    onViewStateChange(event);

    expect(mapState.jumpTo).not.toHaveBeenCalled();
    expect(mapState.onViewStateChange).toHaveBeenCalledWith(event);
  });

  it('clones layers with unique ids and explicit view ids', () => {
    render(
      <UnifiedDeckSurface
        contentRowRef={{ current: null }}
        treeSplitFraction={0.5}
        onSplitterMouseDown={vi.fn()}
        visibleViews={visibleViews}
      />,
    );

    expect(treeLayer.clone).toHaveBeenCalledWith({ id: 'tree:branches', viewId: 'tree' });
    expect(mapLayer.clone).toHaveBeenCalledWith({ id: 'map:branches', viewId: 'map' });
    expect(deckState.props?.layers).toEqual([
      { id: 'tree:branches', props: { id: 'tree:branches', viewId: 'tree' } },
      { id: 'map:branches', props: { id: 'map:branches', viewId: 'map' } },
    ]);
  });

  it('filters every layer to its own view', () => {
    render(
      <UnifiedDeckSurface
        contentRowRef={{ current: null }}
        treeSplitFraction={0.5}
        onSplitterMouseDown={vi.fn()}
        visibleViews={visibleViews}
      />,
    );

    const layerFilter = deckState.props?.layerFilter as (args: {
      layer: { id: string; props: { viewId?: string } };
      viewport: { id: string };
    }) => boolean;
    const layers = deckState.props?.layers as Array<{ id: string; props: { viewId?: string } }>;
    const [treeDeckLayer, mapDeckLayer] = layers;
    const treeFilteredLayer = { id: 'tree:branches-sublayer', props: {} };
    const mapFilteredLayer = { id: 'map:branches-sublayer', props: {} };

    expect(treeDeckLayer).toBeDefined();
    expect(mapDeckLayer).toBeDefined();
    if (!treeDeckLayer || !mapDeckLayer) throw new Error('expected unified deck layers');

    expect(layerFilter({ layer: treeDeckLayer, viewport: { id: 'tree' } })).toBe(true);
    expect(layerFilter({ layer: treeDeckLayer, viewport: { id: 'map' } })).toBe(false);
    expect(layerFilter({ layer: mapDeckLayer, viewport: { id: 'map' } })).toBe(true);
    expect(layerFilter({ layer: mapDeckLayer, viewport: { id: 'tree' } })).toBe(false);
    expect(layerFilter({ layer: treeFilteredLayer, viewport: { id: 'tree' } })).toBe(true);
    expect(layerFilter({ layer: treeFilteredLayer, viewport: { id: 'map' } })).toBe(false);
    expect(layerFilter({ layer: mapFilteredLayer, viewport: { id: 'map' } })).toBe(true);
    expect(layerFilter({ layer: mapFilteredLayer, viewport: { id: 'tree' } })).toBe(false);
  });

  it('keeps layer ids collision-free even when source hooks use the same ids', () => {
    render(
      <UnifiedDeckSurface
        contentRowRef={{ current: null }}
        treeSplitFraction={0.5}
        onSplitterMouseDown={vi.fn()}
        visibleViews={visibleViews}
      />,
    );

    const layers = deckState.props?.layers as Array<{ id: string; props: { viewId?: string } }>;
    expect(layers.map((layer) => layer.id)).toEqual(['tree:branches', 'map:branches']);
    expect(new Set(layers.map((layer) => layer.id)).size).toBe(layers.length);
    expect(
      layers.every((layer) => layer.props.viewId === 'tree' || layer.props.viewId === 'map'),
    ).toBe(true);
  });

  it('omits hidden tree views and layers', () => {
    render(
      <UnifiedDeckSurface
        contentRowRef={{ current: null }}
        treeSplitFraction={0.5}
        onSplitterMouseDown={vi.fn()}
        visibleViews={{ tree: false, map: true, analysis: false }}
      />,
    );

    const views = deckState.props?.views as Array<{ props: { id: string } }>;
    const layers = deckState.props?.layers as Array<{ id: string }>;
    expect(views.map((view) => view.props.id)).toEqual(['map']);
    expect(layers.map((layer) => layer.id)).toEqual(['map:branches']);
    expect(screen.queryByTestId('tree-panel')).toBeNull();
    expect(screen.queryByTestId('tree-sort-toolbar')).toBeNull();
  });

  it('omits hidden map views and layers', () => {
    render(
      <UnifiedDeckSurface
        contentRowRef={{ current: null }}
        treeSplitFraction={0.5}
        onSplitterMouseDown={vi.fn()}
        visibleViews={{ tree: true, map: false, analysis: false }}
      />,
    );

    const views = deckState.props?.views as Array<{ props: { id: string } }>;
    const layers = deckState.props?.layers as Array<{ id: string }>;
    expect(views.map((view) => view.props.id)).toEqual(['tree']);
    expect(layers.map((layer) => layer.id)).toEqual(['tree:branches']);
    expect(screen.queryByTestId('map-panel')).toBeNull();
    expect(screen.queryByTestId('maplibre-basemap')).toBeNull();
  });
});
