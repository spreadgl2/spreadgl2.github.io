import { describe, expect, it } from 'vitest';
import {
  assertInputSize,
  assertRasterDimensions,
  INPUT_LIMITS,
  InputLimitError,
  inputKindForFileName,
} from './input-limits';

describe('input limits', () => {
  it('classifies supported primary inputs without accepting generic JSON', () => {
    expect(inputKindForFileName('analysis.NEXUS')).toBe('tree');
    expect(inputKindForFileName('analysis.spreadgl2.json')).toBe('project');
    expect(inputKindForFileName('analysis.json')).toBeNull();
  });

  it('rejects files above their class-specific byte budget', () => {
    expect(() => assertInputSize('tree', INPUT_LIMITS.treeBytes)).not.toThrow();
    expect(() => assertInputSize('tree', INPUT_LIMITS.treeBytes + 1)).toThrow(InputLimitError);
  });

  it('rejects invalid and over-budget raster dimensions before allocation', () => {
    expect(assertRasterDimensions(4096, 4096)).toBe(INPUT_LIMITS.rasterPixels);
    expect(() => assertRasterDimensions(4097, 4096)).toThrow(InputLimitError);
    expect(() => assertRasterDimensions(2.5, 2)).toThrow(InputLimitError);
  });
});
