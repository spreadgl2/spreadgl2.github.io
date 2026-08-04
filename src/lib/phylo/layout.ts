/**
 * Adapted from peartree (MIT), Copyright (c) 2026 Andrew Rambaut.
 * Source: pearcore/peartree/js/treeutils.js:1–425 ("computeLayoutFromGraph")
 * https://github.com/artic-network/peartree
 *
 * Adapted to strict TypeScript and extended for SpreadGL2 display controls.
 */

import type { Layout, LayoutNode, PhyloGraph, PhyloNode } from './types.js';

// Internal entry type used during DFS — richer than LayoutNode for mid-pass bookkeeping.
interface LayoutEntry extends LayoutNode {
  collapsedMaxX: number;
  hasHiddenChildren: boolean;
}

function _countVisibleTips(
  gnodes: PhyloNode[],
  hiddenNodeIds: Set<string>,
  nodeIdx: number,
  fromIdx: number,
): number {
  let count = 0;
  const stack: { ni: number; fi: number }[] = [{ ni: nodeIdx, fi: fromIdx }];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) continue;
    const { ni, fi } = item;
    const gnode = gnodes[ni];
    if (gnode === undefined) continue;
    if (hiddenNodeIds.has(gnode.origId)) continue;
    const children = gnode.adjacents.filter((a) => a !== fi);
    if (children.length === 0) {
      count++;
    } else {
      for (const c of children) stack.push({ ni: c, fi: ni });
    }
  }
  return count;
}

function _findEffectiveRoot(
  gnodes: PhyloNode[],
  hiddenNodeIds: Set<string>,
  startIdx: number,
  fromIdx: number,
): { nodeIdx: number; fromIdx: number } {
  let curIdx = startIdx;
  let curFrom = fromIdx;
  for (;;) {
    const gnode = gnodes[curIdx];
    if (gnode === undefined) return { nodeIdx: curIdx, fromIdx: curFrom };
    const visChildren = gnode.adjacents.filter((adjIdx) => {
      if (adjIdx === curFrom) return false;
      const childOrigId = gnodes[adjIdx]?.origId;
      if (childOrigId === undefined) return false;
      if (hiddenNodeIds.has(childOrigId)) return false;
      return _countVisibleTips(gnodes, hiddenNodeIds, adjIdx, curIdx) > 0;
    });
    if (visChildren.length !== 1) return { nodeIdx: curIdx, fromIdx: curFrom };
    curFrom = curIdx;
    curIdx = visChildren[0] as number;
  }
}

function _subtreeMaxX(
  gnodes: PhyloNode[],
  hiddenNodeIds: Set<string>,
  collapsedCladeIds: Map<string, { colour: string | null; tipCount: number }>,
  startIdx: number,
  fromIdx: number,
  startXFromRoot: number,
  clampNeg: boolean,
): number {
  let maxX = startXFromRoot;
  const stack: { ni: number; fi: number; x: number }[] = [
    { ni: startIdx, fi: fromIdx, x: startXFromRoot },
  ];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) continue;
    const { ni, fi, x } = item;
    const gnode = gnodes[ni];
    if (gnode === undefined) continue;
    const children = gnode.adjacents
      .map((adjIdx, i) => ({ adjIdx, len: gnode.lengths[i] ?? 0 }))
      .filter(({ adjIdx }) => adjIdx !== fi);
    if (children.length === 0) {
      if (x > maxX) maxX = x;
    } else {
      for (const { adjIdx, len } of children) {
        const childOrigId = gnodes[adjIdx]?.origId;
        if (childOrigId === undefined) continue;
        if (hiddenNodeIds.has(childOrigId)) continue;
        const nextX = x + (clampNeg ? Math.max(0, len) : len);
        if (nextX > maxX) maxX = nextX;
        if (!collapsedCladeIds.has(childOrigId)) {
          stack.push({ ni: adjIdx, fi: ni, x: nextX });
        }
      }
    }
  }
  return maxX;
}

function _subtreeTipCount(
  gnodes: PhyloNode[],
  hiddenNodeIds: Set<string>,
  collapsedCladeIds: Map<string, { colour: string | null; tipCount: number }>,
  startIdx: number,
  fromIdx: number,
): number {
  let count = 0;
  const stack: { ni: number; fi: number }[] = [{ ni: startIdx, fi: fromIdx }];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) continue;
    const { ni, fi } = item;
    const gnode = gnodes[ni];
    if (gnode === undefined) continue;
    const children = gnode.adjacents.filter((a) => a !== fi);
    const visChildren = children.filter((a) => {
      const origId = gnodes[a]?.origId;
      return origId !== undefined && !hiddenNodeIds.has(origId);
    });
    if (visChildren.length === 0) {
      count++;
    } else {
      for (const a of visChildren) {
        const origId = gnodes[a]?.origId;
        if (origId === undefined) continue;
        if (collapsedCladeIds.has(origId)) {
          count += collapsedCladeIds.get(origId)?.tipCount ?? 1;
        } else {
          stack.push({ ni: a, fi: ni });
        }
      }
    }
  }
  return count;
}

