import { describe, it, expect, beforeEach } from 'vitest';
import { useTreeStore } from '../src/store/tree';
import { useTimelineStore } from '../src/store/timeline';
import { useSelectionStore } from '../src/store/selection';
import { useUiStore } from '../src/store/ui';
import type { BranchTable, GeoJSONPolygon } from '../src/lib/phylo/types';

function makeBranchTable(): BranchTable {
  return {
    count: 1,
    branchId: new Int32Array([1]),
    parentBranch: new Int32Array([-1]),
    isInternal: new Uint8Array([0]),
    startTime: new Float32Array([2000]),
    endTime: new Float32Array([2001]),
    startLat: new Float32Array([0]),
    startLon: new Float32Array([0]),
    endLat: new Float32Array([0]),
    endLon: new Float32Array([0]),
    stateWeight: new Float32Array([1]),
  };
}

function makePolygon(): GeoJSONPolygon {
  return {
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
}

describe('tree store', () => {
  beforeEach(() => {
    useTreeStore.setState({
      graph: null,
      layout: null,
      branchTable: null,
      nodeHpds: null,
      nodeMultiHpds: null,
      hpdRenderData: [],
      multiHpdRenderData: [],
      parseStatus: 'idle',
      parseError: null,
    });
  });

  it('starts with null values', () => {
    const s = useTreeStore.getState();
    expect(s.graph).toBeNull();
    expect(s.layout).toBeNull();
    expect(s.branchTable).toBeNull();
    expect(s.parseStatus).toBe('idle');
  });

  it('setParseStatus updates status and error', () => {
    useTreeStore.getState().setParseStatus('error', 'bad file');
    const s = useTreeStore.getState();
    expect(s.parseStatus).toBe('error');
    expect(s.parseError).toBe('bad file');
  });

  it('reset clears state', () => {
    useTreeStore.getState().setParseStatus('done');
    useTreeStore.getState().reset();
    expect(useTreeStore.getState().parseStatus).toBe('idle');
  });

  it('precomputes HPD render data when the branch table lands after HPDs', () => {
    const polygon = makePolygon();
    const store = useTreeStore.getState();

    store.setNodeHpds([null, polygon]);
    expect(useTreeStore.getState().hpdRenderData).toEqual([]);

    store.setBranchTable(makeBranchTable());

    expect(useTreeStore.getState().hpdRenderData).toEqual([
      { polygon, nodeTime: 2001, nodeIdx: 1 },
    ]);
  });

  it('precomputes multimodal HPD render data when HPDs land after the branch table', () => {
    const polygon = makePolygon();
    const store = useTreeStore.getState();

    store.setBranchTable(makeBranchTable());
    store.setNodeMultiHpds([null, [polygon, polygon]]);

    expect(useTreeStore.getState().multiHpdRenderData).toEqual([
      { polygon, nodeTime: 2001, nodeIdx: 1 },
      { polygon, nodeTime: 2001, nodeIdx: 1 },
    ]);
  });
});

describe('timeline store', () => {
  beforeEach(() => {
    useTimelineStore.setState({
      playhead: 2003.0,
      window: null,
      speed: 1,
      mode: 'Trail',
      isPlaying: false,
      bounds: null,
    });
  });

  it('initial state matches spec defaults', () => {
    const s = useTimelineStore.getState();
    expect(s.playhead).toBe(2003.0);
    expect(s.window).toBeNull();
    expect(s.speed).toBe(1);
    expect(s.mode).toBe('Trail');
    expect(s.isPlaying).toBe(false);
    expect(s.bounds).toBeNull();
  });

  it('setPlayhead updates playhead', () => {
    useTimelineStore.getState().setPlayhead(2010.5);
    expect(useTimelineStore.getState().playhead).toBe(2010.5);
  });

  it('setWindow sets window range', () => {
    useTimelineStore.getState().setWindow({ start: 2005.0, end: 2010.0 });
    expect(useTimelineStore.getState().window).toEqual({ start: 2005.0, end: 2010.0 });
  });

  it('setMode accepts both playback modes', () => {
    const store = useTimelineStore.getState();
    for (const mode of ['Trail', 'Window'] as const) {
      store.setMode(mode);
      expect(useTimelineStore.getState().mode).toBe(mode);
    }
  });

  it('setBounds sets bounds', () => {
    useTimelineStore.getState().setBounds({ min: 2000.0, max: 2020.0 });
    expect(useTimelineStore.getState().bounds).toEqual({ min: 2000.0, max: 2020.0 });
  });

  // Window-mode tail-off (chore/window-mode-tail-off): when the playhead
  // advances past bounds.max in Window mode, the visible window collapses
  // from the left instead of freezing mid-band. The persistent `windowSize`
  // is preserved across mode switches.

  it('setWindow stores the chosen width in `windowSize` and clears both on null', () => {
    const store = useTimelineStore.getState();
    store.setWindow({ start: 2005.0, end: 2010.0 });
    expect(useTimelineStore.getState().windowSize).toBe(5.0);
    store.setWindow(null);
    const s = useTimelineStore.getState();
    expect(s.window).toBeNull();
    expect(s.windowSize).toBeNull();
  });

  it('setPlayhead clamps window.end to bounds.max during tail-off', () => {
    useTimelineStore.setState({
      mode: 'Window',
      bounds: { min: 2000.0, max: 2010.0 },
    });
    useTimelineStore.getState().setWindow({ start: 2007.0, end: 2009.0 }); // W=2
    // Advance past bounds.max — window.end clamps to 2010, window.start = 2011 - 2 = 2009.
    useTimelineStore.getState().setPlayhead(2011.0);
    const s = useTimelineStore.getState();
    expect(s.window).toEqual({ start: 2009.0, end: 2010.0 });
    expect(s.windowSize).toBe(2.0);
  });

  it('setPlayhead returns null window once start passes bounds.max', () => {
    useTimelineStore.setState({
      mode: 'Window',
      bounds: { min: 2000.0, max: 2010.0 },
    });
    useTimelineStore.getState().setWindow({ start: 2007.0, end: 2009.0 }); // W=2
    // playhead = bounds.max + windowSize = 2012 → window.start = 2010 = bounds.max → collapse.
    useTimelineStore.getState().setPlayhead(2012.0);
    expect(useTimelineStore.getState().window).toBeNull();
    // windowSize PRESERVED so scrubbing back restores the original width.
    expect(useTimelineStore.getState().windowSize).toBe(2.0);
  });

  it('preserves windowSize across Window → Trail → Window switches', () => {
    useTimelineStore.setState({ mode: 'Window', bounds: { min: 2000.0, max: 2010.0 } });
    const store = useTimelineStore.getState();
    store.setWindow({ start: 2005.0, end: 2008.0 }); // W=3
    store.setMode('Trail');
    expect(useTimelineStore.getState().windowSize).toBe(3.0);
    store.setMode('Window');
    // Width persisted; setPlayhead now would re-derive a 3-year band.
    useTimelineStore.getState().setPlayhead(2007.0);
    const s = useTimelineStore.getState();
    expect(s.window?.end).toBeCloseTo(2007.0, 5);
    expect(s.window?.start).toBeCloseTo(2004.0, 5);
  });
});

describe('selection store', () => {
  beforeEach(() => {
    useSelectionStore.setState({
      hoveredId: null,
      selectedIds: [],
      compareSelection: [],
    });
  });

  it('initial state is empty', () => {
    const s = useSelectionStore.getState();
    expect(s.hoveredId).toBeNull();
    expect(s.selectedIds).toEqual([]);
    expect(s.compareSelection).toEqual([]);
  });

  it('setHoveredId and setSelectedIds work', () => {
    useSelectionStore.getState().setHoveredId(42);
    useSelectionStore.getState().setSelectedIds([1, 2, 3]);
    const s = useSelectionStore.getState();
    expect(s.hoveredId).toBe(42);
    expect(s.selectedIds).toEqual([1, 2, 3]);
  });

  it('toggleSelectedId adds and removes', () => {
    const store = useSelectionStore.getState();
    store.toggleSelectedId(5);
    expect(useSelectionStore.getState().selectedIds).toContain(5);
    store.toggleSelectedId(5);
    expect(useSelectionStore.getState().selectedIds).not.toContain(5);
  });

  it('clearSelection resets all', () => {
    useSelectionStore.getState().setHoveredId(1);
    useSelectionStore.getState().setSelectedIds([1, 2]);
    useSelectionStore.getState().setCompareSelection([3]);
    useSelectionStore.getState().clearSelection();
    const s = useSelectionStore.getState();
    expect(s.hoveredId).toBeNull();
    expect(s.selectedIds).toEqual([]);
    expect(s.compareSelection).toEqual([]);
  });
});

describe('ui store', () => {
  beforeEach(() => {
    useUiStore.setState({
      activePanel: null,
      theme: 'dark',
      treePanelWidth: 0,
      sidePanelWidth: 280,
      analysisPanelHeight: 156,
      timelineHeight: 56,
    });
  });

  it('initial state has correct defaults', () => {
    const s = useUiStore.getState();
    expect(s.activePanel).toBeNull();
    expect(s.theme).toBe('dark');
    expect(s.sidePanelWidth).toBe(280);
    expect(s.analysisPanelHeight).toBe(156);
    expect(s.timelineHeight).toBe(56);
  });

  it('setActivePanel updates panel', () => {
    useUiStore.getState().setActivePanel('style');
    expect(useUiStore.getState().activePanel).toBe('style');
    useUiStore.getState().setActivePanel(null);
    expect(useUiStore.getState().activePanel).toBeNull();
  });

  it('setTheme accepts all three values', () => {
    const store = useUiStore.getState();
    for (const theme of ['dark', 'light', 'system'] as const) {
      store.setTheme(theme);
      expect(useUiStore.getState().theme).toBe(theme);
    }
  });
});
