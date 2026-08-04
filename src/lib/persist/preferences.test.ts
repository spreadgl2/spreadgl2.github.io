// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Preferences } from './preferences';

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

beforeEach(() => {
  store.clear();
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
});

describe('getPreferences', () => {
  it('returns defaults when localStorage is empty', async () => {
    const { getPreferences, DEFAULTS } = await import('./preferences');
    const prefs = getPreferences();
    expect(prefs).toEqual(DEFAULTS);
  });

  it('returns stored theme', async () => {
    store.set('spreadgl2_prefs', JSON.stringify({ theme: 'light' }));
    const { getPreferences } = await import('./preferences');
    const prefs = getPreferences();
    expect(prefs.theme).toBe('light');
  });

  it('returns stored dateDisplay', async () => {
    store.set('spreadgl2_prefs', JSON.stringify({ dateDisplay: 'decimal' }));
    const { getPreferences } = await import('./preferences');
    const prefs = getPreferences();
    expect(prefs.dateDisplay).toBe('decimal');
  });

  it('merges partial stored preferences with defaults', async () => {
    store.set('spreadgl2_prefs', JSON.stringify({ theme: 'light' }));
    const { getPreferences, DEFAULTS } = await import('./preferences');
    const prefs = getPreferences();
    expect(prefs.theme).toBe('light');
    expect(prefs.dateDisplay).toBe(DEFAULTS.dateDisplay);
    expect(prefs.reducedMotion).toBe(DEFAULTS.reducedMotion);
    expect(prefs.renderQuality).toBe(DEFAULTS.renderQuality);
  });
});

describe('setPreference', () => {
  it('persists theme to localStorage', async () => {
    const { setPreference } = await import('./preferences');
    setPreference('theme', 'light');
    const raw = store.get('spreadgl2_prefs') ?? '';
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    expect(parsed.theme).toBe('light');
  });

  it('persists dateDisplay to localStorage', async () => {
    const { setPreference } = await import('./preferences');
    setPreference('dateDisplay', 'decimal');
    const raw = store.get('spreadgl2_prefs') ?? '';
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    expect(parsed.dateDisplay).toBe('decimal');
  });

  it('merges with existing stored keys', async () => {
    store.set('spreadgl2_prefs', JSON.stringify({ theme: 'light' }));
    const { setPreference } = await import('./preferences');
    setPreference('dateDisplay', 'decimal');
    const raw = store.get('spreadgl2_prefs') ?? '';
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    expect(parsed.theme).toBe('light');
    expect(parsed.dateDisplay).toBe('decimal');
  });
});

describe('round-trip', () => {
  it('reload restores all publication preferences', async () => {
    const { setPreference } = await import('./preferences');
    setPreference('theme', 'light');
    setPreference('dateDisplay', 'decimal');
    setPreference('reducedMotion', true);
    setPreference('renderQuality', 'performance');
    setPreference('sidePanelWidth', 320);
    setPreference('analysisPanelHeight', 220);
    setPreference('treeSplitFraction', 0.3);
    setPreference('animationMode', 'Window');
    setPreference('animationSpeed', 2);

    vi.resetModules();
    const { getPreferences } = await import('./preferences');
    const prefs = getPreferences();
    expect(prefs.theme).toBe('light');
    expect(prefs.dateDisplay).toBe('decimal');
    expect(prefs.reducedMotion).toBe(true);
    expect(prefs.renderQuality).toBe('performance');
    expect(prefs.sidePanelWidth).toBe(320);
    expect(prefs.analysisPanelHeight).toBe(220);
    expect(prefs.treeSplitFraction).toBe(0.3);
    expect(prefs.animationMode).toBe('Window');
    expect(prefs.animationSpeed).toBe(2);
  });
});

describe('clearAllPreferences', () => {
  it('removes localStorage entry so getPreferences returns defaults', async () => {
    const { setPreference, clearAllPreferences, getPreferences, DEFAULTS } = await import(
      './preferences'
    );
    setPreference('theme', 'light');
    setPreference('dateDisplay', 'decimal');

    await clearAllPreferences();

    vi.resetModules();
    const { getPreferences: getPreferences2 } = await import('./preferences');
    const prefs = getPreferences2();
    expect(prefs).toEqual(DEFAULTS);
    void getPreferences;
  });
});
