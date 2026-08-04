import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_VISIBLE_VIEWS, useUiStore } from './ui';

describe('useUiStore visibleViews', () => {
  beforeEach(() => {
    useUiStore.setState({
      visibleViews: { ...DEFAULT_VISIBLE_VIEWS },
      lassoMode: false,
      lassoVertices: [],
      pickLocationName: null,
      hoveredLocationName: null,
    });
  });

  it('toggles individual workspace views', () => {
    useUiStore.getState().toggleVisibleView('map');
    expect(useUiStore.getState().visibleViews).toEqual({
      tree: true,
      map: false,
      analysis: false,
    });
  });

  it('defaults the analysis strip off (secondary, opt-in panel)', () => {
    expect(DEFAULT_VISIBLE_VIEWS.analysis).toBe(false);
    expect(DEFAULT_VISIBLE_VIEWS.tree).toBe(true);
    expect(DEFAULT_VISIBLE_VIEWS.map).toBe(true);
  });

  it('defaults the tree sort order to descending (file-order is no longer selectable)', () => {
    expect(useUiStore.getState().treeSortOrder).toBe('desc');
  });

  it('refuses to disable the last visible workspace view', () => {
    useUiStore.setState({ visibleViews: { tree: true, map: false, analysis: false } });
    useUiStore.getState().setVisibleView('tree', false);
    expect(useUiStore.getState().visibleViews).toEqual({
      tree: true,
      map: false,
      analysis: false,
    });
  });

  it('allows analysis-only mode', () => {
    useUiStore.getState().setVisibleView('analysis', true);
    useUiStore.getState().setVisibleView('tree', false);
    useUiStore.getState().setVisibleView('map', false);
    expect(useUiStore.getState().visibleViews).toEqual({
      tree: false,
      map: false,
      analysis: true,
    });
  });

  it('entering pick-location mode cancels lasso mode', () => {
    useUiStore.setState({ lassoMode: true, lassoVertices: [[1, 2]] });
    useUiStore.getState().setPickLocationName('Beijing');
    expect(useUiStore.getState().pickLocationName).toBe('Beijing');
    expect(useUiStore.getState().lassoMode).toBe(false);
    expect(useUiStore.getState().lassoVertices).toEqual([]);
  });

  it('activating lasso mode cancels pick-location mode', () => {
    useUiStore.setState({ pickLocationName: 'Beijing' });
    useUiStore.getState().setLassoMode(true);
    expect(useUiStore.getState().lassoMode).toBe(true);
    expect(useUiStore.getState().pickLocationName).toBeNull();
  });

  it('tracks the location row currently previewed on the map', () => {
    useUiStore.getState().setHoveredLocationName('Beijing');
    expect(useUiStore.getState().hoveredLocationName).toBe('Beijing');
    useUiStore.getState().setHoveredLocationName(null);
    expect(useUiStore.getState().hoveredLocationName).toBeNull();
  });
});
