import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { introspect } from '../../src/lib/phylo/introspect.js';
import { parseNexus, parseTreeFile } from '../../src/lib/phylo/parse.js';
import type { PhyloGraph } from '../../src/lib/phylo/types.js';

const FIXTURES_DIR = join(import.meta.dirname, '.');

function countTips(node: { name?: string | null; children?: unknown[] }): number {
  if (!node.children || node.children.length === 0) return 1;
  return (node.children as typeof node[]).reduce((sum, child) => sum + countTips(child), 0);
}

function collectInternalNodes(root: {
  name?: string | null;
  children?: unknown[];
  annotations: Record<string, unknown>;
}): Array<{ annotations: Record<string, unknown> }> {
  const internals: Array<{ annotations: Record<string, unknown> }> = [];
  const stack: typeof internals[0][] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const children = (node as { children?: unknown[] }).children;
    if (children && (children as unknown[]).length > 0) {
      internals.push(node);
      for (const child of children as typeof stack) {
        stack.push(child);
      }
    }
  }
  return internals;
}

describe('discrete-tiny.nex', () => {
  const nexus = readFileSync(join(FIXTURES_DIR, 'discrete-tiny.nex'), 'utf8');
  const trees = parseNexus(nexus);

  it('parses to exactly one tree', () => {
    expect(trees.length).toBe(1);
  });

  it('has 5 tips', () => {
    const root = trees[0]?.root;
    expect(root).toBeDefined();
    expect(countTips(root!)).toBe(5);
  });

  it('tip nodes have location annotation as string', () => {
    const root = trees[0]?.root;
    expect(root).toBeDefined();

    const tips: Array<{ annotations: Record<string, unknown> }> = [];
    const stack: Array<{ name?: string | null; children?: unknown[]; annotations: Record<string, unknown> }> = [root!];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (!node.children || node.children.length === 0) {
        tips.push(node);
      } else {
        for (const child of node.children as typeof stack) {
          stack.push(child);
        }
      }
    }

    expect(tips.length).toBe(5);
    for (const tip of tips) {
      expect(typeof tip.annotations['location']).toBe('string');
    }
  });

  it('one internal node has location_set array and location_set_prob array', () => {
    const root = trees[0]?.root;
    expect(root).toBeDefined();

    const internals = collectInternalNodes(root!);
    expect(internals.length).toBeGreaterThan(0);

    const withSet = internals.filter((n) => Array.isArray(n.annotations['location_set']));
    expect(withSet.length).toBeGreaterThan(0);

    const withProb = internals.filter((n) => Array.isArray(n.annotations['location_set_prob']));
    expect(withProb.length).toBeGreaterThan(0);
  });

  it('location_set values are strings', () => {
    const root = trees[0]?.root;
    const internals = collectInternalNodes(root!);
    const nodeWithSet = internals.find((n) => Array.isArray(n.annotations['location_set']));
    expect(nodeWithSet).toBeDefined();
    const set = nodeWithSet!.annotations['location_set'] as unknown[];
    expect(set.length).toBeGreaterThan(0);
    for (const v of set) {
      expect(typeof v).toBe('string');
    }
  });

  it('location_set_prob values are numbers', () => {
    const root = trees[0]?.root;
    const internals = collectInternalNodes(root!);
    const nodeWithProb = internals.find((n) => Array.isArray(n.annotations['location_set_prob']));
    expect(nodeWithProb).toBeDefined();
    const probs = nodeWithProb!.annotations['location_set_prob'] as unknown[];
    expect(probs.length).toBeGreaterThan(0);
    for (const v of probs) {
      expect(typeof v).toBe('number');
    }
  });
});

