import { describe, expect, it } from 'vitest';
import { playheadDelta } from './playback';

describe('playheadDelta', () => {
  const range = 20; // decimal years
  const speed = 1;

  it('advances proportionally to the frame delta below the cap', () => {
    const step16 = playheadDelta(16, range, speed);
    const step32 = playheadDelta(32, range, speed);
    expect(step32).toBeCloseTo(step16 * 2, 9);
  });

  it('clamps a stalled frame so the playhead does not leap forward', () => {
    const normal = playheadDelta(16, range, speed);
    const hugeA = playheadDelta(500, range, speed);
    const hugeB = playheadDelta(2000, range, speed);
    // Two different long stalls (cold shader compile, tile decode, backgrounded
    // tab) advance the playhead by the same clamped amount...
    expect(hugeA).toBe(hugeB);
    // ...a small multiple of a normal frame, not the ~30–125× the raw gap implies.
    expect(hugeB).toBeLessThan(normal * 10);
  });

  it('scales with playback speed', () => {
    expect(playheadDelta(16, range, 2)).toBeCloseTo(playheadDelta(16, range, 1) * 2, 9);
  });
});
