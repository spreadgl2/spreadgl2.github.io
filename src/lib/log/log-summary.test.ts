import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasLogAnalyses, summarizeLogColumns } from './log-summary';
import { inspectLogText, parseLogText } from './log-table';

const FIXTURES_DIR = join(import.meta.dirname, '../../../tests/fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

describe('inspectLogText', () => {
  it('returns the header and sample count without applying burn-in', () => {
    const text = fixture('bssvs-tiny.log');
    const inspection = inspectLogText(text);
    const table = parseLogText(text, { burnInFraction: 0 });
    expect(inspection.columnNames).toEqual(table.columnNames);
    expect(inspection.sampleCount).toBe(table.rowCount);
  });

  it('skips comments and blank lines', () => {
    expect(inspectLogText('# comment\nstate\tposterior\n\n0\t-1\r\n10\t-2\n')).toEqual({
      columnNames: ['state', 'posterior'],
      sampleCount: 2,
    });
  });

  it('rejects logs without data rows', () => {
    expect(() => inspectLogText('state\tposterior\n')).toThrow(/header row and at least one/);
  });
});

describe('summarizeLogColumns', () => {
  it('matches BSSVS indicators to a discrete tree', () => {
    const { columnNames } = inspectLogText(fixture('bssvs-tiny.log'));
    const summary = summarizeLogColumns(columnNames, ['A', 'B', 'C']);
    expect(summary.bssvsTraits).toEqual(['location']);
    expect(summary.matchedBssvsTrait).toBe('location');
    expect(hasLogAnalyses(summary)).toBe(true);
  });

  it('does not match BSSVS traits for a continuous tree', () => {
    const { columnNames } = inspectLogText(fixture('bssvs-tiny.log'));
    expect(summarizeLogColumns(columnNames, null).matchedBssvsTrait).toBeNull();
  });

  it('detects Markov jumps and actual rates', () => {
    const jumps = inspectLogText(fixture('markov-jumps-tiny.log')).columnNames;
    const rates = inspectLogText(fixture('actual-rates-tiny.log')).columnNames;
    expect(summarizeLogColumns(jumps, null).markovJumpTrait).toBe('location');
    expect(summarizeLogColumns(rates, null).actualRatesTrait).toBe('location');
  });

  it('reports logs that offer no analyses', () => {
    const summary = summarizeLogColumns(['state', 'posterior', 'likelihood'], ['A', 'B']);
    expect(hasLogAnalyses(summary)).toBe(false);
  });
});
