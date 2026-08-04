import { describe, expect, it } from 'vitest';
import {
  clamp01,
  formatCount,
  integerTicks,
  monthTicks,
  PAD_BOTTOM,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  type PlotDims,
  xFor,
  yFor,
  yForRange,
} from './chart-utils';

// These functions place every point and every axis tick on the LTT and
// transitions charts, so they decide what a reader sees in a published figure.
// They are pure and deterministic, which makes them cheap to pin down exactly.

const DIMS: PlotDims = { width: 800, height: 140 };
const PLOT_H = DIMS.height - PAD_TOP - PAD_BOTTOM;
const PLOT_W = DIMS.width - PAD_LEFT - PAD_RIGHT;

describe('clamp01', () => {
  it.each([
    [-0.5, 0],
    [0, 0],
    [0.25, 0.25],
    [1, 1],
    [1.5, 1],
  ])('clamps %p to %p', (input, expected) => {
    expect(clamp01(input)).toBe(expected);
  });
});

describe('xFor', () => {
  it('maps the range ends to the plot edges and the midpoint to the centre', () => {
    expect(xFor(2000, 2000, 2010, DIMS)).toBe(PAD_LEFT);
    expect(xFor(2010, 2000, 2010, DIMS)).toBe(PAD_LEFT + PLOT_W);
    expect(xFor(2005, 2000, 2010, DIMS)).toBe(PAD_LEFT + PLOT_W / 2);
  });

  it('clamps times outside the range rather than drawing off-plot', () => {
    expect(xFor(1990, 2000, 2010, DIMS)).toBe(PAD_LEFT);
    expect(xFor(2050, 2000, 2010, DIMS)).toBe(PAD_LEFT + PLOT_W);
  });

  it('collapses to the left edge for a degenerate range', () => {
    // A single-date tree would otherwise divide by zero.
    expect(xFor(2005, 2005, 2005, DIMS)).toBe(PAD_LEFT);
    expect(xFor(2005, 2010, 2000, DIMS)).toBe(PAD_LEFT);
  });
});

describe('yFor', () => {
  it('puts zero at the baseline and the max count at the top of the plot', () => {
    expect(yFor(0, 10, DIMS)).toBe(PAD_TOP + PLOT_H);
    expect(yFor(10, 10, DIMS)).toBe(PAD_TOP);
    expect(yFor(5, 10, DIMS)).toBe(PAD_TOP + PLOT_H / 2);
  });

  it('returns the baseline when there is no data to scale against', () => {
    expect(yFor(0, 0, DIMS)).toBe(PAD_TOP + PLOT_H);
    expect(yFor(3, -1, DIMS)).toBe(PAD_TOP + PLOT_H);
  });

  it('is inverted: a larger count is a smaller y', () => {
    expect(yFor(9, 10, DIMS)).toBeLessThan(yFor(1, 10, DIMS));
  });
});

describe('yForRange', () => {
  it('maps min to the baseline and max to the top', () => {
    expect(yForRange(-5, -5, 5, DIMS)).toBe(PAD_TOP + PLOT_H);
    expect(yForRange(5, -5, 5, DIMS)).toBe(PAD_TOP);
    expect(yForRange(0, -5, 5, DIMS)).toBe(PAD_TOP + PLOT_H / 2);
  });

  it('returns the baseline for a degenerate range', () => {
    expect(yForRange(3, 3, 3, DIMS)).toBe(PAD_TOP + PLOT_H);
    expect(yForRange(3, 10, 0, DIMS)).toBe(PAD_TOP + PLOT_H);
  });
});

describe('monthTicks', () => {
  it('returns a single tick for a degenerate range', () => {
    const ticks = monthTicks(2020.5, 2020.5, 800);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.label).toMatch(/^\d{4}-\d{2}$/);
  });

  it('labels every tick as yyyy-MM and keeps them ascending and inside the range', () => {
    const ticks = monthTicks(2020.0, 2021.0, 800);
    expect(ticks.length).toBeGreaterThan(1);
    for (const tick of ticks) {
      expect(tick.label).toMatch(/^\d{4}-\d{2}$/);
      expect(tick.time).toBeGreaterThanOrEqual(2020.0 - 1e-6);
      expect(tick.time).toBeLessThanOrEqual(2021.0 + 1e-6);
    }
    const times = ticks.map((t) => t.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('emits fewer ticks on a narrower plot', () => {
    const wide = monthTicks(2015.0, 2021.0, 1600);
    const narrow = monthTicks(2015.0, 2021.0, 300);
    expect(narrow.length).toBeLessThanOrEqual(wide.length);
  });

  it('stays bounded on a very long span rather than emitting a tick per month', () => {
    // 100 years at one tick per month would be 1200 labels.
    const ticks = monthTicks(1920.0, 2020.0, 800);
    expect(ticks.length).toBeLessThanOrEqual(100);
    expect(ticks.length).toBeGreaterThan(1);
  });
});

describe('integerTicks', () => {
  it('starts at zero, ascends, and reaches at least the max count', () => {
    const ticks = integerTicks(37, 5);
    expect(ticks[0]).toBe(0);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(37);
  });

  it('uses a round step so the axis reads as 1/2/5 x a power of ten', () => {
    for (const max of [7, 37, 240, 1830]) {
      const ticks = integerTicks(max, 5);
      const step = (ticks[1] ?? 0) - (ticks[0] ?? 0);
      const magnitude = 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5, 10]).toContain(Math.round(step / magnitude));
    }
  });

  it('produces whole numbers only — lineage counts are not fractional', () => {
    for (const tick of integerTicks(13, 4)) {
      expect(Number.isInteger(tick)).toBe(true);
    }
  });

  it('still yields a usable axis when the count is zero', () => {
    const ticks = integerTicks(0, 5);
    expect(ticks[0]).toBe(0);
    expect(ticks.length).toBeGreaterThan(1);
  });
});

describe('formatCount', () => {
  it.each([
    [5, '5'],
    [5.00001, '5'],
    [0, '0'],
    [-3, '-3'],
  ])('renders %p as %p without decimals', (input, expected) => {
    expect(formatCount(input)).toBe(expected);
  });

  it('keeps two decimals for genuinely fractional counts (weighted lineages)', () => {
    expect(formatCount(2.5)).toBe('2.50');
    expect(formatCount(0.125)).toBe('0.13');
  });
});
