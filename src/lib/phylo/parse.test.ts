/** @original SpreadGL2 - tests for the peartree-adapted parser and graph builder. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPhyloGraph, parseNewick, parseTreeFile, parseTreeFileMeta } from './parse.js';

describe('parseNewick', () => {
  it('(a) returns a nested root with two children for a simple two-leaf tree', () => {
    const root = parseNewick('(A:1,B:2);');
    expect(root.children).toBeDefined();
    expect(root.children?.length).toBe(2);
    expect(root.children?.[0]?.name).toBe('A');
    expect(root.children?.[0]?.length).toBe(1);
    expect(root.children?.[1]?.name).toBe('B');
    expect(root.children?.[1]?.length).toBe(2);
  });

  it('(b) multi-dot key: region.set.prob normalizes to region_set_prob (patch-lock test)', () => {
    const root = parseNewick('(A[&region.set.prob={0.6,0.4}]:1);');
    const leaf = root.children?.at(0);
    expect(leaf).toBeDefined();
    expect(leaf?.annotations).toHaveProperty('region_set_prob');
    expect(leaf?.annotations).not.toHaveProperty('region_set.prob');
    expect(leaf?.annotations.region_set_prob).toEqual([0.6, 0.4]);
  });

  it('(c) single-dot key: region.set normalizes to region_set with array value', () => {
    const root = parseNewick("(A[&region.set={'X','Y'}]:1);");
    const leaf = root.children?.at(0);
    expect(leaf).toBeDefined();
    expect(leaf?.annotations).toHaveProperty('region_set');
    expect(leaf?.annotations).not.toHaveProperty('region.set');
    expect(leaf?.annotations.region_set).toEqual(['X', 'Y']);
  });
});

const SYNTHETIC_NEXUS = `#NEXUS
Begin Trees;
  Tree tree1 = (A[&location=1.5]:1.0,B[&location=2.5]:2.0);
End;
`;

describe('parseTreeFile', () => {
  it('(e) dispatches Newick text to parseNewick + buildPhyloGraph', () => {
    const graph = parseTreeFile('(A:1,B:2);');
    const tipA = graph.nodes.find((n) => n.name === 'A');
    const tipB = graph.nodes.find((n) => n.name === 'B');
    expect(tipA).toBeDefined();
    expect(tipB).toBeDefined();
    expect(graph.nodes.length).toBe(2);
  });

  it('(f) dispatches NEXUS text (case-insensitive prefix) to parseNexus + buildPhyloGraph', () => {
    const graph = parseTreeFile(SYNTHETIC_NEXUS);
    expect(graph.nodes.length).toBe(2);
    const tipA = graph.nodes.find((n) => n.name === 'A');
    expect(tipA).toBeDefined();
    expect(tipA?.annotations).toHaveProperty('location');
    expect(tipA?.annotations.location).toBe(1.5);
  });

  it('(g) annotations are preserved exactly as the parser wrote them', () => {
    const nexus = `#NEXUS
Begin Trees;
  Tree t = (X[&region.set={a,b},rate=0.01]:1.0);
End;
`;
    const graph = parseTreeFile(nexus);
    const tipX = graph.nodes.find((n) => n.name === 'X');
    expect(tipX).toBeDefined();
    expect(tipX?.annotations).toHaveProperty('region_set');
    expect(tipX?.annotations).not.toHaveProperty('region.set');
    expect(tipX?.annotations.rate).toBe(0.01);
  });

  it('(h) handles lowercase #nexus prefix', () => {
    const lower = SYNTHETIC_NEXUS.replace('#NEXUS', '#nexus');
    const graph = parseTreeFile(lower);
    expect(graph.nodes.length).toBe(2);
  });

  it('(i) throws on empty NEXUS with no trees', () => {
    expect(() => parseTreeFile('#NEXUS\nBegin Trees;\nEnd;\n')).toThrow();
  });
});

describe('buildPhyloGraph', () => {
  it('(d) returns a PhyloGraph with correct shape from a simple nested root', () => {
    const nested = parseNewick('(A:1,B:2);');
    const graph = buildPhyloGraph(nested);

    expect(graph.nodes).toBeDefined();
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(graph.root).toBeDefined();
    expect(typeof graph.root.nodeA).toBe('number');
    expect(typeof graph.root.nodeB).toBe('number');
    expect(typeof graph.root.lenA).toBe('number');
    expect(typeof graph.root.lenB).toBe('number');
    expect(graph.origIdToIdx).toBeInstanceOf(Map);
    expect(typeof graph.rooted).toBe('boolean');
    expect(graph.hiddenNodeIds).toBeInstanceOf(Set);
    expect(graph.collapsedCladeIds).toBeInstanceOf(Map);

    const tipA = graph.nodes.find((n) => n.name === 'A');
    const tipB = graph.nodes.find((n) => n.name === 'B');
    expect(tipA).toBeDefined();
    expect(tipB).toBeDefined();
    expect(Array.isArray(tipA?.adjacents)).toBe(true);
    expect(Array.isArray(tipA?.lengths)).toBe(true);
  });
});

const MULTI_TREE_NEXUS = readFileSync(
  join(import.meta.dirname, '../../../tests/fixtures/multi-tree-tiny.nex'),
  'utf8',
);

describe('T044.5 — multi-tree NEXUS detection', () => {
  it('(m) parseTreeFileMeta returns multiTreeCount=3 for 3-tree fixture', () => {
    const { multiTreeCount } = parseTreeFileMeta(MULTI_TREE_NEXUS);
    expect(multiTreeCount).toBe(3);
  });

  it('(n) only the first tree is loaded (2 tips A and B)', () => {
    const { graph } = parseTreeFileMeta(MULTI_TREE_NEXUS);
    expect(graph.nodes.length).toBe(2);
    const names = graph.nodes.map((n) => n.name).sort();
    expect(names).toEqual(['A', 'B']);
  });

  it('(o) parseTreeFileMeta returns multiTreeCount=1 for a single-tree NEXUS', () => {
    const { multiTreeCount } = parseTreeFileMeta(SYNTHETIC_NEXUS);
    expect(multiTreeCount).toBe(1);
  });

  it('(p) parseTreeFileMeta returns multiTreeCount=1 for a plain Newick string', () => {
    const { multiTreeCount } = parseTreeFileMeta('(A:1,B:2);');
    expect(multiTreeCount).toBe(1);
  });
});

const MULTILINE_NEXUS = `#NEXUS
Begin Trees;
  Translate
    1 A,
    2 B,
    3 C
    ;
  Tree tree1 = (1[&loc=1.5]:1.0,(2[&loc=2.5]:0.5,3[&loc=3.5]:0.5):0.5);
End;
`;

const SINGLELINE_NEXUS =
  '#NEXUS begin trees; translate 1 A, 2 B, 3 C ; tree tree1 = (1[&loc=1.5]:1.0,(2[&loc=2.5]:0.5,3[&loc=3.5]:0.5):0.5); end;';

describe('T014 — monolithic single-line NEXUS', () => {
  it('(j) single-line NEXUS parses to the same node count as multi-line equivalent', () => {
    const multiGraph = parseTreeFile(MULTILINE_NEXUS);
    const singleGraph = parseTreeFile(SINGLELINE_NEXUS);
    expect(singleGraph.nodes.length).toBe(multiGraph.nodes.length);
  });

  it('(k) single-line NEXUS preserves annotation keys on tip nodes', () => {
    const graph = parseTreeFile(SINGLELINE_NEXUS);
    const tipA = graph.nodes.find((n) => n.name === 'A');
    expect(tipA).toBeDefined();
    expect(tipA?.annotations).toHaveProperty('loc');
    expect(tipA?.annotations.loc).toBe(1.5);
  });

  it('(l) PEDV tree.nex parses without error and has 769 tips', () => {
    const text = readFileSync(
      join(import.meta.dirname, '../../../public/examples/pedv/tree.nex'),
      'utf8',
    );
    const graph = parseTreeFile(text);
    const tips = graph.nodes.filter((n) => n.adjacents.length === 1);
    expect(tips.length).toBe(769);
  });
});
