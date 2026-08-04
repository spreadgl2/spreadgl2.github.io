import { assertTextSize, INPUT_LIMITS, InputLimitError } from '../security/input-limits';

export function splitDelimitedRow(line: string, delimiter: ',' | '\t' = ','): string[] {
  const cells: string[] = [];
  let inQuote = false;
  let cell = '';
  for (const character of line) {
    if (character === '"') {
      inQuote = !inQuote;
    } else if (character === delimiter && !inQuote) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseHeaderedCsvRows(text: string): Array<Record<string, string>> {
  assertTextSize('csv', text);
  const lines = text.trim().split(/\r?\n/);
  if (lines.length - 1 > INPUT_LIMITS.csvRows) {
    throw new InputLimitError(
      `CSV files may contain at most ${INPUT_LIMITS.csvRows.toLocaleString()} data rows.`,
    );
  }
  if (lines.length < 2) return [];
  const headers = splitDelimitedRow(lines[0] ?? '');
  if (headers.length > INPUT_LIMITS.csvColumns) {
    throw new InputLimitError(
      `CSV files may contain at most ${INPUT_LIMITS.csvColumns.toLocaleString()} columns.`,
    );
  }

  const rows: Array<Record<string, string>> = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const cells = splitDelimitedRow(line);
    const row: Record<string, string> = {};
    for (let column = 0; column < headers.length; column += 1) {
      row[headers[column] ?? ''] = cells[column] ?? '';
    }
    rows.push(row);
  }
  return rows;
}
