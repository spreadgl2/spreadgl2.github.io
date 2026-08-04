import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeLayoutFromGraph } from '../phylo/layout.js';
import { parseTreeFile } from '../phylo/parse.js';
import { computeFocusedLineageNodeIds } from './focused-lineage.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../../tests/fixtures');

describe('computeFocusedLineageNodeIds', () => {
  const nexus = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
  const graph = parseTreeFile(nexus);
  const layout = computeLayoutFromGraph(graph);

  it('returns empty set for empty focusedTaxa', () => {
    const result = computeFocusedLineageNodeIds(layout, []);
    expect(result.size).toBe(0);
  });

  it('includes the focused tip itself', () => {
    const tip = layout.nodes.find((n) => n.isTip);
    if (!tip) throw new Error('no tips in fixture');
    const result = computeFocusedLineageNodeIds(layout, [tip.id]);
    expect(result.has(tip.id)).toBe(true);
  });

  it('includes all ancestors up to root for a single tip', () => {
    const tip = layout.nodes.find((n) => n.isTip);
    if (!tip) throw new Error('no tips in fixture');
    const result = computeFocusedLineageNodeIds(layout, [tip.id]);

    let node = layout.nodeMap.get(tip.id);
    while (node) {
      expect(result.has(node.id)).toBe(true);
      if (node.parentId === null) break;
      node = layout.nodeMap.get(node.parentId);
    }
  });

  it('unions lineages across multiple focused tips', () => {
    const tips = layout.nodes.filter((n) => n.isTip).slice(0, 2);
    if (tips.length < 2) return;
    const [tipA, tipB] = tips as [(typeof tips)[0], (typeof tips)[0]];

    const resultA = computeFocusedLineageNodeIds(layout, [tipA.id]);
    const resultB = computeFocusedLineageNodeIds(layout, [tipB.id]);
    const resultBoth = computeFocusedLineageNodeIds(layout, [tipA.id, tipB.id]);

    for (const id of resultA) expect(resultBoth.has(id)).toBe(true);
    for (const id of resultB) expect(resultBoth.has(id)).toBe(true);
  });

  it('root is always included when any tip is focused', () => {
    const tip = layout.nodes.find((n) => n.isTip);
    if (!tip) throw new Error('no tips in fixture');
    const root = layout.nodes.find((n) => n.parentId === null);
    if (!root) throw new Error('no root in fixture');
    const result = computeFocusedLineageNodeIds(layout, [tip.id]);
    expect(result.has(root.id)).toBe(true);
  });
});
