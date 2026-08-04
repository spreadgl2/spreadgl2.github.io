import { decimalYearToISO } from '../../lib/format/decimal-year';
import { useSelectionStore } from '../../store/selection';
import { useTreeStore } from '../../store/tree';
import styles from './HoverTooltip.module.css';

interface HoverTooltipProps {
  mouseX: number;
  mouseY: number;
}

export function HoverTooltip({ mouseX, mouseY }: HoverTooltipProps) {
  const hoveredId = useSelectionStore((s) => s.hoveredId);
  const graph = useTreeStore((s) => s.graph);
  const branchTable = useTreeStore((s) => s.branchTable);
  const traitInfo = useTreeStore((s) => s.traitInfo);

  if (!hoveredId || !graph) return null;

  const idx = graph.origIdToIdx.get(hoveredId);
  if (idx === undefined) return null;

  const node = graph.nodes[idx];
  if (!node) return null;

  const dateISO =
    branchTable && branchTable.endTime[idx] !== undefined
      ? decimalYearToISO(branchTable.endTime[idx] as number)
      : null;

  const posterior =
    branchTable?.posterior && branchTable.posterior[idx] !== undefined
      ? (branchTable.posterior[idx] as number).toFixed(2)
      : null;

  let location: string | null = null;
  if (traitInfo && traitInfo.kind === 'discrete') {
    const val = node.annotations[traitInfo.key];
    if (typeof val === 'string' || typeof val === 'number') {
      location = String(val);
    }
  } else if (traitInfo && traitInfo.kind === 'continuous') {
    const lat = node.annotations[traitInfo.keyFamily.lat];
    const lon = node.annotations[traitInfo.keyFamily.lon];
    if (
      typeof lat === 'number' &&
      Number.isFinite(lat) &&
      typeof lon === 'number' &&
      Number.isFinite(lon)
    ) {
      location = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    }
  }

  const line2Parts: string[] = [];
  if (dateISO) line2Parts.push(dateISO);
  if (location) line2Parts.push(location);

  const line3Parts: string[] = [];
  if (posterior) line3Parts.push(`posterior ${posterior}`);

  return (
    <div
      data-testid="hover-tooltip"
      className={styles.tooltip}
      style={{ left: mouseX + 14, top: mouseY + 14 }}
    >
      <div className={styles.taxon}>{node.name ?? node.origId}</div>
      {line2Parts.length > 0 && <div className={styles.line}>{line2Parts.join(' · ')}</div>}
      {line3Parts.length > 0 && <div className={styles.line}>{line3Parts.join(' · ')}</div>}
    </div>
  );
}
