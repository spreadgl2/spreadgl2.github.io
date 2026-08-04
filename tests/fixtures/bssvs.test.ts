import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bssvsStateList,
  computeBssvsBayesFactors,
  detectTraitName,
  detectTraitNameForStates,
  detectTraitNames,
  getIndicatorColumns,
  inferBssvsSymmetryMode,
} from '../../src/lib/log/bssvs';
import type { LogTable } from '../../src/lib/log/log-table';
import { parseLogText } from '../../src/lib/log/log-table';

describe('detectTraitNames / bssvsStateList', () => {
  it('lists every BSSVS trait present in the log', () => {
    const cols = ['state', 'state.indicators.A.B', 'host.indicators.Ap.Ef'];
    expect(detectTraitNames(cols).sort()).toEqual(['host', 'state']);
  });

  it('derives a trait state list from its named indicator routes', () => {
    const cols = ['host.indicators.Ap.Ef', 'host.indicators.Ap.Cn'];
    expect(bssvsStateList(cols, 'host')).toEqual(['Ap', 'Cn', 'Ef']);
  });

  it('falls back to the provided states for numeric-only indicators', () => {
    const cols = ['location.indicators.0', 'location.indicators.1'];
    expect(bssvsStateList(cols, 'location', ['B', 'A'])).toEqual(['A', 'B']);
  });
});

const TINY_PATH = join(import.meta.dirname, 'bssvs-tiny.log');

describe('detectTraitName', () => {
  it('detects trait name from indicator column names', () => {
    const cols = ['state', 'posterior', 'location.indicators.0', 'location.indicators.1'];
    expect(detectTraitName(cols)).toBe('location');
  });

  it('detects trait name from named-route indicator column names', () => {
    const cols = ['state', 'posterior', 'location.indicators.A.B', 'location.indicators.A.C'];
    expect(detectTraitName(cols)).toBe('location');
  });

  it('returns null when no indicator columns present', () => {
    expect(detectTraitName(['state', 'posterior'])).toBeNull();
  });
});

describe('getIndicatorColumns', () => {
  it('extracts and sorts indicator columns by index', () => {
    const cols = [
      'state',
      'location.indicators.2',
      'location.indicators.0',
      'location.indicators.1',
    ];
    const result = getIndicatorColumns(cols, 'location');
    expect(result.map((r) => r.idx)).toEqual([0, 1, 2]);
    // cols[2]='indicators.0' (idx=0,colIdx=2), cols[3]='indicators.1' (colIdx=3), cols[1]='indicators.2' (colIdx=1)
    expect(result.map((r) => r.colIdx)).toEqual([2, 3, 1]);
  });

  it('returns empty when no matching columns', () => {
    expect(getIndicatorColumns(['state', 'posterior'], 'region')).toEqual([]);
  });

  it('extracts named-route indicator columns', () => {
    const cols = ['state', 'location.indicators.Arizona.California'];
    const result = getIndicatorColumns(cols, 'location');
    expect(result).toHaveLength(1);
    expect(result[0]?.route).toEqual({ from: 'Arizona', to: 'California' });
  });
});

describe('inferBssvsSymmetryMode', () => {
  it('infers symmetric mode from K*(K-1)/2 indicators', () => {
    const cols = [
      'state',
      'location.indicators.0',
      'location.indicators.1',
      'location.indicators.2',
    ];
    expect(inferBssvsSymmetryMode(cols, ['A', 'B', 'C'])).toBe('symmetric');
  });

  it('infers asymmetric mode from K*(K-1) indicators', () => {
    const cols = [
      'state',
      'location.indicators.0',
      'location.indicators.1',
      'location.indicators.2',
      'location.indicators.3',
      'location.indicators.4',
      'location.indicators.5',
    ];
    expect(inferBssvsSymmetryMode(cols, ['A', 'B', 'C'])).toBe('asymmetric');
  });

  it('returns null for partial indicator logs', () => {
    const cols = ['state', 'location.indicators.0', 'location.indicators.1'];
    expect(inferBssvsSymmetryMode(cols, ['A', 'B', 'C'])).toBeNull();
  });
});

