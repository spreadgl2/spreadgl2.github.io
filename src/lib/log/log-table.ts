import { assertTextSize, INPUT_LIMITS, InputLimitError } from '../security/input-limits';

export interface LogTable {
  columnNames: string[];
  columns: Float64Array[];
  rowCount: number;
}

export interface ParseLogOptions {
  burnInFraction?: number;
}

export function parseLogText(text: string, options?: ParseLogOptions): LogTable {
  assertTextSize('log', text);
  const burnIn = options?.burnInFraction ?? 0.1;

  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      const line = text.slice(start, i).replace(/\r$/, '');
      start = i + 1;
      if (line.length > 0 && !line.startsWith('#')) {
        lines.push(line);
        if (lines.length > INPUT_LIMITS.logRows + 1) {
          throw new InputLimitError(
            `Log files may contain at most ${INPUT_LIMITS.logRows.toLocaleString()} data rows.`,
          );
        }
      }
    }
  }

  if (lines.length < 2) {
    throw new Error('Log file must have a header row and at least one data row');
  }

  const headerLine = lines[0];
  if (!headerLine) throw new Error('Empty header line');
  const columnNames = headerLine.split('\t');
  const colCount = columnNames.length;
  if (colCount > INPUT_LIMITS.logColumns) {
    throw new InputLimitError(
      `Log files may contain at most ${INPUT_LIMITS.logColumns.toLocaleString()} columns.`,
    );
  }

  const dataLines = lines.slice(1);
  const totalRows = dataLines.length;
  const burnInCount = Math.floor(totalRows * burnIn);
  const keptLines = dataLines.slice(burnInCount);
  const rowCount = keptLines.length;
  if (rowCount * colCount > INPUT_LIMITS.logCells) {
    throw new InputLimitError('Log dimensions exceed the supported in-memory cell budget.');
  }

  if (rowCount === 0) {
    throw new Error('No rows remain after burn-in trimming');
  }

  const buffers: Float64Array[] = Array.from(
    { length: colCount },
    () => new Float64Array(rowCount),
  );

  for (let r = 0; r < rowCount; r++) {
    const line = keptLines[r];
    if (!line) continue;
    const fields = line.split('\t');
    for (let c = 0; c < colCount; c++) {
      const field = fields[c];
      const val = field !== undefined && field !== '' ? Number(field) : Number.NaN;
      const col = buffers[c];
      if (col) col[r] = val;
    }
  }

  return { columnNames, columns: buffers, rowCount };
}
