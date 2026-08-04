import { useEffect } from 'react';
import { useTimelineStore } from '../../store/timeline';
import { type ActivePanel, useUiStore } from '../../store/ui';
import { DEFAULT_WINDOW_FRACTION } from './window-config';

const SMALL_STEP_FRACTION = 0.01;
const LARGE_STEP_FRACTION = 0.1;
const WINDOW_RESIZE_FRACTION = 0.05;

interface Options {
  onHelp?: () => void;
}

export function useKeyboardTransport({ onHelp }: Options = {}) {
  const bounds = useTimelineStore((s) => s.bounds);
  const playhead = useTimelineStore((s) => s.playhead);
  const timeWindow = useTimelineStore((s) => s.window);
  const mode = useTimelineStore((s) => s.mode);
  const arcs = useTimelineStore((s) => s.arcs);
  const clade = useTimelineStore((s) => s.clade);
  const subtreeRootIds = useTimelineStore((s) => s.subtreeRootIds);
  const subtreeRootId = useTimelineStore((s) => s.subtreeRootId);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const setIsPlaying = useTimelineStore((s) => s.setIsPlaying);
  const setMode = useTimelineStore((s) => s.setMode);
  const setArcs = useTimelineStore((s) => s.setArcs);
  const setClade = useTimelineStore((s) => s.setClade);
  const setSubtreeRootIds = useTimelineStore((s) => s.setSubtreeRootIds);
  const setWindow = useTimelineStore((s) => s.setWindow);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      if (e.key === '/' && !inInput) {
        e.preventDefault();
        const { activePanel, setActivePanel } = useUiStore.getState();
        if (activePanel !== 'filter') setActivePanel('filter');
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLElement>('[data-testid="filter-search-input"]');
          input?.focus();
        });
        return;
      }

      if (inInput) return;

      if (e.key === '?' && onHelp) {
        e.preventDefault();
        onHelp();
        return;
      }

      if (e.key === 'Escape' && clade && (subtreeRootIds.length > 0 || subtreeRootId !== null)) {
        setSubtreeRootIds([]);
        return;
      }

      type PanelKey = Exclude<ActivePanel, null>;
      const PANEL_KEYS: Record<string, PanelKey> = {
        t: 'style',
        T: 'style',
        l: 'layers',
        L: 'layers',
        f: 'filter',
        F: 'filter',
        e: 'export',
        E: 'export',
        ',': 'settings',
      };
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key in PANEL_KEYS) {
        e.preventDefault();
        const panel = PANEL_KEYS[e.key] as PanelKey;
        const { activePanel, setActivePanel } = useUiStore.getState();
        setActivePanel(activePanel === panel ? null : panel);
        return;
      }

      if (!bounds) return;

      const range = bounds.max - bounds.min;

      switch (e.code) {
        case 'Space': {
          e.preventDefault();
          if (useUiStore.getState().reducedMotion) break;
          setIsPlaying(!isPlaying);
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const step = e.shiftKey ? LARGE_STEP_FRACTION * range : SMALL_STEP_FRACTION * range;
          setPlayhead(Math.max(bounds.min, playhead - step));
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          const step = e.shiftKey ? LARGE_STEP_FRACTION * range : SMALL_STEP_FRACTION * range;
          setPlayhead(Math.min(bounds.max, playhead + step));
          break;
        }
        case 'Home': {
          e.preventDefault();
          setPlayhead(bounds.min);
          break;
        }
        case 'End': {
          e.preventDefault();
          setPlayhead(bounds.max);
          break;
        }
        case 'Digit1': {
          e.preventDefault();
          setMode('Trail');
          break;
        }
        case 'Digit2': {
          e.preventDefault();
          setMode('Window');
          if (timeWindow === null) {
            const w = DEFAULT_WINDOW_FRACTION * range;
            setWindow({ start: playhead - w, end: playhead });
          }
          break;
        }
        case 'Digit3': {
          e.preventDefault();
          setArcs(!arcs);
          break;
        }
        case 'Digit4': {
          e.preventDefault();
          setClade(!clade);
          break;
        }
        case 'BracketLeft': {
          if (mode !== 'Window' || !timeWindow) break;
          e.preventDefault();
          const shrink = WINDOW_RESIZE_FRACTION * range;
          const w = timeWindow.end - timeWindow.start;
          const newW = Math.max(0, w - shrink);
          setWindow({ start: playhead - newW, end: playhead });
          break;
        }
        case 'BracketRight': {
          if (mode !== 'Window') break;
          e.preventDefault();
          const grow = WINDOW_RESIZE_FRACTION * range;
          const currentW = timeWindow ? timeWindow.end - timeWindow.start : 0;
          const newW2 = currentW + grow;
          setWindow({ start: playhead - newW2, end: playhead });
          break;
        }
      }
    };

    globalThis.window.addEventListener('keydown', handleKeyDown);
    return () => globalThis.window.removeEventListener('keydown', handleKeyDown);
  }, [
    bounds,
    playhead,
    timeWindow,
    mode,
    arcs,
    clade,
    subtreeRootIds,
    subtreeRootId,
    isPlaying,
    setPlayhead,
    setIsPlaying,
    setMode,
    setArcs,
    setClade,
    setSubtreeRootIds,
    setWindow,
    onHelp,
  ]);
}
