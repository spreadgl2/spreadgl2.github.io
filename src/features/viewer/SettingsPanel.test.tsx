// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '../../store/ui';

vi.mock('../../lib/persist/preferences', () => ({
  setPreference: vi.fn(),
  clearAllPreferences: vi.fn().mockResolvedValue(undefined),
  DEFAULTS: {
    theme: 'dark',
    dateDisplay: 'iso',
    reducedMotion: false,
    renderQuality: 'auto',
    treeSplitFraction: 0.5,
    sidePanelWidth: 280,
    analysisPanelHeight: 156,
    animationMode: 'Trail',
    animationSpeed: 1,
  },
}));

vi.mock('../../lib/persist/cache', () => ({
  clearCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../store/timeline', () => ({
  useTimelineStore: vi.fn(
    (selector: (s: { setSpeed: () => void; setMode: () => void }) => unknown) =>
      selector({ setSpeed: vi.fn(), setMode: vi.fn() }),
  ),
}));

beforeEach(() => {
  useUiStore.setState({
    theme: 'dark',
    dateDisplay: 'iso',
    reducedMotion: false,
    renderQuality: 'auto',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderPanel() {
  const { SettingsPanel } = await import('./SettingsPanel');
  return render(<SettingsPanel />);
}

describe('SettingsPanel', () => {
  it('dark theme radio is checked by default', async () => {
    await renderPanel();
    const darkRadio = screen.getByTestId('settings-theme-dark') as HTMLInputElement;
    expect(darkRadio.checked).toBe(true);
  });

  it('clicking light theme updates ui store', async () => {
    await renderPanel();
    const lightRadio = screen.getByTestId('settings-theme-light');
    fireEvent.click(lightRadio);
    expect(useUiStore.getState().theme).toBe('light');
  });

  it('ISO is checked by default', async () => {
    await renderPanel();
    const isoRadio = screen.getByTestId('settings-date-iso') as HTMLInputElement;
    expect(isoRadio.checked).toBe(true);
  });

  it('clicking decimal year updates store', async () => {
    await renderPanel();
    const decimalRadio = screen.getByTestId('settings-date-decimal');
    fireEvent.click(decimalRadio);
    expect(useUiStore.getState().dateDisplay).toBe('decimal');
  });

  it('selects and persists performance rendering', async () => {
    const { setPreference } = await import('../../lib/persist/preferences');
    await renderPanel();

    fireEvent.click(screen.getByTestId('settings-render-quality-performance'));

    expect(useUiStore.getState().renderQuality).toBe('performance');
    expect(setPreference).toHaveBeenCalledWith('renderQuality', 'performance');
  });

  it('reset button resets theme to dark', async () => {
    useUiStore.setState({ theme: 'light' });
    await renderPanel();
    const resetBtn = screen.getByTestId('settings-reset-btn');
    fireEvent.click(resetBtn);
    expect(useUiStore.getState().theme).toBe('dark');
    expect(useUiStore.getState().renderQuality).toBe('auto');
  });

  it('discloses and clears the persistent parsed-tree cache', async () => {
    const { clearCache } = await import('../../lib/persist/cache');
    await renderPanel();

    expect(screen.getByText(/cached on this device/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('settings-clear-cache-btn'));

    expect(clearCache).toHaveBeenCalledOnce();
  });
});
