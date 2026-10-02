import type { FeatureCollection, Geometry } from 'geojson';
import { describe, expect, it } from 'vitest';
import { detectAxisOrder, isValidAxisOrder, summarizeAxes, toLonLatOrder } from './geojson-axis';

function collection(...geometries: Geometry[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: geometries.map((geometry) => ({ type: 'Feature', properties: {}, geometry })),
  };
}

// Beijing-ish polygon written latitude-first: longitudes (> 90) sit in position 2.
const latFirstPolygon: Geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [39.9, 116.4],
      [40.1, 116.4],
      [40.1, 116.6],
      [39.9, 116.4],
    ],
  ],
};

describe('summarizeAxes', () => {
  it('collects samples and per-axis ranges across nested geometries', () => {
    const summary = summarizeAxes(
      collection(latFirstPolygon, {
        type: 'GeometryCollection',
        geometries: [{ type: 'Point', coordinates: [41, 117, 5] }],
      }),
    );
    expect(summary.positionCount).toBe(5);
    expect(summary.samples).toEqual([
      [39.9, 116.4],
      [40.1, 116.4],
      [40.1, 116.6],
    ]);
    expect(summary.ranges).toEqual([
      [39.9, 41],
      [116.4, 117],
    ]);
  });

  it('returns null ranges for a collection without positions', () => {
    const summary = summarizeAxes(
      collection({ type: 'GeometryCollection', geometries: [] }, null as unknown as Geometry),
    );
    expect(summary).toEqual({ positionCount: 0, samples: [], ranges: null });
  });
});

describe('detectAxisOrder', () => {
  it('detects latitude-first data when the second axis exceeds ±90', () => {
    expect(detectAxisOrder(summarizeAxes(collection(latFirstPolygon)))).toBe('lat-lon');
  });

  it('defaults to the GeoJSON longitude-first order when both readings are plausible', () => {
    const ambiguous = collection({ type: 'Point', coordinates: [10, 20] });
    expect(detectAxisOrder(summarizeAxes(ambiguous))).toBe('lon-lat');
  });

  it('keeps longitude-first data longitude-first', () => {
    const lonFirst = collection({ type: 'Point', coordinates: [116.4, 39.9] });
    expect(detectAxisOrder(summarizeAxes(lonFirst))).toBe('lon-lat');
  });
});

describe('isValidAxisOrder', () => {
  it('rejects orders that put out-of-range values on the latitude axis', () => {
    const summary = summarizeAxes(collection(latFirstPolygon));
    expect(isValidAxisOrder(summary, 'lat-lon')).toBe(true);
    expect(isValidAxisOrder(summary, 'lon-lat')).toBe(false);
  });

  it('rejects longitudes outside ±180', () => {
    const summary = summarizeAxes(collection({ type: 'Point', coordinates: [200, 10] }));
    expect(isValidAxisOrder(summary, 'lon-lat')).toBe(false);
  });
});

describe('toLonLatOrder', () => {
  it('returns longitude-first data unchanged', () => {
    const data = collection(latFirstPolygon);
    expect(toLonLatOrder(data, 'lon-lat')).toBe(data);
  });

  it('swaps the first two numbers of every position, keeping extra dimensions', () => {
    const data = collection(latFirstPolygon, {
      type: 'GeometryCollection',
      geometries: [{ type: 'MultiPoint', coordinates: [[41, 117, 5]] }],
    });
    const swapped = toLonLatOrder(data, 'lat-lon');
    expect(swapped.features[0]?.geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [116.4, 39.9],
          [116.4, 40.1],
          [116.6, 40.1],
          [116.4, 39.9],
        ],
      ],
    });
    expect(swapped.features[1]?.geometry).toEqual({
      type: 'GeometryCollection',
      geometries: [{ type: 'MultiPoint', coordinates: [[117, 41, 5]] }],
    });
  });

  it('does not mutate the input and drops stale bounding boxes', () => {
    const data: FeatureCollection = {
      ...collection({ type: 'Point', coordinates: [39.9, 116.4] }),
      bbox: [39.9, 116.4, 39.9, 116.4],
    };
    const swapped = toLonLatOrder(data, 'lat-lon');
    expect(data.features[0]?.geometry).toEqual({ type: 'Point', coordinates: [39.9, 116.4] });
    expect(swapped.bbox).toBeUndefined();
  });
});
