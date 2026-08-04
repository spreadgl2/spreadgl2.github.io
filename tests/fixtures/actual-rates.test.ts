import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeActualRates,
  detectRateTraitName,
  getRateColumns,
} from '../../src/lib/log/actual-rates';
import type { SymmetryMode } from '../../src/lib/log/actual-rates';
import { parseLogText } from '../../src/lib/log/log-table';

const TINY_PATH = join(import.meta.dirname, 'actual-rates-tiny.log');

describe('detectRateTraitName', () => {
  it('detects trait name from actualRates columns', () => {
    const cols = ['state', 'posterior', 'location.actualRates.0', 'location.actualRates.1'];
    expect(detectRateTraitName(cols)).toBe('location');
  });

  it('returns null when no actualRates columns present', () => {
    expect(detectRateTraitName(['state', 'posterior', 'location.indicators.0'])).toBeNull();
  });

  it('returns null for empty column list', () => {
    expect(detectRateTraitName([])).toBeNull();
  });
});

describe('getRateColumns', () => {
  it('extracts and sorts rate columns by index', () => {
    const cols = [
      'state',
      'location.actualRates.2',
      'location.actualRates.0',
      'location.actualRates.1',
    ];
    const result = getRateColumns(cols, 'location');
    expect(result.map((r) => r.idx)).toEqual([0, 1, 2]);
    expect(result.map((r) => r.colIdx)).toEqual([2, 3, 1]);
  });

  it('returns empty when no matching columns', () => {
    expect(getRateColumns(['state', 'posterior'], 'region')).toEqual([]);
  });
});

