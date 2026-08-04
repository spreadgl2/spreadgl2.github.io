import type { Layout, PhyloGraph } from '../phylo/types';
import { isoToDecimalYear } from './decimal-year';
import { parseHeaderedCsvRows } from './delimited';
import { extractTipDate, type TipDateResult } from './tip-date';

export type TipDateFormat =
  | TipDateResult['pattern']
  | 'iso-date'
  | 'year-month'
  | 'year-only'
  | 'decimal-year'
  | 'unknown';

export type TipDateSource = 'annotation' | 'parsed' | 'tree-height' | 'manual' | 'csv' | 'missing';

// Human-readable form of a tip-date format, shared by the Dates panel and the
// import settings MRSD provenance display.
export function tipDateFormatLabel(format: TipDateFormat): string {
  switch (format) {
    case 'iso-pipe':
    case 'iso-date':
      return 'YYYY-MM-DD';
    case 'day-month-year':
      return 'DD-MM-YYYY';
    case 'year-pipe':
    case 'year-only':
      return 'YYYY';
    case 'year-month-slash':
    case 'year-month':
      return 'YYYY-MM';
    case 'decimal-underscore':
    case 'decimal-year-underscore':
    case 'decimal-year':
      return 'decimal year';
    case 'ambiguous':
      return 'ambiguous';
    default:
      return 'unknown';
  }
}

export interface TipDateRow {
  nodeId: string;
  taxon: string;
  parsedSubstring: string;
  decimalYear: number | null;
  format: TipDateFormat;
  source: TipDateSource;
}

export interface ParsedTipDateInput {
  raw: string;
  decimalYear: number;
  format: TipDateFormat;
}

interface BuildTipDateRowInput {
  nodeId: string;
  label: string;
  annotatedDate: unknown;
  patternHint?: TipDateResult['pattern'];
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_-]/g, '');
}

function findHeader(headers: string[], candidates: string[]): string | null {
  const wanted = new Set(candidates.map(normalizeHeader));
  return headers.find((header) => wanted.has(normalizeHeader(header))) ?? null;
}

export function parseEditableTipDate(value: string): ParsedTipDateInput | null {
  const raw = value.trim();
  if (raw === '') return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const decimalYear = isoToDecimalYear(raw);
    if (Number.isFinite(decimalYear)) return { raw, decimalYear, format: 'iso-date' };
    return null;
  }

  const yearMonth = raw.match(/^(\d{4})-(\d{1,2})$/);
  if (yearMonth?.[1] && yearMonth[2]) {
    const month = Number(yearMonth[2]);
    if (month >= 1 && month <= 12) {
      const decimalYear = isoToDecimalYear(`${yearMonth[1]}-${String(month).padStart(2, '0')}-15`);
      if (!Number.isFinite(decimalYear)) return null;
      return {
        raw,
        decimalYear,
        format: 'year-month',
      };
    }
  }

  if (/^\d{4}$/.test(raw)) {
    return { raw, decimalYear: Number(raw), format: 'year-only' };
  }

  if (/^\d{4}\.\d+$/.test(raw)) {
    const decimalYear = Number(raw);
    if (Number.isFinite(decimalYear)) return { raw, decimalYear, format: 'decimal-year' };
  }

  return null;
}

export function parseTipDateCSV(csvText: string): Map<string, ParsedTipDateInput> {
  const rows = parseHeaderedCsvRows(csvText);
  if (rows.length === 0) throw new Error('Empty or unparseable CSV');

  const headers = Object.keys(rows[0] ?? {});
  const taxonCol = findHeader(headers, ['taxon', 'name', 'label', 'tip', 'id']);
  const dateCol = findHeader(headers, ['date', 'tipDate', 'tip_date', 'decimalYear', 'year']);
  if (!taxonCol) throw new Error('CSV needs a taxon/name column');
  if (!dateCol) throw new Error('CSV needs a date column');

  const result = new Map<string, ParsedTipDateInput>();
  let invalid = 0;
  for (const row of rows) {
    const taxon = row[taxonCol]?.trim();
    if (!taxon) continue;
    const parsed = parseEditableTipDate(row[dateCol] ?? '');
    if (!parsed) {
      invalid += 1;
      continue;
    }
    result.set(taxon, parsed);
  }

  if (result.size === 0) {
    throw new Error(invalid > 0 ? 'No valid dates found in CSV' : 'No taxon/date rows found');
  }
  return result;
}

function parseLabelTipDate(
  label: string,
  patternHint?: TipDateResult['pattern'],
): ParsedTipDateInput | null {
  const extracted =
    patternHint !== undefined ? extractTipDate(label, { patternHint }) : extractTipDate(label);
  if (extracted !== null) {
    return {
      raw: extracted.raw,
      decimalYear: extracted.decimalYear,
      format: extracted.pattern,
    };
  }

  const lastPipePart = label.includes('|') ? label.split('|').at(-1)?.trim() : undefined;
  return lastPipePart ? parseEditableTipDate(lastPipePart) : null;
}

export function buildTipDateRowFromInput({
  nodeId,
  label,
  annotatedDate,
  patternHint,
}: BuildTipDateRowInput): TipDateRow {
  const labelDate = parseLabelTipDate(label, patternHint);
  const annotationRaw = annotatedDate == null ? null : String(annotatedDate);
  if (labelDate !== null && (annotationRaw === null || annotationRaw.trim() === labelDate.raw)) {
    return {
      nodeId,
      taxon: label,
      parsedSubstring: labelDate.raw,
      decimalYear: labelDate.decimalYear,
      format: labelDate.format,
      source: 'parsed',
    };
  }

  if (annotationRaw !== null) {
    const parsed = parseEditableTipDate(annotationRaw);
    return {
      nodeId,
      taxon: label,
      parsedSubstring: annotationRaw,
      decimalYear: parsed?.decimalYear ?? null,
      format: parsed?.format ?? 'unknown',
      source: 'annotation',
    };
  }

  return {
    nodeId,
    taxon: label,
    parsedSubstring: '',
    decimalYear: null,
    format: 'unknown',
    source: 'missing',
  };
}

export function deriveTipDateRowsFromGraph(graph: PhyloGraph, layout: Layout): TipDateRow[] {
  const rows: TipDateRow[] = [];
  for (const node of graph.nodes) {
    const layoutNode = layout.nodeMap.get(node.origId);
    if (!layoutNode?.isTip) continue;

    const label = node.name ?? node.origId ?? '';
    rows.push(
      buildTipDateRowFromInput({
        nodeId: node.origId,
        label,
        annotatedDate: node.annotations.date,
      }),
    );
  }
  return rows;
}