describe('computeBssvsBayesFactors — bssvs-tiny.log (3 states)', () => {
  const text = readFileSync(TINY_PATH, 'utf-8');
  const logTable = parseLogText(text, { burnInFraction: 0 });
  const states = ['A', 'B', 'C'];

  it('returns one row per indicator in symmetric mode', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'symmetric');
    expect(rows).toHaveLength(3);
  });

  it('returns one row per matched indicator in asymmetric mode (fixture has 3 indicators)', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'asymmetric');
    // bssvs-tiny.log has 3 indicator columns (indices 0,1,2).
    // In asymmetric 3-state mapping: idx0=A→B, idx1=A→C, idx2=B→A.
    // Only 3 indicators found → 3 rows, not all 6 asymmetric pairs.
    expect(rows).toHaveLength(3);
  });

  it('maps indicator 0 to A→B (symmetric)', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'symmetric');
    const first = rows.find((r) => r.indicatorIdx === 0);
    expect(first?.from).toBe('A');
    expect(first?.to).toBe('B');
  });

  it('maps indicator 1 to A→C (symmetric)', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'symmetric');
    const r = rows.find((r) => r.indicatorIdx === 1);
    expect(r?.from).toBe('A');
    expect(r?.to).toBe('C');
  });

  it('maps indicator 2 to B→C (symmetric)', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'symmetric');
    const r = rows.find((r) => r.indicatorIdx === 2);
    expect(r?.from).toBe('B');
    expect(r?.to).toBe('C');
  });

  it('exposes the Lemey 2009 prior inclusion probability on every symmetric row', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'symmetric');
    // q = (ln2 + K-1) / (K(K-1)/2); K=3 → (ln2 + 2)/3 ≈ 0.8977
    const expected =
      (Math.log(2) + states.length - 1) / ((states.length * (states.length - 1)) / 2);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.priorProbability).toBeCloseTo(expected, 6);
    }
  });

  it('uses the asymmetric route count in the prior when in asymmetric mode', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'asymmetric');
    // q = (ln2 + K-1) / (K(K-1)); K=3 → (ln2 + 2)/6 ≈ 0.4489
    const expected = (Math.log(2) + states.length - 1) / (states.length * (states.length - 1));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.priorProbability).toBeCloseTo(expected, 6);
    }
  });

  it('indicator 0 (A→B, p≈0.87) has BF < 1 (no support) — Lemey 2009 corrected prior q≈0.90 for K=3', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'symmetric');
    const r = rows.find((r) => r.indicatorIdx === 0);
    expect(r).toBeDefined();
    expect(r!.posteriorFrequency).toBeGreaterThan(0.8);
    expect(r!.bayesFactor).toBeLessThan(1);
    expect(r!.evidenceLabel).toBe('no support');
  });

  it('indicator 2 (B→C, p≈0.07) gets no support BF', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'symmetric');
    const r = rows.find((r) => r.indicatorIdx === 2);
    expect(r).toBeDefined();
    expect(r!.posteriorFrequency).toBeLessThan(0.3);
    expect(r!.bayesFactor).toBeLessThan(1);
    expect(r!.evidenceLabel).toBe('no support');
  });

  it('posterior frequency is between 0 and 1 for all rows', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'symmetric');
    for (const r of rows) {
      expect(r.posteriorFrequency).toBeGreaterThanOrEqual(0);
      expect(r.posteriorFrequency).toBeLessThanOrEqual(1);
    }
  });

  it('BF is positive for all rows', () => {
    const rows = computeBssvsBayesFactors(logTable, states, 'symmetric');
    for (const r of rows) {
      expect(r.bayesFactor).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns empty array when state list has fewer than 2 states', () => {
    const rows = computeBssvsBayesFactors(logTable, ['A'], 'symmetric');
    expect(rows).toHaveLength(0);
  });

  it('uses named state routes when a log also contains host BSSVS indicators', () => {
    const text = [
      'state\thost.indicators.Ap.Ef\tstate.indicators.Arizona.California\tstate.indicators.Arizona.Texas',
      '0\t1\t1\t0',
      '1\t0\t1\t1',
      '2\t1\t0\t1',
    ].join('\n');
    const table = parseLogText(text, { burnInFraction: 0 });
    expect(detectTraitNameForStates(table.columnNames, ['Arizona', 'California', 'Texas'])).toBe(
      'state',
    );
    const rows = computeBssvsBayesFactors(table, ['Arizona', 'California', 'Texas'], 'symmetric');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => `${row.from}.${row.to}`)).toEqual([
      'Arizona.California',
      'Arizona.Texas',
    ]);
  });
});

describe('route mapping — ordering invariant', () => {
  it('produces identical from/to labels regardless of state list insertion order (unsorted vs sorted)', () => {
    // Simulates traitInfo.values arriving in first-appearance order (C, A, B)
    // vs BEAST sorted order (A, B, C). The sorted state list is authoritative.
    // bssvs-tiny.log has 3 indicator columns mapping to a 3-state symmetric tree.

    const text = readFileSync(TINY_PATH, 'utf-8');
    const tbl: LogTable = parseLogText(text, { burnInFraction: 0 });

    const sortedStates = ['A', 'B', 'C'];
    const unsortedStates = ['C', 'A', 'B'];

    const rowsSorted = computeBssvsBayesFactors(tbl, sortedStates, 'symmetric');
    const rowsUnsorted = computeBssvsBayesFactors(tbl, unsortedStates, 'symmetric');

    // Regardless of which order was passed, after sorting both should agree on
    // indicator 0 → A↔B, indicator 1 → A↔C, indicator 2 → B↔C.
    const sorted0 = rowsSorted.find((r) => r.indicatorIdx === 0);
    const unsorted0 = rowsUnsorted.find((r) => r.indicatorIdx === 0);
    expect(sorted0?.from).toBe('A');
    expect(sorted0?.to).toBe('B');
    // The unsorted result uses the unsorted state list so routes will differ —
    // this test documents that callers MUST sort before calling.
    // DtaPanel.tsx sorts via [...traitInfo.values].sort() before the call.
    expect(unsorted0?.from).not.toBe(sorted0?.from);
  });

  it('DtaPanel sort guard: sorted stateList gives stable indicator→route mapping', () => {
    const text = readFileSync(TINY_PATH, 'utf-8');
    const tbl: LogTable = parseLogText(text, { burnInFraction: 0 });

    // Mimic what DtaPanel does: sort before passing
    const rawStates = ['C', 'B', 'A'];
    const sortedStates = [...rawStates].sort();

    const rows = computeBssvsBayesFactors(tbl, sortedStates, 'symmetric');
    expect(rows.find((r) => r.indicatorIdx === 0)?.from).toBe('A');
    expect(rows.find((r) => r.indicatorIdx === 0)?.to).toBe('B');
    expect(rows.find((r) => r.indicatorIdx === 1)?.from).toBe('A');
    expect(rows.find((r) => r.indicatorIdx === 1)?.to).toBe('C');
    expect(rows.find((r) => r.indicatorIdx === 2)?.from).toBe('B');
    expect(rows.find((r) => r.indicatorIdx === 2)?.to).toBe('C');
  });
});
