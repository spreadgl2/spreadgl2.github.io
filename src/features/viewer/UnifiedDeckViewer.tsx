import type React from 'react';
import { useUiStore, type VisibleViews } from '../../store/ui';
import { UnifiedDeckSurface } from './UnifiedDeckSurface';

interface UnifiedDeckViewerProps {
  contentRowRef: React.MutableRefObject<HTMLDivElement | null>;
  onSplitterMouseDown: (e: React.MouseEvent) => void;
  visibleViews: VisibleViews;
}

export function UnifiedDeckViewer({
  contentRowRef,
  onSplitterMouseDown,
  visibleViews,
}: UnifiedDeckViewerProps) {
  const treeSplitFraction = useUiStore((s) => s.treeSplitFraction);

  return (
    <UnifiedDeckSurface
      contentRowRef={contentRowRef}
      treeSplitFraction={treeSplitFraction}
      onSplitterMouseDown={onSplitterMouseDown}
      visibleViews={visibleViews}
    />
  );
}
