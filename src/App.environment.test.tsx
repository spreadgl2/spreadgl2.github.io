// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FeatureCollection } from 'geojson';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useEnvStore } from './store/env';
import { useTimelineStore } from './store/timeline';
import { useTreeStore } from './store/tree';

const boundary: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Anhui' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [90, 20],
            [120, 20],
            [120, 40],
            [90, 40],
            [90, 20],
          ],
        ],
      },
    },
  ],
};

const parsedResult = {
  graph: {
    nodes: [],
    root: {},
    origIdToIdx: new Map(),
    rooted: true,
    hiddenNodeIds: new Set(),
    collapsedCladeIds: new Map(),
  },
  layout: { nodes: [], nodeMap: new Map(), maxX: 0, maxY: 0, xAxisMode: 'date' as const },
  branchTable: {
    count: 1,
    branchId: new Int32Array([0]),
    parentBranch: new Int32Array([-1]),
    isInternal: new Uint8Array([0]),
    startTime: new Float32Array([2010]),
    endTime: new Float32Array([2011]),
    startLat: new Float32Array([30]),
    startLon: new Float32Array([105]),
    endLat: new Float32Array([31]),
    endLon: new Float32Array([106]),
    stateWeight: new Float32Array([1]),
  },
  dateRange: [2010, 2011] as [number, number],
  traitInfo: { kind: 'unrecognized' as const, reason: 'test fixture' },
  nodeHpds: [],
  allDiscreteKeys: [],
  nodeMultiHpds: [],
};

vi.mock('./features/loader/Loader', () => ({
  Loader: ({
    onParsed,
  }: {
    onParsed: (
      result: typeof parsedResult,
      opts?: {
        pendingBoundary?: { id: string; name: string; geojson: FeatureCollection };
        pendingEnvironment?: { id: string; name: string; text: string };
      },
    ) => void;
  }) => (
    <button
      type="button"
      data-testid="mock-load-pedv"
      onClick={() =>
        onParsed(parsedResult, {
          pendingBoundary: { id: 'boundaries-pedv', name: 'boundaries.geojson', geojson: boundary },
          pendingEnvironment: {
            id: 'environment-pedv',
            name: 'environment.csv',
            text: 'location,temperature\nAnhui,16\n',
          },
        })
      }
    >
      Load PEDV
    </button>
  ),
}));

vi.mock('./features/viewer/Viewer', () => ({
  Viewer: () => <div data-testid="viewer-mock" />,
}));

vi.mock('./features/timeline/playback', () => ({
  usePlaybackLoop: () => {},
}));

beforeEach(() => {
  vi.stubGlobal(
    'Worker',
    class FakeWorker {
      terminate() {}
      addEventListener() {}
    },
  );
  useTreeStore.getState().reset();
  useEnvStore.setState({ columns: [], activeKey: null, paletteOverride: {} });
  useTimelineStore.setState({ playhead: 0, bounds: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App example environment preload', () => {
  it('loads pending example environment CSV as a choropleth region layer', async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('mock-load-pedv'));

    await waitFor(() => {
      expect(screen.getByTestId('viewer-mock')).toBeTruthy();
    });

    const tree = useTreeStore.getState();
    const env = useEnvStore.getState();

    expect(tree.customOverlays).toHaveLength(1);
    expect(tree.choroplethOverlays).toHaveLength(1);
    expect(tree.choroplethOverlays[0]).toMatchObject({
      id: 'environment-pedv',
      name: 'environment',
      valueColumn: 'temperature',
      locationCol: 'location',
    });
    expect(tree.choroplethOverlays[0]?.valueByLocation.get('Anhui')).toBe(16);
    expect(env.columns.map((c) => c.key)).toEqual(['temperature']);
    expect(env.activeKey).toBe('temperature');
  });
});
