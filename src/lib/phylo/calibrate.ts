/**
 * Adapted from peartree (MIT), Copyright (c) 2026 Andrew Rambaut.
 * Source: pearcore/peartree/js/phylograph.js:1270-1400 ("anchor calibration"),
 *         pearcore/peartree/js/phylograph.js:1582-1623 ("date conversion")
 * https://github.com/artic-network/peartree
 *
 * Adapted to strict TypeScript. Scope: anchor mode only; no rate or regression path.
 */

import { decimalYearToISO, isoToDecimalYear } from '../format/decimal-year.js';
import type { LayoutNode } from './types.js';

export class TreeCalibration {
  private _anchorDecYear: number | null = null;
  private _anchorH: number | null = null;
  private _active = false;

  get active(): boolean {
    return this._active;
  }

  setAnchor(annotKey: string | null, nodeMap: Map<string, LayoutNode>, maxX: number): boolean {
    if (!annotKey) {
      this._clear();
      return false;
    }

    let anchorDecYear: number | null = null;
    let anchorH: number | null = null;

    for (const node of nodeMap.values()) {
      if (!node.isTip) continue;
      const h = maxX - node.x;
      if (Number.isNaN(h)) continue;
      const raw = node.annotations[annotKey];
      if (raw == null) continue;
      const dec = TreeCalibration.parseDateToDecYear(String(raw));
      if (dec == null) continue;
      if (anchorDecYear === null || dec > anchorDecYear) {
        anchorDecYear = dec;
        anchorH = h;
      }
    }

    if (anchorDecYear === null || anchorH === null) {
      this._clear();
      return false;
    }

    this._anchorDecYear = anchorDecYear;
    this._anchorH = anchorH;
    this._active = true;
    return true;
  }

  heightToDecYear(height: number): number {
    if (this._anchorDecYear === null || this._anchorH === null) return Number.NaN;
    return this._anchorDecYear + (this._anchorH - height);
  }

  decYearToHeight(decYear: number): number {
    if (this._anchorDecYear === null || this._anchorH === null) return Number.NaN;
    return this._anchorH - (decYear - this._anchorDecYear);
  }

  private _clear(): void {
    this._anchorDecYear = null;
    this._anchorH = null;
    this._active = false;
  }

  static parseDateToDecYear(raw: string): number | null {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return isoToDecimalYear(trimmed);
    }
    if (/^\d{4}$/.test(trimmed)) {
      return isoToDecimalYear(`${trimmed}-01-01`);
    }
    if (/^\d{4}\.\d+$/.test(trimmed)) {
      return parseFloat(trimmed);
    }
    return null;
  }

  static decYearToDate(decYear: number): string {
    return decimalYearToISO(decYear);
  }
}
