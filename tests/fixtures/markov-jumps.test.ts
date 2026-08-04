import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeJumpMatrix, detectJumpTraitName } from '../../src/lib/log/markov-jumps';
import { parseLogText } from '../../src/lib/log/log-table';

const TINY_PATH = join(import.meta.dirname, 'markov-jumps-tiny.log');

describe('detectJumpTraitName', () => {
  it('detects trait name from count columns', () => {
    const cols = ['state', 'posterior', 'location.count.A.B', 'location.count.B.A'];
    expect(detectJumpTraitName(cols)).toBe('location');
  });

  it('detects trait name from history columns', () => {
    const cols = ['state', 'posterior', 'region.history.X.Y'];
    expect(detectJumpTraitName(cols)).toBe('region');
  });

  it('prefers count over history when both present', () => {
    const cols = ['state', 'location.count.A.B', 'region.history.X.Y'];
    expect(detectJumpTraitName(cols)).toBe('location');
  });

  it('returns null when no jump columns present', () => {
    expect(detectJumpTraitName(['state', 'posterior', 'location.indicators.0'])).toBeNull();
  });
});

describe('computeJumpMatrix — markov-jumps-tiny.log', () => {
  const text = readFileSync(TINY_PATH, 'utf-8');
  const logTable = parseLogText(text, { burnInFraction: 0 });

  it('returns a non-null matrix', () => {
    const matrix = computeJumpMatrix(logTable);
    expect(matrix).not.toBeNull();
  });

  it('has trait name "location"', () => {
    const matrix = computeJumpMatrix(logTable);
    expect(matrix?.traitName).toBe('location');
  });

  it('returns 6 routes for a 3-state asymmetric fixture', () => {
    const matrix = computeJumpMatrix(logTable);
    expect(matrix?.routes).toHaveLength(6);
  });

  it('A→B route has the highest mean count', () => {
    const matrix = computeJumpMatrix(logTable);
    const ab = matrix?.routes.find((r) => r.from === 'A' && r.to === 'B');
    expect(ab).toBeDefined();
    expect(ab!.meanCount).toBeGreaterThan(0);
    // A→B has the highest counts in the fixture
    for (const r of matrix!.routes) {
      if (r.from === 'A' && r.to === 'B') continue;
      expect(ab!.meanCount).toBeGreaterThanOrEqual(r.meanCount);
    }
  });

  it('mean count equals arithmetic mean of column values', () => {
    const matrix = computeJumpMatrix(logTable);
    // location.count.A.B values: 3,4,2,5,3,4,2,6,3,4 → mean = 3.6
    const ab = matrix?.routes.find((r) => r.from === 'A' && r.to === 'B');
    expect(ab).toBeDefined();
    expect(ab!.meanCount).toBeCloseTo(3.6, 5);
  });

  it('all mean counts are non-negative', () => {
    const matrix = computeJumpMatrix(logTable);
    for (const r of matrix!.routes) {
      expect(r.meanCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns null when no jump columns present', () => {
    const result = computeJumpMatrix({
      columnNames: ['state', 'posterior', 'location.indicators.0'],
      columns: [new Float64Array(5), new Float64Array(5), new Float64Array(5)],
      rowCount: 5,
    });
    expect(result).toBeNull();
  });
});
