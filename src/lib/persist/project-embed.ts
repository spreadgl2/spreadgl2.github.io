import type { ChoroplethOverlay, CustomOverlay, GeoSource } from '../../store/tree';
import type { EnvColumn } from '../format/env-csv';
import type { RasterData } from '../geotiff/loader';
import type { LogTable } from '../log/log-table';
import { parseFeatureCollection } from '../security/geojson';
import { assertRasterDimensions, INPUT_LIMITS, InputLimitError } from '../security/input-limits';
import { base64ToUint8, gzipText, streamTransform, uint8ToBase64, ungzipText } from './gzip';

// Self-contained payload embedded in a project file so a shared `.spreadgl2.json`
// carries the processed coordinate lookup, BSSVS log, and map layers — the
// things a user would otherwise have to re-load on import. Big binary blobs are
// gzipped once on their raw bytes (not base64-inside-JSON) to keep the file as
// small as possible.
export interface EmbeddedGeo {
  source: GeoSource;
  // [locationName, lat, lon]
  entries: [string, number, number][];
}

export interface EmbeddedLog {
  fileName: string;
  columnNames: string[];
  rowCount: number;
  // base64(gzip(concatenated Float64 column buffers)), column-major.
  columnsGz: string;
}

// A boundary overlay (custom GeoJSON outline). The FeatureCollection can be
// large, so it's gzipped as JSON text.
export interface EmbeddedBoundary {
  id: string;
  name: string;
  dataGz: string;
}

// A region choropleth: a boundary plus the per-location values that colour it.
export interface EmbeddedChoropleth {
  id: string;
  name: string;
  dataGz: string;
  valueColumn: string;
  locationCol: string;
  valueByLocation: [string, number][];
}

// An environment-variable column backing choropleth colouring.
export interface EmbeddedEnvColumn {
  key: string;
  displayName: string;
  units: string | null;
  values: [string, number][];
}

// A raster overlay (GeoTIFF decoded to RGBA). The pixel buffer is gzipped raw.
export interface EmbeddedRaster {
  width: number;
  height: number;
  bounds: [number, number, number, number];
  dataGz: string;
}

export interface EmbeddedLayers {
  boundaries?: EmbeddedBoundary[];
  choropleths?: EmbeddedChoropleth[];
  envColumns?: EmbeddedEnvColumn[];
  raster?: EmbeddedRaster;
}

export interface EmbeddedData {
  geo?: EmbeddedGeo;
  log?: EmbeddedLog;
  layers?: EmbeddedLayers;
}

async function gzipBytes(bytes: Uint8Array): Promise<string> {
  const compressed = await streamTransform(bytes, new CompressionStream('gzip'));
  return uint8ToBase64(compressed);
}

async function ungzipBytes(
  b64: string,
  maxOutputBytes: number,
  label: string,
): Promise<Uint8Array> {
  const compressed = base64ToUint8(
    b64,
    Math.max(maxOutputBytes, INPUT_LIMITS.decompressionRatioFloorBytes),
  );
  return streamTransform(compressed, new DecompressionStream('gzip'), {
    maxOutputBytes,
    maxCompressionRatio: INPUT_LIMITS.decompressionRatio,
    label,
  });
}

function packFloat64Columns(columns: Float64Array[]): Uint8Array {
  const total = columns.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const col of columns) {
    out.set(new Uint8Array(col.buffer, col.byteOffset, col.byteLength), offset);
    offset += col.byteLength;
  }
  return out;
}

function unpackFloat64Columns(
  bytes: Uint8Array,
  columnCount: number,
  rowCount: number,
): Float64Array[] {
  // Copy into an aligned ArrayBuffer before viewing as Float64.
  const aligned = bytes.slice().buffer;
  const flat = new Float64Array(aligned);
  const columns: Float64Array[] = [];
  for (let i = 0; i < columnCount; i++) {
    columns.push(flat.slice(i * rowCount, (i + 1) * rowCount));
  }
  return columns;
}

export interface BuildEmbeddedInput {
  geoLookup: Map<string, [number, number]> | null;
  geoSource: GeoSource;
  logTable: LogTable | null;
  logFileName: string | null;
  customOverlays: CustomOverlay[];
  choroplethOverlays: ChoroplethOverlay[];
  envColumns: EnvColumn[];
  raster: RasterData | null;
}

async function buildEmbeddedLayers(input: BuildEmbeddedInput): Promise<EmbeddedLayers | null> {
  const layers: EmbeddedLayers = {};

  if (input.customOverlays.length > 0) {
    layers.boundaries = await Promise.all(
      input.customOverlays.map(async (o) => ({
        id: o.id,
        name: o.name,
        dataGz: await gzipText(JSON.stringify(o.data)),
      })),
    );
  }

  if (input.choroplethOverlays.length > 0) {
    layers.choropleths = await Promise.all(
      input.choroplethOverlays.map(async (o) => ({
        id: o.id,
        name: o.name,
        dataGz: await gzipText(JSON.stringify(o.data)),
        valueColumn: o.valueColumn,
        locationCol: o.locationCol,
        valueByLocation: Array.from(o.valueByLocation.entries()),
      })),
    );
  }

  if (input.envColumns.length > 0) {
    layers.envColumns = input.envColumns.map((c) => ({
      key: c.key,
      displayName: c.displayName,
      units: c.units,
      values: Array.from(c.values.entries()),
    }));
  }

  if (input.raster) {
    layers.raster = {
      width: input.raster.width,
      height: input.raster.height,
      bounds: input.raster.bounds,
      dataGz: await gzipBytes(
        new Uint8Array(
          input.raster.data.buffer,
          input.raster.data.byteOffset,
          input.raster.data.byteLength,
        ),
      ),
    };
  }

  return layers.boundaries || layers.choropleths || layers.envColumns || layers.raster
    ? layers
    : null;
}

