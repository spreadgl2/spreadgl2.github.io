// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTimelineStore } from '../../store/timeline';
import { useUiStore } from '../../store/ui';
import { TimelineStrip } from './TimelineStrip';

vi.mock('../../lib/format/decimal-year', () => ({
  decimalYearToISO: (y: number) => `${Math.floor(y)}-01-01`,
}));

vi.mock('./TimelineStrip.module.css', () => ({ default: {} }));

function makeBoundedStore(min: number, max: number, playhead?: number) {
  useTimelineStore.setState({
    bounds: { min, max },
    playhead: playhead ?? min,
    window: null,
    windowSize: null,
    mode: 'Trail',
    isPlaying: false,
    speed: 1,
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useTimelineStore.setState({
    bounds: null,
    playhead: 2003.0,
    window: null,
    windowSize: null,
    mode: 'Trail',
    arcs: false,
    clade: false,
    isPlaying: false,
    speed: 1,
  });
  useUiStore.setState({ reducedMotion: false });
});

describe('TimelineStrip', () => {
  it('renders scrubber and transport when bounds are set', () => {
    makeBoundedStore(2000, 2010, 2000);
    render(<TimelineStrip />);
    expect(screen.getByTestId('timeline-track')).toBeTruthy();
    expect(screen.getByTestId('scrubber-dot')).toBeTruthy();
    expect(screen.getByTestId('btn-play')).toBeTruthy();
    expect(screen.getByTestId('btn-jump-start')).toBeTruthy();
    expect(screen.getByTestId('btn-jump-end')).toBeTruthy();
    expect(screen.getByTestId('playhead-readout')).toBeTruthy();
  });

  it('stops and disables automatic playback when reduced motion is enabled', () => {
    makeBoundedStore(2000, 2010, 2005);
    useTimelineStore.setState({ isPlaying: true });
    useUiStore.setState({ reducedMotion: true });
    render(<TimelineStrip />);

    expect((screen.getByTestId('btn-play') as HTMLButtonElement).disabled).toBe(true);
    expect(useTimelineStore.getState().isPlaying).toBe(false);
  });

  it('keeps the scrubber dot visible after the paused playhead-marker delay', () => {
    vi.useFakeTimers();
    makeBoundedStore(2000, 2010, 2005);
    render(<TimelineStrip />);

    expect(screen.getByTestId('scrubber-dot')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(screen.getByTestId('scrubber-dot')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('scrubber-dot')).toBeTruthy();

    act(() => {
      useTimelineStore.setState({ isPlaying: true });
    });
    expect(screen.getByTestId('scrubber-dot')).toBeTruthy();
  });

  it('renders empty placeholder when bounds are null', () => {
    render(<TimelineStrip />);
    expect(screen.getByTestId('timeline-strip')).toBeTruthy();
    expect(screen.queryByTestId('timeline-track')).toBeNull();
  });

  it('click track at 50% sets playhead to midpoint of bounds', () => {
    makeBoundedStore(2000, 2010, 2000);
    render(<TimelineStrip />);

    const track = screen.getByTestId('timeline-track');

    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.mouseDown(track, { clientX: 100, shiftKey: false });

    const { playhead } = useTimelineStore.getState();
    expect(playhead).toBeCloseTo(2005, 1);
  });

  it('scrubbing keeps the Window band trailing with the circle at its right edge', () => {
    makeBoundedStore(2000, 2010, 2000);
    useTimelineStore.setState({ mode: 'Window', window: { start: 1998, end: 2000 } });
    render(<TimelineStrip />);

    const track = screen.getByTestId('timeline-track');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.mouseDown(track, { clientX: 60, shiftKey: false });
    fireEvent.mouseMove(document, { clientX: 160 });

    const state = useTimelineStore.getState();
    expect(state.playhead).toBeCloseTo(2008, 1);
    if (!state.window) throw new Error('window is null');
    // playhead pinned to the window's right edge, 2-year width preserved
    expect(state.window.end).toBeCloseTo(2008, 1);
    expect(state.window.start).toBeCloseTo(2006, 1);
  });

  it('entering Window mode seeds a band that ends at the playhead', () => {
    makeBoundedStore(2000, 2010, 2006);
    render(<TimelineStrip />);

    fireEvent.click(screen.getByTestId('mode-pill-window'));

    const state = useTimelineStore.getState();
    expect(state.mode).toBe('Window');
    if (!state.window) throw new Error('window is null');
    expect(state.window.end).toBeCloseTo(2006, 5);
    expect(state.window.start).toBeCloseTo(2005.5, 5);
    expect(state.windowSize).toBeCloseTo(0.5, 5);
  });

  it('hides the window band outside Window mode', () => {
    makeBoundedStore(2000, 2010, 2005);
    useTimelineStore.setState({ mode: 'Trail', window: { start: 2003, end: 2005 } });
    render(<TimelineStrip />);
    expect(screen.queryByTestId('window-region')).toBeNull();
  });

  it('shows the window band in Window mode', () => {
    makeBoundedStore(2000, 2010, 2005);
    useTimelineStore.setState({ mode: 'Window', window: { start: 2003, end: 2005 } });
    render(<TimelineStrip />);
    expect(screen.getByTestId('window-region')).toBeTruthy();
  });

  it('lets the window band extend left of the track into t<0', () => {
    makeBoundedStore(2000, 2010, 2000);
    useTimelineStore.setState({ mode: 'Window', window: { start: 1998, end: 2000 } });
    render(<TimelineStrip />);
    const band = screen.getByTestId('window-region');
    expect(band.style.left).toBe('-20%');
    expect(band.style.width).toBe('20%');
  });

  it('hides the window-start handle outside Window mode', () => {
    makeBoundedStore(2000, 2010, 2005);
    useTimelineStore.setState({ mode: 'Trail', window: { start: 2003, end: 2005 } });
    render(<TimelineStrip />);
    expect(screen.queryByTestId('window-handle')).toBeNull();
  });

  it('dragging the window-start handle resizes the window from the left', () => {
    makeBoundedStore(2000, 2010, 2008);
    useTimelineStore.setState({ mode: 'Window', window: { start: 2006, end: 2008 } });
    render(<TimelineStrip />);

    const track = screen.getByTestId('timeline-track');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.mouseDown(screen.getByTestId('window-handle'));
    fireEvent.mouseMove(document, { clientX: 40 });

    const state = useTimelineStore.getState();
    if (!state.window) throw new Error('window is null');
    // left edge moved, right edge + playhead stay pinned
    expect(state.window.start).toBeCloseTo(2002, 1);
    expect(state.window.end).toBeCloseTo(2008, 1);
    expect(state.playhead).toBeCloseTo(2008, 1);
  });

  it('resizing pulls the window start before t=0 without snapping', () => {
    makeBoundedStore(2000, 2010, 2005);
    useTimelineStore.setState({ mode: 'Window', window: { start: 2003, end: 2005 } });
    render(<TimelineStrip />);

    const track = screen.getByTestId('timeline-track');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 300,
      width: 200,
      top: 0,
      bottom: 10,
      height: 10,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.mouseDown(screen.getByTestId('window-handle'));
    fireEvent.mouseMove(document, { clientX: 60 });

    const state = useTimelineStore.getState();
    if (!state.window) throw new Error('window is null');
    expect(state.window.start).toBeLessThan(2000);
    expect(state.window.start).toBeCloseTo(1998, 1);
    expect(state.window.end).toBeCloseTo(2005, 1);
  });

  it('shift+drag on track sets window and auto-switches mode to Window', () => {
    makeBoundedStore(2000, 2010, 2000);
    render(<TimelineStrip />);

    const track = screen.getByTestId('timeline-track');

    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.mouseDown(track, { clientX: 40, shiftKey: true });

    fireEvent.mouseMove(document, { clientX: 120 });

    const state = useTimelineStore.getState();
    expect(state.mode).toBe('Window');
    if (!state.window) throw new Error('window is null');
    expect(state.window.start).toBeCloseTo(2002, 0);
    expect(state.window.end).toBeCloseTo(2006, 0);
  });

  it('play button sets isPlaying to true', () => {
    makeBoundedStore(2000, 2010, 2000);
    render(<TimelineStrip />);

    const playBtn = screen.getByTestId('btn-play');
    fireEvent.click(playBtn);

    expect(useTimelineStore.getState().isPlaying).toBe(true);
  });

  it('pause button sets isPlaying to false when playing', () => {
    makeBoundedStore(2000, 2010, 2000);
    useTimelineStore.setState({ isPlaying: true });
    render(<TimelineStrip />);

    const playBtn = screen.getByTestId('btn-play');
    fireEvent.click(playBtn);

    expect(useTimelineStore.getState().isPlaying).toBe(false);
  });

  it('jump-to-start sets playhead to bounds.min', () => {
    makeBoundedStore(2000, 2010, 2007);
    render(<TimelineStrip />);

    fireEvent.click(screen.getByTestId('btn-jump-start'));
    expect(useTimelineStore.getState().playhead).toBe(2000);
  });

  it('jump-to-end sets playhead to bounds.max', () => {
    makeBoundedStore(2000, 2010, 2000);
    render(<TimelineStrip />);

    fireEvent.click(screen.getByTestId('btn-jump-end'));
    expect(useTimelineStore.getState().playhead).toBe(2010);
  });

  it('double-click on track resets playhead to bounds.min', () => {
    makeBoundedStore(2000, 2010, 2008);
    render(<TimelineStrip />);

    fireEvent.dblClick(screen.getByTestId('timeline-track'));
    expect(useTimelineStore.getState().playhead).toBe(2000);
  });

  it('renders Trail/Window pills and Arcs/Clade toggles, not Slice/Clade pills', () => {
    makeBoundedStore(2000, 2010, 2000);
    render(<TimelineStrip />);

    expect(screen.getByTestId('mode-pill-trail')).toBeTruthy();
    expect(screen.getByTestId('mode-pill-window')).toBeTruthy();
    expect(screen.getByTestId('toggle-arcs')).toBeTruthy();
    expect(screen.getByTestId('toggle-clade')).toBeTruthy();
    expect(screen.queryByTestId('mode-pill-slice')).toBeNull();
  });

  it('Arcs toggle flips the arcs flag in the store', () => {
    makeBoundedStore(2000, 2010, 2000);
    useTimelineStore.setState({ arcs: false });
    render(<TimelineStrip />);
    expect(useTimelineStore.getState().arcs).toBe(false);
    fireEvent.click(screen.getByTestId('toggle-arcs'));
    expect(useTimelineStore.getState().arcs).toBe(true);
  });

  it('Clade toggle flips the clade flag in the store', () => {
    makeBoundedStore(2000, 2010, 2000);
    render(<TimelineStrip />);
    expect(useTimelineStore.getState().clade).toBe(false);
    fireEvent.click(screen.getByTestId('toggle-clade'));
    expect(useTimelineStore.getState().clade).toBe(true);
  });

  it('speed select changes speed in store', () => {
    makeBoundedStore(2000, 2010, 2000);
    render(<TimelineStrip />);

    const select = screen.getByTestId('speed-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });

    expect(useTimelineStore.getState().speed).toBe(4);
  });

  it('offers playback speeds from 0.25× to 4× with 1× as the default label', () => {
    makeBoundedStore(2000, 2010, 2000);
    render(<TimelineStrip />);

    const select = screen.getByTestId('speed-select') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual([
      '0.25×',
      '0.5×',
      '1×',
      '2×',
      '4×',
    ]);
    expect(select.value).toBe('1');
  });

  it('playhead readout shows ISO date', () => {
    makeBoundedStore(2000, 2010, 2005);
    render(<TimelineStrip />);

    const readout = screen.getByTestId('playhead-readout');
    expect(readout.textContent).toBe('2005-01-01');
  });

  it('arcs is true by default in a fresh store', () => {
    expect(useTimelineStore.getInitialState().arcs).toBe(true);
  });
});
