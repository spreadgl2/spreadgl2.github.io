// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SmallScreenGuard } from './SmallScreenGuard';

const DISMISSED_KEY = 'spreadgl2_small_screen_dismissed';
const PORTRAIT_DISMISSED_KEY = 'spreadgl2_portrait_dismissed';

const store = new Map<string, string>();

const storageMock: Storage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => {
    store.set(k, v);
  },
  removeItem: (k) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

vi.stubGlobal('localStorage', storageMock);

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: h });
}

beforeEach(() => {
  store.clear();
  setViewport(1440, 900);
  Object.defineProperty(window, 'ontouchstart', {
    writable: true,
    configurable: true,
    value: undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SmallScreenGuard', () => {
  it('renders children without overlay at desktop viewport', () => {
    render(
      <SmallScreenGuard>
        <div data-testid="child">hello</div>
      </SmallScreenGuard>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.queryByTestId('small-screen-guard')).toBeNull();
    expect(screen.queryByTestId('portrait-guard')).toBeNull();
  });

  it('shows small-screen overlay at 700×500 viewport', () => {
    setViewport(700, 500);
    render(
      <SmallScreenGuard>
        <div data-testid="child">hello</div>
      </SmallScreenGuard>,
    );
    expect(screen.getByTestId('small-screen-guard')).toBeTruthy();
    expect(screen.getByTestId('small-screen-message')).toBeTruthy();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe('small-screen-guard-title');
    expect(document.activeElement).toBe(screen.getByTestId('small-screen-continue'));
  });

  it('shows small-screen overlay at 767px wide (below 768 threshold)', () => {
    setViewport(767, 700);
    render(
      <SmallScreenGuard>
        <div data-testid="child">hello</div>
      </SmallScreenGuard>,
    );
    expect(screen.getByTestId('small-screen-guard')).toBeTruthy();
  });

  it('shows small-screen overlay at height below 600px', () => {
    setViewport(1280, 599);
    render(
      <SmallScreenGuard>
        <div data-testid="child">hello</div>
      </SmallScreenGuard>,
    );
    expect(screen.getByTestId('small-screen-guard')).toBeTruthy();
  });

  it('Continue anyway dismisses small-screen overlay and shows children', () => {
    setViewport(800, 500);
    render(
      <SmallScreenGuard>
        <div data-testid="child">hello</div>
      </SmallScreenGuard>,
    );

    fireEvent.click(screen.getByTestId('small-screen-continue'));

    expect(screen.queryByTestId('small-screen-guard')).toBeNull();
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('Continue anyway persists dismissal to localStorage', () => {
    setViewport(700, 500);
    render(
      <SmallScreenGuard>
        <div data-testid="child">hello</div>
      </SmallScreenGuard>,
    );

    fireEvent.click(screen.getByTestId('small-screen-continue'));

    expect(storageMock.getItem(DISMISSED_KEY)).toBe('1');
  });

  it('does not show overlay on mount if already dismissed in localStorage', () => {
    storageMock.setItem(DISMISSED_KEY, '1');
    setViewport(700, 500);
    render(
      <SmallScreenGuard>
        <div data-testid="child">hello</div>
      </SmallScreenGuard>,
    );

    expect(screen.queryByTestId('small-screen-guard')).toBeNull();
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('shows portrait guard when touch device is in portrait', () => {
    Object.defineProperty(window, 'ontouchstart', {
      writable: true,
      configurable: true,
      value: () => {},
    });
    setViewport(600, 900);
    render(
      <SmallScreenGuard>
        <div data-testid="child">hello</div>
      </SmallScreenGuard>,
    );

    expect(screen.getByTestId('portrait-guard')).toBeTruthy();
    expect(screen.getByTestId('portrait-message').textContent).toContain('Rotate to landscape');
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('portrait-guard-title');
  });

  it('portrait Continue anyway dismisses and shows children', () => {
    Object.defineProperty(window, 'ontouchstart', {
      writable: true,
      configurable: true,
      value: () => {},
    });
    setViewport(600, 900);
    render(
      <SmallScreenGuard>
        <div data-testid="child">hello</div>
      </SmallScreenGuard>,
    );

    fireEvent.click(screen.getByTestId('portrait-continue'));

    expect(screen.queryByTestId('portrait-guard')).toBeNull();
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(storageMock.getItem(PORTRAIT_DISMISSED_KEY)).toBe('1');
  });

  it('no overlay at exactly 768×600 (boundary is exclusive)', () => {
    setViewport(768, 600);
    render(
      <SmallScreenGuard>
        <div data-testid="child">hello</div>
      </SmallScreenGuard>,
    );
    expect(screen.queryByTestId('small-screen-guard')).toBeNull();
    expect(screen.getByTestId('child')).toBeTruthy();
  });
});
