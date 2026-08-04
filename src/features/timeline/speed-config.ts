export const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export const PLAYBACK_SPEED_SCALE = 2;

export function effectivePlaybackSpeed(speed: number): number {
  return speed * PLAYBACK_SPEED_SCALE;
}