export function computeLayoutFromGraph(
  graph: PhyloGraph,
  subtreeRootId: string | null = null,
  options: {
    clampNegativeBranches?: boolean;
    collapsedCladeHeightN?: number;
    /**
     * Ladderize children by subtree tip count.
     * 'asc'  = smaller clades drawn above larger (small-on-top).
     * 'desc' = larger clades drawn above smaller (large-on-top).
     * undefined / 'file' = preserve the parser's adjacency order.
     */
    sortBy?: 'asc' | 'desc' | 'file';
  } = {},
): Layout {
  const { nodes: gnodes, root } = graph;
  const { nodeA, nodeB, lenA, lenB } = root;
  const hiddenNodeIds = graph.hiddenNodeIds ?? new Set<string>();
  const collapsedCladeIds =
    graph.collapsedCladeIds ?? new Map<string, { colour: string | null; tipCount: number }>();
  const clampNeg = !!options.clampNegativeBranches;
  const collapsedHeightN =
    options.collapsedCladeHeightN != null ? Math.max(1, +options.collapsedCladeHeightN) : null;
  const sortBy = options.sortBy ?? 'file';

  let tipCounter = 0;
  const layoutNodes: LayoutEntry[] = [];
  const nodeMap = new Map<string, LayoutEntry>();

  function traverse(
    startNodeIdx: number,
    startFromNodeIdx: number,
    startXFromRoot: number,
    startParentLayoutId: string | null,
  ): void {
    const startLen = layoutNodes.length;

    const stack: {
      nodeIdx: number;
      fromNodeIdx: number;
      xFromRoot: number;
      parentLayoutId: string | null;
      collapsed?: boolean;
    }[] = [
      {
        nodeIdx: startNodeIdx,
        fromNodeIdx: startFromNodeIdx,
        xFromRoot: startXFromRoot,
        parentLayoutId: startParentLayoutId,
      },
    ];

    while (stack.length > 0) {
      const item = stack.pop();
      if (item === undefined) continue;
      const { nodeIdx, fromNodeIdx, xFromRoot, parentLayoutId, collapsed } = item;
      const gnode = gnodes[nodeIdx];
      if (gnode === undefined) continue;

      const entry: LayoutEntry = {
        id: gnode.origId,
        annotations: gnode.annotations,
        x: xFromRoot,
        y: 0,
        isTip: false,
        isCollapsed: false,
        collapsedTipCount: 0,
        collapsedMaxX: xFromRoot,
        hasHiddenChildren: false,
        parentId: parentLayoutId,
        children: [],
      };

      layoutNodes.push(entry);
      nodeMap.set(entry.id, entry);

      if (collapsed === true) {
        const info = collapsedCladeIds.get(gnode.origId);
        const realTipCount =
          info?.tipCount ??
          _subtreeTipCount(gnodes, hiddenNodeIds, collapsedCladeIds, nodeIdx, fromNodeIdx);
        const heightN =
          collapsedHeightN != null ? Math.min(collapsedHeightN, realTipCount) : realTipCount;
        const maxX = _subtreeMaxX(
          gnodes,
          hiddenNodeIds,
          collapsedCladeIds,
          nodeIdx,
          fromNodeIdx,
          xFromRoot,
          clampNeg,
        );
        entry.isCollapsed = true;
        entry.collapsedTipCount = heightN;
        entry.collapsedMaxX = maxX;
        entry.isTip = true;
        tipCounter += heightN;
        entry.y = tipCounter - (heightN - 1) / 2;
        continue;
      }

      const allChildren = gnode.adjacents
        .map((adjIdx, i) => ({ adjIdx, len: gnode.lengths[i] ?? 0 }))
        .filter(({ adjIdx }) => adjIdx !== fromNodeIdx);

      entry.isTip = allChildren.length === 0;
      if (entry.isTip) {
        tipCounter++;
        entry.y = tipCounter;
        entry.collapsedMaxX = xFromRoot;
      }

      const toPush: { adjIdx: number; len: number; collapsed?: boolean }[] = [];
      for (const { adjIdx, len } of allChildren) {
        const childOrigId = gnodes[adjIdx]?.origId;
        if (childOrigId === undefined) continue;
        if (hiddenNodeIds.has(childOrigId)) {
          entry.hasHiddenChildren = true;
        } else if (collapsedCladeIds.has(childOrigId)) {
          entry.children.push(childOrigId);
          toPush.push({ adjIdx, len, collapsed: true });
        } else {
          entry.children.push(childOrigId);
          toPush.push({ adjIdx, len });
        }
      }
      // Ladderize: order children by subtree tip count.
      // The push loop below iterates toPush from N-1 down to 0, so toPush[0]
      // ends up on TOP of the DFS stack and is processed FIRST. The first-
      // processed child gets the lowest tip-y values, i.e., drawn at the TOP
      // of the canvas. So toPush[0] = top-of-canvas clade.
      //   sortBy='asc'  → smallest tip count on top → sort indices ASCENDING
      //   sortBy='desc' → largest tip count on top  → sort indices DESCENDING
      if (sortBy === 'asc' || sortBy === 'desc') {
        const tipCounts = toPush.map((c) =>
          collapsedCladeIds.has(gnodes[c.adjIdx]?.origId ?? '')
            ? (collapsedCladeIds.get(gnodes[c.adjIdx]?.origId ?? '')?.tipCount ?? 1)
            : _subtreeTipCount(gnodes, hiddenNodeIds, collapsedCladeIds, c.adjIdx, nodeIdx),
        );
        const indices = toPush.map((_, i) => i);
        indices.sort((a, b) => {
          const ta = tipCounts[a] ?? 0;
          const tb = tipCounts[b] ?? 0;
          return sortBy === 'asc' ? ta - tb : tb - ta;
        });
        const reordered = indices
          .map((i) => toPush[i])
          .filter((x): x is NonNullable<typeof x> => x != null);
        toPush.length = 0;
        toPush.push(...reordered);
      }
      for (let j = toPush.length - 1; j >= 0; j--) {
        const child = toPush[j];
        if (child === undefined) continue;
        const { adjIdx, len, collapsed: childCollapsed } = child;
        stack.push({
          nodeIdx: adjIdx,
          fromNodeIdx: nodeIdx,
          xFromRoot: xFromRoot + (clampNeg ? Math.max(0, len) : len),
          parentLayoutId: gnode.origId,
          collapsed: childCollapsed === true,
        });
      }
    }

    for (let i = layoutNodes.length - 1; i >= startLen; i--) {
      const node = layoutNodes[i];
      if (node === undefined) continue;
      if (node.isTip || node.children.length === 0) continue;
      const childYs = node.children
        .map((cid) => nodeMap.get(cid)?.y)
        .filter((y): y is number => y != null);
      if (childYs.length > 0) {
        node.y = childYs.reduce((a, b) => a + b, 0) / childYs.length;
      }
    }
  }

  if (subtreeRootId !== null) {
    const nodeIdx = graph.origIdToIdx.get(subtreeRootId);
    if (nodeIdx !== undefined) {
      const gnode = gnodes[nodeIdx];
      const parentDir = gnode?.adjacents[0] ?? -1;
      traverse(nodeIdx, parentDir, 0, null);
    }
  } else if (lenA === 0) {
    const eff = hiddenNodeIds.size
      ? _findEffectiveRoot(gnodes, hiddenNodeIds, nodeA, -1)
      : { nodeIdx: nodeA, fromIdx: -1 };
    traverse(eff.nodeIdx, eff.fromIdx, 0, null);
  } else {
    const tipsA = hiddenNodeIds.size ? _countVisibleTips(gnodes, hiddenNodeIds, nodeA, nodeB) : 1;
    const tipsB = hiddenNodeIds.size ? _countVisibleTips(gnodes, hiddenNodeIds, nodeB, nodeA) : 1;

    if (tipsA > 0 && tipsB > 0) {
      const ROOT_LAYOUT_ID = '__graph_root__';
      const gNodeA = gnodes[nodeA];
      const gNodeB = gnodes[nodeB];

      if (gNodeA !== undefined && !hiddenNodeIds.has(gNodeA.origId)) {
        traverse(nodeA, nodeB, lenA, ROOT_LAYOUT_ID);
      }
      if (gNodeB !== undefined && !hiddenNodeIds.has(gNodeB.origId)) {
        traverse(nodeB, nodeA, lenB, ROOT_LAYOUT_ID);
      }

      const aEntry = gNodeA !== undefined ? nodeMap.get(gNodeA.origId) : undefined;
      const bEntry = gNodeB !== undefined ? nodeMap.get(gNodeB.origId) : undefined;
      const rootChildren: string[] = [];
      if (aEntry !== undefined && gNodeA !== undefined) rootChildren.push(gNodeA.origId);
      if (bEntry !== undefined && gNodeB !== undefined) rootChildren.push(gNodeB.origId);
      const rootY =
        aEntry !== undefined && bEntry !== undefined
          ? (aEntry.y + bEntry.y) / 2
          : aEntry !== undefined
            ? aEntry.y
            : bEntry !== undefined
              ? bEntry.y
              : 1;

      const rootEntry: LayoutEntry = {
        id: ROOT_LAYOUT_ID,
        annotations: root.annotations ?? {},
        x: 0,
        y: rootY,
        isTip: rootChildren.length === 0,
        isCollapsed: false,
        collapsedTipCount: 0,
        collapsedMaxX: 0,
        hasHiddenChildren:
          (gNodeA !== undefined && hiddenNodeIds.has(gNodeA.origId)) ||
          (gNodeB !== undefined && hiddenNodeIds.has(gNodeB.origId)),
        children: rootChildren,
        parentId: null,
      };
      if (rootEntry.isTip) {
        tipCounter++;
        rootEntry.y = tipCounter;
      }
      layoutNodes.unshift(rootEntry);
      nodeMap.set(ROOT_LAYOUT_ID, rootEntry);
    } else {
      const startIdx = tipsA > 0 ? nodeA : nodeB;
      const startFrom = tipsA > 0 ? nodeB : nodeA;
      const eff = _findEffectiveRoot(gnodes, hiddenNodeIds, startIdx, startFrom);
      traverse(eff.nodeIdx, eff.fromIdx, 0, null);
    }
  }

  // Post-pass: suppress single-child non-root internal nodes.
  const toRemove = new Set<string>();
  for (let i = layoutNodes.length - 1; i >= 0; i--) {
    const node = layoutNodes[i];
    if (node === undefined) continue;
    if (node.parentId === null) continue;
    if (node.isTip) continue;
    if (node.children.length === 0) {
      const parentNode = nodeMap.get(node.parentId);
      if (parentNode !== undefined) {
        parentNode.hasHiddenChildren = true;
        const idx = parentNode.children.indexOf(node.id);
        if (idx !== -1) parentNode.children.splice(idx, 1);
      }
      toRemove.add(node.id);
      nodeMap.delete(node.id);
      continue;
    }
    if (node.children.length !== 1) continue;
    const parentNode = nodeMap.get(node.parentId);
    const childId = node.children[0];
    const childNode = childId !== undefined ? nodeMap.get(childId) : undefined;
    if (parentNode === undefined || childNode === undefined) continue;
    const idx = parentNode.children.indexOf(node.id);
    if (idx !== -1) parentNode.children[idx] = childNode.id;
    childNode.parentId = parentNode.id;
    if (node.hasHiddenChildren) childNode.hasHiddenChildren = true;
    toRemove.add(node.id);
    nodeMap.delete(node.id);
  }

  let finalNodes = layoutNodes.filter((n) => !toRemove.has(n.id));

  // Root-collapse pass: promote the first bifurcating ancestor if root has only one child.
  {
    const rootsToRemove = new Set<string>();
    let rootNode = finalNodes.find((n) => n.parentId === null);
    while (rootNode !== undefined && !rootNode.isTip && rootNode.children.length === 1) {
      const childId = rootNode.children[0];
      const childNode = childId !== undefined ? nodeMap.get(childId) : undefined;
      if (childNode === undefined) break;
      if (rootNode.hasHiddenChildren) childNode.hasHiddenChildren = true;
      childNode.parentId = null;
      rootsToRemove.add(rootNode.id);
      nodeMap.delete(rootNode.id);
      rootNode = childNode;
    }
    if (rootsToRemove.size > 0) {
      finalNodes = finalNodes.filter((n) => !rootsToRemove.has(n.id));
      const newRoot = finalNodes.find((n) => n.parentId === null);
      const newRootX = newRoot?.x ?? 0;
      if (newRootX !== 0) {
        for (const n of finalNodes) n.x -= newRootX;
      }
    }
  }

  // Recompute y positions bottom-up after suppression.
  for (let i = finalNodes.length - 1; i >= 0; i--) {
    const node = finalNodes[i];
    if (node === undefined) continue;
    if (node.isTip) continue;
    const childYs = node.children
      .map((cid) => nodeMap.get(cid)?.y)
      .filter((y): y is number => y != null);
    if (childYs.length > 0) {
      node.y = childYs.reduce((a, b) => a + b, 0) / childYs.length;
    }
  }

  const maxX = finalNodes.reduce((m, n) => Math.max(m, n.collapsedMaxX ?? n.x), 0);
  const maxY = tipCounter;

  // Cast away the internal-only fields before returning.
  const outNodes: LayoutNode[] = finalNodes;
  const outMap = nodeMap as unknown as Map<string, LayoutNode>;

  return { nodes: outNodes, nodeMap: outMap, maxX, maxY, xAxisMode: 'divergence' };
}