export async function buildEmbeddedData(input: BuildEmbeddedInput): Promise<EmbeddedData | null> {
  const embedded: EmbeddedData = {};

  if (input.geoLookup && input.geoLookup.size > 0) {
    embedded.geo = {
      source: input.geoSource,
      entries: Array.from(input.geoLookup.entries(), ([name, [lat, lon]]) => [name, lat, lon]),
    };
  }

  if (input.logTable) {
    embedded.log = {
      fileName: input.logFileName ?? 'log',
      columnNames: input.logTable.columnNames,
      rowCount: input.logTable.rowCount,
      columnsGz: await gzipBytes(packFloat64Columns(input.logTable.columns)),
    };
  }

  const layers = await buildEmbeddedLayers(input);
  if (layers) embedded.layers = layers;

  return embedded.geo || embedded.log || embedded.layers ? embedded : null;
}

export interface AppliedLayers {
  boundaries: CustomOverlay[];
  choropleths: ChoroplethOverlay[];
  envColumns: EnvColumn[];
  raster: RasterData | null;
}

export interface AppliedEmbedded {
  geo?: { lookup: Map<string, [number, number]>; source: GeoSource };
  log?: { table: LogTable; fileName: string };
  layers?: AppliedLayers;
}

async function applyEmbeddedLayers(layers: EmbeddedLayers): Promise<AppliedLayers> {
  const boundaries: CustomOverlay[] = [];
  for (const b of layers.boundaries ?? []) {
    boundaries.push({
      id: b.id,
      name: b.name,
      data: parseFeatureCollection(
        await ungzipText(b.dataGz, {
          maxOutputBytes: INPUT_LIMITS.geojsonBytes,
          label: 'Embedded boundary GeoJSON',
        }),
      ),
    });
  }

  const choropleths: ChoroplethOverlay[] = [];
  for (const c of layers.choropleths ?? []) {
    choropleths.push({
      id: c.id,
      name: c.name,
      data: parseFeatureCollection(
        await ungzipText(c.dataGz, {
          maxOutputBytes: INPUT_LIMITS.geojsonBytes,
          label: 'Embedded choropleth GeoJSON',
        }),
      ),
      valueByLocation: new Map(c.valueByLocation),
      valueColumn: c.valueColumn,
      locationCol: c.locationCol,
    });
  }

  const envColumns: EnvColumn[] = (layers.envColumns ?? []).map((c) => ({
    key: c.key,
    displayName: c.displayName,
    units: c.units,
    values: new Map(c.values),
  }));

  let raster: RasterData | null = null;
  if (layers.raster) {
    const pixels = assertRasterDimensions(layers.raster.width, layers.raster.height);
    const expectedBytes = pixels * 4;
    const bytes = await ungzipBytes(layers.raster.dataGz, expectedBytes, 'Embedded raster');
    if (bytes.byteLength !== expectedBytes) {
      throw new InputLimitError('Embedded raster byte length does not match its dimensions.');
    }
    raster = {
      width: layers.raster.width,
      height: layers.raster.height,
      bounds: layers.raster.bounds,
      data: new Uint8ClampedArray(bytes),
    };
  }

  return { boundaries, choropleths, envColumns, raster };
}

export async function applyEmbeddedData(embedded: EmbeddedData): Promise<AppliedEmbedded> {
  const applied: AppliedEmbedded = {};

  if (embedded.geo) {
    const lookup = new Map<string, [number, number]>();
    for (const [name, lat, lon] of embedded.geo.entries) {
      lookup.set(name, [lat, lon]);
    }
    applied.geo = { lookup, source: embedded.geo.source };
  }

  if (embedded.log) {
    const columnCount = embedded.log.columnNames.length;
    const { rowCount } = embedded.log;
    if (
      !Number.isSafeInteger(rowCount) ||
      rowCount <= 0 ||
      columnCount === 0 ||
      columnCount > INPUT_LIMITS.logColumns ||
      rowCount > INPUT_LIMITS.logRows ||
      rowCount * columnCount > INPUT_LIMITS.logCells
    ) {
      throw new InputLimitError('Embedded log dimensions exceed the supported limits.');
    }
    const expectedBytes = rowCount * columnCount * Float64Array.BYTES_PER_ELEMENT;
    const bytes = await ungzipBytes(embedded.log.columnsGz, expectedBytes, 'Embedded log');
    if (bytes.byteLength !== expectedBytes) {
      throw new InputLimitError('Embedded log byte length does not match its declared dimensions.');
    }
    const columns = unpackFloat64Columns(
      bytes,
      embedded.log.columnNames.length,
      embedded.log.rowCount,
    );
    applied.log = {
      table: {
        columnNames: embedded.log.columnNames,
        columns,
        rowCount: embedded.log.rowCount,
      },
      fileName: embedded.log.fileName,
    };
  }

  if (embedded.layers) {
    applied.layers = await applyEmbeddedLayers(embedded.layers);
  }

  return applied;
}
