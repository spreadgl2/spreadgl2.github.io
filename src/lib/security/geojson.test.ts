import { describe, expect, it } from 'vitest';
import { parseFeatureCollection, validateFeatureCollection } from './geojson';
import { INPUT_LIMITS, InputLimitError } from './input-limits';

describe('GeoJSON security validation', () => {
  it('accepts a bounded FeatureCollection', () => {
    const result = parseFeatureCollection(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'A' },
            geometry: { type: 'Point', coordinates: [1, 2] },
          },
        ],
      }),
    );
    expect(result.features).toHaveLength(1);
  });

  it('rejects non-FeatureCollection JSON and malformed coordinates', () => {
    expect(() => validateFeatureCollection({ type: 'Point', coordinates: [1, 2] })).toThrow(
      InputLimitError,
    );
    expect(() =>
      validateFeatureCollection({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: ['x', 2] } },
        ],
      }),
    ).toThrow(InputLimitError);
  });

  it('rejects over-budget feature collections before rendering', () => {
    const feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [1, 2] },
    };
    expect(() =>
      validateFeatureCollection({
        type: 'FeatureCollection',
        features: Array.from({ length: INPUT_LIMITS.geojsonFeatures + 1 }, () => feature),
      }),
    ).toThrow(InputLimitError);
  });
});
