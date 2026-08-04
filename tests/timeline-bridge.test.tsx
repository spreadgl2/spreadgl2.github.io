// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlaybackLoop } from '../src/features/timeline/playback';
import { effectivePlaybackSpeed } from '../src/features/timeline/speed-config';
import type { BranchTable } from '../src/lib/phylo/types';
import { useTimelineStore } from '../src/store/timeline';
import { useTreeStore } from '../src/store/tree';

// ─── MapView mocks ───────────────────────────────────────────────────────────

let capturedCurrentTime: number | null = null;

vi.mock('@deck.gl/react', () => ({
  DeckGL: ({ layers }: { layers: unknown[] }) => {
    const layer = layers[0] as { currentTime?: number } | undefined;
    capturedCurrentTime = layer?.currentTime ?? null;
    return <div data-testid="deckgl" />;
  },
}));

vi.mock('react-map-gl/maplibre', () => ({
  Map: () => <div />,
}));

vi.mock('@deck.gl/geo-layers', () => ({
  TripsLayer: class TripsLayer {
    currentTime: number;
    id: string;
    data: unknown[];
    constructor(props: { id: string; currentTime: number; data: unknown[] }) {
      this.id = props.id;
      this.currentTime = props.currentTime;
      this.data = props.data;
    }
  },
}));

vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

vi.mock('../src/lib/map/arc-hover-index', () => ({
  buildArcHoverIndex: vi.fn(() => ({ root: {} })),
  queryNearestArc: vi.fn(() => null),
}));

// jsdom does not implement ResizeObserver — stub it so MapView components don't throw.
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeBranchTable(): BranchTable {
  const count = 3;
  return {
    count,
    branchId: new Int32Array([0, 1, 2]),
    parentBranch: new Int32Array([0, 0, 1]),
    isInternal: new Uint8Array([1, 1, 0]),
    startTime: new Float32Array([2000.0, 2001.0, 2002.0]),
    endTime: new Float32Array([2001.0, 2002.0, 2003.0]),
    startLat: new Float32Array([0, 1, 2]),
    startLon: new Float32Array([0, 1, 2]),
    endLat: new Float32Array([1, 2, 3]),
    endLon: new Float32Array([1, 2, 3]),
  };
}

function PlaybackWrapper() {
  usePlaybackLoop();
  return null;
}

// ─── usePlaybackLoop rAF loop ─────────────────────────────────────────────────

