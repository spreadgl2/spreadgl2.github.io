import { mapRouteIndex, type SymmetryMode } from './bssvs';
import type { LogTable } from './log-table';

export type { SymmetryMode };

export interface RateRoute {
  from: string;
  to: string;
  meanRate: number;
  hpdLow: number;
  hpdHigh: number;
  rateIdx: number;
}

export interface RateMatrix {
  routes: RateRoute[];
  traitName: string;
}

export function detectRateTraitName(columnNames: string[]): string | null {
  for (const name of columnNames) {
    const m = /^(.+)\.actualRates\.\d+$/.exec(name);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function getRateColumns(
  columnNames: string[],
  traitName: string,
): { name: string; idx: number; colIdx: number }[] {
  const prefix = `${traitName}.actualRates.`;
  const results: { name: string; idx: number; colIdx: number }[] = [];
  for (let colIdx = 0; colIdx < columnNames.length; colIdx++) {
    const name = columnNames[colIdx];
    if (!name?.startsWith(prefix)) continue;
    const idxStr = name.slice(prefix.length);
    const idx = Number(idxStr);
    if (Number.isInteger(idx) && idx >= 0) {
      results.push({ name, idx, colIdx });
    }
  }
  results.sort((a, b) => a.idx - b.idx);
  return results;
}

function computeHpd(values: Float64Array, credMass: number): { low: number; high: number } {
  const n = values.length;
  if (n === 0) return { low: 0, high: 0 };

  const sorted = Float64Array.from(values).sort();
  const intervalWidth = Math.floor(credMass * n);

  if (intervalWidth <= 0) return { low: sorted[0] ?? 0, high: sorted[0] ?? 0 };
  if (intervalWidth >= n) return { low: sorted[0] ?? 0, high: sorted[n - 1] ?? 0 };

  let minWidth = Number.POSITIVE_INFINITY;
  let bestLow = sorted[0] ?? 0;
  let bestHigh = sorted[intervalWidth - 1] ?? sorted[n - 1] ?? 0;

  for (let i = 0; i + intervalWidth - 1 < n; i++) {
    const lo = sorted[i] ?? 0;
    const hi = sorted[i + intervalWidth - 1] ?? 0;
    const width = hi - lo;
    if (width < minWidth) {
      minWidth = width;
      bestLow = lo;
      bestHigh = hi;
    }
  }

  return { low: bestLow, high: bestHigh };
}

export function computeActualRates(
  logTable: LogTable,
  stateList: string[],
  symmetryMode: SymmetryMode = 'symmetric',
): RateMatrix | null {
  const traitName = detectRateTraitName(logTable.columnNames);
  if (!traitName) return null;

  const rateCols = getRateColumns(logTable.columnNames, traitName);
  if (rateCols.length === 0) return null;

  const routes: RateRoute[] = [];

  for (const { idx: rateIdx, colIdx } of rateCols) {
    const col = logTable.columns[colIdx];
    if (!col) continue;

    let sum = 0;
    let finiteCount = 0;
    for (let r = 0; r < logTable.rowCount; r++) {
      const v = col[r];
      if (Number.isFinite(v)) {
        sum += v as number;
        finiteCount++;
      }
    }
    const meanRate = finiteCount > 0 ? sum / finiteCount : 0;

    const { low: hpdLow, high: hpdHigh } = computeHpd(col, 0.95);

    const route = mapRouteIndex(rateIdx, stateList, symmetryMode === 'symmetric');
    if (!route) continue;

    routes.push({ from: route.from, to: route.to, meanRate, hpdLow, hpdHigh, rateIdx });
  }

  if (routes.length === 0) return null;

  return { routes, traitName };
}
