import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLogText } from '../../src/lib/log/log-table';

const FIXTURE_PATH = join(import.meta.dirname, 'bssvs-50states-tiny.log');

describe('parseLogText', () => {
  it('parses column count from 50-state BSSVS fixture', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf-8');
    const table = parseLogText(text);
    expect(table.columnNames.length).toBe(49);
    expect(table.columns.length).toBe(49);
  });

  it('applies 10% burn-in by default', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf-8');
    const table = parseLogText(text);
    // 1000 data rows; 10% = 100 dropped → 900 kept
    expect(table.rowCount).toBe(900);
  });

  it('respects custom burn-in fraction', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf-8');
    const table = parseLogText(text, { burnInFraction: 0.2 });
    // 1000 data rows; 20% = 200 dropped → 800 kept
    expect(table.rowCount).toBe(800);
  });

  it('zero burn-in keeps all rows', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf-8');
    const table = parseLogText(text, { burnInFraction: 0 });
    expect(table.rowCount).toBe(1000);
  });

  it('columns are Float64Array', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf-8');
    const table = parseLogText(text);
    for (const col of table.columns) {
      expect(col).toBeInstanceOf(Float64Array);
      expect(col.length).toBe(table.rowCount);
    }
  });

  it('first column name is "state"', () => {
    const text = readFileSync(FIXTURE_PATH, 'utf-8');
    const table = parseLogText(text);
    expect(table.columnNames[0]).toBe('state');
  });

  it('skips comment lines starting with #', () => {
    const text = '# comment line\nstate\tposterior\n0\t-1000\n1\t-999\n';
    const table = parseLogText(text, { burnInFraction: 0 });
    expect(table.rowCount).toBe(2);
    expect(table.columnNames).toEqual(['state', 'posterior']);
  });

  it('throws on empty or header-only input', () => {
    expect(() => parseLogText('')).toThrow();
    expect(() => parseLogText('state\tposterior\n')).toThrow();
  });
});
