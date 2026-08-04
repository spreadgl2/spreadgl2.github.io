import { create } from 'zustand';
import type { PlayMode, TimeWindow } from '../lib/phylo/types';

export type { PlayMode, TimeWindow };

export interface TimeBounds {
  min: number;
  max: number;
}

export interface TimelineStore {
  playhead: number;
  // The currently-rendered window (start/end). Derived from `playhead` and
  // `windowSize` whenever either changes — kept on the store so consumers
  // can read it as a snapshot without re-deriving. `null` in Trail mode.
  window: TimeWindow | null;
  // The user-selected window WIDTH in decimal years. Persists across
  // Trail→Window→Trail mode switches, so re-entering Window mode restores
  // the same width the user dragged to. Also used by the playback hook to
  // know when the tail-off animation ends (playhead ≥ bounds.max + windowSize).
  windowSize: number | null;
  speed: number;
  mode: PlayMode;
  // Arc rendering (vs line/trail) and clade isolation are independent display
  // toggles layered on top of the Trail/Window mode.
  arcs: boolean;
  clade: boolean;
  subtreeRootIds: string[];
  // Legacy mirror of the first selected clade root. Kept for old project files
  // and callers that have not moved to the multi-clade API yet.
  subtreeRootId: string | null;
  isPlaying: boolean;
  bounds: TimeBounds | null;
  setPlayhead: (t: number) => void;
  setWindow: (window: TimeWindow | null) => void;
  setWindowSize: (windowSize: number | null) => void;
  setSpeed: (speed: number) => void;
  setMode: (mode: PlayMode) => void;
  setArcs: (arcs: boolean) => void;
  setClade: (clade: boolean) => void;
  setSubtreeRootIds: (ids: string[]) => void;
  setSubtreeRootId: (id: string | null) => void;
  toggleSubtreeRootId: (id: string) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setBounds: (bounds: TimeBounds | null) => void;
}

/**
 * Compute the rendered window for a given playhead + width + bounds. The
 * right edge is clamped to `bounds.max` so that during tail-off (when the
 * playhead is virtually advancing past `bounds.max`), the visible window
 * shrinks from the left edge until it collapses. Returns null when the
 * computed window has zero or negative size (animation has fully ended).
 */
export function deriveWindow(
  playhead: number,
  windowSize: number,
  bounds: TimeBounds | null,
): TimeWindow | null {
  const cap = bounds?.max ?? playhead;
  const end = Math.min(playhead, cap);
  const start = playhead - windowSize;
  if (start >= end) return null;
  return { start, end };
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  playhead: 2003.0,
  window: null,
  windowSize: null,
  speed: 1,
  mode: 'Trail',
  arcs: true,
  clade: false,
  subtreeRootIds: [],
  subtreeRootId: null,
  isPlaying: false,
  bounds: null,
  setPlayhead: (playhead) =>
    set((state) => {
      // In Window mode the band trails the playhead: the playhead is pinned
      // to the window's right edge, so the band always covers the span of
      // time just behind "now". Any playhead move re-anchors the band,
      // keeping the user-selected width.
      //
      // During tail-off (playhead > bounds.max), `deriveWindow` clamps the
      // right edge to bounds.max, so the visible band shrinks from the left
      // until window.start ≥ bounds.max — at which point deriveWindow
      // returns null and the band disappears entirely.
      if (state.mode === 'Window') {
        // Prefer the persistent `windowSize`. Fall back to the width of an
        // existing `window` so tests / external code that initialize the
        // store via `setState({window: ...})` still get the trailing-band
        // behavior without having to know about `windowSize`.
        const width =
          state.windowSize ?? (state.window ? state.window.end - state.window.start : null);
        if (width !== null) {
          return {
            playhead,
            windowSize: width,
            window: deriveWindow(playhead, width, state.bounds),
          };
        }
      }
      return { playhead };
    }),
  // setWindow is the single point where the user-selected width gets
  // updated (drag-resize handle, keyboard `[`/`]`, programmatic). Passing
  // null clears both `window` and `windowSize`.
  setWindow: (window) =>
    set(() => {
      if (window === null) return { window: null, windowSize: null };
      return { window, windowSize: window.end - window.start };
    }),
  setWindowSize: (windowSize) => set({ windowSize }),
  setSpeed: (speed) => set({ speed }),
  setMode: (mode) => set({ mode }),
  setArcs: (arcs) => set({ arcs }),
  setClade: (clade) => set({ clade }),
  setSubtreeRootIds: (subtreeRootIds) =>
    set({ subtreeRootIds, subtreeRootId: subtreeRootIds[0] ?? null }),
  setSubtreeRootId: (subtreeRootId) =>
    set({ subtreeRootId, subtreeRootIds: subtreeRootId === null ? [] : [subtreeRootId] }),
  toggleSubtreeRootId: (id) =>
    set((state) => {
      const exists = state.subtreeRootIds.includes(id);
      const subtreeRootIds = exists
        ? state.subtreeRootIds.filter((rootId) => rootId !== id)
        : [...state.subtreeRootIds, id];
      return { subtreeRootIds, subtreeRootId: subtreeRootIds[0] ?? null };
    }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setBounds: (bounds) => set({ bounds }),
}));
