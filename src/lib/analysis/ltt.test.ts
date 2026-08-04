import { describe, expect, it } from 'vitest';
import type { BranchTable } from '../phylo/types';
import { buildLttSeries, countAtTime, sumLttSeries } from './ltt';

function table(
  rows: Array<{ start: number; end: number; weight?: number; lat?: number; lon?: number }>,
): BranchTable {
  const count = rows.length;
  return {
    count,
    branchId: new Int32Array(rows.map((_, i) => i)),
    parentBranch: new Int32Array(count).fill(-1),
    isInternal: new Uint8Array(count),
    startTime: new Float32Array(rows.map((row) => row.start)),
    endTime: new Float32Array(rows.map((row) => row.end)),
    startLat: new Float32Array(rows.map((row) => row.lat ?? 0)),
    startLon: new Float32Array(rows.map((row) => row.lon ?? 0)),
    endLat: new Float32Array(rows.map((row) => row.lat ?? 0)),
    endLon: new Float32Array(rows.map((row) => row.lon ?? 0)),
    stateWeight: new Float32Array(rows.map((row) => row.weight ?? 1)),
  };
}

describe('buildLttSeries', () => {
  it('uses instantaneous lineage counts with start included and end excluded', () => {
    const bundle = buildLttSeries(
      table([
        { start: 0, end: 2 },
        { start: 1, end: 3 },
      ]),
      { min: 0, max: 3 },
    );

    expect(countAtTime(bundle.global, 0)).toBe(1);
    expect(countAtTime(bundle.global, 1)).toBe(2);
    expect(countAtTime(bundle.global, 2)).toBe(1);
    expect(countAtTime(bundle.global, 3)).toBe(0);
  });

  it('weights tie-expanded discrete rows by stateWeight', () => {
    const locations = new Map<string, [number, number]>([
      ['A', [10, 20]],
      ['B', [30, 40]],
    ]);
    const bundle = buildLttSeries(
      table([
        { start: 0, end: 2, weight: 0.5, lat: 10, lon: 20 },
        { start: 0, end: 2, weight: 0.5, lat: 30, lon: 40 },
      ]),
      { min: 0, max: 2 },
      { values: ['A', 'B'], coordByValue: locations },
    );

    expect(bundle.locations).toEqual(['A', 'B']);
    expect(countAtTime(bundle.byLocation.get('A') ?? [], 1)).toBe(0.5);
    expect(countAtTime(bundle.byLocation.get('B') ?? [], 1)).toBe(0.5);
    expect(countAtTime(bundle.global, 1)).toBe(1);
  });

  it('sums location series without rescanning the branch table', () => {
    const locations = new Map<string, [number, number]>([
      ['A', [10, 20]],
      ['B', [30, 40]],
    ]);
    const bundle = buildLttSeries(
      table([
        { start: 0, end: 2, lat: 10, lon: 20 },
        { start: 1, end: 3, lat: 30, lon: 40 },
      ]),
      { min: 0, max: 3 },
      { values: ['A', 'B'], coordByValue: locations },
    );
    const summed = sumLttSeries(
      ['A', 'B'].map((value) => bundle.byLocation.get(value) ?? []),
      bundle.bounds,
    );

    expect(countAtTime(summed, 0)).toBe(1);
    expect(countAtTime(summed, 1)).toBe(2);
    expect(countAtTime(summed, 3)).toBe(0);
  });

  it('does not assign an unresolved endpoint to a valid location at (0,0)', () => {
    const branchTable = table([
      { start: 0, end: 2, lat: 0, lon: 0 },
      { start: 0, end: 2, lat: 0, lon: 0 },
    ]);
    branchTable.startGeoResolved = new Uint8Array([1, 0]);
    branchTable.endGeoResolved = new Uint8Array([1, 1]);
    const bundle = buildLttSeries(
      branchTable,
      { min: 0, max: 2 },
      {
        values: ['Null Island'],
        coordByValue: new Map([['Null Island', [0, 0]]]),
      },
    );

    expect(countAtTime(bundle.global, 1)).toBe(2);
    expect(countAtTime(bundle.byLocation.get('Null Island') ?? [], 1)).toBe(1);
  });
});
