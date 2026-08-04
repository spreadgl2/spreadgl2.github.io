// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineStore } from '../../store/timeline';
import { useUiStore } from '../../store/ui';
import { useKeyboardTransport } from './useKeyboardTransport';

function TestComponent({ onHelp }: { onHelp?: () => void } = {}) {
  useKeyboardTransport(onHelp ? { onHelp } : {});
  return <div data-testid="transport-host" tabIndex={-1} />;
}

function setup() {
  useTimelineStore.setState({
    bounds: { min: 2000, max: 2020 },
    playhead: 2010,
    isPlaying: false,
    window: null,
    windowSize: null,
    mode: 'Trail',
    speed: 1,
    arcs: true,
    clade: false,
    subtreeRootIds: [],
    subtreeRootId: null,
  });
  return render(<TestComponent />);
}

afterEach(() => {
  cleanup();
  useTimelineStore.setState({
    bounds: null,
    playhead: 2003.0,
    window: null,
    windowSize: null,
    mode: 'Trail',
    isPlaying: false,
    speed: 1,
    arcs: true,
    clade: false,
    subtreeRootIds: [],
    subtreeRootId: null,
  });
  useUiStore.setState({ reducedMotion: false });
});

beforeEach(() => {
  setup();
});

describe('useKeyboardTransport', () => {
  it('Space toggles isPlaying', async () => {
    const user = userEvent.setup();
    expect(useTimelineStore.getState().isPlaying).toBe(false);
    await user.keyboard(' ');
    expect(useTimelineStore.getState().isPlaying).toBe(true);
    await user.keyboard(' ');
    expect(useTimelineStore.getState().isPlaying).toBe(false);
  });

  it('Space does not start playback when reduced motion is enabled', async () => {
    useUiStore.setState({ reducedMotion: true });
    const user = userEvent.setup();
    await user.keyboard(' ');
    expect(useTimelineStore.getState().isPlaying).toBe(false);
  });

  it('ArrowLeft decrements playhead by 1% of range', async () => {
    const user = userEvent.setup();
    await user.keyboard('{ArrowLeft}');
    const { playhead } = useTimelineStore.getState();
    expect(playhead).toBeCloseTo(2009.8, 5);
  });

  it('ArrowRight increments playhead by 1% of range', async () => {
    const user = userEvent.setup();
    await user.keyboard('{ArrowRight}');
    const { playhead } = useTimelineStore.getState();
    expect(playhead).toBeCloseTo(2010.2, 5);
  });

  it('Shift+ArrowLeft decrements playhead by 10% of range', async () => {
    const user = userEvent.setup();
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    const { playhead } = useTimelineStore.getState();
    expect(playhead).toBeCloseTo(2008, 5);
  });

  it('Shift+ArrowRight increments playhead by 10% of range', async () => {
    const user = userEvent.setup();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    const { playhead } = useTimelineStore.getState();
    expect(playhead).toBeCloseTo(2012, 5);
  });

  it('Home jumps playhead to bounds.min', async () => {
    const user = userEvent.setup();
    await user.keyboard('{Home}');
    expect(useTimelineStore.getState().playhead).toBe(2000);
  });

  it('End jumps playhead to bounds.max', async () => {
    const user = userEvent.setup();
    await user.keyboard('{End}');
    expect(useTimelineStore.getState().playhead).toBe(2020);
  });

  it('Digit2 enters Window mode with the default 5% time-coverage window', async () => {
    const user = userEvent.setup();
    await user.keyboard('2');

    const state = useTimelineStore.getState();
    expect(state.mode).toBe('Window');
    if (!state.window) throw new Error('window is null');
    expect(state.window.end).toBeCloseTo(2010, 5);
    expect(state.window.start).toBeCloseTo(2009, 5);
    expect(state.windowSize).toBeCloseTo(1, 5);
  });

  it('ArrowLeft clamps at bounds.min', async () => {
    useTimelineStore.setState({ playhead: 2000.05 });
    const user = userEvent.setup();
    await user.keyboard('{ArrowLeft}');
    expect(useTimelineStore.getState().playhead).toBe(2000);
  });

  it('ArrowRight clamps at bounds.max', async () => {
    useTimelineStore.setState({ playhead: 2019.95 });
    const user = userEvent.setup();
    await user.keyboard('{ArrowRight}');
    expect(useTimelineStore.getState().playhead).toBe(2020);
  });

  it('no-op when bounds are null', async () => {
    useTimelineStore.setState({ bounds: null, playhead: 2010 });
    const user = userEvent.setup();
    await user.keyboard('{Home}');
    expect(useTimelineStore.getState().playhead).toBe(2010);
  });

  it('? key calls onHelp callback', async () => {
    const onHelp = vi.fn();
    cleanup();
    render(<TestComponent onHelp={onHelp} />);
    const user = userEvent.setup();
    await user.keyboard('?');
    expect(onHelp).toHaveBeenCalledOnce();
  });

  it('? key does not call onHelp when focus is in a text input', async () => {
    const onHelp = vi.fn();
    cleanup();
    const { getByTestId } = render(
      <>
        <TestComponent onHelp={onHelp} />
        <input data-testid="text-input" type="text" />
      </>,
    );
    getByTestId('text-input').focus();
    const user = userEvent.setup();
    await user.keyboard('?');
    expect(onHelp).not.toHaveBeenCalled();
  });

  it('Escape clears selected clades while Clade mode is active', async () => {
    useTimelineStore.setState({
      clade: true,
      subtreeRootIds: ['node-a', 'node-b'],
      subtreeRootId: 'node-a',
    });
    const user = userEvent.setup();
    await user.keyboard('{Escape}');

    expect(useTimelineStore.getState().subtreeRootIds).toEqual([]);
    expect(useTimelineStore.getState().subtreeRootId).toBeNull();
  });

  it('Escape leaves selected clades untouched when Clade mode is off', async () => {
    useTimelineStore.setState({
      clade: false,
      subtreeRootIds: ['node-a'],
      subtreeRootId: 'node-a',
    });
    const user = userEvent.setup();
    await user.keyboard('{Escape}');

    expect(useTimelineStore.getState().subtreeRootIds).toEqual(['node-a']);
    expect(useTimelineStore.getState().subtreeRootId).toBe('node-a');
  });
});
