// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTreeStore } from '../../store/tree';
import { DEFAULT_VISIBLE_VIEWS, useUiStore } from '../../store/ui';
import { Viewer } from './Viewer';

vi.mock('../analysis/AnalysisPanel', () => ({
  AnalysisPanel: ({ fill }: { fill?: boolean }) => (
    <div data-testid={fill ? 'analysis-panel-fill' : 'analysis-panel'} />
  ),
}));

vi.mock('./UnifiedDeckViewer', () => ({
  UnifiedDeckViewer: ({
    contentRowRef,
    onSplitterMouseDown,
    visibleViews,
  }: {
    contentRowRef: React.MutableRefObject<HTMLDivElement | null>;
    onSplitterMouseDown: React.MouseEventHandler<HTMLButtonElement>;
    visibleViews: Record<string, boolean>;
  }) => (
    <div data-testid="unified-deck-viewer">
      <div ref={contentRowRef} data-testid="content-row">
        {visibleViews.tree && <div data-testid="tree-panel" />}
        {visibleViews.tree && visibleViews.map && (
          <button type="button" data-testid="splitter" onMouseDown={onSplitterMouseDown} />
        )}
        {visibleViews.map && <div data-testid="map-panel" />}
      </div>
    </div>
  ),
}));

vi.mock('../timeline/TimelineStrip', () => ({
  TimelineStrip: () => <div data-testid="timeline-strip" />,
}));

vi.mock('../timeline/useKeyboardTransport', () => ({
  useKeyboardTransport: () => {},
}));

beforeEach(() => {
  window.history.pushState({}, '', '/');
  useTreeStore.setState({
    graph: null,
    layout: null,
    branchTable: null,
    parseStatus: 'idle',
    parseError: null,
    fileName: null,
  });
  useUiStore.setState({
    activePanel: null,
    visibleViews: { ...DEFAULT_VISIBLE_VIEWS },
    analysisPanelHeight: 156,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Viewer', () => {
  it('renders new chassis: header, sidebar, content row, timeline, no icon rail', async () => {
    render(<Viewer />);
    expect(screen.getByTestId('app-header')).toBeTruthy();
    expect(screen.getByTestId('sidebar')).toBeTruthy();
    expect(await screen.findByTestId('content-row')).toBeTruthy();
    expect(screen.getByTestId('timeline-container')).toBeTruthy();
    expect(screen.queryByTestId('icon-rail')).toBeNull();
  });

  it('timeline is below the content row, not inside it', async () => {
    render(<Viewer />);
    const contentRow = await screen.findByTestId('content-row');
    const timeline = screen.getByTestId('timeline-container');
    expect(contentRow.contains(timeline)).toBe(false);
    expect(timeline).toBeTruthy();
  });

  it('uses the unified DeckGL workspace by default', async () => {
    render(<Viewer />);
    expect(await screen.findByTestId('unified-deck-viewer')).toBeTruthy();
  });

  it('ignores unknown dev renderer flags', async () => {
    window.history.pushState({}, '', '/?dev=unknown-renderer');
    render(<Viewer />);
    expect(await screen.findByTestId('unified-deck-viewer')).toBeTruthy();
  });

  it('still accepts dev tree-gl as the default unified workspace', async () => {
    window.history.pushState({}, '', '/?dev=tree-gl');
    render(<Viewer />);
    expect(await screen.findByTestId('unified-deck-viewer')).toBeTruthy();
  });

  it('hides tree or map panels from the default workspace', async () => {
    useUiStore.setState({ visibleViews: { tree: false, map: true, analysis: false } });
    render(<Viewer />);
    expect(screen.queryByTestId('tree-panel')).toBeNull();
    expect(screen.queryByTestId('splitter')).toBeNull();
    expect(await screen.findByTestId('map-panel')).toBeTruthy();
  });

  it('renders analysis above the playback bar when analysis is visible with deck views', () => {
    useUiStore.setState({ visibleViews: { tree: true, map: true, analysis: true } });
    render(<Viewer />);
    const mainColumn = screen.getByTestId('main-column');
    const children = Array.from(mainColumn.children);
    const analysis = screen.getByTestId('analysis-container');
    const timeline = screen.getByTestId('timeline-container');

    expect(screen.getByTestId('analysis-splitter')).toBeTruthy();
    expect(analysis).toBeTruthy();
    expect(screen.getByTestId('analysis-panel')).toBeTruthy();
    expect(screen.queryByTestId('analysis-panel-fill')).toBeNull();
    expect(children.indexOf(analysis)).toBeLessThan(children.indexOf(timeline));
  });

  it('renders analysis-only mode without mounting the unified DeckGL route', async () => {
    window.history.pushState({}, '', '/?dev=tree-gl');
    useUiStore.setState({ visibleViews: { tree: false, map: false, analysis: true } });
    render(<Viewer />);
    expect(await screen.findByTestId('analysis-panel-fill')).toBeTruthy();
    expect(screen.queryByTestId('unified-deck-viewer')).toBeNull();
  });

  it('drag splitter updates tree fraction', async () => {
    render(<Viewer />);
    const splitter = await screen.findByTestId('splitter');
    const contentRow = await screen.findByTestId('content-row');
    const initialFraction = useUiStore.getState().treeSplitFraction;

    vi.spyOn(contentRow, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      height: 600,
      width: 800,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    fireEvent.mouseDown(splitter);
    fireEvent.mouseMove(window, { clientX: 200 });
    fireEvent.mouseUp(window);

    expect(useUiStore.getState().treeSplitFraction).not.toBe(initialFraction);
  });

  it('dragging analysis splitter updates analysis panel height', () => {
    useUiStore.setState({ visibleViews: { tree: true, map: true, analysis: true } });
    render(<Viewer />);
    const splitter = screen.getByTestId('analysis-splitter');
    const mainColumn = screen.getByTestId('main-column');
    const initialHeight = useUiStore.getState().analysisPanelHeight;

    vi.spyOn(mainColumn, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      bottom: 700,
      right: 1000,
      height: 700,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    fireEvent.mouseDown(splitter);
    fireEvent.mouseMove(window, { clientY: 374 });
    fireEvent.mouseUp(window);

    expect(useUiStore.getState().analysisPanelHeight).not.toBe(initialHeight);
    expect(useUiStore.getState().analysisPanelHeight).toBe(270);
  });

  it('drawer renders and is closed by default', () => {
    render(<Viewer />);
    const drawer = screen.getByTestId('drawer');
    expect(drawer.className).toContain('drawerClosed');
  });

  it('drawer opens when header icon is clicked', () => {
    render(<Viewer />);
    fireEvent.click(screen.getByTestId('header-btn-style'));
    const drawer = screen.getByTestId('drawer');
    expect(drawer.className).toContain('drawerOpen');
  });
});
