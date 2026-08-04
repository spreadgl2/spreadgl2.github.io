import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { setPreference } from '../../lib/persist/preferences';
import { useUiStore } from '../../store/ui';
import { AnalysisPanel } from '../analysis/AnalysisPanel';
import { Header } from '../header/Header';
import { MultiTreeBanner } from '../loader/MultiTreeBanner';
import { Sidebar } from '../sidebar/Sidebar';
import { useTauriMenu } from '../tauri-menu/useTauriMenu';
import { TimelineStrip } from '../timeline/TimelineStrip';
import { useKeyboardTransport } from '../timeline/useKeyboardTransport';
import { Drawer } from './Drawer';
import { HoverTooltip } from './HoverTooltip';
import { KeyboardHelpModal } from './KeyboardHelpModal';
import styles from './Viewer.module.css';

const UnifiedDeckViewer = lazy(() =>
  import('./UnifiedDeckViewer').then((m) => ({ default: m.UnifiedDeckViewer })),
);

const MIN_ANALYSIS_HEIGHT = 120;
const MIN_WORKSPACE_HEIGHT = 160;
const TIMELINE_HEIGHT_PX = 56;

interface ViewerProps {
  onReplaceFile?: () => void;
}

export function Viewer({ onReplaceFile }: ViewerProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  useKeyboardTransport({ onHelp: () => setHelpOpen(true) });
  useTauriMenu({
    onHelp: () => setHelpOpen(true),
    ...(onReplaceFile ? { onOpenFile: onReplaceFile } : {}),
  });

  const setTreeSplitFraction = useUiStore((s) => s.setTreeSplitFraction);
  const analysisPanelHeight = useUiStore((s) => s.analysisPanelHeight);
  const setAnalysisPanelHeight = useUiStore((s) => s.setAnalysisPanelHeight);
  const visibleViews = useUiStore((s) => s.visibleViews);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const contentRowRef = useRef<HTMLDivElement>(null);
  const mainColumnRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const analysisDraggingRef = useRef(false);
  const mouseMoveRafRef = useRef<number | null>(null);
  const pendingMousePosRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    pendingMousePosRef.current = { x: e.clientX, y: e.clientY };
    if (mouseMoveRafRef.current !== null) return;
    mouseMoveRafRef.current = requestAnimationFrame(() => {
      mouseMoveRafRef.current = null;
      setMousePos(pendingMousePosRef.current);
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    pendingMousePosRef.current = null;
    if (mouseMoveRafRef.current !== null) {
      cancelAnimationFrame(mouseMoveRafRef.current);
      mouseMoveRafRef.current = null;
    }
    setMousePos(null);
  }, []);

  useEffect(
    () => () => {
      if (mouseMoveRafRef.current !== null) cancelAnimationFrame(mouseMoveRafRef.current);
    },
    [],
  );

  const onSplitterMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;

      const onMouseMove = (mv: MouseEvent) => {
        if (!draggingRef.current || !contentRowRef.current) return;
        const rect = contentRowRef.current.getBoundingClientRect();
        const relX = mv.clientX - rect.left;
        const clamped = Math.max(0.1, Math.min(0.9, relX / rect.width));
        setTreeSplitFraction(clamped);
        setPreference('treeSplitFraction', clamped);
      };

      const onMouseUp = () => {
        draggingRef.current = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [setTreeSplitFraction],
  );

  const onAnalysisSplitterMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      analysisDraggingRef.current = true;

      const onMouseMove = (mv: MouseEvent) => {
        if (!analysisDraggingRef.current || !mainColumnRef.current) return;
        const rect = mainColumnRef.current.getBoundingClientRect();
        const timelineRect = timelineContainerRef.current?.getBoundingClientRect();
        const timelineHeight =
          timelineRect && timelineRect.height > 0 ? timelineRect.height : TIMELINE_HEIGHT_PX;
        const requested = rect.bottom - timelineHeight - mv.clientY;
        const maxHeight = Math.max(
          MIN_ANALYSIS_HEIGHT,
          rect.height - timelineHeight - MIN_WORKSPACE_HEIGHT,
        );
        const clamped = Math.max(MIN_ANALYSIS_HEIGHT, Math.min(maxHeight, requested));
        setAnalysisPanelHeight(clamped);
        setPreference('analysisPanelHeight', clamped);
      };

      const onMouseUp = () => {
        analysisDraggingRef.current = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [setAnalysisPanelHeight],
  );

  const showDeckWorkspace = visibleViews.tree || visibleViews.map;

  return (
    <div
      role="application"
      aria-label="SpreadGL2 viewer"
      className={styles.root}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Header />
      <MultiTreeBanner />

      <div className={styles.body}>
        <Sidebar {...(onReplaceFile ? { onReplaceFile } : {})} />

        <div ref={mainColumnRef} className={styles.mainColumn} data-testid="main-column">
          <div className={styles.workspaceArea} data-testid="workspace-area">
            {showDeckWorkspace ? (
              <Suspense fallback={null}>
                <UnifiedDeckViewer
                  contentRowRef={contentRowRef}
                  onSplitterMouseDown={onSplitterMouseDown}
                  visibleViews={visibleViews}
                />
              </Suspense>
            ) : (
              <AnalysisPanel fill />
            )}
          </div>

          {visibleViews.analysis && showDeckWorkspace && (
            <>
              <button
                type="button"
                aria-label="Drag to resize analysis panel"
                data-testid="analysis-splitter"
                className={styles.analysisSplitter}
                onMouseDown={onAnalysisSplitterMouseDown}
              />
              <div
                className={styles.analysisContainer}
                data-testid="analysis-container"
                style={{ height: analysisPanelHeight }}
              >
                <AnalysisPanel />
              </div>
            </>
          )}

          <div
            ref={timelineContainerRef}
            data-testid="timeline-container"
            className={styles.timelineContainer}
          >
            <TimelineStrip />
          </div>
        </div>
      </div>

      <Drawer />
      {mousePos && <HoverTooltip mouseX={mousePos.x} mouseY={mousePos.y} />}
      {helpOpen && <KeyboardHelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
