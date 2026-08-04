import { assertTextSize, INPUT_LIMITS, InputLimitError } from '../security/input-limits';
import { splitDelimitedRow } from './delimited';

export type LookupDetectResult =
  | {
      kind: 'auto';
      mapping: Map<string, [number, number]>;
      metadata: LookupTableMetadata;
      stringCol: string;
      latCol: string;
      lonCol: string;
      numericCols: string[];
    }
  | {
      kind: 'ambiguous';
      stringCol: string;
      numericCols: string[];
      metadata: LookupTableMetadata;
    };

export interface LookupTableMetadata {
  delimiter: ',' | '\t';
  hasHeader: boolean;
  columns: string[];
  rowCount: number;
}

function parseTable(text: string): {
  rows: Array<Record<string, string>>;
  metadata: LookupTableMetadata;
} {
  assertTextSize('csv', text);
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');
  if (lines.length > INPUT_LIMITS.csvRows + 1) {
    throw new InputLimitError(
      `CSV files may contain at most ${INPUT_LIMITS.csvRows.toLocaleString()} data rows.`,
    );
  }
  if (lines.length < 1) {
    return { rows: [], metadata: { delimiter: ',', hasHeader: false, columns: [], rowCount: 0 } };
  }
  const delimiter = detectDelimiter(lines);
  const firstCells = splitDelimitedRow(lines[0] ?? '', delimiter);
  if (firstCells.length > INPUT_LIMITS.csvColumns) {
    throw new InputLimitError(
      `CSV files may contain at most ${INPUT_LIMITS.csvColumns.toLocaleString()} columns.`,
    );
  }
  const hasHeader = detectHeader(firstCells);
  const headers = hasHeader ? firstCells : firstCells.map((_, index) => `Column ${index + 1}`);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows: Array<Record<string, string>> = [];
  for (const line of dataLines) {
    const cells = splitDelimitedRow(line, delimiter);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] ?? '';
      row[key] = cells[j] ?? '';
    }
    rows.push(row);
  }
  return {
    rows,
    metadata: { delimiter, hasHeader, columns: headers, rowCount: rows.length },
  };
}

function detectDelimiter(lines: string[]): ',' | '\t' {
  const sample = lines.slice(0, 5).join('\n');
  const tabs = (sample.match(/\t/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

function detectHeader(cells: string[]): boolean {
  if (cells.length === 0) return false;
  const normalized = cells.map((cell) => cell.trim().toLowerCase());
  if (
    normalized.some((cell) =>
      [
        'location',
        'state',
        'region',
        'name',
        'lat',
        'latitude',
        'lon',
        'lng',
        'longitude',
      ].includes(cell),
    )
  ) {
    return true;
  }
  const numericCount = cells.filter(
    (cell) => cell.trim() !== '' && !Number.isNaN(Number(cell)),
  ).length;
  return numericCount < 2;
}

function allNumeric(values: string[]): boolean {
  return values.every((v) => v !== '' && !Number.isNaN(Number(v)));
}

function inRange(values: string[], min: number, max: number): boolean {
  return values.every((v) => {
    const n = Number(v);
    return n >= min && n <= max;
  });
}

export function detectLookupCSV(csvText: string, expectedValues?: string[]): LookupDetectResult {
  const { rows, metadata } = parseTable(csvText);
  if (rows.length === 0) throw new Error('Empty or unparseable CSV');

  const headers = Object.keys(rows[0] ?? {});

  const numericCols: string[] = [];
  const stringCols: string[] = [];

  for (const col of headers) {
    const values = rows.map((r) => r[col] ?? '');
    if (allNumeric(values)) {
      numericCols.push(col);
    } else {
      stringCols.push(col);
    }
  }

  const stringCol = pickStringCol(rows, stringCols, expectedValues);
  if (stringCol === null) throw new Error('No string column found in CSV');

  if (numericCols.length === 2) {
    const col0 = numericCols[0] ?? '';
    const col1 = numericCols[1] ?? '';
    const vals0 = rows.map((r) => r[col0] ?? '');
    const vals1 = rows.map((r) => r[col1] ?? '');

    const col0InLatRange = inRange(vals0, -90, 90);
    const col1InLatRange = inRange(vals1, -90, 90);
    const col0InLonRange = inRange(vals0, -180, 180);
    const col1InLonRange = inRange(vals1, -180, 180);

    let latCol: string | null = null;
    let lonCol: string | null = null;

    if (col0InLatRange && col1InLonRange && !col1InLatRange) {
      latCol = col0;
      lonCol = col1;
    } else if (col1InLatRange && col0InLonRange && !col0InLatRange) {
      latCol = col1;
      lonCol = col0;
    } else if (col0InLatRange && col1InLonRange) {
      latCol = col0;
      lonCol = col1;
    }

    if (latCol !== null && lonCol !== null) {
      const mapping = buildMapping(rows, stringCol, latCol, lonCol);
      return { kind: 'auto', mapping, metadata, stringCol, latCol, lonCol, numericCols };
    }
  }

  return { kind: 'ambiguous', stringCol, numericCols, metadata };
}

function pickStringCol(
  rows: Array<Record<string, string>>,
  stringCols: string[],
  expectedValues?: string[],
): string | null {
  if (stringCols.length === 0) return null;
  if (expectedValues === undefined || expectedValues.length === 0) return stringCols[0] ?? null;
  const expected = new Set(expectedValues.map((value) => value.trim().toLowerCase()));
  let bestCol = stringCols[0] ?? null;
  let bestScore = -1;
  for (const col of stringCols) {
    let score = 0;
    for (const row of rows) {
      const value = row[col]?.trim().toLowerCase();
      if (value && expected.has(value)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }
  return bestCol;
}

export function resolveAmbiguousLookup(
  csvText: string,
  stringCol: string,
  latCol: string,
  lonCol: string,
): Map<string, [number, number]> {
  const { rows } = parseTable(csvText);
  return buildMapping(rows, stringCol, latCol, lonCol);
}

function buildMapping(
  rows: Array<Record<string, string>>,
  stringCol: string,
  latCol: string,
  lonCol: string,
): Map<string, [number, number]> {
  const map = new Map<string, [number, number]>();
  for (const row of rows) {
    const key = row[stringCol];
    const lat = Number(row[latCol]);
    const lon = Number(row[lonCol]);
    if (key !== undefined && key !== '' && !Number.isNaN(lat) && !Number.isNaN(lon)) {
      map.set(key, [lat, lon]);
    }
  }
  return map;
}
