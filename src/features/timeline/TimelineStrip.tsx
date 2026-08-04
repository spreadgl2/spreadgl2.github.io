import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { decimalYearToISO } from '../../lib/format/decimal-year';
import { type PlayMode, useTimelineStore } from '../../store/timeline';
import { useUiStore } from '../../store/ui';
import { PLAYBACK_SPEEDS } from './speed-config';
import styles from './TimelineStrip.module.css';
import { DEFAULT_WINDOW_FRACTION } from './window-config';

const MODES: PlayMode[] = ['Trail', 'Window'];

type DragKind = 'scrubber' | 'window-define' | 'window-left';

function positionFraction(clientX: number, rect: DOMRect): number {
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
}

function fractionToTime(fraction: number, min: number, max: number): number {
  return min + fraction * (max - min);
}

function timeToFraction(t: number, min: number, max: number): number {
  if (max === min) return 0;
  return (t - min) / (max - min);
}

export function TimelineStrip() {
  const playhead = useTimelineStore((s) => s.playhead);
  const window = useTimelineStore((s) => s.window);
  const speed = useTimelineStore((s) => s.speed);
  const mode = useTimelineStore((s) => s.mode);
  const arcs = useTimelineStore((s) => s.arcs);
  const clade = useTimelineStore((s) => s.clade);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const bounds = useTimelineStore((s) => s.bounds);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const setWindow = useTimelineStore((s) => s.setWindow);
  const setSpeed = useTimelineStore((s) => s.setSpeed);
  const setMode = useTimelineStore((s) => s.setMode);
  const setArcs = useTimelineStore((s) => s.setArcs);
  const setClade = useTimelineStore((s) => s.setClade);
  const setIsPlaying = useTimelineStore((s) => s.setIsPlaying);
  const reducedMotion = useUiStore((s) => s.reducedMotion);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragKind | null>(null);
  const windowAnchorRef = useRef<number>(0);
  const [flashingMode, setFlashingMode] = useState<PlayMode | null>(null);

  const flashMode = useCallback((m: PlayMode) => {
    setFlashingMode(m);
    const tid = setTimeout(() => setFlashingMode(null), 400);
    return tid;
  }, []);

  const getTrackRect = useCallback((): DOMRect | null => {
    return trackRef.current?.getBoundingClientRect() ?? null;
  }, []);

  const handleTrackMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!bounds) return;
      const rect = getTrackRect();
      if (!rect) return;

      if (e.shiftKey) {
        const frac = positionFraction(e.clientX, rect);
        const t = fractionToTime(frac, bounds.min, bounds.max);
        windowAnchorRef.current = t;
        dragRef.current = 'window-define';
        setWindow({ start: t, end: t });
        setPlayhead(t);
        setMode('Window');
        flashMode('Window');
        e.preventDefault();
        return;
      }

      dragRef.current = 'scrubber';
      const frac = positionFraction(e.clientX, rect);
      setPlayhead(fractionToTime(frac, bounds.min, bounds.max));
      e.preventDefault();
    },
    [bounds, getTrackRect, setPlayhead, setWindow, setMode, flashMode],
  );

  // The window band's left edge is a resize handle: dragging it moves the
  // window's start while the right edge stays pinned to the playhead.
  const handleWindowLeftMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    dragRef.current = 'window-left';
    e.preventDefault();
  }, []);

  const handleTrackDoubleClick = useCallback(() => {
    if (!bounds) return;
    setPlayhead(bounds.min);
  }, [bounds, setPlayhead]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const kind = dragRef.current;
      if (!kind || !bounds) return;
      const rect = getTrackRect();
      if (!rect) return;

      const frac = positionFraction(e.clientX, rect);
      const t = fractionToTime(frac, bounds.min, bounds.max);

      if (kind === 'scrubber') {
        setPlayhead(t);
      } else if (kind === 'window-define') {
        const anchor = windowAnchorRef.current;
        const end = Math.max(anchor, t);
        setWindow({ start: Math.min(anchor, t), end });
        setPlayhead(end);
      } else if (kind === 'window-left' && window) {
        // Unclamped fraction — the window start may be dragged before
        // bounds.min so the trailing window keeps its width near t=0 instead
        // of snapping to the start.
        const rawT = fractionToTime((e.clientX - rect.left) / rect.width, bounds.min, bounds.max);
        setWindow({ start: Math.min(rawT, window.end), end: window.end });
      }
    };

    const onMouseUp = () => {
      dragRef.current = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [bounds, window, getTrackRect, setPlayhead, setWindow]);

  const handleJumpStart = useCallback(() => {
    if (bounds) setPlayhead(bounds.min);
  }, [bounds, setPlayhead]);

  const handleJumpEnd = useCallback(() => {
    if (bounds) setPlayhead(bounds.max);
  }, [bounds, setPlayhead]);

  const handlePlayPause = useCallback(() => {
    if (reducedMotion) return;
    setIsPlaying(!isPlaying);
  }, [isPlaying, reducedMotion, setIsPlaying]);

  useEffect(() => {
    if (reducedMotion && isPlaying) setIsPlaying(false);
  }, [isPlaying, reducedMotion, setIsPlaying]);

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSpeed(Number(e.target.value));
    },
    [setSpeed],
  );

  const handleModeClick = useCallback(
    (m: PlayMode) => {
      setMode(m);
      flashMode(m);
      if (m === 'Window' && window === null && bounds !== null) {
        const w = DEFAULT_WINDOW_FRACTION * (bounds.max - bounds.min);
        setWindow({ start: playhead - w, end: playhead });
      }
    },
    [setMode, flashMode, window, bounds, playhead, setWindow],
  );

  const handleArcsToggle = useCallback(() => {
    setArcs(!arcs);
  }, [arcs, setArcs]);

  const handleCladeToggle = useCallback(() => {
    setClade(!clade);
  }, [clade, setClade]);

  if (!bounds) {
    return (
      <div className={styles.strip} data-testid="timeline-strip">
        <div className={styles.empty} />
      </div>
    );
  }

  // During Window-mode tail-off the playhead value is allowed to exceed
  // bounds.max (so the window's left edge can sweep through to bounds.max).
  // The visible marker still pins to the right edge of the track — the
  // value advances but the indicator stays at 100 %.
  const playheadFrac = Math.min(1, timeToFraction(playhead, bounds.min, bounds.max));
  // windowLeftFrac may go negative — a trailing window near t=0 reaches before
  // bounds.min. The band rides the separator line and the strip clips it, so
  // that surplus reads as a thin line over the transport buttons.
  const windowLeftFrac =
    window != null ? timeToFraction(window.start, bounds.min, bounds.max) : null;
  const windowRightFrac =
    window != null ? timeToFraction(window.end, bounds.min, bounds.max) : null;

  const isoReadout = decimalYearToISO(playhead);
  const windowStartReadout = window ? decimalYearToISO(window.start) : null;

  return (
    <div className={styles.strip} data-testid="timeline-strip">
      <div className={styles.row1}>
        <div className={styles.transport}>
          <button
            type="button"
            className={styles.transportBtn}
            onClick={handleJumpStart}
            aria-label="Jump to start"
            data-testid="btn-jump-start"
          >
            <SkipBack size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={[styles.transportBtn, styles.playBtn].join(' ')}
            onClick={handlePlayPause}
            aria-label={
              reducedMotion
                ? 'Automatic playback disabled by Reduced motion'
                : isPlaying
                  ? 'Pause'
                  : 'Play'
            }
            title={reducedMotion ? 'Automatic playback is disabled by Reduced motion' : undefined}
            disabled={reducedMotion}
            data-testid="btn-play"
          >
            {isPlaying ? (
              <Pause size={18} aria-hidden="true" />
            ) : (
              <Play size={18} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={styles.transportBtn}
            onClick={handleJumpEnd}
            aria-label="Jump to end"
            data-testid="btn-jump-end"
          >
            <SkipForward size={15} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.sliderArea}>
          {mode === 'Window' && windowLeftFrac != null && windowRightFrac != null && (
            <div
              className={styles.windowRegion}
              style={{
                left: `${windowLeftFrac * 100}%`,
                width: `${(windowRightFrac - windowLeftFrac) * 100}%`,
              }}
              data-testid="window-region"
            />
          )}
          <div
            ref={trackRef}
            className={styles.track}
            role="slider"
            aria-label="Playhead"
            aria-valuemin={bounds.min}
            aria-valuemax={bounds.max}
            aria-valuenow={playhead}
            tabIndex={0}
            onMouseDown={handleTrackMouseDown}
            onDoubleClick={handleTrackDoubleClick}
            data-testid="timeline-track"
          >
            <div
              className={styles.scrubberDot}
              style={{ left: `${playheadFrac * 100}%` }}
              data-testid="scrubber-dot"
            />
          </div>
          {mode === 'Window' && window != null && windowLeftFrac != null && (
            <div
              className={styles.windowHandle}
              style={{ left: `${windowLeftFrac * 100}%` }}
              role="slider"
              aria-label="Window start"
              aria-valuemin={bounds.min}
              aria-valuemax={playhead}
              aria-valuenow={window.start}
              tabIndex={0}
              onMouseDown={handleWindowLeftMouseDown}
              data-testid="window-handle"
              title={windowStartReadout ?? undefined}
            >
              {windowStartReadout && (
                <span className={styles.windowStartTooltip} data-testid="window-start-tooltip">
                  {windowStartReadout}
                </span>
              )}
            </div>
          )}
        </div>

        <select
          className={styles.speedSelect}
          value={speed}
          onChange={handleSpeedChange}
          aria-label="Playback speed"
          data-testid="speed-select"
        >
          {PLAYBACK_SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row2}>
        <div className={styles.controls}>
          <div className={styles.modePills}>
            {MODES.map((m) => {
              const isModeActive = mode === m;
              const isFlashing = flashingMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  className={[
                    styles.modePill,
                    isModeActive ? styles.modePillActive : '',
                    isFlashing ? styles.modePillFlash : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleModeClick(m)}
                  aria-pressed={isModeActive}
                  data-testid={`mode-pill-${m.toLowerCase()}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
          <span className={styles.modeDivider} aria-hidden="true" />
          <div className={styles.toggles}>
            <button
              type="button"
              className={[styles.modePill, arcs ? styles.modePillActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={handleArcsToggle}
              aria-pressed={arcs}
              data-testid="toggle-arcs"
            >
              Arcs
            </button>
            <button
              type="button"
              className={[styles.modePill, clade ? styles.modePillActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={handleCladeToggle}
              aria-pressed={clade}
              title="Limit playback to selected clades. Shift-click adds clades; hold Shift to preview the full tree."
              data-testid="toggle-clade"
            >
              Clade
            </button>
          </div>
        </div>
        <div className={styles.readout} data-testid="playhead-readout">
          {isoReadout}
        </div>
      </div>
    </div>
  );
}
