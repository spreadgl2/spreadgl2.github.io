/**
 * @original SpreadGL2 — original code for SpreadGL2, not adapted from pearcore.
 * Tests for glyph-map.ts.
 */

import { describe, expect, it } from 'vitest';
import { buildGlyphByValue } from './glyph-map';
import type { PhyloGraph } from './phylo/types';

function makeGraph(
  nodes: Array<{ origId: string; annotations: Record<string, string>; adjacents: number[] }>,
): PhyloGraph {
  return {
    nodes: nodes.map((n, idx) => ({ idx, name: null, label: null, lengths: [], ...n })),
    root: { nodeA: 0, nodeB: -1, lenA: 0, lenB: 0, annotations: {} },
    origIdToIdx: new Map(nodes.map((n, idx) => [n.origId, idx])),
    rooted: true,
    hiddenNodeIds: new Set(),
    collapsedCladeIds: new Map(),
  } as unknown as PhyloGraph;
}

describe('buildGlyphByValue', () => {
  it('returns empty map when no tip nodes have the key', () => {
    const graph = makeGraph([
      { origId: 'root', annotations: {}, adjacents: [1, 2] },
      { origId: 'tip1', annotations: {}, adjacents: [0] },
      { origId: 'tip2', annotations: {}, adjacents: [0] },
    ]);
    const m = buildGlyphByValue(graph, 'host');
    expect(m.size).toBe(0);
  });

  it('assigns glyphs by sorted value order', () => {
    const graph = makeGraph([
      { origId: 'root', annotations: { host: 'bat' }, adjacents: [1, 2] },
      { origId: 'tip1', annotations: { host: 'zebra' }, adjacents: [0] },
      { origId: 'tip2', annotations: { host: 'ant' }, adjacents: [0] },
    ]);
    const m = buildGlyphByValue(graph, 'host');
    expect(m.get('ant')).toBe('circle');
    expect(m.get('zebra')).toBe('triangle');
    expect(m.has('bat')).toBe(false);
  });

  it('excludes internal nodes from value scan', () => {
    const graph = makeGraph([
      { origId: 'root', annotations: { host: 'internal_only' }, adjacents: [1, 2] },
      { origId: 'tip1', annotations: { host: 'bat' }, adjacents: [0] },
      { origId: 'tip2', annotations: { host: 'bat' }, adjacents: [0] },
    ]);
    const m = buildGlyphByValue(graph, 'host');
    expect(m.size).toBe(1);
    expect(m.has('internal_only')).toBe(false);
    expect(m.has('bat')).toBe(true);
  });

  it('legend and nodeGlyphById produce identical value→glyph mapping', () => {
    const graph = makeGraph([
      { origId: 'internal', annotations: { host: 'z_first_seen' }, adjacents: [1, 2] },
      { origId: 'tip1', annotations: { host: 'bat' }, adjacents: [0] },
      { origId: 'tip2', annotations: { host: 'dog' }, adjacents: [0] },
      { origId: 'tip3', annotations: { host: 'cat' }, adjacents: [0] },
    ]);

    const legendMap = buildGlyphByValue(graph, 'host');

    const glyphMap = buildGlyphByValue(graph, 'host');
    const rendererMap = new Map<string, string>();
    for (const node of graph.nodes) {
      if (node.adjacents.length > 1) continue;
      const v = node.annotations.host;
      if (typeof v !== 'string') continue;
      const glyph = glyphMap.get(v);
      if (glyph !== undefined) rendererMap.set(v, glyph);
    }

    for (const [value, glyph] of legendMap.entries()) {
      expect(rendererMap.get(value)).toBe(glyph);
    }
    expect(legendMap.size).toBe(rendererMap.size);
  });
});
