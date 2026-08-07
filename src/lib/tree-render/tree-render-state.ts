import { useSelectionStore } from '../../store/selection';
import { type TimeWindow, useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { buildGlyphByValue } from '../glyph-map';
import { buildSubtreeBranchIdsForRoots, isActive } from '../phylo/slice';
import { computeFocusedLineageNodeIds } from './focused-lineage';
import type { TipGlyph } from './glyphs';
import { paletteColorFor } from './palettes';

export interface TreeRenderState {
  nodeColorById: Map<string, string> | undefined;
  nodeGlyphById: Map<string, TipGlyph> | undefined;
  dimmedNodeIds: Set<string> | undefined;
  // Dim set for tip glyphs — everything in dimmedNodeIds except posterior-only
  // dimming, so a tip stays visible when its (uncertain) parent branch dims.
  dimmedTipIds: Set<string> | undefined;
  focusedLineageNodeIds: Set<string>;
}

export interface NodeAppearance {
  nodeColorById: Map<string, string> | undefined;
  nodeGlyphById: Map<string, TipGlyph> | undefined;
}

// Computes the stable color and glyph maps — no playhead dependency.
// Called when colorByKey / glyphByKey / palette / traitInfo / graph changes,
// NOT on every playhead tick. Kept separate so the per-frame dim path doesn't
// invalidate the 35k-entry color map.
export function computeNodeAppearance(): NodeAppearance {
  const { graph, traitInfo, allDiscreteKeys, branchTable } = useTreeStore.getState();
  const { colorByKey, glyphByKey, palette, paletteReverse } = useUiStore.getState();
  const { bounds: storeBounds } = useTimelineStore.getState();

  let nodeColorById: Map<string, string> | undefined;

  if (colorByKey !== 'single-color' && graph && traitInfo) {
    if (
      traitInfo.kind === 'continuous' &&
      colorByKey === '__time__' &&
      branchTable &&
      storeBounds
    ) {
      const range = storeBounds.max - storeBounds.min;
      const map = new Map<string, string>();
      for (let i = 0; i < branchTable.count; i++) {
        const id = branchTable.branchId[i] ?? i;
        const node = graph.nodes[id];
        if (!node) continue;
        const endTime = branchTable.endTime[i] ?? 0;
        const t = range > 0 ? (endTime - storeBounds.min) / range : 0;
        const hex = paletteColorFor(Math.max(0, Math.min(1, t)), null, palette, paletteReverse);
        map.set(node.origId, hex);
      }
      if (map.size > 0) nodeColorById = map;
    } else if (traitInfo.kind === 'discrete') {
      const annotKey =
        colorByKey !== 'single-color' && colorByKey !== '__time__' ? colorByKey : traitInfo.key;
      const isSecondary = annotKey !== traitInfo.key;
      let values: string[];
      if (isSecondary) {
        const seen = new Set<string>();
        for (const node of graph.nodes) {
          const v = node.annotations[annotKey];
          if (typeof v === 'string') seen.add(v);
        }
        values = Array.from(seen).sort();
      } else {
        values = traitInfo.values;
      }
      const map = new Map<string, string>();
      for (const node of graph.nodes) {
        const state = node.annotations[annotKey];
        if (typeof state !== 'string') continue;
        const hex = paletteColorFor(state, values, palette, paletteReverse);
        map.set(node.origId, hex);
      }
      if (map.size > 0) nodeColorById = map;
    } else if (
      traitInfo.kind === 'continuous' &&
      colorByKey !== '__time__' &&
      colorByKey !== 'single-color' &&
      allDiscreteKeys.includes(colorByKey)
    ) {
      const seen = new Set<string>();
      for (const node of graph.nodes) {
        const v = node.annotations[colorByKey];
        if (typeof v === 'string') seen.add(v);
      }
      const values = Array.from(seen).sort();
      const map = new Map<string, string>();
      for (const node of graph.nodes) {
        const state = node.annotations[colorByKey];
        if (typeof state !== 'string') continue;
        const hex = paletteColorFor(state, values, palette, paletteReverse);
        map.set(node.origId, hex);
      }
      if (map.size > 0) nodeColorById = map;
    }
  }

  let nodeGlyphById: Map<string, TipGlyph> | undefined;
  if (glyphByKey !== 'none' && graph) {
    const glyphMap = buildGlyphByValue(graph, glyphByKey);
    if (glyphMap.size > 0) {
      const map = new Map<string, TipGlyph>();
      for (const node of graph.nodes) {
        if (node.adjacents.length > 1) continue;
        const v = node.annotations[glyphByKey];
        if (typeof v !== 'string') continue;
        const glyph = glyphMap.get(v);
        if (glyph !== undefined) map.set(node.origId, glyph);
      }
      if (map.size > 0) nodeGlyphById = map;
    }
  }

  return { nodeColorById, nodeGlyphById };
}

// Computes which nodes are dimmed at the current playhead.
// Only re-runs when playhead / mode / clade / focus set changes.
export function computeDimmedNodeIds(
  playhead: number,
  focusedTaxa: string[],
  rawLayout: import('../phylo/types.js').Layout | null,
  highlightedBranchIds: number[] = [],
  suppressCladeDimming = false,
  playbackWindow?: TimeWindow | null,
  rootTime?: number | null,
): {
  dimmedNodeIds: Set<string> | undefined;
  dimmedTipIds: Set<string> | undefined;
  focusedLineageNodeIds: Set<string>;
} {
  const { graph, branchTable } = useTreeStore.getState();
  const { colorByKey, deselectedValues, posteriorThreshold } = useUiStore.getState();
  const {
    window: storeWindow,
    mode: storeMode,
    clade: storeClade,
    subtreeRootIds: storeSubtreeRootIds,
    subtreeRootId: storeSubtreeRootId,
    isPlaying: storeIsPlaying,
  } = useTimelineStore.getState();
  const selectedSubtreeRootIds =
    storeSubtreeRootIds.length > 0
      ? storeSubtreeRootIds
      : storeSubtreeRootId !== null
        ? [storeSubtreeRootId]
        : [];

  const focusedLineageNodeIds =
    rawLayout && focusedTaxa.length > 0
      ? computeFocusedLineageNodeIds(rawLayout, focusedTaxa)
      : new Set<string>();

  let dimmedNodeIds: Set<string> | undefined;
  let dimmedTipIds: Set<string> | undefined;
  if (branchTable && graph) {
    const dimmed = new Set<string>();
    const highlightedBranchSet =
      highlightedBranchIds.length > 0 ? new Set(highlightedBranchIds) : null;

    if (storeClade && selectedSubtreeRootIds.length > 0 && rawLayout && !suppressCladeDimming) {
      const subtreeBranchIds = buildSubtreeBranchIdsForRoots(
        graph,
        rawLayout,
        selectedSubtreeRootIds,
      );
      // Iterate every node, not just branch-table rows: the root is no edge's
      // child, so it has no branch row. Iterating the branch table alone would
      // leave the root — and its vertical connector — undimmed when a descendant
      // clade is selected.
      for (let idx = 0; idx < graph.nodes.length; idx++) {
        if (subtreeBranchIds.has(idx)) continue;
        const nodeId = graph.nodes[idx]?.origId;
        if (nodeId !== undefined) dimmed.add(nodeId);
      }
    } else if (storeIsPlaying) {
      const activeWindow = playbackWindow === undefined ? storeWindow : playbackWindow;
      for (let i = 0; i < branchTable.count; i++) {
        const branchId = branchTable.branchId[i] ?? i;
        const startTime = branchTable.startTime[i] ?? 0;
        const endTime = branchTable.endTime[i] ?? 0;
        const active = isActive(
          { startTime, endTime, branchId },
          playhead,
          activeWindow,
          storeMode,
        );
        if (!active) {
          const nodeId = graph.nodes[branchId]?.origId;
          if (nodeId !== undefined) dimmed.add(nodeId);
        }
      }

      const root = rawLayout?.nodes.find((node) => node.parentId === null);
      if (root && rootTime != null && Number.isFinite(rootTime)) {
        const active = isActive(
          { startTime: rootTime, endTime: rootTime, branchId: -1 },
          playhead,
          activeWindow,
          storeMode,
        );
        if (!active) dimmed.add(root.id);
      }
    }

    if (deselectedValues.size > 0 && colorByKey !== 'single-color' && colorByKey !== '__time__') {
      for (let i = 0; i < branchTable.count; i++) {
        const branchId = branchTable.branchId[i] ?? i;
        const node = graph.nodes[branchId];
        if (!node) continue;
        const traitVal = node.annotations[colorByKey];
        if (typeof traitVal === 'string' && deselectedValues.has(traitVal)) {
          dimmed.add(node.origId);
        }
      }
    }

    if (focusedLineageNodeIds.size > 0) {
      for (let i = 0; i < branchTable.count; i++) {
        const branchId = branchTable.branchId[i] ?? i;
        const nodeId = graph.nodes[branchId]?.origId;
        if (nodeId !== undefined && !focusedLineageNodeIds.has(nodeId)) {
          dimmed.add(nodeId);
        }
      }
    }

    if (highlightedBranchSet) {
      for (let i = 0; i < branchTable.count; i++) {
        const branchId = branchTable.branchId[i] ?? i;
        if (highlightedBranchSet.has(branchId)) continue;
        const nodeId = graph.nodes[branchId]?.origId;
        if (nodeId !== undefined) dimmed.add(nodeId);
      }
    }

    // Tip glyphs stay lit under a posterior filter: a tip is observed data
    // (support 1), so only its uncertain uptending BRANCH dims, not the tip
    // itself. Snapshot the dim set for the glyph layer before the posterior
    // pass, which affects branches only.
    const dimmedTips = new Set(dimmed);

    if (posteriorThreshold > 0 && branchTable.posterior) {
      for (let i = 0; i < branchTable.count; i++) {
        const branchId = branchTable.branchId[i] ?? i;
        const p = branchTable.posterior[i];
        if (p !== undefined && p < posteriorThreshold) {
          const nodeId = graph.nodes[branchId]?.origId;
          if (nodeId !== undefined) dimmed.add(nodeId);
        }
      }
    }

    if (highlightedBranchSet) {
      for (const branchId of highlightedBranchSet) {
        const nodeId = graph.nodes[branchId]?.origId;
        if (nodeId !== undefined) {
          dimmed.delete(nodeId);
          dimmedTips.delete(nodeId);
        }
      }
    }

    if (dimmed.size > 0) dimmedNodeIds = dimmed;
    if (dimmedTips.size > 0) dimmedTipIds = dimmedTips;
  }

  return { dimmedNodeIds, dimmedTipIds, focusedLineageNodeIds };
}

// Combined entry point for non-animated contexts and export snapshots.
export function computeTreeRenderState(playhead?: number): TreeRenderState {
  const { layout: rawLayout } = useTreeStore.getState();
  const { focusedTaxa, highlightedBranchIds } = useSelectionStore.getState();
  const { playhead: storePlayhead } = useTimelineStore.getState();

  const effectivePlayhead = playhead ?? storePlayhead;

  const { nodeColorById, nodeGlyphById } = computeNodeAppearance();
  const { dimmedNodeIds, dimmedTipIds, focusedLineageNodeIds } = computeDimmedNodeIds(
    effectivePlayhead,
    focusedTaxa,
    rawLayout,
    highlightedBranchIds,
  );

  return { nodeColorById, nodeGlyphById, dimmedNodeIds, dimmedTipIds, focusedLineageNodeIds };
}
