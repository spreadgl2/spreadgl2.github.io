import type { FeatureCollection } from 'geojson';
import { describe, expect, it } from 'vitest';
import { choroplethColorScale, joinChoropleth } from './choropleth-join';

const GEOJSON: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      properties: { name: 'Africa' },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 2],
          ],
        ],
      },
      properties: { name: 'Asia' },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [4, 4],
            [5, 4],
            [5, 5],
            [4, 4],
          ],
        ],
      },
      properties: { name: 'Oceania' },
    },
  ],
};

describe('joinChoropleth', () => {
  it('matches features by string property value', () => {
    const values = new Map([
      ['Africa', 28.5],
      ['Asia', 22.1],
    ]);
    const result = joinChoropleth(GEOJSON, values);
    expect(result).toHaveLength(2);
    const africa = result.find((r) => r.location === 'Africa');
    expect(africa).toBeDefined();
    expect(africa?.value).toBeCloseTo(28.5);
  });

  it('skips features with no matching location', () => {
    const values = new Map([['Africa', 10]]);
    const result = joinChoropleth(GEOJSON, values);
    expect(result).toHaveLength(1);
    expect(result[0]?.location).toBe('Africa');
  });

  it('returns empty array when no matches', () => {
    const values = new Map([['Unknown', 5]]);
    const result = joinChoropleth(GEOJSON, values);
    expect(result).toHaveLength(0);
  });

  it('matches case-insensitively', () => {
    const values = new Map([['africa', 15]]);
    const result = joinChoropleth(GEOJSON, values);
    expect(result).toHaveLength(1);
  });
});

describe('choroplethColorScale', () => {
  it('returns a 4-tuple RGBA', () => {
    const color = choroplethColorScale(0, 0, 100, 1);
    expect(color).toHaveLength(4);
    expect(color[3]).toBeGreaterThan(0);
  });

  it('low value is light, high value is dark', () => {
    const low = choroplethColorScale(0, 0, 100, 1);
    const high = choroplethColorScale(100, 0, 100, 1);
    expect(low[0]).toBeGreaterThan(high[0]);
  });

  it('clamps values outside range', () => {
    const below = choroplethColorScale(-10, 0, 100, 1);
    const above = choroplethColorScale(110, 0, 100, 1);
    const min = choroplethColorScale(0, 0, 100, 1);
    const max = choroplethColorScale(100, 0, 100, 1);
    expect(below).toEqual(min);
    expect(above).toEqual(max);
  });
});
