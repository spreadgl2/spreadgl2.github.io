import { describe, expect, it } from 'vitest';
import {
  deckDevicePixels,
  PERFORMANCE_PLAYHEAD_BUCKETS,
  playbackBucketCount,
  QUALITY_PLAYHEAD_BUCKETS,
  shouldUsePerformanceMode,
} from './performance-policy';

describe('performance policy', () => {
  it('uses performance rendering automatically for large trees', () => {
    expect(
      shouldUsePerformanceMode('auto', 30_000, {
        hardwareConcurrency: 12,
        deviceMemory: 16,
      }),
    ).toBe(true);
  });

  it('uses performance rendering automatically on constrained devices', () => {
    expect(shouldUsePerformanceMode('auto', 100, { hardwareConcurrency: 4 })).toBe(true);
    expect(shouldUsePerformanceMode('auto', 100, { deviceMemory: 4 })).toBe(true);
  });

  it('lets explicit user choices override automatic detection', () => {
    expect(shouldUsePerformanceMode('quality', 40_000, { hardwareConcurrency: 2 })).toBe(false);
    expect(shouldUsePerformanceMode('performance', 100, { hardwareConcurrency: 16 })).toBe(true);
  });

  it('caps quality rendering at 2x and performance rendering at 1x', () => {
    expect(deckDevicePixels(false, 3)).toBe(2);
    expect(deckDevicePixels(false, 1.5)).toBe(1.5);
    expect(deckDevicePixels(true, 3)).toBe(1);
  });

  it('reduces CPU playhead update frequency in performance mode', () => {
    expect(playbackBucketCount(false)).toBe(QUALITY_PLAYHEAD_BUCKETS);
    expect(playbackBucketCount(true)).toBe(PERFORMANCE_PLAYHEAD_BUCKETS);
  });
});
