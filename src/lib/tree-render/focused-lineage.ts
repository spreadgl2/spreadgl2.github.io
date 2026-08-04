import type { Layout } from '../phylo/types.js';

/**
 * Returns the set of node origIds that lie on the root→tip path for any of
 * the given focused tip IDs. An empty input yields an empty set.
 * Used to determine which nodes stay at full alpha when focusedTaxa is non-empty.
 */
export function computeFocusedLineageNodeIds(layout: Layout, focusedTaxa: string[]): Set<string> {
  if (focusedTaxa.length === 0) return new Set();

  const result = new Set<string>();
  const { nodeMap } = layout;

  for (const tipId of focusedTaxa) {
    let current = nodeMap.get(tipId);
    while (current) {
      result.add(current.id);
      if (current.parentId === null) break;
      current = nodeMap.get(current.parentId) ?? undefined;
    }
  }

  return result;
}
