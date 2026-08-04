import { parseHeaderedCsvRows } from './delimited';

export interface EnvColumn {
  key: string;
  displayName: string;
  units: string | null;
  values: Map<string, number>;
}

function mostlyNumeric(values: string[]): boolean {
  if (values.length === 0) return false;
  const parseable = values.filter((v) => v !== '' && !Number.isNaN(Number(v)));
  return parseable.length / values.length >= 0.8;
}

const UNIT_SUFFIXES: Record<string, string> = {
  _C: '°C',
  _F: '°F',
  _K: 'K',
  _m: 'm',
  _km: 'km',
  _pct: '%',
  _mm: 'mm',
  _inches: 'in',
};

function parseColumnHeader(key: string): { displayName: string; units: string | null } {
  for (const [suffix, unit] of Object.entries(UNIT_SUFFIXES)) {
    if (key.endsWith(suffix)) {
      const base = key.slice(0, -suffix.length);
      const displayName = toTitleCase(base.replace(/_/g, ' '));
      return { displayName, units: unit };
    }
  }
  const displayName = toTitleCase(key.replace(/_/g, ' '));
  return { displayName, units: null };
}

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface EnvCsvResult {
  locationCol: string;
  numericCols: string[];
  numericColumns: EnvColumn[];
  valueByLocation: (col: string) => Map<string, number>;
}

export function parseEnvCSV(text: string): EnvCsvResult {
  const rows = parseHeaderedCsvRows(text);
  if (rows.length === 0) throw new Error('Empty or unparseable CSV');

  const headers = Object.keys(rows[0] ?? {});
  const numericCols: string[] = [];
  let locationCol: string | null = null;

  for (const col of headers) {
    const values = rows.map((r) => r[col] ?? '');
    if (mostlyNumeric(values)) {
      numericCols.push(col);
    } else if (locationCol === null) {
      locationCol = col;
    }
  }

  if (locationCol === null) throw new Error('No string column found in CSV');
  if (numericCols.length === 0) throw new Error('No numeric columns found in CSV');

  const locCol = locationCol;

  const valueByLocation = (col: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const key = row[locCol];
      const val = Number(row[col] ?? '');
      if (key !== undefined && key !== '' && !Number.isNaN(val)) {
        map.set(key, val);
      }
    }
    return map;
  };

  const numericColumns: EnvColumn[] = numericCols.map((col) => {
    const { displayName, units } = parseColumnHeader(col);
    return { key: col, displayName, units, values: valueByLocation(col) };
  });

  return {
    locationCol: locCol,
    numericCols,
    numericColumns,
    valueByLocation,
  };
}