describe('discrete-region-tiny.nex', () => {
  const nexus = readFileSync(join(FIXTURES_DIR, 'discrete-region-tiny.nex'), 'utf8');
  const trees = parseNexus(nexus);

  it('parses to exactly one tree', () => {
    expect(trees.length).toBe(1);
  });

  it('has 5 tips', () => {
    const root = trees[0]?.root;
    expect(root).toBeDefined();
    expect(countTips(root!)).toBe(5);
  });

  it('tip nodes have region annotation as string', () => {
    const root = trees[0]?.root;
    expect(root).toBeDefined();

    const tips: Array<{ annotations: Record<string, unknown> }> = [];
    const stack: Array<{ name?: string | null; children?: unknown[]; annotations: Record<string, unknown> }> = [root!];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (!node.children || node.children.length === 0) {
        tips.push(node);
      } else {
        for (const child of node.children as typeof stack) {
          stack.push(child);
        }
      }
    }

    expect(tips.length).toBe(5);
    for (const tip of tips) {
      expect(typeof tip.annotations['region']).toBe('string');
    }
  });

  it('one internal node has region_set array and region_set_prob array', () => {
    const root = trees[0]?.root;
    expect(root).toBeDefined();

    const internals = collectInternalNodes(root!);
    expect(internals.length).toBeGreaterThan(0);

    const withSet = internals.filter((n) => Array.isArray(n.annotations['region_set']));
    expect(withSet.length).toBeGreaterThan(0);

    const withProb = internals.filter((n) => Array.isArray(n.annotations['region_set_prob']));
    expect(withProb.length).toBeGreaterThan(0);
  });
});

describe('introspect — discrete-tiny.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'discrete-tiny.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const result = introspect(graph);

  it('returns kind === discrete', () => {
    expect(result.kind).toBe('discrete');
  });

  it('key is location', () => {
    expect(result.kind).toBe('discrete');
    if (result.kind === 'discrete') {
      expect(result.key).toBe('location');
    }
  });

  it('values include NY, CA, TX', () => {
    expect(result.kind).toBe('discrete');
    if (result.kind === 'discrete') {
      expect(result.values).toContain('NY');
      expect(result.values).toContain('CA');
      expect(result.values).toContain('TX');
    }
  });

  it('ambiguous is false', () => {
    expect(result.kind).toBe('discrete');
    if (result.kind === 'discrete') {
      expect(result.ambiguous).toBe(false);
    }
  });
});

describe('introspect — discrete-region-tiny.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'discrete-region-tiny.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const result = introspect(graph);

  it('returns kind === discrete', () => {
    expect(result.kind).toBe('discrete');
  });

  it('key is region', () => {
    expect(result.kind).toBe('discrete');
    if (result.kind === 'discrete') {
      expect(result.key).toBe('region');
    }
  });
});

describe('introspect — discrete-ambiguous (synthesized graph)', () => {
  function makeDiscreteAmbiguousGraph(): PhyloGraph {
    const nodes = [
      {
        idx: 0,
        origId: '0',
        name: 'TipA',
        label: null,
        annotations: { location: 'NY', region: 'northeast' },
        adjacents: [2],
        lengths: [0.5],
      },
      {
        idx: 1,
        origId: '1',
        name: 'TipB',
        label: null,
        annotations: { location: 'CA', region: 'west' },
        adjacents: [2],
        lengths: [0.5],
      },
      {
        idx: 2,
        origId: '2',
        name: null,
        label: null,
        annotations: { location: 'NY', region: 'northeast' },
        adjacents: [0, 1],
        lengths: [0.5, 0.5],
      },
    ];
    return {
      nodes,
      root: { nodeA: 2, nodeB: 2, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map([['0', 0], ['1', 1], ['2', 2]]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
  }

  it('returns kind === discrete-ambiguous when both location and region are on all tips', () => {
    const graph = makeDiscreteAmbiguousGraph();
    const result = introspect(graph);
    expect(result.kind).toBe('discrete-ambiguous');
  });

  it('candidates include both location and region', () => {
    const graph = makeDiscreteAmbiguousGraph();
    const result = introspect(graph);
    expect(result.kind).toBe('discrete-ambiguous');
    if (result.kind === 'discrete-ambiguous') {
      const keys = result.candidates.map((c) => c.key);
      expect(keys).toContain('location');
      expect(keys).toContain('region');
    }
  });
});
