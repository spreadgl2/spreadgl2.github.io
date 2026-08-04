import { describe, expect, it } from 'vitest';
import {
  ENV_PALETTES,
  type EnvPaletteId,
  getPaletteColor,
  suggestPaletteForVariable,
} from './palettes';

describe('suggestPaletteForVariable', () => {
  it('temperature → cool-warm', () => {
    expect(suggestPaletteForVariable('Temperature')).toBe('cool-warm');
    expect(suggestPaletteForVariable('temp')).toBe('cool-warm');
    expect(suggestPaletteForVariable('Max Temperature')).toBe('cool-warm');
  });

  it('humidity / precipitation → blues', () => {
    expect(suggestPaletteForVariable('Humidity')).toBe('blues');
    expect(suggestPaletteForVariable('Precipitation')).toBe('blues');
    expect(suggestPaletteForVariable('Rainfall')).toBe('blues');
    expect(suggestPaletteForVariable('Soil Moisture')).toBe('blues');
  });

  it('elevation → viridis', () => {
    expect(suggestPaletteForVariable('Elevation')).toBe('viridis');
    expect(suggestPaletteForVariable('Altitude')).toBe('viridis');
    expect(suggestPaletteForVariable('Height')).toBe('viridis');
  });

  it('ndvi / vegetation → viridis', () => {
    expect(suggestPaletteForVariable('Ndvi')).toBe('viridis');
    expect(suggestPaletteForVariable('Forest Cover')).toBe('viridis');
    expect(suggestPaletteForVariable('Vegetation')).toBe('viridis');
  });

  it('population / gdp → reds', () => {
    expect(suggestPaletteForVariable('Population')).toBe('reds');
    expect(suggestPaletteForVariable('Density')).toBe('reds');
    expect(suggestPaletteForVariable('Gdp')).toBe('reds');
  });

  it('unknown column → viridis (fallback)', () => {
    expect(suggestPaletteForVariable('Some Unknown Variable')).toBe('viridis');
    expect(suggestPaletteForVariable('')).toBe('viridis');
  });
});

describe('getPaletteColor', () => {
  const paletteIds: EnvPaletteId[] = ['viridis', 'plasma', 'magma', 'blues', 'reds', 'cool-warm'];

  for (const id of paletteIds) {
    describe(id, () => {
      it('t=0 returns valid RGB', () => {
        const [r, g, b] = getPaletteColor(id, 0);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      });

      it('t=0.5 returns valid RGB', () => {
        const [r, g, b] = getPaletteColor(id, 0.5);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      });

      it('t=1 returns valid RGB', () => {
        const [r, g, b] = getPaletteColor(id, 1);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(255);
        expect(g).toBeGreaterThanOrEqual(0);
        expect(g).toBeLessThanOrEqual(255);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(255);
      });

      it('t=0 and t=1 return different colors', () => {
        const [r0, g0, b0] = getPaletteColor(id, 0);
        const [r1, g1, b1] = getPaletteColor(id, 1);
        const same = r0 === r1 && g0 === g1 && b0 === b1;
        expect(same).toBe(false);
      });

      it('clamps out-of-range t', () => {
        const neg = getPaletteColor(id, -0.5);
        const zero = getPaletteColor(id, 0);
        expect(neg).toEqual(zero);
        const over = getPaletteColor(id, 1.5);
        const one = getPaletteColor(id, 1);
        expect(over).toEqual(one);
      });
    });
  }
});

describe('ENV_PALETTES', () => {
  it('has 6 entries', () => {
    expect(ENV_PALETTES).toHaveLength(6);
  });

  it('all IDs are unique', () => {
    const ids = ENV_PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
