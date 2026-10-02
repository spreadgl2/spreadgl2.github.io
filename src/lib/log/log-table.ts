import { assertTextSize, INPUT_LIMITS, InputLimitError } from '../security/input-limits';

export interface LogTable {
  columnNames: string[];
  columns: Float64Array[];
  rowCount: number;
}

export interface ParseLogOptions {
  burnInFraction?: number;
}

/** Header and sample count of a log, without materializing its values. */
export interface LogInspection {
  columnNames: string[];
  sampleCount: number;
}

/** Calls `visit` for each non-empty, non-comment line; stops when it returns false. */
function forEachLogLine(text: string, visit: (line: string) => boolean): void {
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      const line = text.slice(start, i).replace(/\r$/, '');
      start = i + 1;
      if (line.length > 0 && !line.startsWith('#') && !visit(line)) return;
    }
  }
}

function assertRowLimit(lineCount: number): void {
  if (lineCount > INPUT_LIMITS.logRows + 1) {
    throw new InputLimitError(
      `Log files may contain at most ${INPUT_LIMITS.logRows.toLocaleString()} data rows.`,
    );
  }
}

function parseHeader(headerLine: string | undefined, lineCount: number): string[] {
  if (lineCount < 2 || headerLine === undefined) {
    throw new Error('Log file must have a header row and at least one data row');
  }
  const columnNames = headerLine.split('\t');
  if (columnNames.length > INPUT_LIMITS.logColumns) {
    throw new InputLimitError(
      `Log files may contain at most ${INPUT_LIMITS.logColumns.toLocaleString()} columns.`,
    );
  }
  return columnNames;
}

export function inspectLogText(text: string): LogInspection {
  assertTextSize('log', text);
  let headerLine: string | undefined;
  let lineCount = 0;
  forEachLogLine(text, (line) => {
    if (lineCount === 0) headerLine = line;
    lineCount += 1;
    assertRowLimit(lineCount);
    return true;
  });
  const columnNames = parseHeader(headerLine, lineCount);
  return { columnNames, sampleCount: lineCount - 1 };
}

export function parseLogText(text: string, options?: ParseLogOptions): LogTable {
  assertTextSize('log', text);
  const burnIn = options?.burnInFraction ?? 0.1;

  const lines: string[] = [];
  forEachLogLine(text, (line) => {
    lines.push(line);
    assertRowLimit(lines.length);
    return true;
  });

  const columnNames = parseHeader(lines[0], lines.length);
  const colCount = columnNames.length;

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