describe('usePlaybackLoop rAF loop', () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let rafIdCounter: number;
  let origRaf: typeof requestAnimationFrame;
  let origCancelRaf: typeof cancelAnimationFrame;

  beforeEach(() => {
    rafCallbacks = new Map();
    rafIdCounter = 0;
    origRaf = globalThis.requestAnimationFrame;
    origCancelRaf = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      const id = ++rafIdCounter;
      rafCallbacks.set(id, cb);
      return id;
    };
    globalThis.cancelAnimationFrame = (id: number) => {
      rafCallbacks.delete(id);
    };

    useTimelineStore.setState({
      playhead: 2003.0,
      bounds: { min: 2000.0, max: 2015.0 },
      isPlaying: false,
      speed: 1,
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = origRaf;
    globalThis.cancelAnimationFrame = origCancelRaf;
    cleanup();
  });

  async function flushRaf(timestamp: number) {
    const cbs = Array.from(rafCallbacks.entries());
    rafCallbacks = new Map();
    await act(async () => {
      for (const [, cb] of cbs) cb(timestamp);
    });
  }

  // Playback is dataset-normalized. The new displayed 1× equals the previous
  // 2× pace, so per-frame advance = (range / 20) * effectiveSpeed * dt.
  const TARGET_FULL_PLAYBACK_SECONDS = 20;
  const RANGE = 15; // bounds 2000..2015 set in beforeEach

  it('advances playhead by (range / 20) * effective speed * (delta / 1000) at 1×', async () => {
    await act(async () => {
      render(<PlaybackWrapper />);
    });

    await act(async () => {
      useTimelineStore.getState().setIsPlaying(true);
    });

    const frameDeltaMs = 16.667;
    let wallTime = 1000;

    // First tick: records lastTimestamp, no playhead advance
    await flushRaf(wallTime);

    wallTime += frameDeltaMs;
    const before = useTimelineStore.getState().playhead;
    await flushRaf(wallTime);
    const after = useTimelineStore.getState().playhead;

    const expectedDelta =
      (RANGE / TARGET_FULL_PLAYBACK_SECONDS) *
      effectivePlaybackSpeed(1) *
      (frameDeltaMs / 1000);
    expect(Math.abs(after - before - expectedDelta)).toBeLessThan(0.00001);
  });

  it('advances playhead by (range / 20) * effective speed * (delta / 1000) at 4×', async () => {
    useTimelineStore.setState({ speed: 4 });

    await act(async () => {
      render(<PlaybackWrapper />);
    });

    await act(async () => {
      useTimelineStore.getState().setIsPlaying(true);
    });

    const frameDeltaMs = 16.667;
    let wallTime = 1000;

    await flushRaf(wallTime);

    wallTime += frameDeltaMs;
    const before = useTimelineStore.getState().playhead;
    await flushRaf(wallTime);
    const after = useTimelineStore.getState().playhead;

    const expectedDelta =
      (RANGE / TARGET_FULL_PLAYBACK_SECONDS) *
      effectivePlaybackSpeed(4) *
      (frameDeltaMs / 1000);
    expect(Math.abs(after - before - expectedDelta)).toBeLessThan(0.00001);
  });

  it('clamps to bounds.max and sets isPlaying = false', async () => {
    useTimelineStore.setState({
      playhead: 2014.99,
      bounds: { min: 2000.0, max: 2015.0 },
      speed: 1,
    });

    await act(async () => {
      render(<PlaybackWrapper />);
    });

    await act(async () => {
      useTimelineStore.getState().setIsPlaying(true);
    });

    let wallTime = 1000;
    await flushRaf(wallTime);

    // The 1000 ms delta clamps to MAX_FRAME_DELTA_MS, but even the clamped step
    // carries 2014.99 past bounds.max (2015.0), so the playhead clamps and stops.
    wallTime += 1000;
    await flushRaf(wallTime);

    const state = useTimelineStore.getState();
    expect(state.playhead).toBe(2015.0);
    expect(state.isPlaying).toBe(false);
  });

  it('Window mode: playhead crosses bounds.max, continues, and stops at bounds.max + windowSize', async () => {
    // bounds.max = 2015.0, windowSize = 2.0 → effective end = 2017.0.
    useTimelineStore.setState({
      playhead: 2014.5,
      bounds: { min: 2000.0, max: 2015.0 },
      mode: 'Window',
      windowSize: 2.0,
      speed: 4,
    });

    await act(async () => {
      render(<PlaybackWrapper />);
    });

    await act(async () => {
      useTimelineStore.getState().setIsPlaying(true);
    });

    // Advance in 40 ms frames — below the loop's per-frame delta clamp, so each
    // frame steps the true amount — until each milestone is reached.
    let wallTime = 1000;
    await flushRaf(wallTime); // first tick only records the timestamp
    const stepUntil = async (done: () => boolean) => {
      for (let i = 0; i < 200 && !done(); i++) {
        wallTime += 40;
        await flushRaf(wallTime);
      }
    };

    // Window mode keeps playing after the playhead passes bounds.max (2015.0);
    // the visible band shrinks from the left until window.start ≥ bounds.max.
    await stepUntil(() => useTimelineStore.getState().playhead > 2015.0);
    expect(useTimelineStore.getState().playhead).toBeGreaterThan(2015.0);
    expect(useTimelineStore.getState().isPlaying).toBe(true);

    // Continues to the effective end (bounds.max + windowSize = 2017.0), where
    // it clamps exactly and stops.
    await stepUntil(() => !useTimelineStore.getState().isPlaying);
    expect(useTimelineStore.getState().playhead).toBe(2017.0);
    expect(useTimelineStore.getState().isPlaying).toBe(false);
  });

  it('stops advancing after isPlaying flips false', async () => {
    await act(async () => {
      render(<PlaybackWrapper />);
    });

    await act(async () => {
      useTimelineStore.getState().setIsPlaying(true);
    });

    let wallTime = 1000;
    await flushRaf(wallTime);

    // At least one rAF is pending
    expect(rafCallbacks.size).toBeGreaterThan(0);

    await act(async () => {
      useTimelineStore.getState().setIsPlaying(false);
    });

    const playheadBefore = useTimelineStore.getState().playhead;
    wallTime += 16.667;
    await flushRaf(wallTime);
    const playheadAfter = useTimelineStore.getState().playhead;

    // Playhead does not advance after stop
    expect(playheadAfter).toBe(playheadBefore);
  });
});

// ─── MapView currentTime ↔ playhead synchrony ─────────────────────────────────

describe('MapView currentTime reflects playhead (drift = 0)', () => {
  beforeEach(() => {
    capturedCurrentTime = null;
    useTimelineStore.setState({
      playhead: 2007.5,
      bounds: { min: 2000.0, max: 2015.0 },
      isPlaying: false,
      speed: 1,
      arcs: false,
    });
    useTreeStore.setState({ branchTable: makeBranchTable() });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('currentTime in TripsLayer equals playhead on initial render', async () => {
    const { MapView } = await import('../src/features/map-view/MapView');

    await act(async () => {
      render(<MapView />);
    });

    expect(capturedCurrentTime).toBe(2007.5);
  });

  it('currentTime updates synchronously with playhead — max drift < 16.6 ms across 10 scrub frames', async () => {
    const { MapView } = await import('../src/features/map-view/MapView');

    await act(async () => {
      render(<MapView />);
    });

    const samples: Array<{ playhead: number; currentTime: number }> = [];

    for (let i = 0; i < 10; i++) {
      const t = 2007.5 + i * (1 / 365.25);
      await act(async () => {
        useTimelineStore.getState().setPlayhead(t);
      });
      samples.push({
        playhead: useTimelineStore.getState().playhead,
        currentTime: capturedCurrentTime ?? 0,
      });
    }

    let maxDriftDecYear = 0;
    for (const { playhead, currentTime } of samples) {
      const drift = Math.abs(playhead - currentTime);
      if (drift > maxDriftDecYear) maxDriftDecYear = drift;
    }

    // Convert dec-year drift to ms (1 year ≈ 31,557,600 ms)
    const maxDriftMs = maxDriftDecYear * 31_557_600;
    expect(maxDriftMs).toBeLessThan(16.6);
  });
});