describe('computeActualRates — asymmetric mode — actual-rates-tiny.log (3 states)', () => {
  const text = readFileSync(TINY_PATH, 'utf-8');
  const logTable = parseLogText(text, { burnInFraction: 0 });
  const states = ['A', 'B', 'C'];
  const mode: SymmetryMode = 'asymmetric';

  it('returns a non-null matrix', () => {
    const result = computeActualRates(logTable, states, mode);
    expect(result).not.toBeNull();
  });

  it('has trait name "location"', () => {
    const result = computeActualRates(logTable, states, mode);
    expect(result?.traitName).toBe('location');
  });

  it('returns 6 routes for a 3-state asymmetric fixture', () => {
    const result = computeActualRates(logTable, states, mode);
    expect(result?.routes).toHaveLength(6);
  });

  it('maps index 0 to A→B (asymmetric)', () => {
    const result = computeActualRates(logTable, states, mode);
    const r = result?.routes.find((x) => x.rateIdx === 0);
    expect(r?.from).toBe('A');
    expect(r?.to).toBe('B');
  });

  it('maps index 1 to A→C (asymmetric)', () => {
    const result = computeActualRates(logTable, states, mode);
    const r = result?.routes.find((x) => x.rateIdx === 1);
    expect(r?.from).toBe('A');
    expect(r?.to).toBe('C');
  });

  it('maps index 2 to B→A (asymmetric)', () => {
    const result = computeActualRates(logTable, states, mode);
    const r = result?.routes.find((x) => x.rateIdx === 2);
    expect(r?.from).toBe('B');
    expect(r?.to).toBe('A');
  });

  it('maps index 3 to B→C (asymmetric)', () => {
    const result = computeActualRates(logTable, states, mode);
    const r = result?.routes.find((x) => x.rateIdx === 3);
    expect(r?.from).toBe('B');
    expect(r?.to).toBe('C');
  });

  it('maps index 4 to C→A (asymmetric)', () => {
    const result = computeActualRates(logTable, states, mode);
    const r = result?.routes.find((x) => x.rateIdx === 4);
    expect(r?.from).toBe('C');
    expect(r?.to).toBe('A');
  });

  it('maps index 5 to C→B (asymmetric)', () => {
    const result = computeActualRates(logTable, states, mode);
    const r = result?.routes.find((x) => x.rateIdx === 5);
    expect(r?.from).toBe('C');
    expect(r?.to).toBe('B');
  });

  it('A→B (idx 0) has the highest mean rate', () => {
    const result = computeActualRates(logTable, states, mode);
    const ab = result?.routes.find((r) => r.rateIdx === 0);
    expect(ab).toBeDefined();
    for (const r of result!.routes) {
      if (r.rateIdx === 0) continue;
      expect(ab!.meanRate).toBeGreaterThanOrEqual(r.meanRate);
    }
  });

  it('mean rate for A→B (idx 0) equals arithmetic mean of column values', () => {
    const result = computeActualRates(logTable, states, mode);
    const ab = result?.routes.find((r) => r.rateIdx === 0);
    // values: 0.5,0.6,0.4,0.55,0.52,0.58,0.48,0.62,0.51,0.53 → mean = 0.529
    expect(ab).toBeDefined();
    expect(ab!.meanRate).toBeCloseTo(0.529, 3);
  });

  it('HPD low ≤ mean ≤ HPD high for all routes', () => {
    const result = computeActualRates(logTable, states, mode);
    for (const r of result!.routes) {
      expect(r.hpdLow).toBeLessThanOrEqual(r.meanRate);
      expect(r.meanRate).toBeLessThanOrEqual(r.hpdHigh);
    }
  });

  it('HPD low ≤ HPD high for all routes', () => {
    const result = computeActualRates(logTable, states, mode);
    for (const r of result!.routes) {
      expect(r.hpdLow).toBeLessThanOrEqual(r.hpdHigh);
    }
  });

  it('all mean rates are non-negative', () => {
    const result = computeActualRates(logTable, states, mode);
    for (const r of result!.routes) {
      expect(r.meanRate).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns null when no actualRates columns present', () => {
    const result = computeActualRates(
      {
        columnNames: ['state', 'posterior', 'location.indicators.0'],
        columns: [new Float64Array(5), new Float64Array(5), new Float64Array(5)],
        rowCount: 5,
      },
      states,
      mode,
    );
    expect(result).toBeNull();
  });

  it('returns null when state list is empty', () => {
    const result = computeActualRates(logTable, [], mode);
    expect(result).toBeNull();
  });
});

describe('computeActualRates — symmetric mode — actual-rates-tiny.log (3 states)', () => {
  const text = readFileSync(TINY_PATH, 'utf-8');
  const logTable = parseLogText(text, { burnInFraction: 0 });
  const states = ['A', 'B', 'C'];
  const mode: SymmetryMode = 'symmetric';

  it('returns 3 routes for 3-state symmetric (upper-triangle) mode', () => {
    const result = computeActualRates(logTable, states, mode);
    expect(result?.routes).toHaveLength(3);
  });

  it('maps index 0 to A↔B (symmetric)', () => {
    const result = computeActualRates(logTable, states, mode);
    const r = result?.routes.find((x) => x.rateIdx === 0);
    expect(r?.from).toBe('A');
    expect(r?.to).toBe('B');
  });

  it('maps index 1 to A↔C (symmetric)', () => {
    const result = computeActualRates(logTable, states, mode);
    const r = result?.routes.find((x) => x.rateIdx === 1);
    expect(r?.from).toBe('A');
    expect(r?.to).toBe('C');
  });

  it('maps index 2 to B↔C (consistent with bssvs symmetric idx 2)', () => {
    const result = computeActualRates(logTable, states, mode);
    const r = result?.routes.find((x) => x.rateIdx === 2);
    expect(r?.from).toBe('B');
    expect(r?.to).toBe('C');
  });

  it('default mode is symmetric', () => {
    const withDefault = computeActualRates(logTable, states);
    const withExplicit = computeActualRates(logTable, states, 'symmetric');
    expect(withDefault?.routes).toHaveLength(withExplicit!.routes.length);
    expect(withDefault?.routes.map((r) => `${r.from}→${r.to}`)).toEqual(
      withExplicit?.routes.map((r) => `${r.from}→${r.to}`),
    );
  });
});
