import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLogText } from '../lib/log/log-table.js';
import { getLogTransferables } from './log.worker.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../tests/fixtures');

describe('getLogTransferables', () => {
  it('returns an ArrayBuffer for each Float64Array column', () => {
    const text = readFileSync(join(FIXTURES_DIR, 'bssvs-50states-tiny.log'), 'utf-8');
    const table = parseLogText(text);
    const transferables = getLogTransferables(table);
    expect(transferables).toHaveLength(table.columns.length);
    for (const t of transferables) {
      expect(t).toBeInstanceOf(ArrayBuffer);
    }
  });

  it('each buffer corresponds to a column buffer', () => {
    const text = readFileSync(join(FIXTURES_DIR, 'bssvs-50states-tiny.log'), 'utf-8');
    const table = parseLogText(text);
    const transferables = getLogTransferables(table);
    for (let i = 0; i < table.columns.length; i++) {
      expect(transferables[i]).toBe(table.columns[i]?.buffer);
    }
  });

  it('all buffer references are unique (no double-transfer)', () => {
    const text = readFileSync(join(FIXTURES_DIR, 'bssvs-50states-tiny.log'), 'utf-8');
    const table = parseLogText(text);
    const transferables = getLogTransferables(table);
    const set = new Set(transferables);
    expect(set.size).toBe(transferables.length);
  });

  it('each buffer is non-empty for a parsed log with rows', () => {
    const text = readFileSync(join(FIXTURES_DIR, 'bssvs-50states-tiny.log'), 'utf-8');
    const table = parseLogText(text);
    expect(table.rowCount).toBeGreaterThan(0);
    const transferables = getLogTransferables(table);
    for (const t of transferables) {
      expect((t as ArrayBuffer).byteLength).toBeGreaterThan(0);
    }
  });

  it('returns empty array for a table with no columns', () => {
    const emptyTable = { columnNames: [], columns: [], rowCount: 0 };
    const transferables = getLogTransferables(emptyTable);
    expect(transferables).toHaveLength(0);
  });
});
