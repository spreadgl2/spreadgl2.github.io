export type InputKind = 'tree' | 'log' | 'project' | 'geojson' | 'csv' | 'geotiff';

const MIB = 1024 * 1024;

export const INPUT_LIMITS = {
  treeBytes: 128 * MIB,
  logBytes: 128 * MIB,
  projectBytes: 96 * MIB,
  geojsonBytes: 32 * MIB,
  csvBytes: 16 * MIB,
  geotiffBytes: 256 * MIB,
  decompressionRatio: 200,
  decompressionRatioFloorBytes: 1 * MIB,
  geojsonFeatures: 100_000,
  geojsonCoordinates: 2_000_000,
  geojsonGeometryDepth: 16,
  rasterPixels: 16_777_216,
  logRows: 1_000_000,
  logColumns: 2_048,
  logCells: 20_000_000,
  treeNodes: 500_000,
  treeAnnotationEntries: 5_000_000,
  csvRows: 250_000,
  csvColumns: 512,
  projectCollectionEntries: 250_000,
  projectLayerEntries: 256,
  projectStringLength: 1 * MIB,
} as const;

const MAX_BYTES_BY_KIND: Record<InputKind, number> = {
  tree: INPUT_LIMITS.treeBytes,
  log: INPUT_LIMITS.logBytes,
  project: INPUT_LIMITS.projectBytes,
  geojson: INPUT_LIMITS.geojsonBytes,
  csv: INPUT_LIMITS.csvBytes,
  geotiff: INPUT_LIMITS.geotiffBytes,
};

const LABEL_BY_KIND: Record<InputKind, string> = {
  tree: 'Tree',
  log: 'Log',
  project: 'Project',
  geojson: 'GeoJSON',
  csv: 'CSV',
  geotiff: 'GeoTIFF',
};

export class InputLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputLimitError';
  }
}

export function formatMiB(bytes: number): string {
  return `${Math.round(bytes / MIB)} MiB`;
}

export function maxBytesForInput(kind: InputKind): number {
  return MAX_BYTES_BY_KIND[kind];
}

export function assertInputSize(kind: InputKind, sizeBytes: number): void {
  const maximum = maxBytesForInput(kind);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > maximum) {
    throw new InputLimitError(
      `${LABEL_BY_KIND[kind]} files must be ${formatMiB(maximum)} or smaller.`,
    );
  }
}

export function assertTextSize(kind: Exclude<InputKind, 'geotiff'>, text: string): void {
  const maximum = maxBytesForInput(kind);
  if (text.length > maximum) {
    throw new InputLimitError(
      `${LABEL_BY_KIND[kind]} files must be ${formatMiB(maximum)} or smaller.`,
    );
  }
}

export function inputKindForFileName(name: string): 'tree' | 'project' | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.spreadgl2.json')) return 'project';
  if (['.tree', '.trees', '.nex', '.nexus'].some((extension) => lower.endsWith(extension))) {
    return 'tree';
  }
  return null;
}

export function assertRasterDimensions(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new InputLimitError('Raster dimensions must be positive whole numbers.');
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > INPUT_LIMITS.rasterPixels) {
    throw new InputLimitError(
      `Raster images may contain at most ${INPUT_LIMITS.rasterPixels.toLocaleString()} pixels.`,
    );
  }
  return pixels;
}

export function assertBoundedArray(
  value: unknown,
  label: string,
  maximum: number,
): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new InputLimitError(`${label} must be an array.`);
  if (value.length > maximum) {
    throw new InputLimitError(`${label} may contain at most ${maximum.toLocaleString()} entries.`);
  }
}

export function assertBoundedString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new InputLimitError(`${label} must be a string.`);
  if (value.length > INPUT_LIMITS.projectStringLength) {
    throw new InputLimitError(`${label} is too long.`);
  }
}
