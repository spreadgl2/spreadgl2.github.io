import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLookupCSV, resolveAmbiguousLookup } from './lookup-csv';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '../../../tests/fixtures', name), 'utf-8');
}

describe('detectLookupCSV — auto path', () => {
  it('returns auto with 3 entries on lookup-auto.csv', () => {
    const result = detectLookupCSV(fixture('lookup-auto.csv'));
    expect(result.kind).toBe('auto');
    if (result.kind !== 'auto') return;
    expect(result.mapping.size).toBe(3);
    const bj = result.mapping.get('Beijing');
    expect(bj).toBeDefined();
    expect(bj?.[0]).toBeCloseTo(39.9042);
    expect(bj?.[1]).toBeCloseTo(116.4074);
  });

  it('returns auto on discrete-locations.csv (real fixture)', () => {
    const result = detectLookupCSV(fixture('discrete-locations.csv'));
    expect(result.kind).toBe('auto');
    if (result.kind !== 'auto') return;
    expect(result.mapping.size).toBeGreaterThanOrEqual(3);
  });

  it('detects headerless location lookup files', () => {
    const result = detectLookupCSV('Arizona,33.7712,-111.3877\nCalifornia,36.17,-119.7462\n', [
      'Arizona',
      'California',
    ]);
    expect(result.kind).toBe('auto');
    if (result.kind !== 'auto') return;
    expect(result.metadata.hasHeader).toBe(false);
    expect(result.stringCol).toBe('Column 1');
    expect(result.latCol).toBe('Column 2');
    expect(result.lonCol).toBe('Column 3');
    expect(result.mapping.get('Arizona')).toEqual([33.7712, -111.3877]);
  });

  it('detects TSV lookup files', () => {
    const result = detectLookupCSV('state\tlat\tlon\nArizona\t33.7712\t-111.3877\n');
    expect(result.kind).toBe('auto');
    if (result.kind !== 'auto') return;
    expect(result.metadata.delimiter).toBe('\t');
    expect(result.mapping.get('Arizona')).toEqual([33.7712, -111.3877]);
  });
});

describe('detectLookupCSV — ambiguous path', () => {
  it('returns ambiguous with numericCols list on lookup-ambig.csv', () => {
    const result = detectLookupCSV(fixture('lookup-ambig.csv'));
    expect(result.kind).toBe('ambiguous');
    if (result.kind !== 'ambiguous') return;
    expect(result.stringCol).toBe('location');
    expect(result.numericCols).toContain('lat');
    expect(result.numericCols).toContain('lon');
    expect(result.numericCols).toContain('population');
    expect(result.numericCols).toHaveLength(3);
  });
});

describe('resolveAmbiguousLookup', () => {
  it('resolves to correct Map when user picks lat/lon from ambig fixture', () => {
    const text = fixture('lookup-ambig.csv');
    const mapping = resolveAmbiguousLookup(text, 'location', 'lat', 'lon');
    expect(mapping.size).toBe(3);
    const sh = mapping.get('Shanghai');
    expect(sh).toBeDefined();
    expect(sh?.[0]).toBeCloseTo(31.2304);
    expect(sh?.[1]).toBeCloseTo(121.4737);
  });

  it('handles swapped user pick (user assigns population as lat) gracefully', () => {
    const text = fixture('lookup-ambig.csv');
    const mapping = resolveAmbiguousLookup(text, 'location', 'population', 'lat');
    expect(mapping.size).toBe(3);
    const bj = mapping.get('Beijing');
    expect(bj?.[0]).toBeCloseTo(21540000);
    expect(bj?.[1]).toBeCloseTo(39.9042);
  });
});
