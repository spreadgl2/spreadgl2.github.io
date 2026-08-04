import type { Feature, FeatureCollection } from 'geojson';
import { describe, expect, it } from 'vitest';
import {
  computePointsBBox,
  featureBBox,
  filterBoundariesByBBox,
  filterBoundariesByPoints,
  padBBox,
  pointInFeature,
} from './boundaries';

describe('computePointsBBox', () => {
  it('returns null on empty input', () => {
    expect(computePointsBBox([])).toBeNull();
  });

  it('returns null when only null-island points are present', () => {
    expect(computePointsBBox([[0, 0]])).toBeNull();
  });

  it('computes the bbox of a point set', () => {
    expect(
      computePointsBBox([
        [-80, 40],
        [-70, 45],
        [-75, 42],
      ]),
    ).toEqual([-80, 40, -70, 45]);
  });

  it('ignores non-finite coordinates', () => {
    expect(
      computePointsBBox([
        [-80, 40],
        [Number.NaN, 50],
        [-70, 45],
      ]),
    ).toEqual([-80, 40, -70, 45]);
  });
});

describe('padBBox', () => {
  it('pads by a fraction of extent when fraction exceeds the absolute min', () => {
    // 100-deg extent × 0.1 = 10 deg, comfortably above the default 2-deg floor.
    expect(padBBox([0, 0, 100, 100], 0.1)).toEqual([-10, -10, 110, 110]);
  });

  it('uses the minimum absolute pad when extent is small', () => {
    // 1-degree extent × 10 % = 0.1 deg, well under minPadDeg=2 → pad by 2.
    expect(padBBox([0, 0, 1, 1], 0.1, 2)).toEqual([-2, -2, 3, 3]);
  });

  it('uses the absolute minimum pad on a single-point bbox', () => {
    expect(padBBox([10, 20, 10, 20], 0.1, 2)).toEqual([8, 18, 12, 22]);
  });
});

describe('featureBBox', () => {
  it('uses the feature.bbox property when present', () => {
    expect(
      featureBBox({
        type: 'Feature',
        bbox: [-5, -5, 5, 5],
        properties: {},
        geometry: { type: 'Point', coordinates: [100, 100] },
      }),
    ).toEqual([-5, -5, 5, 5]);
  });

  it('walks geometry coordinates when feature.bbox is absent', () => {
    expect(
      featureBBox({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-80, 40],
              [-70, 40],
              [-70, 45],
              [-80, 45],
              [-80, 40],
            ],
          ],
        },
      }),
    ).toEqual([-80, 40, -70, 45]);
  });

  it('walks MultiPolygon nested rings', () => {
    expect(
      featureBBox({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'MultiPolygon',
          coordinates: [
            [
              [
                [-80, 40],
                [-70, 45],
              ],
            ],
            [
              [
                [-90, 30],
                [-85, 35],
              ],
            ],
          ],
        },
      }),
    ).toEqual([-90, 30, -70, 45]);
  });
});

function makeCountriesFC(): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        bbox: [-130, 25, -65, 50], // continental US
        properties: { name: 'United States' },
        geometry: { type: 'Point', coordinates: [-95, 39] },
      },
      {
        type: 'Feature',
        bbox: [73, 18, 135, 53], // China
        properties: { name: 'China' },
        geometry: { type: 'Point', coordinates: [104, 35] },
      },
      {
        type: 'Feature',
        bbox: [-74, -34, -34, 5], // Brazil
        properties: { name: 'Brazil' },
        geometry: { type: 'Point', coordinates: [-55, -10] },
      },
    ],
  };
}

describe('filterBoundariesByBBox', () => {
  it('keeps only features whose bbox overlaps the analysis bbox', () => {
    const fc = makeCountriesFC();
    // RABV-shaped bbox over the eastern US
    const filtered = filterBoundariesByBBox(fc, [-85, 35, -70, 45]);
    expect(filtered.features).toHaveLength(1);
    expect(filtered.features[0]?.properties?.name).toBe('United States');
  });

  it('drops every feature when analysis bbox is far away', () => {
    const fc = makeCountriesFC();
    // Pacific ocean — no land
    const filtered = filterBoundariesByBBox(fc, [160, -10, 175, 10]);
    expect(filtered.features).toHaveLength(0);
  });

  it('keeps features whose bbox just touches the analysis bbox', () => {
    const fc = makeCountriesFC();
    // Tangent at the western edge of China
    const filtered = filterBoundariesByBBox(fc, [60, 30, 73, 40]);
    expect(filtered.features.map((f) => f.properties?.name)).toContain('China');
  });

  it('returns a fresh FeatureCollection (doesn’t mutate input)', () => {
    const fc = makeCountriesFC();
    const before = fc.features.length;
    const filtered = filterBoundariesByBBox(fc, [-130, 25, -65, 50]);
    expect(fc.features).toHaveLength(before);
    expect(filtered).not.toBe(fc);
  });
});

