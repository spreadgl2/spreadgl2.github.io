import type { RenderQuality } from '../../lib/persist/preferences';

export const LARGE_TREE_BRANCH_THRESHOLD = 30_000;
export const CONSTRAINED_CPU_THRESHOLD = 4;
export const CONSTRAINED_MEMORY_GB_THRESHOLD = 4;
export const PERFORMANCE_PLAYHEAD_BUCKETS = 120;
export const QUALITY_PLAYHEAD_BUCKETS = 600;

export interface HardwareCapabilities {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  devicePixelRatio?: number;
}

export function browserHardwareCapabilities(): HardwareCapabilities {
  if (typeof navigator === 'undefined') return {};
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    hardwareConcurrency: navigator.hardwareConcurrency,
    ...(deviceMemory !== undefined ? { deviceMemory } : {}),
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
  };
}

export function shouldUsePerformanceMode(
  quality: RenderQuality,
  branchCount: number,
  capabilities: HardwareCapabilities = browserHardwareCapabilities(),
): boolean {
  if (quality === 'performance') return true;
  if (quality === 'quality') return false;
  if (branchCount >= LARGE_TREE_BRANCH_THRESHOLD) return true;
  if (
    capabilities.hardwareConcurrency !== undefined &&
    capabilities.hardwareConcurrency <= CONSTRAINED_CPU_THRESHOLD
  ) {
    return true;
  }
  return (
    capabilities.deviceMemory !== undefined &&
    capabilities.deviceMemory <= CONSTRAINED_MEMORY_GB_THRESHOLD
  );
}

export function deckDevicePixels(
  performanceMode: boolean,
  devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio,
): number {
  if (performanceMode) return 1;
  return Math.max(1, Math.min(devicePixelRatio || 1, 2));
}

export function playbackBucketCount(performanceMode: boolean): number {
  return performanceMode ? PERFORMANCE_PLAYHEAD_BUCKETS : QUALITY_PLAYHEAD_BUCKETS;
}
