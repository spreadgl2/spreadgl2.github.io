import type { TipDateRow } from '../lib/format/tip-date-table';
import { rebuildBranchTable } from '../lib/tree-render/rebuild';
import { useTimelineStore } from './timeline';
import { useTreeStore } from './tree';

const PRE_TMRCA_BUFFER = 0.01;
const POST_SAMPLE_BUFFER = 0.01;

function updateTimelineBounds(branchTable: ReturnType<typeof rebuildBranchTable>): void {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < branchTable.count; i++) {
    const start = branchTable.startTime[i] ?? Infinity;
    const end = branchTable.endTime[i] ?? -Infinity;
    if (start < min) min = start;
    if (end > max) max = end;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return;
  const timeline = useTimelineStore.getState();
  timeline.setBounds({ min: min - PRE_TMRCA_BUFFER, max: max + POST_SAMPLE_BUFFER });
  timeline.setPlayhead(min - PRE_TMRCA_BUFFER);
}

export function rebuildDatesFromRows(rows: TipDateRow[]): void {
  const st = useTreeStore.getState();
  if (!st.graph || !st.layout || !st.traitInfo) return;

  for (const row of rows) {
    const idx = st.graph.origIdToIdx.get(row.nodeId);
    const node = idx === undefined ? undefined : st.graph.nodes[idx];
    if (!node) continue;
    if (row.decimalYear === null || !Number.isFinite(row.decimalYear)) {
      delete node.annotations.date;
    } else {
      node.annotations.date = String(row.decimalYear);
    }
  }

  const branchTable = rebuildBranchTable(
    st.graph,
    st.layout,
    st.traitInfo,
    st.discreteGeoLookup ?? undefined,
  );
  st.setTipDateRows(rows);
  st.setBranchTable(branchTable);
  updateTimelineBounds(branchTable);
}
