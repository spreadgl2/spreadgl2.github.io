import type { LogTable } from './log-table';

export type SymmetryMode = 'symmetric' | 'asymmetric';

export interface BssvsBayesFactor {
  from: string;
  to: string;
  posteriorFrequency: number;
  priorProbability: number;
  bayesFactor: number;
  evidenceLabel: EvidenceLabel;
  indicatorIdx: number;
}

export type EvidenceLabel = 'no support' | 'weak' | 'positive' | 'strong' | 'very strong';

function kassRafteryLabel(bf: number): EvidenceLabel {
  if (bf < 1) return 'no support';
  if (bf < 3) return 'weak';
  if (bf < 20) return 'positive';
  if (bf < 150) return 'strong';
  return 'very strong';
}

// Lemey et al. 2009 §2.3: prior per-route inclusion probability q = (ln2 + K−1) / nRoutes
function priorExpected(nStates: number, symmetric: boolean): number {
  const nRoutes = symmetric ? (nStates * (nStates - 1)) / 2 : nStates * (nStates - 1);
  return (Math.log(2) + nStates - 1) / nRoutes;
}

function computeBayesFactor(pPost: number, pPrior: number): number {
  if (pPost >= 1) return Number.POSITIVE_INFINITY;
  if (pPrior >= 1) return 0;
  const oddsPost = pPost / (1 - pPost);
  const oddsPrior = pPrior / (1 - pPrior);
  if (oddsPrior === 0) return Number.POSITIVE_INFINITY;
  return oddsPost / oddsPrior;
}

