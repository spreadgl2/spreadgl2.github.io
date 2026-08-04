import { beforeEach, describe, expect, it } from 'vitest';
import type { EnvColumn } from './env';
import { resolveEnvPalette, useEnvStore } from './env';

const makeColumns = (): EnvColumn[] => [
  {
    key: 'temperature_C',
    displayName: 'Temperature',
    units: '°C',
    values: new Map([
      ['Africa', 28.5],
      ['Asia', 22.1],
    ]),
  },
  {
    key: 'humidity_pct',
    displayName: 'Humidity',
    units: '%',
    values: new Map([
      ['Africa', 70],
      ['Asia', 60],
    ]),
  },
];

function fixtureColumn(index: number): EnvColumn {
  const col = makeColumns()[index];
  if (!col) throw new Error(`missing fixture column ${index}`);
  return col;
}

beforeEach(() => {
  useEnvStore.setState({ columns: [], activeKey: null, paletteOverride: {} });
});

describe('setColumns', () => {
  it('sets columns and auto-picks first column as activeKey when activeKey is null', () => {
    useEnvStore.getState().setColumns(makeColumns());
    const state = useEnvStore.getState();
    expect(state.columns).toHaveLength(2);
    expect(state.activeKey).toBe('temperature_C');
  });

  it('keeps existing activeKey if it still exists in new columns', () => {
    useEnvStore.setState({ activeKey: 'humidity_pct' });
    useEnvStore.getState().setColumns(makeColumns());
    expect(useEnvStore.getState().activeKey).toBe('humidity_pct');
  });

  it('resets activeKey to first column if existing key absent from new columns', () => {
    useEnvStore.setState({ activeKey: 'stale_key' });
    useEnvStore.getState().setColumns(makeColumns());
    expect(useEnvStore.getState().activeKey).toBe('temperature_C');
  });

  it('sets activeKey to null when columns is empty', () => {
    useEnvStore.setState({ activeKey: 'temperature_C' });
    useEnvStore.getState().setColumns([]);
    expect(useEnvStore.getState().activeKey).toBeNull();
  });
});

describe('setPaletteOverride', () => {
  it('stores per-column palette override', () => {
    useEnvStore.getState().setPaletteOverride('temperature_C', 'plasma');
    useEnvStore.getState().setPaletteOverride('humidity_pct', 'blues');
    const { paletteOverride } = useEnvStore.getState();
    expect(paletteOverride.temperature_C).toBe('plasma');
    expect(paletteOverride.humidity_pct).toBe('blues');
  });

  it('sets override to auto for a column', () => {
    useEnvStore.getState().setPaletteOverride('temperature_C', 'auto');
    expect(useEnvStore.getState().paletteOverride.temperature_C).toBe('auto');
  });
});

describe('setPaletteOverrides', () => {
  it('replaces the full override map', () => {
    useEnvStore.getState().setPaletteOverride('humidity_pct', 'blues');
    useEnvStore.getState().setPaletteOverrides({ temperature_C: 'plasma' });

    expect(useEnvStore.getState().paletteOverride).toEqual({ temperature_C: 'plasma' });
  });
});

describe('resolveEnvPalette', () => {
  it('returns suggested palette when override is auto', () => {
    const col = fixtureColumn(0);
    expect(resolveEnvPalette(col, { temperature_C: 'auto' })).toBe('cool-warm');
  });

  it('returns suggested palette when no override entry', () => {
    const col = fixtureColumn(0);
    expect(resolveEnvPalette(col, {})).toBe('cool-warm');
  });

  it('returns override palette when explicitly set', () => {
    const col = fixtureColumn(0);
    expect(resolveEnvPalette(col, { temperature_C: 'magma' })).toBe('magma');
  });

  it('resolves humidity to blues by suggestion', () => {
    const col = fixtureColumn(1);
    expect(resolveEnvPalette(col, {})).toBe('blues');
  });
});
