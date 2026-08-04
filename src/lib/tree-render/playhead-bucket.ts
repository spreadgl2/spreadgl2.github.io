export interface PlayheadBucketBounds {
  min: number;
  max: number;
}

const DEFAULT_ANIMATION_BUCKET_COUNT = 600;

export function getRangeRelativePlayheadBucket(
  playhead: number,
  bounds: PlayheadBucketBounds | null,
  isPlaying: boolean,
  bucketCount = DEFAULT_ANIMATION_BUCKET_COUNT,
): number {
  if (!isPlaying || !bounds) return playhead;
  const range = bounds.max - bounds.min;
  if (!Number.isFinite(range) || range <= 0 || bucketCount <= 0) return playhead;
  const step = range / bucketCount;
  return bounds.min + Math.round((playhead - bounds.min) / step) * step;
}
