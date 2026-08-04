import { describe, expect, it } from 'vitest';
import { extractTipDate } from './tip-date';

describe('extractTipDate — day-first dates', () => {
  it('extracts DD-MM-YYYY after a pipe: name|22-04-2017 → 2017-04-22', () => {
    const result = extractTipDate('name|22-04-2017');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('day-month-year');
    expect(result!.confidence).toBe('high');
    expect(result!.raw).toBe('22-04-2017');
    expect(result!.decimalYear).toBeCloseTo(2017.305, 2); // 2017-04-22
  });

  it('prioritizes the full DD-MM-YYYY over an earlier bare year field', () => {
    // The |4480| field must NOT win over the trailing full date.
    const result = extractTipDate('FioRJ|4480|Human|RioJaneiro_CasimirodeAbreu|22-04-2017');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('day-month-year');
    expect(result!.raw).toBe('22-04-2017');
    expect(Math.trunc(result!.decimalYear)).toBe(2017);
  });

  it('does not treat an invalid day/month as a day-first date', () => {
    // 04-22-2017 (month 22) is not a valid DD-MM-YYYY → falls through.
    const result = extractTipDate('name|04-22-2017');
    expect(result?.pattern).not.toBe('day-month-year');
  });

  it('still parses ISO (year-first) dates as iso-pipe, not day-first', () => {
    const result = extractTipDate('name|2017-04-22');
    expect(result?.pattern).toBe('iso-pipe');
  });
});

describe('extractTipDate', () => {
  it('extracts RABV decimal-underscore: Bat_NY_03.4 → ≈2003.4 high confidence', () => {
    const result = extractTipDate('Bat_NY_03.4');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('decimal-underscore');
    expect(result!.confidence).toBe('high');
    expect(result!.decimalYear).toBeCloseTo(2003.4, 5);
  });

  it('extracts full decimal-year underscore: TX5275_2002.5 → 2002.5 medium confidence', () => {
    const result = extractTipDate('TX5275_2002.5');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('decimal-year-underscore');
    expect(result!.confidence).toBe('medium');
    expect(result!.decimalYear).toBeCloseTo(2002.5, 5);
    expect(result!.raw).toBe('_2002.5');
  });

  it('extracts ISO pipe-tail: TipA|2020-06-13 → high confidence', () => {
    const result = extractTipDate('TipA|2020-06-13');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('iso-pipe');
    expect(result!.confidence).toBe('high');
    expect(result!.decimalYear).toBeGreaterThan(2020.0);
    expect(result!.decimalYear).toBeLessThan(2021.0);
    expect(result!.raw).toBe('2020-06-13');
  });

  it('extracts year-only pipe: Sample|2019 → 2019.0 medium confidence', () => {
    const result = extractTipDate('Sample|2019');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('year-pipe');
    expect(result!.confidence).toBe('medium');
    expect(result!.decimalYear).toBe(2019);
  });

  it('returns null for ambiguous label: host_42_X', () => {
    const result = extractTipDate('host_42_X');
    expect(result).toBeNull();
  });

  it('century pivot default (30): _03.4 → 2003', () => {
    const result = extractTipDate('Sample_03.4');
    expect(result!.decimalYear).toBeCloseTo(2003.4, 5);
  });

  it('century pivot override (1990 → pivot 90): _03.4 → 1903', () => {
    const result = extractTipDate('Sample_03.4', { centuryPivot: 0 });
    expect(result!.decimalYear).toBeCloseTo(1903.4, 5);
  });

  it('century pivot: _95.5 with default pivot → 1995.5', () => {
    const result = extractTipDate('Sample_95.5');
    expect(result!.decimalYear).toBeCloseTo(1995.5, 5);
  });

  it('raw field contains the matched suffix', () => {
    const result = extractTipDate('Bat_NY_03.4');
    expect(result!.raw).toBe('_03.4');
  });

  it('extracts slash-delimited year-month: HQ233605/2002-8/Hubei → mid-Aug 2002', () => {
    const result = extractTipDate('HQ233605/2002-8/Hubei');
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('year-month-slash');
    expect(result!.confidence).toBe('high');
    expect(result!.raw).toBe('2002-08');
    // 2002-08-15 ≈ 2002.62
    expect(result!.decimalYear).toBeCloseTo(2002.62, 1);
  });

  it('slash year-month with two-digit month: id/2014-11/Guangdong', () => {
    const result = extractTipDate('11SH1-GD_Guangdong_2010_China/2014-11/Guangdong');
    expect(result!.pattern).toBe('year-month-slash');
    expect(result!.raw).toBe('2014-11');
  });

  it('rejects an out-of-range month in the slash pattern', () => {
    expect(extractTipDate('id/2002-13/Loc')).toBeNull();
  });
});