export function detectTraitName(columnNames: string[]): string | null {
  for (const name of columnNames) {
    const m = /^(.+)\.indicators\.(?:\d+|[^.]+\.[^.]+)$/.exec(name);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function detectTraitNames(columnNames: string[]): string[] {
  const seen = new Set<string>();
  for (const name of columnNames) {
    const m = /^(.+)\.indicators\.(?:\d+|[^.]+\.[^.]+)$/.exec(name);
    if (m?.[1]) seen.add(m[1]);
  }
  return [...seen];
}

// The discrete states of a BSSVS trait, taken from its named indicator routes
// (e.g. host.indicators.Ap.Ef → {Ap, Ef}). Numeric-only indicators carry no state
// names, so `fallback` (the tree's discrete values) is used instead.
export function bssvsStateList(
  columnNames: string[],
  traitName: string,
  fallback?: string[],
): string[] {
  const seen = new Set<string>();
  for (const col of getIndicatorColumns(columnNames, traitName)) {
    if (col.route) {
      seen.add(col.route.from);
      seen.add(col.route.to);
    }
  }
  if (seen.size > 0) return [...seen].sort();
  return fallback ? [...fallback].sort() : [];
}

export function getIndicatorColumns(
  columnNames: string[],
  traitName: string,
): { name: string; idx: number; colIdx: number; route?: { from: string; to: string } }[] {
  const prefix = `${traitName}.indicators.`;
  const results: {
    name: string;
    idx: number;
    colIdx: number;
    route?: { from: string; to: string };
  }[] = [];
  for (let colIdx = 0; colIdx < columnNames.length; colIdx++) {
    const name = columnNames[colIdx];
    if (!name?.startsWith(prefix)) continue;
    const idxStr = name.slice(prefix.length);
    const idx = Number(idxStr);
    if (Number.isInteger(idx) && idx >= 0) {
      results.push({ name, idx, colIdx });
      continue;
    }
    // Named route, e.g. state.indicators.Arizona.California → from/to on the
    // first dot. Limitation: state names containing '.' (e.g. "St. Louis") are
    // not supported — the detectTraitName regex requires exactly two dot-free
    // tokens and this split would break from/to. Rare for BEAST discrete states.
    const dotIdx = idxStr.indexOf('.');
    if (dotIdx > 0 && dotIdx < idxStr.length - 1) {
      results.push({
        name,
        idx: results.length,
        colIdx,
        route: { from: idxStr.slice(0, dotIdx), to: idxStr.slice(dotIdx + 1) },
      });
    }
  }
  results.sort((a, b) => a.idx - b.idx);
  return results;
}

function routeMatchesStateList(
  route: { from: string; to: string },
  stateSet: Set<string>,
): boolean {
  return stateSet.has(route.from) && stateSet.has(route.to);
}

export function detectTraitNameForStates(
  columnNames: string[],
  stateList: string[],
): string | null {
  const names = detectTraitNames(columnNames);
  if (names.length === 0) return null;
  const stateSet = new Set(stateList);
  let bestNamed: { traitName: string; score: number } | null = null;
  let bestNumeric: { traitName: string; score: number } | null = null;
  for (const traitName of names) {
    const cols = getIndicatorColumns(columnNames, traitName);
    const named = cols.filter((col) => col.route !== undefined);
    if (named.length > 0) {
      const score = named.filter(
        (col) => col.route && routeMatchesStateList(col.route, stateSet),
      ).length;
      if (score > 0 && (bestNamed === null || score > bestNamed.score)) {
        bestNamed = { traitName, score };
      }
    } else if (bestNumeric === null || cols.length > bestNumeric.score) {
      bestNumeric = { traitName, score: cols.length };
    }
  }
  return bestNamed?.traitName ?? bestNumeric?.traitName ?? null;
}

export function inferBssvsSymmetryMode(
  columnNames: string[],
  stateList: string[],
): SymmetryMode | null {
  const traitName = detectTraitNameForStates(columnNames, stateList);
  if (!traitName || stateList.length < 2) return null;
  const indicatorCount = getIndicatorColumns(columnNames, traitName).length;
  const symmetricCount = (stateList.length * (stateList.length - 1)) / 2;
  const asymmetricCount = stateList.length * (stateList.length - 1);
  if (indicatorCount === symmetricCount) return 'symmetric';
  if (indicatorCount === asymmetricCount) return 'asymmetric';
  return null;
}

export function mapRouteIndex(
  idx: number,
  stateList: string[],
  symmetric: boolean,
): { from: string; to: string } | null {
  const n = stateList.length;
  if (symmetric) {
    // Upper-triangle enumeration: row i, col j (j > i), linear index
    let k = 0;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        if (k === idx) {
          const from = stateList[i];
          const to = stateList[j];
          if (from === undefined || to === undefined) return null;
          return { from, to };
        }
        k++;
      }
    }
  } else {
    // All ordered pairs (i, j) with i ≠ j
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        if (k === idx) {
          const from = stateList[i];
          const to = stateList[j];
          if (from === undefined || to === undefined) return null;
          return { from, to };
        }
        k++;
      }
    }
  }
  return null;
}

export function computeBssvsBayesFactors(
  logTable: LogTable,
  stateList: string[],
  symmetryMode: SymmetryMode,
): BssvsBayesFactor[] {
  if (stateList.length < 2) return [];

  const traitName = detectTraitNameForStates(logTable.columnNames, stateList);
  if (!traitName) return [];

  const indicatorCols = getIndicatorColumns(logTable.columnNames, traitName);
  if (indicatorCols.length === 0) return [];

  const nStates = stateList.length;
  const symmetric = symmetryMode === 'symmetric';
  const pPrior = priorExpected(nStates, symmetric);

  const results: BssvsBayesFactor[] = [];
  for (const { idx: indicatorIdx, colIdx, route: namedRoute } of indicatorCols) {
    const col = logTable.columns[colIdx];
    if (!col) continue;

    let sum = 0;
    for (let r = 0; r < logTable.rowCount; r++) {
      const v = col[r];
      sum += Number.isFinite(v) ? (v as number) : 0;
    }
    const pPost = sum / logTable.rowCount;

    const route = namedRoute ?? mapRouteIndex(indicatorIdx, stateList, symmetric);
    if (!route) continue;

    const bf = computeBayesFactor(pPost, pPrior);
    results.push({
      from: route.from,
      to: route.to,
      posteriorFrequency: pPost,
      priorProbability: pPrior,
      bayesFactor: bf,
      evidenceLabel: kassRafteryLabel(bf),
      indicatorIdx,
    });
  }

  return results;
}
