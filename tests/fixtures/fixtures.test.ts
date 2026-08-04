import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNexus } from '../../src/lib/phylo/parse.js';

const FIXTURES_DIR = join(import.meta.dirname, '.');

function countTips(node: { name?: string; children?: unknown[] }): number {
  if (!node.children || node.children.length === 0) return 1;
  return (node.children as typeof node[]).reduce((sum, child) => sum + countTips(child), 0);
}

describe('continuous-tiny.nex', () => {
  const nexus = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
  const trees = parseNexus(nexus);

  it('parses to exactly one tree', () => {
    expect(trees.length).toBe(1);
  });

  it('has 5 tips', () => {
    const root = trees[0]?.root;
    expect(root).toBeDefined();
    expect(countTips(root!)).toBe(5);
  });

  it('internal nodes have location1 and location2 annotations', () => {
    const root = trees[0]?.root;
    expect(root).toBeDefined();

    const internalNodes: Array<{ annotations: Record<string, unknown> }> = [];
    const stack: Array<{ name?: string; children?: unknown[]; annotations: Record<string, unknown> }> = [root!];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.children && node.children.length > 0) {
        internalNodes.push(node);
        for (const child of node.children as typeof stack) {
          stack.push(child);
        }
      }
    }

    expect(internalNodes.length).toBeGreaterThan(0);
    for (const node of internalNodes) {
      expect(node.annotations).toHaveProperty('location1');
      expect(node.annotations).toHaveProperty('location2');
    }
  });

  it('at least one internal node has location1_95%_HPD and location2_95%_HPD arrays', () => {
    const root = trees[0]?.root;
    expect(root).toBeDefined();

    let foundHPD = false;
    const stack: Array<{ name?: string; children?: unknown[]; annotations: Record<string, unknown> }> = [root!];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.children && node.children.length > 0) {
        if ('location1_95%_HPD' in node.annotations && 'location2_95%_HPD' in node.annotations) {
          expect(Array.isArray(node.annotations['location1_95%_HPD'])).toBe(true);
          expect(Array.isArray(node.annotations['location2_95%_HPD'])).toBe(true);
          foundHPD = true;
        }
        for (const child of node.children as typeof stack) {
          stack.push(child);
        }
      }
    }

    expect(foundHPD).toBe(true);
  });
});

describe('non-wgs84.nex', () => {
  const nexus = readFileSync(join(FIXTURES_DIR, 'non-wgs84.nex'), 'utf8');

  it('parses without error (coordinate sanity is at introspector level, not parser)', () => {
    expect(() => parseNexus(nexus)).not.toThrow();
  });

  it('produces at least one tree', () => {
    const trees = parseNexus(nexus);
    expect(trees.length).toBeGreaterThan(0);
  });

  it('annotations contain BNG-scale coordinate values outside WGS84 range', () => {
    const trees = parseNexus(nexus);
    const root = trees[0]?.root;
    expect(root).toBeDefined();

    const stack: Array<{ name?: string; children?: unknown[]; annotations: Record<string, unknown> }> = [root!];
    let foundOutOfRange = false;
    while (stack.length > 0) {
      const node = stack.pop()!;
      const c1 = node.annotations['coordinates1'];
      if (typeof c1 === 'number' && c1 > 180) {
        foundOutOfRange = true;
      }
      if (node.children) {
        for (const child of node.children as typeof stack) {
          stack.push(child);
        }
      }
    }
    expect(foundOutOfRange).toBe(true);
  });
});
