import { fromArrayBuffer } from 'geotiff';
import { getPaletteColor } from '../env/palettes';
import { assertInputSize, assertRasterDimensions, InputLimitError } from '../security/input-limits';

export interface RasterData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  bounds: [number, number, number, number];
}

export async function loadGeoTIFF(buffer: ArrayBuffer): Promise<RasterData> {
  assertInputSize('geotiff', buffer.byteLength);
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();

  const bbox = image.getBoundingBox() as number[];
  const bounds: [number, number, number, number] = [
    bbox[0] ?? 0,
    bbox[1] ?? 0,
    bbox[2] ?? 0,
    bbox[3] ?? 0,
  ];

  const width = image.getWidth();
  const height = image.getHeight();
  const pixelCount = assertRasterDimensions(width, height);

  const rasters = await image.readRasters({ samples: [0] });
  const band = rasters[0] as Float32Array | Int16Array | Uint8Array;
  if (!band || band.length !== pixelCount) {
    throw new InputLimitError('GeoTIFF raster length does not match its declared dimensions.');
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < band.length; i++) {
    const v = band[i] as number;
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;

  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < band.length; i++) {
    const v = band[i] as number;
    const t = range > 0 ? Math.max(0, Math.min(1, (v - min) / range)) : 0;
    const [r, g, b] = getPaletteColor('viridis', t);
    const base = i * 4;
    rgba[base] = r;
    rgba[base + 1] = g;
    rgba[base + 2] = b;
    rgba[base + 3] = 255;
  }

  return { data: rgba, width, height, bounds };
}
