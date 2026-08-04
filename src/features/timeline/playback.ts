import { useEffect, useRef } from 'react';
import { type TimelineStore, useTimelineStore } from '../../store/timeline';
import { effectivePlaybackSpeed } from './speed-config';

// Wall-clock seconds for one full timeline traversal at 1x. The actual
// per-frame delta is (range / TARGET_FULL_PLAYBACK_SECONDS) * effectiveSpeed * dt.
// The displayed 1x intentionally maps to the previous 2x pace.
const TARGET_FULL_PLAYBACK_SECONDS = 20;

// Longest per-frame delta the loop will honour. A cold shader compile, tile
// decode, GC pause, or a backgrounded tab can stall a frame for hundreds of ms;
// without a cap the playhead would leap forward by the whole gap — a visible
// skip. Clamping turns a hitch into a brief slow-down instead of a jump.
//
// ~3 frames at 60fps: high enough to sit above the normal frame time for any
// device down to ~20fps (so healthy playback is never throttled), low enough
// that a stall advances the playhead only a hair before it recovers.
const MAX_FRAME_DELTA_MS = 50;

/**
 * Decimal-year the playhead advances for a frame of `deltaMs`, with the delta
 * clamped to MAX_FRAME_DELTA_MS. Exported for testing.
 */
export function playheadDelta(deltaMs: number, range: number, speed: number): number {
  const clampedMs = Math.min(deltaMs, MAX_FRAME_DELTA_MS);
  return (
    (range / TARGET_FULL_PLAYBACK_SECONDS) * effectivePlaybackSpeed(speed) * (clampedMs / 1000)
  );
}

/**
 * The playhead value at which the current mode's animation is "done."
 *   Trail → `bounds.max` (every lineage visible).
 *   Window → `bounds.max + windowSize`. Past `bounds.max`, the window's
 *     right edge clamps so the visible band shrinks from the left; the
 *     animation truly ends only once `window.start ≥ bounds.max`, i.e.
 *     `playhead ≥ bounds.max + windowSize`.
 * Returns null when bounds aren't known yet (pre-parse).
 */
function endOfPlayback(state: TimelineStore): number | null {
  if (!state.bounds) return null;
  if (state.mode === 'Window' && state.windowSize !== null) {
    return state.bounds.max + state.windowSize;
  }
  return state.bounds.max;
}

export function usePlaybackLoop(enabled = true): void {
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const rafRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimestampRef.current = null;
      return;
    }

    // When Play starts with the playhead at (or past) the effective end of
    // playback (`endOfPlayback` below), rewind to bounds.min so animation
    // runs root → tips. Otherwise pressing Play after a finished playback
    // would be a no-op.
    const initial = useTimelineStore.getState();
    const initialEnd = endOfPlayback(initial);
    if (initial.bounds && initialEnd !== null && initial.playhead >= initialEnd) {
      initial.setPlayhead(initial.bounds.min);
    }

    function tick(timestamp: number) {
      const state = useTimelineStore.getState();
      if (!state.isPlaying) {
        rafRef.current = null;
        lastTimestampRef.current = null;
        return;
      }

      const last = lastTimestampRef.current;
      if (last !== null) {
        const range = state.bounds ? state.bounds.max - state.bounds.min : 1;
        const deltaDecYear = playheadDelta(timestamp - last, range, state.speed);
        const next = state.playhead + deltaDecYear;

        // End of playback:
        //   Trail mode → playhead reaches bounds.max (full history visible).
        //   Window mode → playhead reaches bounds.max + windowSize, at which
        //     point window.start ≥ bounds.max and `deriveWindow` returns null
        //     so the band collapses to nothing. Same forward speed as Trail.
        const end = endOfPlayback(state);
        if (state.bounds && end !== null && next >= end) {
          state.setPlayhead(end);
          state.setIsPlaying(false);
          rafRef.current = null;
          lastTimestampRef.current = null;
          return;
        }

        // setPlayhead carries the Window band along in Window mode.
        state.setPlayhead(next);
      }

      lastTimestampRef.current = timestamp;
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimestampRef.current = null;
    };
  }, [enabled, isPlaying]);
}