// Two simple "country" polygons for the point-in-feature suite. Country A is a
// 10x10 square from (-100,-10) to (-90,0); Country B is a 10x10 square from
// (10,40) to (20,50). They don't overlap.
const POLY_A: Feature = {
  type: 'Feature',
  properties: { name: 'A' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-100, -10],
        [-90, -10],
        [-90, 0],
        [-100, 0],
        [-100, -10],
      ],
    ],
  },
};
const POLY_B: Feature = {
  type: 'Feature',
  properties: { name: 'B' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [10, 40],
        [20, 40],
        [20, 50],
        [10, 50],
        [10, 40],
      ],
    ],
  },
};

describe('pointInFeature', () => {
  it('returns true for a point strictly inside the polygon', () => {
    expect(pointInFeature([-95, -5], POLY_A)).toBe(true);
  });

  it('returns false for a point outside the bbox (early bbox-reject)', () => {
    expect(pointInFeature([50, 50], POLY_A)).toBe(false);
  });

  it('returns false for a point inside the bbox but outside the polygon', () => {
    // A diamond inside a square bbox: bbox covers the corner but the
    // polygon doesn't.
    const diamond: Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, -5],
            [5, 0],
            [0, 5],
            [-5, 0],
            [0, -5],
          ],
        ],
      },
    };
    // (-4, -4) is inside the bbox [-5,-5,5,5] but outside the diamond.
    expect(pointInFeature([-4, -4], diamond)).toBe(false);
  });

  it('handles MultiPolygon by returning true if any subpolygon contains the point', () => {
    const multi: Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          POLY_A.geometry.type === 'Polygon' ? POLY_A.geometry.coordinates : [],
          POLY_B.geometry.type === 'Polygon' ? POLY_B.geometry.coordinates : [],
        ],
      },
    };
    expect(pointInFeature([-95, -5], multi)).toBe(true);
    expect(pointInFeature([15, 45], multi)).toBe(true);
    expect(pointInFeature([0, 0], multi)).toBe(false);
  });

  it('honors interior rings (holes) — point inside a hole is not inside the polygon', () => {
    const donut: Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          // Outer ring: 0..10 square
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
          // Inner hole: 4..6 square
          [
            [4, 4],
            [6, 4],
            [6, 6],
            [4, 6],
            [4, 4],
          ],
        ],
      },
    };
    expect(pointInFeature([2, 2], donut)).toBe(true); // inside outer, outside hole
    expect(pointInFeature([5, 5], donut)).toBe(false); // inside hole
  });

  it('returns false for non-region geometries (Point, LineString, etc.)', () => {
    const linePoint: Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [0, 0] },
    };
    expect(pointInFeature([0, 0], linePoint)).toBe(false);
  });
});

describe('filterBoundariesByPoints', () => {
  const fc: FeatureCollection = { type: 'FeatureCollection', features: [POLY_A, POLY_B] };

  it('keeps only the feature that contains at least one input point', () => {
    const filtered = filterBoundariesByPoints(fc, [[-95, -5]]);
    expect(filtered.features.map((f) => f.properties?.name)).toEqual(['A']);
  });

  it('keeps multiple features when points fall in different ones', () => {
    const filtered = filterBoundariesByPoints(fc, [
      [-95, -5],
      [15, 45],
    ]);
    expect(filtered.features.map((f) => f.properties?.name).sort()).toEqual(['A', 'B']);
  });

  it('returns an empty collection when no point hits any feature', () => {
    const filtered = filterBoundariesByPoints(fc, [[0, 0]]); // gap between A and B
    expect(filtered.features).toHaveLength(0);
  });

  it('ignores null-island and non-finite input points', () => {
    const filtered = filterBoundariesByPoints(fc, [
      [0, 0],
      [Number.NaN, 50],
      [-95, -5],
    ]);
    expect(filtered.features.map((f) => f.properties?.name)).toEqual(['A']);
  });

  it('returns an empty collection when input has only invalid points', () => {
    const filtered = filterBoundariesByPoints(fc, [
      [0, 0],
      [Number.NaN, 50],
    ]);
    expect(filtered.features).toHaveLength(0);
  });

  it('does not mutate the input FeatureCollection', () => {
    const before = fc.features.length;
    filterBoundariesByPoints(fc, [[-95, -5]]);
    expect(fc.features).toHaveLength(before);
  });
});
