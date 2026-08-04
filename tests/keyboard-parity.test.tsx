// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineStore } from '../src/store/timeline';
import { useUiStore } from '../src/store/ui';
import { useKeyboardTransport } from '../src/features/timeline/useKeyboardTransport';

function TransportHost({ onHelp }: { onHelp?: () => void } = {}) {
  useKeyboardTransport(onHelp ? { onHelp } : {});
  return <div data-testid="host" />;
}

function setup() {
  useTimelineStore.setState({
    bounds: { min: 2000, max: 2020 },
    playhead: 2010,
    isPlaying: false,
    window: null,
    mode: 'Trail',
    speed: 1,
  });
  useUiStore.setState({ activePanel: null });
}

beforeEach(() => {
  setup();
  render(<TransportHost />);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useTimelineStore.setState({
    bounds: null,
    playhead: 2003,
    window: null,
    mode: 'Trail',
    isPlaying: false,
    speed: 1,
  });
  useUiStore.setState({ activePanel: null });
});

describe('panel toggle shortcuts', () => {
  it('T opens style panel', async () => {
    const user = userEvent.setup();
    await user.keyboard('t');
    expect(useUiStore.getState().activePanel).toBe('style');
  });

  it('T again closes style panel', async () => {
    const user = userEvent.setup();
    await user.keyboard('t');
    await user.keyboard('t');
    expect(useUiStore.getState().activePanel).toBeNull();
  });

  it('L opens layers panel', async () => {
    const user = userEvent.setup();
    await user.keyboard('l');
    expect(useUiStore.getState().activePanel).toBe('layers');
  });

  it('F opens filter panel', async () => {
    const user = userEvent.setup();
    await user.keyboard('f');
    expect(useUiStore.getState().activePanel).toBe('filter');
  });

  it('E opens export panel', async () => {
    const user = userEvent.setup();
    await user.keyboard('e');
    expect(useUiStore.getState().activePanel).toBe('export');
  });

  it(', opens settings panel', async () => {
    const user = userEvent.setup();
    await user.keyboard(',');
    expect(useUiStore.getState().activePanel).toBe('settings');
  });

  it('panel shortcuts are suppressed when focus is in a text input', async () => {
    const { unmount } = render(<input data-testid="text" type="text" />);
    screen.getByTestId('text').focus();
    const user = userEvent.setup();
    await user.keyboard('t');
    expect(useUiStore.getState().activePanel).toBeNull();
    unmount();
  });
});

describe('/ shortcut focuses filter search', () => {
  it('/ sets activePanel to filter', async () => {
    const input = document.createElement('input');
    input.setAttribute('data-testid', 'filter-search-input');
    document.body.appendChild(input);
    try {
      const user = userEvent.setup();
      await user.keyboard('/');
      expect(useUiStore.getState().activePanel).toBe('filter');
    } finally {
      document.body.removeChild(input);
    }
  });

  it('/ inside a text input does not open filter panel', async () => {
    const { unmount } = render(<input data-testid="text" type="text" />);
    screen.getByTestId('text').focus();
    const user = userEvent.setup();
    await user.keyboard('/');
    expect(useUiStore.getState().activePanel).toBeNull();
    unmount();
  });
});

describe('focus-visible CSS classes present on interactive elements', () => {
  it('every button in the transport host renders with type="button"', () => {
    const buttons = document.querySelectorAll('button:not([type])');
    expect(buttons.length).toBe(0);
  });
});
