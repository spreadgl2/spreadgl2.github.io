import { describe, expect, it } from 'vitest';
import {
  CATEGORICAL_PALETTE_STOPS,
  categoricalPaletteSize,
  hexToRgb,
  lerpSequential,
  paletteColorFor,
  paletteRepeatsForCategoryCount,
  SEQUENTIAL_PALETTES,
  STYLE_QUALITATIVE_PALETTES,
  STYLE_QUANTITATIVE_PALETTES,
  suggestedCategoricalPaletteForCount,
} from './palettes.js';

describe('hexToRgb', () => {
  it('parses #rrggbb hex format', () => {
    expect(hexToRgb('#440154')).toEqual({ r: 68, g: 1, b: 84 });
  });

  it('parses rgb(r,g,b) CSS string format', () => {
    expect(hexToRgb('rgb(68,1,84)')).toEqual({ r: 68, g: 1, b: 84 });
  });

  it('#rrggbb and rgb() produce identical results for viridis low end', () => {
    const fromHex = hexToRgb('#440154');
    const fromRgb = hexToRgb('rgb(68,1,84)');
    expect(fromHex).toEqual(fromRgb);
  });

  it('returns black for unrecognized input', () => {
    expect(hexToRgb('notacolor')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('parses rgb() with spaces around values', () => {
    expect(hexToRgb('rgb( 68 , 1 , 84 )')).toEqual({ r: 68, g: 1, b: 84 });
  });
});

describe('lerpSequential', () => {
  const viridisStops = SEQUENTIAL_PALETTES.Viridis as string[];

  it('returns a string starting with # (not rgb()', () => {
    const result = lerpSequential(0.5, viridisStops);
    expect(result.startsWith('#')).toBe(true);
  });

  it('clamps t=0 to first stop', () => {
    const result = lerpSequential(0, viridisStops);
    expect(result.startsWith('#')).toBe(true);
    expect(result).toBe(viridisStops[0]);
  });

  it('clamps t=1 to last stop', () => {
    const result = lerpSequential(1, viridisStops);
    expect(result.startsWith('#')).toBe(true);
    expect(result).toBe(viridisStops[viridisStops.length - 1]);
  });

  it('returns #000000 for empty stops', () => {
    expect(lerpSequential(0.5, [])).toBe('#000000');
  });

  it('returns the single stop for length-1 array', () => {
    expect(lerpSequential(0.5, ['#ff0000'])).toBe('#ff0000');
  });

  it('output is parseable by hexToRgb without returning black', () => {
    const result = lerpSequential(0.3, viridisStops);
    const rgb = hexToRgb(result);
    const isBlack = rgb.r === 0 && rgb.g === 0 && rgb.b === 0;
    expect(isBlack).toBe(false);
  });
});

describe('paletteColorFor', () => {
  it('returns a non-black hex for viridis discrete-trait lookup', () => {
    const result = paletteColorFor('Beijing', ['Anhui', 'Beijing', 'Chongqing'], 'viridis', false);
    expect(result.startsWith('#')).toBe(true);
    expect(result).not.toBe('#000000');
  });

  it('returns a non-black hex for rd-bu discrete-trait lookup', () => {
    const result = paletteColorFor('Beijing', ['Anhui', 'Beijing', 'Chongqing'], 'rd-bu', false);
    expect(result.startsWith('#')).toBe(true);
    expect(result).not.toBe('#000000');
  });

  it('supports all qualitative style palettes for categorical traits', () => {
    for (const { id } of STYLE_QUALITATIVE_PALETTES) {
      const result = paletteColorFor('B', ['A', 'B', 'C'], id, false);
      expect(result.startsWith('#')).toBe(true);
      expect(result).not.toBe('#000000');
    }
  });

  it('supports all quantitative style palettes for numeric values', () => {
    for (const { id } of STYLE_QUANTITATIVE_PALETTES) {
      const result = paletteColorFor(0.5, null, id, false);
      expect(result.startsWith('#')).toBe(true);
      expect(result).not.toBe('#000000');
    }
  });

  it('includes 64 unique colors for both Colorcet Glasbey palettes', () => {
    for (const id of ['glasbey-light', 'glasbey-dark'] as const) {
      const stops = CATEGORICAL_PALETTE_STOPS[id];
      expect(stops).toHaveLength(64);
      expect(new Set(stops).size).toBe(64);
    }
  });

  it('uses the first n Glasbey colors for categorical values', () => {
    const values = Array.from({ length: 26 }, (_, i) => `state-${i + 1}`);
    expect(paletteColorFor(values.at(25) ?? '', values, 'glasbey-light', false)).toBe(
      CATEGORICAL_PALETTE_STOPS['glasbey-light'][25],
    );
  });

  it('suggests theme-matched Glasbey palettes for large categorical sets', () => {
    expect(suggestedCategoricalPaletteForCount(8, 'dark')).toBe('okabe-ito');
    expect(suggestedCategoricalPaletteForCount(9, 'dark')).toBe('seaborn-tab20');
    expect(suggestedCategoricalPaletteForCount(20, 'dark')).toBe('seaborn-tab20');
    expect(suggestedCategoricalPaletteForCount(21, 'dark')).toBe('glasbey-light');
    expect(suggestedCategoricalPaletteForCount(21, 'light')).toBe('glasbey-dark');
  });

  it('detects categorical palette color reuse', () => {
    expect(categoricalPaletteSize('okabe-ito')).toBe(8);
    expect(paletteRepeatsForCategoryCount('okabe-ito', 26)).toBe(true);
    expect(paletteRepeatsForCategoryCount('glasbey-light', 26)).toBe(false);
    expect(paletteRepeatsForCategoryCount('glasbey-light', 65)).toBe(true);
    expect(paletteRepeatsForCategoryCount('viridis', 65)).toBe(false);
  });
});
