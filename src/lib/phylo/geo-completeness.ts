/** @original SpreadGL2 - geographic annotation completeness helpers. */

import type { BranchTable, PhyloGraph } from './types.js';

export interface MissingAnnotationCounts {
  total: number;
  internal: number;
  tips: number;
}

export function countMissingNodeAnnotations(
  graph: PhyloGraph,
  annotationKey: string,
): MissingAnnotationCounts {
  let internal = 0;
  let tips = 0;
  for (const node of graph.nodes) {
    const value = node.annotations[annotationKey];
    if (typeof value === 'string' && value.trim() !== '') continue;
    if (node.adjacents.length === 1) tips += 1;
    else internal += 1;
  }
  return { total: internal + tips, internal, tips };
}

export function isStartGeoResolved(branchTable: BranchTable, index: number): boolean {
  return branchTable.startGeoResolved?.[index] !== 0;
}

export function isEndGeoResolved(branchTable: BranchTable, index: number): boolean {
  return branchTable.endGeoResolved?.[index] !== 0;
}

export function isBranchGeoResolved(branchTable: BranchTable, index: number): boolean {
  return isStartGeoResolved(branchTable, index) && isEndGeoResolved(branchTable, index);
}
