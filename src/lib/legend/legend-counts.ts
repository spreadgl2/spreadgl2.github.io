import { buildSubtreeBranchIdsForRoots } from '../phylo/slice';
import type { BranchTable, Layout, PhyloGraph } from '../phylo/types';
import { computeFocusedLineageNodeIds } from '../tree-render/focused-lineage';

export interface StateCount {
  total: number;
  shown: number;
}

export interface LegendCounts {
  /** Per trait-value tip counts, keyed by the colour-trait value. */
  perValue: Map<string, StateCount>;
  /** Total terminal tips carrying a value for the colour trait. */
  total: number;
  /** Tips still included after the persistent filters. */
  shown: number;
  /** True when a filter excludes at least one tip (`shown < total`). */
  filtered: boolean;
}

export interface LegendCountInput {
  graph: PhyloGraph;
  layout: Layout;
  branchTable: BranchTable;
  /**
   * The discrete colour-trait key for per-state counts, or `null` for a
   * continuous/gradient legend — then only the overall total/shown are counted
   * (no per-value breakdown, and legend deselection doesn't apply).
   */
  colorByKey: string | null;
  deselectedValues: ReadonlySet<string>;
  focusedTaxa: string[];
  subtreeRootIds?: readonly string[];
  subtreeRootId: string | null;
  clade: boolean;
}

/**
 * Terminal-tip counts per state for the discrete colour trait.
 *
 * `shown` reflects the working-set filters — legend deselection, focused taxa,
 * and the clade subtree — i.e. which *tips* you're looking at. It deliberately
 * excludes:
 *  - playback/temporal state (playhead, Trail/Window), so counts stay stable
 *    during animation, and
 *  - the posterior threshold, which is a display/confidence filter on branches:
 *    a tip is observed data with support 1, so filtering by clade support never
 *    removes a tip from the count (only the branch to a low-support parent may
 *    dim in the tree).
 */
export function computeLegendCounts(input: LegendCountInput): LegendCounts {
  const {
    graph,
    layout,
    branchTable,
    colorByKey,
    deselectedValues,
    focusedTaxa,
    subtreeRootIds = [],
    subtreeRootId,
    clade,
  } = input;

  const focusedLineage =
    focusedTaxa.length > 0 ? computeFocusedLineageNodeIds(layout, focusedTaxa) : null;
  const selectedSubtreeRootIds =
    subtreeRootIds.length > 0 ? subtreeRootIds : subtreeRootId !== null ? [subtreeRootId] : [];
  const subtreeBranchIds =
    clade && selectedSubtreeRootIds.length > 0
      ? buildSubtreeBranchIdsForRoots(graph, layout, selectedSubtreeRootIds)
      : null;

  const perValue = new Map<string, StateCount>();
  let total = 0;
  let shown = 0;

  // A single tip can occupy several branch rows: a posterior MAP tie ("A+B") on
  // the tip or its parent emits one row per state combination. Count each tip
  // once (by branchId) so ties don't inflate the totals.
  const countedTips = new Set<number>();

  for (let i = 0; i < branchTable.count; i++) {
    if (branchTable.isInternal[i]) continue; // terminal tips only
    const branchId = branchTable.branchId[i] ?? i;
    if (countedTips.has(branchId)) continue;
    countedTips.add(branchId);
    const node = graph.nodes[branchId];
    if (!node) continue;

    // Discrete legend: only tips carrying a value for the colour trait count.
    // Continuous/gradient legend (colorByKey === null): every terminal tip counts.
    let value: string | null = null;
    if (colorByKey !== null) {
      const v = node.annotations[colorByKey];
      if (typeof v !== 'string') continue;
      value = v;
    }
    total += 1;

    let entry: StateCount | undefined;
    if (value !== null) {
      entry = perValue.get(value);
      if (!entry) {
        entry = { total: 0, shown: 0 };
        perValue.set(value, entry);
      }
      entry.total += 1;
    }

    let isShown = value === null || !deselectedValues.has(value);
    if (isShown && focusedLineage && !focusedLineage.has(node.origId)) isShown = false;
    if (isShown && subtreeBranchIds && !subtreeBranchIds.has(branchId)) isShown = false;

    if (isShown) {
      shown += 1;
      if (entry) entry.shown += 1;
    }
  }

  return { perValue, total, shown, filtered: shown < total };
}
