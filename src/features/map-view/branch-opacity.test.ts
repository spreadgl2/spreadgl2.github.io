import { describe, expect, it } from 'vitest';
import { branchOpacitySliderToLayerOpacity } from './branch-opacity';

describe('branchOpacitySliderToLayerOpacity', () => {
  it('maps the full slider range onto the former 0-25% opacity range', () => {
    expect(branchOpacitySliderToLayerOpacity(100)).toBeCloseTo(0.25, 5);
    expect(branchOpacitySliderToLayerOpacity(50)).toBeCloseTo(0.125, 5);
    expect(branchOpacitySliderToLayerOpacity(25)).toBeCloseTo(0.0625, 5);
  });

  it('clamps out-of-range slider values', () => {
    expect(branchOpacitySliderToLayerOpacity(-10)).toBe(0);
    expect(branchOpacitySliderToLayerOpacity(150)).toBeCloseTo(0.25, 5);
  });
});
