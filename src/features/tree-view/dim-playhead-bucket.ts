import {
  getRangeRelativePlayheadBucket,
  type PlayheadBucketBounds,
} from '../../lib/tree-render/playhead-bucket';

export function getDimPlayheadBucket(
  playhead: number,
  bounds: PlayheadBucketBounds | null,
  isPlaying: boolean,
  bucketCount?: number,
): number {
  return getRangeRelativePlayheadBucket(playhead, bounds, isPlaying, bucketCount);
}
