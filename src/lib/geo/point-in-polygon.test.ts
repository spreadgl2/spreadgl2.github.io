import { describe, expect, it } from 'vitest';
import type { LonLat } from './point-in-polygon';
import { pointInPolygon } from './point-in-polygon';

const square: LonLat[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

const triangle: LonLat[] = [
  [0, 0],
  [10, 0],
  [5, 10],
];

// U-shape opening upward: solid bottom strip (y=0..4, x=0..10) plus two arms
// rising up: left arm (x=0..4, y=4..10) and right arm (x=6..10, y=4..10).
// The notch (x=4..6, y=4..10) is OUTSIDE the polygon.
const concave: LonLat[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [6, 10],
  [6, 4],
  [4, 4],
  [4, 10],
  [0, 10],
];

describe('pointInPolygon', () => {
  it('returns true for a point clearly inside a square', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
  });

  it('returns false for a point clearly outside a square', () => {
    expect(pointInPolygon([15, 5], square)).toBe(false);
    expect(pointInPolygon([-1, 5], square)).toBe(false);
    expect(pointInPolygon([5, 15], square)).toBe(false);
    expect(pointInPolygon([5, -1], square)).toBe(false);
  });

  it('returns true for a point inside a triangle', () => {
    expect(pointInPolygon([5, 5], triangle)).toBe(true);
  });

  it('returns false for a point outside a triangle', () => {
    expect(pointInPolygon([1, 9], triangle)).toBe(false);
    expect(pointInPolygon([9, 9], triangle)).toBe(false);
  });

  it('handles concave polygons: point inside the notch is outside', () => {
    expect(pointInPolygon([5, 6], concave)).toBe(false);
  });

  it('handles concave polygons: point in a solid arm is inside', () => {
    expect(pointInPolygon([2, 2], concave)).toBe(true);
    expect(pointInPolygon([8, 2], concave)).toBe(true);
  });

  it('returns false for degenerate polygon with fewer than 3 vertices', () => {
    expect(
      pointInPolygon([0, 0], [
        [0, 0],
        [1, 1],
      ] as LonLat[]),
    ).toBe(false);
    expect(pointInPolygon([0, 0], [] as LonLat[])).toBe(false);
  });

  it('handles negative coordinates', () => {
    const negSquare: LonLat[] = [
      [-10, -10],
      [0, -10],
      [0, 0],
      [-10, 0],
    ];
    expect(pointInPolygon([-5, -5], negSquare)).toBe(true);
    expect(pointInPolygon([5, 5], negSquare)).toBe(false);
  });

  it('handles real geographic coordinates', () => {
    const africa: LonLat[] = [
      [-20, -35],
      [55, -35],
      [55, 38],
      [-20, 38],
    ];
    expect(pointInPolygon([20, 0], africa)).toBe(true);
    expect(pointInPolygon([100, 0], africa)).toBe(false);
  });
});
