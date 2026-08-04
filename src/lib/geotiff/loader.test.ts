import { fromArrayBuffer } from 'geotiff';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INPUT_LIMITS, InputLimitError } from '../security/input-limits';
import { loadGeoTIFF } from './loader';

const mockBandData = new Float32Array(4 * 4);
for (let i = 0; i < mockBandData.length; i++) {
  mockBandData[i] = i;
}

vi.mock('geotiff', () => ({
  fromArrayBuffer: vi.fn().mockResolvedValue({
    getImage: vi.fn().mockResolvedValue({
      getBoundingBox: vi.fn().mockReturnValue([-180, -90, 180, 90]),
      getWidth: vi.fn().mockReturnValue(4),
      getHeight: vi.fn().mockReturnValue(4),
      readRasters: vi
        .fn()
        .mockResolvedValue([new Float32Array(Array.from({ length: 16 }, (_, i) => i))]),
    }),
  }),
}));

describe('loadGeoTIFF', () => {
  beforeEach(() => {
    vi.mocked(fromArrayBuffer).mockResolvedValue({
      getImage: vi.fn().mockResolvedValue({
        getBoundingBox: vi.fn().mockReturnValue([-180, -90, 180, 90]),
        getWidth: vi.fn().mockReturnValue(4),
        getHeight: vi.fn().mockReturnValue(4),
        readRasters: vi
          .fn()
          .mockResolvedValue([new Float32Array(Array.from({ length: 16 }, (_, i) => i))]),
      }),
    } as never);
  });

  it('returns correct bounds from getBoundingBox', async () => {
    const result = await loadGeoTIFF(new ArrayBuffer(8));
    expect(result.bounds).toEqual([-180, -90, 180, 90]);
  });

  it('returns correct width and height', async () => {
    const result = await loadGeoTIFF(new ArrayBuffer(8));
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  it('returns RGBA Uint8ClampedArray of length width * height * 4', async () => {
    const result = await loadGeoTIFF(new ArrayBuffer(8));
    expect(result.data).toBeInstanceOf(Uint8ClampedArray);
    expect(result.data.length).toBe(4 * 4 * 4);
  });

  it('maps min pixel to viridis t=0 and max pixel to viridis t=1', async () => {
    const result = await loadGeoTIFF(new ArrayBuffer(8));
    const first = [result.data[0], result.data[1], result.data[2]];
    const lastBase = (4 * 4 - 1) * 4;
    const last = [result.data[lastBase], result.data[lastBase + 1], result.data[lastBase + 2]];
    expect(first).toEqual([68, 1, 84]);
    expect(last).toEqual([253, 231, 37]);
  });

  it('alpha channel is fully opaque (255) for all pixels', async () => {
    const result = await loadGeoTIFF(new ArrayBuffer(8));
    let allOpaque = true;
    for (let i = 3; i < result.data.length; i += 4) {
      if (result.data[i] !== 255) {
        allOpaque = false;
        break;
      }
    }
    expect(allOpaque).toBe(true);
  });

  it('reads only the first raster band', async () => {
    const tiff = await fromArrayBuffer(new ArrayBuffer(8));
    const image = await tiff.getImage();
    await loadGeoTIFF(new ArrayBuffer(8));
    expect(image.readRasters).toHaveBeenCalledWith({ samples: [0] });
  });

  it('rejects over-budget dimensions before decoding raster samples', async () => {
    vi.mocked(fromArrayBuffer).mockResolvedValueOnce({
      getImage: vi.fn().mockResolvedValue({
        getBoundingBox: vi.fn().mockReturnValue([-180, -90, 180, 90]),
        getWidth: vi.fn().mockReturnValue(INPUT_LIMITS.rasterPixels + 1),
        getHeight: vi.fn().mockReturnValue(1),
        readRasters: vi.fn(),
      }),
    } as never);

    await expect(loadGeoTIFF(new ArrayBuffer(8))).rejects.toThrow(InputLimitError);
  });
});
