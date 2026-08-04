import { DateTime } from 'luxon';

const DAYS_PER_YEAR = 365.25;

export function decimalYearToISO(year: number): string {
  const wholeYear = Math.floor(year);
  const fraction = year - wholeYear;
  const start = DateTime.fromObject({ year: wholeYear, month: 1, day: 1 });
  const dayOffset = Math.floor(fraction * DAYS_PER_YEAR);
  return start.plus({ days: dayOffset }).toISODate()!;
}

export function isoToDecimalYear(iso: string): number {
  const date = DateTime.fromISO(iso);
  const year = date.year;
  const start = DateTime.fromObject({ year, month: 1, day: 1 });
  const dayOfYear = date.diff(start, 'days').days;
  return year + dayOfYear / DAYS_PER_YEAR;
}
