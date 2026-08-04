import { describe, expect, it } from 'vitest';
import { decimalYearToISO, isoToDecimalYear } from './decimal-year';

describe('decimalYearToISO', () => {
  it('converts 2020.0 to 2020-01-01', () => {
    expect(decimalYearToISO(2020.0)).toBe('2020-01-01');
  });

  it('converts 2020.451 to 2020-06-13', () => {
    expect(decimalYearToISO(2020.451)).toBe('2020-06-13');
  });

  it('handles leap year 2020.5', () => {
    const result = decimalYearToISO(2020.5);
    expect(result).toBeDefined();
    const back = isoToDecimalYear(result);
    expect(Math.abs(back - 2020.5)).toBeLessThan(2 / 366);
  });

  it('handles non-leap year 2021.5', () => {
    const result = decimalYearToISO(2021.5);
    expect(result).toBeDefined();
    const back = isoToDecimalYear(result);
    expect(Math.abs(back - 2021.5)).toBeLessThan(2 / 365);
  });
});

describe('isoToDecimalYear', () => {
  it('converts 2020-01-01 to 2020.0', () => {
    expect(isoToDecimalYear('2020-01-01')).toBeCloseTo(2020.0, 5);
  });

  it('round-trips with decimalYearToISO', () => {
    const iso = decimalYearToISO(2020.451);
    expect(isoToDecimalYear(iso)).toBeCloseTo(2020.451, 2);
  });
});

describe('round-trip identity', () => {
  it('100 random samples in [1900, 2100] are within ±1/365', () => {
    const rng = () => {
      let seed = 42;
      return () => {
        seed = (seed * 16807 + 0) % 2147483647;
        return seed / 2147483647;
      };
    };
    const rand = rng();
    const tolerance = 1 / 365;
    for (let i = 0; i < 100; i++) {
      const year = 1900 + rand() * 200;
      const iso = decimalYearToISO(year);
      const back = isoToDecimalYear(iso);
      expect(Math.abs(back - year)).toBeLessThan(tolerance);
    }
  });
});
