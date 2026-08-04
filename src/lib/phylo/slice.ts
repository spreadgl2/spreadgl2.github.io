/** @original SpreadGL2 - subtree selection and animation time-slice indexes. */

import type { BranchTable, Layout, PhyloGraph, PlayMode, TimeWindow } from './types';

/**
 * BFS the subtree rooted at `rootOrigId` using directed parent→child links
 * (LayoutNode.children). Returns the set of PhyloGraph node indices in that
 * subtree, suitable for filtering branch-id sets.
 *
 * IMPORTANT: do NOT use PhyloGraph.adjacents for this — that field is
 * undirected (parent + children) and BFS through it from any node escapes
 * upward to the root and back down through siblings, visiting the entire
 * tree. That was the v0.2 Clade bug.
 */
export function buildSubtreeBranchIds(
  graph: PhyloGraph,
  layout: Layout,
  rootOrigId: string,
): Set<number> {
  if (!layout.nodeMap.has(rootOrigId)) return new Set();
  const visited = new Set<number>();
  const queue: string[] = [rootOrigId];
  while (queue.length > 0) {
    const curId = queue.pop();
    if (curId === undefined) continue;
    const idx = graph.origIdToIdx.get(curId);
    if (idx === undefined || visited.has(idx)) continue;
    visited.add(idx);
    const lnode = layout.nodeMap.get(curId);
    if (!lnode) continue;
    for (const childId of lnode.children) {
      const childIdx = graph.origIdToIdx.get(childId);
      if (childIdx !== undefined && !visited.has(childIdx)) queue.push(childId);
    }
  }
  return visited;
}

export function buildSubtreeBranchIdsForRoots(
  graph: PhyloGraph,
  layout: Layout,
  rootOrigIds: readonly string[],
): Set<number> {
  const result = new Set<number>();
  for (const rootOrigId of rootOrigIds) {
    for (const branchId of buildSubtreeBranchIds(graph, layout, rootOrigId)) {
      result.add(branchId);
    }
  }
  return result;
}

export interface TimeSliceIndexes {
  startTimeSorted: Int32Array;
  endTimeSorted: Int32Array;
}

export function buildTimeSliceIndexes(table: BranchTable): TimeSliceIndexes {
  const ids = Array.from({ length: table.count }, (_, i) => i);

  const startTimeSorted = Int32Array.from(
    ids.slice().sort((a, b) => (table.startTime[a] ?? 0) - (table.startTime[b] ?? 0)),
  );
  const endTimeSorted = Int32Array.from(
    ids.slice().sort((a, b) => (table.endTime[a] ?? 0) - (table.endTime[b] ?? 0)),
  );

  return { startTimeSorted, endTimeSorted };
}

function upperBound(sorted: Int32Array, values: Float32Array, threshold: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const id = sorted[mid];
    if (id !== undefined && (values[id] ?? 0) <= threshold) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export function branchesActiveAt(
  playhead: number,
  indexes: TimeSliceIndexes,
  table: BranchTable,
): Int32Array {
  const count = upperBound(indexes.startTimeSorted, table.startTime, playhead);
  return indexes.startTimeSorted.slice(0, count);
}

/**
 * Whether a branch is active at the playhead.
 *
 * - `cladeBranchIds` (passed only when the Clade toggle is on with a clade
 *   selected) restricts the active set to that subtree.
 * - Window mode keeps a trailing window of width `window`; Trail (and Window
 *   with no window seeded) shows everything up to the playhead.
 *
 * Arc-vs-line rendering is a separate display toggle and does not affect which
 * branches are active — the old strict-instant "Slice" set is just Window with
 * a near-zero window width.
 */
export function isActive(
  branch: { startTime: number; endTime: number; branchId: number },
  playhead: number,
  window: TimeWindow | null,
  mode: PlayMode,
  cladeBranchIds?: Set<number>,
): boolean {
  if (cladeBranchIds && !cladeBranchIds.has(branch.branchId)) return false;
  if (mode === 'Window' && window) {
    const w = window.end - window.start;
    return branch.startTime <= playhead && branch.endTime >= playhead - w;
  }
  return branch.startTime <= playhead;
}
