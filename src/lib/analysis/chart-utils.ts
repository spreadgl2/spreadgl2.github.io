import { DateTime } from 'luxon';
import { decimalYearToISO, isoToDecimalYear } from '../format/decimal-year';

export const DEFAULT_PLOT_WIDTH = 800;
export const DEFAULT_PLOT_HEIGHT = 140;
export const MIN_PLOT_HEIGHT = 96;
export const PAD_LEFT = 0;
export const PAD_RIGHT = 0;
export const PAD_TOP = 12;
export const PAD_BOTTOM = 24;

export interface PlotDims {
  width: number;
  height: number;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function xFor(time: number, min: number, max: number, dims: PlotDims): number {
  if (max <= min) return PAD_LEFT;
  return PAD_LEFT + clamp01((time - min) / (max - min)) * (dims.width - PAD_LEFT - PAD_RIGHT);
}

export function yFor(count: number, maxCount: number, dims: PlotDims): number {
  const plotHeight = dims.height - PAD_TOP - PAD_BOTTOM;
  if (maxCount <= 0) return PAD_TOP + plotHeight;
  return PAD_TOP + plotHeight - (count / maxCount) * plotHeight;
}

export function yForRange(value: number, min: number, max: number, dims: PlotDims): number {
  const plotHeight = dims.height - PAD_TOP - PAD_BOTTOM;
  if (max <= min) return PAD_TOP + plotHeight;
  return PAD_TOP + plotHeight - ((value - min) / (max - min)) * plotHeight;
}

function toMonthStart(time: number): DateTime | null {
  const date = DateTime.fromISO(decimalYearToISO(time));
  return date.isValid ? date.startOf('month') : null;
}

function monthTickLabel(time: number): string {
  const date = DateTime.fromISO(decimalYearToISO(time));
  return date.isValid ? date.toFormat('yyyy-MM') : time.toFixed(2);
}

function niceMonthStep(rawStep: number): number {
  const options = [1, 2, 3, 6, 12, 24, 36, 60, 120, 240, 600];
  return options.find((step) => step >= rawStep) ?? Math.ceil(rawStep / 12) * 12;
}

export function monthTicks(
  min: number,
  max: number,
  width: number,
): Array<{ time: number; label: string }> {
  if (max <= min) return [{ time: min, label: monthTickLabel(min) }];

  const start = toMonthStart(min);
  const end = toMonthStart(max);
  if (!start || !end) {
    return [
      { time: min, label: monthTickLabel(min) },
      { time: max, label: monthTickLabel(max) },
    ];
  }

  const targetCount = Math.max(2, Math.floor(width / 150));
  const totalMonths = Math.max(1, Math.ceil(end.diff(start, 'months').months));
  const stepMonths = niceMonthStep(Math.ceil(totalMonths / Math.max(1, targetCount - 1)));
  const result: Array<{ time: number; label: string }> = [];
  let cursor = start;

  for (let guard = 0; cursor <= end && guard < 100; guard++) {
    const iso = cursor.toISODate();
    if (iso) {
      const time = isoToDecimalYear(iso);
      if (time >= min - 1e-6 && time <= max + 1e-6) {
        result.push({ time, label: cursor.toFormat('yyyy-MM') });
      }
    }
    cursor = cursor.plus({ months: stepMonths });
  }

  if (result.length === 0) {
    return [
      { time: min, label: monthTickLabel(min) },
      { time: max, label: monthTickLabel(max) },
    ];
  }
  return result;
}

function niceIntegerStep(maxCount: number, targetCount: number): number {
  const raw = Math.max(1, Math.ceil(maxCount / Math.max(1, targetCount - 1)));
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [1, 2, 5, 10]) {
    const step = factor * magnitude;
    if (step >= raw) return step;
  }
  return 10 * magnitude;
}

export function integerTicks(maxCount: number, targetCount: number): number[] {
  const step = niceIntegerStep(maxCount, targetCount);
  const axisMax = Math.max(step, Math.ceil(maxCount / step) * step);
  const result: number[] = [];
  for (let tick = 0; tick <= axisMax; tick += step) {
    result.push(tick);
  }
  return result;
}

export function formatCount(count: number): string {
  if (Math.abs(count - Math.round(count)) < 1e-4) return String(Math.round(count));
  return count.toFixed(2);
}
