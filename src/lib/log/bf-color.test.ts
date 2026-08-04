import { describe, expect, it } from 'vitest';
import { BF_LEGEND, BF_LEGEND_TICKS, bfBinColor, bfColor } from './bf-color';

describe('bf-color', () => {
  it('maps evidence labels to RGB triples', () => {
    expect(bfColor('very strong', true)).toEqual([225, 29, 72]);
    expect(bfColor('weak', true)).not.toEqual(bfColor('very strong', true));
  });

  it('has distinct dark and light variants', () => {
    expect(bfColor('strong', true)).not.toEqual(bfColor('strong', false));
  });

  it('returns a colour for every legend bin', () => {
    for (const entry of BF_LEGEND) {
      expect(bfBinColor(entry.bin, true)).toHaveLength(3);
      expect(bfBinColor(entry.bin, false)).toHaveLength(3);
    }
  });

  it('uses a muted grey for unsupported routes (BF < 1)', () => {
    expect(bfColor('no support', true)).toEqual([120, 120, 120]);
  });

  it('has four bins and five boundary ticks (1 · 3 · 20 · 150 · ∞)', () => {
    expect(BF_LEGEND.map((e) => e.bin)).toEqual(['weak', 'positive', 'strong', 'very strong']);
    expect(BF_LEGEND_TICKS).toEqual(['1', '3', '20', '150', '∞']);
  });
});
