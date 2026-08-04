import type { LogTable } from './log-table';

export interface JumpRoute {
  from: string;
  to: string;
  meanCount: number;
}

export interface JumpMatrix {
  routes: JumpRoute[];
  traitName: string;
}

export function detectJumpTraitName(columnNames: string[]): string | null {
  for (const name of columnNames) {
    const m = /^(.+)\.count\.[^.]+\.[^.]+$/.exec(name);
    if (m?.[1]) return m[1];
  }
  for (const name of columnNames) {
    const m = /^(.+)\.history\.[^.]+\.[^.]+$/.exec(name);
    if (m?.[1]) return m[1];
  }
  return null;
}

function parseFromTo(colName: string, prefix: string): { from: string; to: string } | null {
  const suffix = colName.slice(prefix.length);
  const dotIdx = suffix.indexOf('.');
  if (dotIdx < 1) return null;
  const from = suffix.slice(0, dotIdx);
  const to = suffix.slice(dotIdx + 1);
  if (!from || !to) return null;
  return { from, to };
}

export function computeJumpMatrix(logTable: LogTable): JumpMatrix | null {
  const traitName = detectJumpTraitName(logTable.columnNames);
  if (!traitName) return null;

  const countPrefix = `${traitName}.count.`;
  const historyPrefix = `${traitName}.history.`;

  const routes: JumpRoute[] = [];

  for (let colIdx = 0; colIdx < logTable.columnNames.length; colIdx++) {
    const name = logTable.columnNames[colIdx];
    if (!name) continue;

    let parsed: { from: string; to: string } | null = null;
    if (name.startsWith(countPrefix)) {
      parsed = parseFromTo(name, countPrefix);
    } else if (name.startsWith(historyPrefix)) {
      parsed = parseFromTo(name, historyPrefix);
    }
    if (!parsed) continue;

    const col = logTable.columns[colIdx];
    if (!col) continue;

    let sum = 0;
    for (let r = 0; r < logTable.rowCount; r++) {
      const v = col[r];
      if (Number.isFinite(v)) sum += v as number;
    }
    const meanCount = logTable.rowCount > 0 ? sum / logTable.rowCount : 0;

    routes.push({ from: parsed.from, to: parsed.to, meanCount });
  }

  if (routes.length === 0) return null;

  return { routes, traitName };
}
