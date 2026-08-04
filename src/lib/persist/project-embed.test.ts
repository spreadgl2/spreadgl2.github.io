import type { FeatureCollection } from 'geojson';
import { describe, expect, it } from 'vitest';
import type { ChoroplethOverlay, CustomOverlay } from '../../store/tree';
import type { EnvColumn } from '../format/env-csv';
import type { RasterData } from '../geotiff/loader';
import type { LogTable } from '../log/log-table';
import { gzipText } from './gzip';
import { applyEmbeddedData, type BuildEmbeddedInput, buildEmbeddedData } from './project-embed';

// Base input with nothing to embed; each test overrides the pieces it cares about.
const EMPTY: BuildEmbeddedInput = {
  geoLookup: null,
  geoSource: 'csv',
  logTable: null,
  logFileName: null,
  customOverlays: [],
  choroplethOverlays: [],
  envColumns: [],
  raster: null,
};

const FC = (id: string): FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: id },
      geometry: { type: 'Point', coordinates: [1, 2] },
    },
  ],
});

describe('project-embed roundtrip', () => {
  it('roundtrips the coordinate lookup', async () => {
    const lookup = new Map<string, [number, number]>([
      ['Beijing', [39.9, 116.4]],
      ['Shanghai', [31.2, 121.5]],
    ]);
    const embedded = await buildEmbeddedData({ ...EMPTY, geoLookup: lookup });
    expect(embedded?.geo).toBeDefined();

    const applied = await applyEmbeddedData(embedded as NonNullable<typeof embedded>);
    expect(applied.geo?.source).toBe('csv');
    expect(applied.geo?.lookup.get('Beijing')).toEqual([39.9, 116.4]);
    expect(applied.geo?.lookup.get('Shanghai')).toEqual([31.2, 121.5]);
  });

  it('roundtrips the log table columns exactly', async () => {
    const logTable: LogTable = {
      columnNames: ['state', 'likelihood', 'rate'],
      columns: [
        new Float64Array([0, 1, 2, 3]),
        new Float64Array([-100.5, -99.25, -98.125, -97.0]),
        new Float64Array([0.1, 0.2, 0.3, 0.4]),
      ],
      rowCount: 4,
    };
    const embedded = await buildEmbeddedData({ ...EMPTY, logTable, logFileName: 'test.log' });
    const applied = await applyEmbeddedData(embedded as NonNullable<typeof embedded>);

    expect(applied.log?.fileName).toBe('test.log');
    expect(applied.log?.table.rowCount).toBe(4);
    expect(applied.log?.table.columnNames).toEqual(['state', 'likelihood', 'rate']);
    expect(Array.from(applied.log?.table.columns[1] ?? [])).toEqual([
      -100.5, -99.25, -98.125, -97.0,
    ]);
    expect(Array.from(applied.log?.table.columns[2] ?? [])).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('roundtrips boundary, choropleth, env columns, and raster layers', async () => {
    const boundary: CustomOverlay = { id: 'b1', name: 'Regions', data: FC('region') };
    const choropleth: ChoroplethOverlay = {
      id: 'c1',
      name: 'Rainfall',
      data: FC('region'),
      valueByLocation: new Map([
        ['A', 1.5],
        ['B', 2.5],
      ]),
      valueColumn: 'rain',
      locationCol: 'loc',
    };
    const envColumn: EnvColumn = {
      key: 'rain',
      displayName: 'Rainfall',
      units: 'mm',
      values: new Map([
        ['A', 1.5],
        ['B', 2.5],
      ]),
    };
    const raster: RasterData = {
      width: 2,
      height: 2,
      bounds: [0, 0, 10, 10],
      data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]),
    };

    // Roundtrip through JSON exactly like a saved project.
    const embedded = await buildEmbeddedData({
      ...EMPTY,
      customOverlays: [boundary],
      choroplethOverlays: [choropleth],
      envColumns: [envColumn],
      raster,
    });
    const applied = await applyEmbeddedData(JSON.parse(JSON.stringify(embedded)));

    expect(applied.layers?.boundaries[0]?.id).toBe('b1');
    expect(applied.layers?.boundaries[0]?.data).toEqual(FC('region'));

    expect(applied.layers?.choropleths[0]?.valueColumn).toBe('rain');
    expect(applied.layers?.choropleths[0]?.valueByLocation.get('B')).toBe(2.5);

    expect(applied.layers?.envColumns[0]?.units).toBe('mm');
    expect(applied.layers?.envColumns[0]?.values.get('A')).toBe(1.5);

    expect(applied.layers?.raster?.width).toBe(2);
    expect(applied.layers?.raster?.bounds).toEqual([0, 0, 10, 10]);
    expect(Array.from(applied.layers?.raster?.data ?? [])).toEqual([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
    ]);
  });

  it('returns null when there is nothing to embed', async () => {
    expect(await buildEmbeddedData(EMPTY)).toBeNull();
  });

  it('rejects embedded log bytes that do not match declared dimensions', async () => {
    const embedded = await buildEmbeddedData({
      ...EMPTY,
      logTable: {
        columnNames: ['state'],
        columns: [new Float64Array([0, 1])],
        rowCount: 2,
      },
      logFileName: 'test.log',
    });
    if (!embedded?.log) throw new Error('Expected embedded log');
    embedded.log.rowCount = 3;

    await expect(applyEmbeddedData(embedded)).rejects.toThrow('byte length');
  });

  it('rejects embedded raster bytes that do not match declared dimensions', async () => {
    const embedded = await buildEmbeddedData({
      ...EMPTY,
      raster: {
        width: 2,
        height: 2,
        bounds: [0, 0, 1, 1],
        data: new Uint8ClampedArray(16),
      },
    });
    if (!embedded?.layers?.raster) throw new Error('Expected embedded raster');
    embedded.layers.raster.width = 3;

    await expect(applyEmbeddedData(embedded)).rejects.toThrow('byte length');
  });

  it('validates decompressed embedded GeoJSON before adding a layer', async () => {
    await expect(
      applyEmbeddedData({
        layers: {
          boundaries: [
            {
              id: 'bad',
              name: 'Bad geometry',
              dataGz: await gzipText('{"type":"Point","coordinates":[1,2]}'),
            },
          ],
        },
      }),
    ).rejects.toThrow('FeatureCollection');
  });
});
