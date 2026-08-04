import { X } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { decimalYearToISO } from '../../lib/format/decimal-year';
import { useTreeStore } from '../../store/tree';
import type { PinnedSelection } from '../../store/ui';
import { useUiStore } from '../../store/ui';
import styles from './Inspector.module.css';

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

interface RowProps {
  label: string;
  value: string | number | null | undefined;
}

function Row({ label, value }: RowProps) {
  if (value === null || value === undefined) return null;
  return (
    <div className={styles.row}>
      <span className={styles.key}>{label}</span>
      <span className={styles.value}>{String(value)}</span>
    </div>
  );
}

interface InspectorPanelProps {
  sel: PinnedSelection;
  onClose: () => void;
  label: string;
  testId: string;
  closeTestId: string;
}

function InspectorPanel({ sel, onClose, label, testId, closeTestId }: InspectorPanelProps) {
  const graph = useTreeStore((s) => s.graph);
  const branchTable = useTreeStore((s) => s.branchTable);
  const nodeHpds = useTreeStore((s) => s.nodeHpds);
  const traitInfo = useTreeStore((s) => s.traitInfo);
  const [rawExpanded, setRawExpanded] = useState(false);

  const idx = sel.branchId;

  if (!graph) return null;
  const node = graph.nodes[idx];
  if (!node) return null;

  const bt = branchTable;
  const startTime = bt?.startTime[idx] !== undefined ? (bt.startTime[idx] as number) : null;
  const endTime = bt?.endTime[idx] !== undefined ? (bt.endTime[idx] as number) : null;
  const posterior =
    bt?.posterior && bt.posterior[idx] !== undefined ? (bt.posterior[idx] as number) : null;
  const endLat = bt?.endLat[idx] !== undefined ? (bt.endLat[idx] as number) : null;
  const endLon = bt?.endLon[idx] !== undefined ? (bt.endLon[idx] as number) : null;

  const branchLength =
    node.lengths.length > 0
      ? node.lengths.reduce((sum, l) => sum + l, 0) / node.lengths.length
      : null;

  const hpd = nodeHpds?.[idx] ?? null;
  const hpdVertexCount = hpd ? (hpd.coordinates[0]?.length ?? null) : null;

  let locationName: string | null = null;
  if (traitInfo?.kind === 'discrete') {
    const val = node.annotations[traitInfo.key];
    if (typeof val === 'string' || typeof val === 'number') locationName = String(val);
  }

  return (
    <aside
      aria-label={label}
      aria-live="polite"
      data-testid={testId}
      // Mark as a tree control so clicks on the inspector are not treated as
      // clicks on the tree canvas underneath (no branch selection fall-through).
      data-tree-control-root="true"
      className={styles.panel}
    >
      <div className={styles.header}>
        <span className={styles.headerTitle}>Inspector</span>
        <button
          type="button"
          aria-label="Close inspector"
          data-testid={closeTestId}
          className={styles.closeBtn}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div className={styles.body}>
        <Section title="Identity">
          <Row label="taxon" value={node.name ?? node.origId} />
          <Row label="branch ID" value={idx} />
          <Row label="posterior" value={posterior !== null ? posterior.toFixed(4) : null} />
        </Section>

        <Section title="Time">
          <Row label="start" value={startTime !== null ? decimalYearToISO(startTime) : null} />
          <Row label="end" value={endTime !== null ? decimalYearToISO(endTime) : null} />
          <Row label="start (decimal)" value={startTime !== null ? startTime.toFixed(4) : null} />
          <Row label="end (decimal)" value={endTime !== null ? endTime.toFixed(4) : null} />
        </Section>

        <Section title="Geography">
          <Row label="lat" value={endLat !== null ? endLat.toFixed(5) : null} />
          <Row label="lon" value={endLon !== null ? endLon.toFixed(5) : null} />
          {locationName && <Row label="location" value={locationName} />}
        </Section>

        <Section title="Inference">
          <Row label="HPD vertices" value={hpdVertexCount !== null ? hpdVertexCount : null} />
          <Row
            label="branch length"
            value={branchLength !== null ? branchLength.toFixed(6) : null}
          />
        </Section>

        <Section title="Raw">
          <button
            type="button"
            className={styles.rawToggle}
            onClick={() => setRawExpanded((v) => !v)}
            data-testid={`${testId}-raw-toggle`}
          >
            {rawExpanded ? 'collapse' : 'expand'}
          </button>
          {rawExpanded && (
            <pre className={styles.rawPre} data-testid={`${testId}-raw`}>
              {JSON.stringify(node.annotations, null, 2)}
            </pre>
          )}
        </Section>
      </div>
    </aside>
  );
}

interface InspectorProps {
  source: 'tree' | 'map';
}

export const Inspector = memo(function Inspector({ source }: InspectorProps) {
  const pinnedSelection = useUiStore((s) => s.pinnedSelection);
  const setPinnedSelection = useUiStore((s) => s.setPinnedSelection);
  const compareSelection = useUiStore((s) => s.compareSelection);
  const setCompareSelection = useUiStore((s) => s.setCompareSelection);
  const containerRef = useRef<HTMLDivElement>(null);

  const pinnedVisible = pinnedSelection !== null && pinnedSelection.source === source;
  const compareVisible = compareSelection !== null && compareSelection.source === source;
  const isVisible = pinnedVisible || compareVisible;

  useEffect(() => {
    if (!isVisible) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPinnedSelection(null);
        setCompareSelection(null);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVisible, setPinnedSelection, setCompareSelection]);

  useEffect(() => {
    if (!isVisible) return;

    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPinnedSelection(null);
        setCompareSelection(null);
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isVisible, setPinnedSelection, setCompareSelection]);

  const pinned = pinnedVisible ? pinnedSelection : null;
  const compare = compareVisible ? compareSelection : null;

  if (pinned === null && compare === null) return null;

  if (pinned !== null && compare !== null) {
    return (
      <div
        ref={containerRef}
        data-testid="inspector-compare-container"
        className={styles.compareContainer}
      >
        <InspectorPanel
          sel={pinned}
          onClose={() => setPinnedSelection(null)}
          label="Pinned inspector"
          testId="inspector"
          closeTestId="inspector-close"
        />
        <InspectorPanel
          sel={compare}
          onClose={() => setCompareSelection(null)}
          label="Compare inspector"
          testId="inspector-compare"
          closeTestId="inspector-compare-close"
        />
      </div>
    );
  }

  const singleSel = pinned ?? compare;
  if (singleSel === null) return null;

  const onClose =
    pinned !== null ? () => setPinnedSelection(null) : () => setCompareSelection(null);
  const testId = pinned !== null ? 'inspector' : 'inspector-compare';
  const closeTestId = pinned !== null ? 'inspector-close' : 'inspector-compare-close';
  const label = pinned !== null ? 'Pinned inspector' : 'Compare inspector';

  return (
    <div ref={containerRef}>
      <InspectorPanel
        sel={singleSel}
        onClose={onClose}
        label={label}
        testId={testId}
        closeTestId={closeTestId}
      />
    </div>
  );
});

export function usePinnedSelectionSetter() {
  const setPinnedSelection = useUiStore((s) => s.setPinnedSelection);
  return (sel: PinnedSelection | null) => setPinnedSelection(sel);
}
