/** @original SpreadGL2 - tests for the peartree-adapted layout algorithm. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeLayoutFromGraph } from './layout.js';
import { parseTreeFile } from './parse.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../../tests/fixtures');
const GOLDEN_PATH = join(FIXTURES_DIR, 'golden', 'continuous-tiny.layout.json');

interface GoldenNode {
  id: string;
  x: number;
  y: number;
  isTip: boolean;
  parentId: string | null;
  children: string[];
  isCollapsed: boolean;
}

interface Golden {
  maxX: number;
  maxY: number;
  xAxisMode: string;
  nodes: GoldenNode[];
}

describe('computeLayoutFromGraph — continuous-tiny.nex', () => {
  const nexus = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
  const graph = parseTreeFile(nexus);
  const layout = computeLayoutFromGraph(graph);
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;

  it('produces the expected node count', () => {
    expect(layout.nodes.length).toBe(golden.nodes.length);
  });

  it('maxX matches golden within ±1e-6', () => {
    expect(Math.abs(layout.maxX - golden.maxX)).toBeLessThan(1e-6);
  });

  it('maxY matches golden', () => {
    expect(layout.maxY).toBe(golden.maxY);
  });

  it('xAxisMode is divergence', () => {
    expect(layout.xAxisMode).toBe('divergence');
  });

  it('nodeMap covers all nodes', () => {
    for (const n of layout.nodes) {
      expect(layout.nodeMap.has(n.id)).toBe(true);
    }
  });

  it('every node x within ±1e-6 of golden', () => {
    for (const gNode of golden.nodes) {
      const n = layout.nodeMap.get(gNode.id);
      expect(n).toBeDefined();
      if (n === undefined) continue;
      expect(Math.abs(n.x - gNode.x)).toBeLessThan(1e-6);
    }
  });

  it('every node y within ±1e-6 of golden', () => {
    for (const gNode of golden.nodes) {
      const n = layout.nodeMap.get(gNode.id);
      expect(n).toBeDefined();
      if (n === undefined) continue;
      expect(Math.abs(n.y - gNode.y)).toBeLessThan(1e-6);
    }
  });

  it('isTip flags match golden', () => {
    for (const gNode of golden.nodes) {
      const n = layout.nodeMap.get(gNode.id);
      expect(n).toBeDefined();
      if (n === undefined) continue;
      expect(n.isTip).toBe(gNode.isTip);
    }
  });

  it('parentId values match golden', () => {
    for (const gNode of golden.nodes) {
      const n = layout.nodeMap.get(gNode.id);
      expect(n).toBeDefined();
      if (n === undefined) continue;
      expect(n.parentId).toBe(gNode.parentId);
    }
  });

  it('tips have empty children arrays', () => {
    for (const n of layout.nodes) {
      if (n.isTip) {
        expect(n.children).toHaveLength(0);
      }
    }
  });

  it('exactly 5 tips', () => {
    const tips = layout.nodes.filter((n) => n.isTip);
    expect(tips).toHaveLength(5);
  });

  it('all tips have x equal to maxX', () => {
    for (const n of layout.nodes) {
      if (n.isTip && !(n.isCollapsed === true)) {
        expect(Math.abs(n.x - layout.maxX)).toBeLessThan(1e-6);
      }
    }
  });

  it('internal nodes y equals mean of children y', () => {
    for (const n of layout.nodes) {
      if (n.isTip || n.children.length === 0) continue;
      const childYs = n.children.map((cid) => layout.nodeMap.get(cid)?.y ?? 0);
      const expected = childYs.reduce((a, b) => a + b, 0) / childYs.length;
      expect(Math.abs(n.y - expected)).toBeLessThan(1e-9);
    }
  });
});

describe('computeLayoutFromGraph — collapsedCladeIds and hiddenNodeIds are empty sets', () => {
  it('passes empty sets through without error', () => {
    const nexus = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
    const graph = parseTreeFile(nexus);
    expect(graph.collapsedCladeIds.size).toBe(0);
    expect(graph.hiddenNodeIds.size).toBe(0);
    expect(() => computeLayoutFromGraph(graph)).not.toThrow();
  });
});
