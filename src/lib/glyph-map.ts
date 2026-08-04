/**
 * @original SpreadGL2 — original code for SpreadGL2, not adapted from pearcore.
 * Coordinates with the shared tree glyph list to
 * provide a shared canonical value→glyph mapping used by both the legend and renderer.
 */

import type { PhyloGraph } from './phylo/types.js';
import { TIP_GLYPHS, type TipGlyph } from './tree-render/glyphs.js';

/**
 * Build a canonical value→glyph mapping from a PhyloGraph for a given
 * annotation key.  Only tip nodes (adjacents.length <= 1) are scanned so the
 * legend and renderer stay in sync with what is actually drawn.  Values are
 * sorted alphabetically so the mapping is order-independent.
 */
export function buildGlyphByValue(graph: PhyloGraph, key: string): Map<string, TipGlyph> {
  const seen = new Set<string>();
  for (const node of graph.nodes) {
    if (node.adjacents.length > 1) continue;
    const v = node.annotations[key];
    if (typeof v === 'string') seen.add(v);
  }
  const sorted = Array.from(seen).sort();
  const map = new Map<string, TipGlyph>();
  sorted.forEach((value, i) => {
    const glyph = TIP_GLYPHS[i % TIP_GLYPHS.length];
    if (glyph !== undefined) map.set(value, glyph);
  });
  return map;
}
