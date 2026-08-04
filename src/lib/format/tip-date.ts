import { isoToDecimalYear } from './decimal-year';

export interface TipDateResult {
  decimalYear: number;
  confidence: 'high' | 'medium' | 'low';
  pattern:
    | 'iso-pipe'
    | 'day-month-year'
    | 'year-pipe'
    | 'decimal-underscore'
    | 'decimal-year-underscore'
    | 'year-month-slash'
    | 'year-only'
    | 'ambiguous';
  raw: string;
}

const ISO_PIPE_RE = /\|(\d{4}-\d{2}-\d{2})(?:[|_].*)?$/;
// Day-first full date, e.g. name|22-04-2017. Delimiter-bounded so it is not
// confused with ISO (year-first) dates or with a bare numeric field.
const DAY_MONTH_YEAR_RE = /(?:^|[|_/])(\d{2})-(\d{2})-(\d{4})(?:[|_/].*)?$/;
const YEAR_PIPE_RE = /\|(\d{4})(?:[|_].*)?$/;
const DECIMAL_UNDERSCORE_RE = /_(\d{2})\.(\d+)$/;
const DECIMAL_UNDERSCORE_MID_RE = /_(\d{2})\.(\d)(?=_[0-9]|$)/;
const DECIMAL_YEAR_UNDERSCORE_RE = /_(\d{4}\.\d+)$/;
// Slash-delimited year-month, e.g. accession/2002-8/Hubei → 2002-8. Common in
// BEAST X taxon labels of the form <id>/<YYYY-M>/<location>.
const YEAR_MONTH_SLASH_RE = /\/(\d{4})-(\d{1,2})(?=\/|$)/;

function resolveYear(twoDigit: number, centuryPivot: number): number {
  return twoDigit <= centuryPivot ? 2000 + twoDigit : 1900 + twoDigit;
}

const DEFAULT_CENTURY_PIVOT = 30;

export function extractTipDate(
  label: string,
  opts?: { centuryPivot?: number; patternHint?: TipDateResult['pattern'] },
): TipDateResult | null {
  const pivot = opts?.centuryPivot ?? DEFAULT_CENTURY_PIVOT;
  const hint = opts?.patternHint;

  if (hint === undefined || hint === 'iso-pipe') {
    const isoMatch = ISO_PIPE_RE.exec(label);
    if (isoMatch?.[1]) {
      const raw = isoMatch[1];
      return {
        decimalYear: isoToDecimalYear(raw),
        confidence: 'high',
        pattern: 'iso-pipe',
        raw,
      };
    }
  }

  // Full calendar dates are tried before year-only / partial formats so a
  // complete date (e.g. 22-04-2017) always wins over a bare year field (|4480|).
  if (hint === undefined || hint === 'day-month-year') {
    const dmyMatch = DAY_MONTH_YEAR_RE.exec(label);
    if (dmyMatch?.[1] && dmyMatch[2] && dmyMatch[3]) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        // Preserve the label substring as raw; compute the year from ISO order.
        const raw = `${dmyMatch[1]}-${dmyMatch[2]}-${dmyMatch[3]}`;
        const iso = `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
        return {
          decimalYear: isoToDecimalYear(iso),
          confidence: 'high',
          pattern: 'day-month-year',
          raw,
        };
      }
    }
  }

  if (hint === undefined || hint === 'year-month-slash') {
    const ymMatch = YEAR_MONTH_SLASH_RE.exec(label);
    if (ymMatch?.[1] && ymMatch[2]) {
      const month = parseInt(ymMatch[2], 10);
      if (month >= 1 && month <= 12) {
        const year = ymMatch[1];
        const mm = String(month).padStart(2, '0');
        const raw = `${year}-${mm}`;
        return {
          // Month precision → place the tip at mid-month (day 15).
          decimalYear: isoToDecimalYear(`${raw}-15`),
          confidence: 'high',
          pattern: 'year-month-slash',
          raw,
        };
      }
    }
  }

  if (hint === undefined || hint === 'decimal-underscore') {
    const midMatch = DECIMAL_UNDERSCORE_MID_RE.exec(label);
    if (midMatch?.[1] && midMatch[2]) {
      const twoDigit = parseInt(midMatch[1], 10);
      const fraction = parseFloat(`0.${midMatch[2]}`);
      const fullYear = resolveYear(twoDigit, pivot);
      const raw = `_${midMatch[1]}.${midMatch[2]}`;
      return {
        decimalYear: fullYear + fraction,
        confidence: 'high',
        pattern: 'decimal-underscore',
        raw,
      };
    }

    const decMatch = DECIMAL_UNDERSCORE_RE.exec(label);
    if (decMatch?.[1] && decMatch[2]) {
      const twoDigit = parseInt(decMatch[1], 10);
      const fraction = parseFloat(`0.${decMatch[2]}`);
      const fullYear = resolveYear(twoDigit, pivot);
      const raw = `_${decMatch[1]}.${decMatch[2]}`;
      return {
        decimalYear: fullYear + fraction,
        confidence: 'high',
        pattern: 'decimal-underscore',
        raw,
      };
    }
  }

  if (hint === undefined || hint === 'decimal-year-underscore') {
    const decYearMatch = DECIMAL_YEAR_UNDERSCORE_RE.exec(label);
    if (decYearMatch?.[1]) {
      const decimalYear = Number(decYearMatch[1]);
      if (Number.isFinite(decimalYear)) {
        return {
          decimalYear,
          confidence: 'medium',
          pattern: 'decimal-year-underscore',
          raw: `_${decYearMatch[1]}`,
        };
      }
    }
  }

  // Year-only is the least specific label format — tried last so it never wins
  // over a full or decimal date elsewhere in the label.
  if (hint === undefined || hint === 'year-pipe') {
    const yearMatch = YEAR_PIPE_RE.exec(label);
    if (yearMatch?.[1]) {
      const raw = yearMatch[1];
      return {
        decimalYear: parseInt(raw, 10),
        confidence: hint !== undefined ? 'high' : 'medium',
        pattern: 'year-pipe',
        raw,
      };
    }
  }

  return null;
}
