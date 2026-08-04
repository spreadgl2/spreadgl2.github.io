/**
 * Adapted from peartree (MIT), Copyright (c) 2026 Andrew Rambaut.
 * Source: pearcore/peartree/js/treeio.js:1-319 ("parseNewick", "parseNexus"),
 *         pearcore/peartree/js/phylograph.js:244-374 ("fromNestedRoot")
 * https://github.com/artic-network/peartree
 *
 * Adapted to strict TypeScript and extended for SpreadGL2's supported inputs.
 */

import type { PhyloGraph, PhyloNode } from './types.js';

interface NestedNode {
  id: string;
  name?: string;
  label?: string;
  length?: number;
  parent?: NestedNode;
  children?: NestedNode[];
  annotations: Record<string, unknown>;
}

export function parseNewick(
  newickString: string,
  tipNameMap: Map<string, string> | null = null,
): NestedNode {
  const tokens = newickString.split(/\s*('[^']*'|"[^"]*"|;|\(|\)|,|:|=|\[&|\]|\{|\})\s*/);
  let level = 0;
  let currentNode: NestedNode | null = null;
  const nodeStack: NestedNode[] = [];
  let labelNext = false;
  let lengthNext = false;
  let inAnnotation = false;
  let annotationKeyNext = true;
  let annotationKey: string | null = null;
  let isAnnotationARange = false;

  let idCounter = 0;
  function newId(): string {
    return `n${idCounter++}`;
  }

  for (const token of tokens.filter((t) => t.length > 0)) {
    if (inAnnotation) {
      if (token === '=') {
        annotationKeyNext = false;
      } else if (token === ',') {
        if (!isAnnotationARange) annotationKeyNext = true;
      } else if (token === '{') {
        isAnnotationARange = true;
        if (currentNode !== null && annotationKey !== null) {
          currentNode.annotations[annotationKey] = [];
        }
      } else if (token === '}') {
        isAnnotationARange = false;
      } else if (token === ']') {
        inAnnotation = false;
        annotationKeyNext = true;
      } else {
        let t = token;
        if (t.startsWith('"') || t.startsWith("'")) t = t.slice(1);
        if (t.endsWith('"') || t.endsWith("'")) t = t.slice(0, -1);
        if (annotationKeyNext) {
          annotationKey = t.replaceAll('.', '_');
        } else if (currentNode !== null && annotationKey !== null) {
          if (isAnnotationARange) {
            const arr = currentNode.annotations[annotationKey];
            if (Array.isArray(arr)) {
              if (t === '?' || t === '') {
                arr.push(null);
              } else {
                const arrNum = Number(t);
                arr.push(!Number.isNaN(arrNum) ? arrNum : t);
              }
            }
          } else {
            if (t === '?' || t === '') {
              currentNode.annotations[annotationKey] = null;
            } else {
              const num = Number(t);
              currentNode.annotations[annotationKey] = !Number.isNaN(num) ? num : t;
            }
          }
        }
      }
    } else if (token === '(') {
      const node: NestedNode = { id: newId(), children: [], annotations: {} };
      if (currentNode !== null) node.parent = currentNode;
      level++;
      if (currentNode !== null) nodeStack.push(currentNode);
      currentNode = node;
    } else if (token === ',') {
      labelNext = false;
      const parent = nodeStack.pop();
      if (parent !== undefined && currentNode !== null) {
        if (!parent.children) parent.children = [];
        parent.children.push(currentNode);
        currentNode = parent;
      }
    } else if (token === ')') {
      labelNext = false;
      const parent = nodeStack.pop();
      if (parent !== undefined && currentNode !== null) {
        if (!parent.children) parent.children = [];
        parent.children.push(currentNode);
        level--;
        currentNode = parent;
      }
      labelNext = true;
    } else if (token === ':') {
      labelNext = false;
      lengthNext = true;
    } else if (token === ';') {
      if (level > 0) throw new Error('Unbalanced brackets in Newick string');
      break;
    } else if (token === '[&') {
      inAnnotation = true;
    } else {
      if (lengthNext) {
        if (currentNode !== null) currentNode.length = parseFloat(token);
        lengthNext = false;
      } else if (labelNext) {
        if (currentNode !== null) {
          currentNode.label = token;
          if (!token.startsWith('#')) {
            currentNode.annotations._node_label = token;
          } else {
            currentNode.id = token.slice(1);
          }
        }
        labelNext = false;
      } else {
        if (currentNode !== null && !currentNode.children) currentNode.children = [];
        let name = tipNameMap !== null ? (tipNameMap.get(token) ?? token) : token;
        name = name
          .replace(/^['"]|['"]$/g, '')
          .trim()
          .replace(/'/g, '');
        const externalNode: NestedNode = {
          id: newId(),
          name,
          annotations: {},
        };
        if (currentNode !== null) externalNode.parent = currentNode;
        if (currentNode !== null) nodeStack.push(currentNode);
        currentNode = externalNode;
      }
    }
  }

  if (level > 0) throw new Error('Unbalanced brackets in Newick string');

  const DATE_RE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;
  const CURRENT_YEAR = new Date().getFullYear();

  function annotateDates(root: NestedNode): void {
    const stack: NestedNode[] = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) continue;
      const isTip = !node.children || node.children.length === 0;
      if (isTip && node.name?.includes('|')) {
        const parts = node.name.split('|');
        const last = parts[parts.length - 1]?.trim() ?? '';
        if (!('date' in node.annotations)) {
          if (DATE_RE.test(last)) {
            node.annotations.date = last;
          } else {
            const asInt = Number(last);
            if (Number.isInteger(asInt) && asInt > 0 && asInt <= CURRENT_YEAR) {
              node.annotations.date = String(asInt);
            }
          }
        }
      }
      if (node.children) {
        for (let j = node.children.length - 1; j >= 0; j--) {
          const child = node.children[j];
          if (child !== undefined) stack.push(child);
        }
      }
    }
  }

  if (currentNode !== null) annotateDates(currentNode);

  if (currentNode === null) throw new Error('Empty Newick string');
  return currentNode;
}

export interface ParsedNexusTree {
  root: NestedNode;
  tipNameMap: Map<string, string>;
  peartreeSettings: Record<string, unknown> | null;
}

// Pre-pass: if the trees block has no newlines (monolithic single-line export),
// insert newlines at structural boundaries so the line-by-line parser can proceed.
// Uses indexOf for block boundary detection (O(n), no backtracking) and bounded
// character-class regexes only — no dotAll `.*` across large spans.
function normalizeMonolithicNexus(text: string): string {
  const lower = text.toLowerCase();
  const beginIdx = lower.indexOf('begin trees;');
  if (beginIdx === -1) return text;
  const afterBegin = beginIdx + 'begin trees;'.length;
  const endIdx = lower.indexOf('end;', afterBegin);
  if (endIdx === -1) return text;

  const blockContent = text.slice(afterBegin, endIdx);

  // Only normalize when the block has no internal newlines (monolithic).
  if (blockContent.indexOf('\n') !== -1) return text;

  // Monolithic: split on structural keywords to give the line-by-line parser
  // the newlines it expects.
  let norm = blockContent;
  // \btranslate\b on own line
  norm = norm.replace(/\btranslate\b/gi, '\ntranslate\n');
  // Each tree statement on its own line
  norm = norm.replace(/\btree\s+/gi, '\ntree ');
  // Translate entries: add newlines between "N name," entries.
  // Only apply before the first ( to avoid touching Newick annotation values.
  const parenIdx = norm.indexOf('(');
  if (parenIdx > 0) {
    const preParen = norm.slice(0, parenIdx).replace(/,(\s*)(\d)/g, ',\n$2');
    norm = preParen + norm.slice(parenIdx);
  }

  const prefix = text.slice(0, beginIdx);
  const prefixWithNl = prefix.endsWith('\n') ? prefix : `${prefix}\n`;
  return `${prefixWithNl}begin trees;\n${norm}\nend;${text.slice(endIdx + 'end;'.length)}`;
}

export function parseNexus(nexus: string): ParsedNexusTree[] {
  const trees: ParsedNexusTree[] = [];
  const rawText = normalizeMonolithicNexus(nexus);
  const lines = rawText.split('\n');
  let inTreesBlock = false;
  const tipNameMap = new Map<string, string>();
  let inTranslate = false;
  let peartreeSettings: Record<string, unknown> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const lower = line.toLowerCase();

    if (lower === 'begin trees;' || lower.startsWith('begin trees;')) {
      inTreesBlock = true;
      inTranslate = false;
      continue;
    }
    if (inTreesBlock) {
      if (lower === 'end;' || lower === 'end') {
        inTreesBlock = false;
        continue;
      }

      const ptMatch = line.match(/^\[peartree=(\{.*\})\]$/i);
      if (ptMatch !== null && ptMatch[1] !== undefined) {
        try {
          peartreeSettings = JSON.parse(ptMatch[1]) as Record<string, unknown>;
        } catch {
          // ignore malformed
        }
        continue;
      }

      if (lower === 'translate') {
        inTranslate = true;
        continue;
      }
      if (inTranslate) {
        if (line === ';') {
          inTranslate = false;
          continue;
        }
        const clean = line.replace(/,$/, '').replace(/;$/, '');
        const parts = clean.split(/\s+/);
        if (parts.length >= 2 && parts[0] !== undefined) {
          tipNameMap.set(parts[0], parts.slice(1).join(' '));
        }
        if (line.endsWith(';')) inTranslate = false;
      } else {
        const idx = line.indexOf('(');
        if (idx !== -1) {
          const newickStr = line.slice(idx);
          const root = parseNewick(newickStr, tipNameMap.size > 0 ? tipNameMap : null);
          trees.push({ root, tipNameMap: new Map(tipNameMap), peartreeSettings });
        }
      }
    }
  }

  if (peartreeSettings !== null) {
    for (const t of trees) {
      if (t.peartreeSettings === null) t.peartreeSettings = peartreeSettings;
    }
  }

  return trees;
}

export interface ParseTreeFileMeta {
  graph: PhyloGraph;
  multiTreeCount: number;
}

export function parseTreeFileMeta(text: string): ParseTreeFileMeta {
  const trimmed = text.trimStart();
  if (trimmed.toUpperCase().startsWith('#NEXUS')) {
    const trees = parseNexus(trimmed);
    if (trees.length === 0) throw new Error('No trees found in NEXUS file');
    const first = trees[0];
    if (first === undefined) throw new Error('No trees found in NEXUS file');
    return { graph: buildPhyloGraph(first.root), multiTreeCount: trees.length };
  }
  const root = parseNewick(trimmed);
  return { graph: buildPhyloGraph(root), multiTreeCount: 1 };
}

export function parseTreeFile(text: string): PhyloGraph {
  return parseTreeFileMeta(text).graph;
}

export function buildPhyloGraph(nestedRoot: NestedNode): PhyloGraph {
  const nodes: PhyloNode[] = [];
  const origIdToIdx = new Map<string, number>();

  const rootChildren = nestedRoot.children ?? [];
  const hasRootAnnotations = Object.keys(nestedRoot.annotations).length > 0;
  const isBifurcating = rootChildren.length === 2 && !hasRootAnnotations;

  function allocNode(startNode: NestedNode): void {
    const stack: NestedNode[] = [startNode];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) continue;
      const idx = nodes.length;
      origIdToIdx.set(node.id, idx);
      nodes.push({
        idx,
        origId: node.id,
        name: node.name ?? null,
        label: node.label ?? null,
        annotations: node.annotations,
        adjacents: [],
        lengths: [],
      });
      if (node.children) {
        for (let j = node.children.length - 1; j >= 0; j--) {
          const child = node.children[j];
          if (child !== undefined) stack.push(child);
        }
      }
    }
  }

  if (isBifurcating) {
    for (const c of rootChildren) allocNode(c);
  } else {
    allocNode(nestedRoot);
  }

  function linkEdge(nestedChild: NestedNode, nestedParent: NestedNode): void {
    const ci = origIdToIdx.get(nestedChild.id);
    const pi = origIdToIdx.get(nestedParent.id);
    if (ci === undefined || pi === undefined) return;
    const len = nestedChild.length ?? 0;

    nodes[ci]?.adjacents.push(pi);
    nodes[ci]?.lengths.push(len);

    nodes[pi]?.adjacents.push(ci);
    nodes[pi]?.lengths.push(len);
  }

  function buildEdges(startNode: NestedNode, startParent: NestedNode | null): void {
    const stack: { node: NestedNode; parentNode: NestedNode | null }[] = [
      { node: startNode, parentNode: startParent },
    ];
    while (stack.length > 0) {
      const entry = stack.pop();
      if (entry === undefined) continue;
      const { node, parentNode } = entry;
      if (parentNode !== null) linkEdge(node, parentNode);
      if (node.children) {
        for (let j = node.children.length - 1; j >= 0; j--) {
          const child = node.children[j];
          if (child !== undefined) stack.push({ node: child, parentNode: node });
        }
      }
    }
  }

  let root: PhyloGraph['root'];

  if (isBifurcating) {
    const cA = rootChildren[0];
    const cB = rootChildren[1];
    if (cA === undefined || cB === undefined)
      throw new Error('Bifurcating root must have two children');
    const idxA = origIdToIdx.get(cA.id);
    const idxB = origIdToIdx.get(cB.id);
    if (idxA === undefined || idxB === undefined) throw new Error('Root children not indexed');
    const lenA = cA.length ?? 0;
    const lenB = cB.length ?? 0;
    const totalLen = lenA + lenB;

    nodes[idxA]?.adjacents.push(idxB);
    nodes[idxA]?.lengths.push(totalLen);

    nodes[idxB]?.adjacents.push(idxA);
    nodes[idxB]?.lengths.push(totalLen);

    if (cA.children) for (const c of cA.children) buildEdges(c, cA);
    if (cB.children) for (const c of cB.children) buildEdges(c, cB);

    const rootAnnotations = nestedRoot.annotations;
    root = { nodeA: idxA, nodeB: idxB, lenA, lenB, annotations: rootAnnotations };
  } else {
    buildEdges(nestedRoot, null);

    const rootIdx = origIdToIdx.get(nestedRoot.id);
    if (rootIdx === undefined) throw new Error('Root node not indexed');
    const firstChild = rootChildren[0];
    if (firstChild === undefined) throw new Error('Root has no children');
    const firstChildIdx = origIdToIdx.get(firstChild.id);
    if (firstChildIdx === undefined) throw new Error('First child not indexed');

    root = {
      nodeA: rootIdx,
      nodeB: firstChildIdx,
      lenA: 0,
      lenB: firstChild.length ?? 0,
      annotations: nestedRoot.annotations,
    };
  }

  const rooted = Object.keys(root.annotations).length > 0;

  return {
    nodes,
    root,
    origIdToIdx,
    rooted,
    hiddenNodeIds: new Set<string>(),
    collapsedCladeIds: new Map<string, { colour: string | null; tipCount: number }>(),
  };
}
