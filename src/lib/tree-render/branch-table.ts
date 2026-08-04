import type { NodeGeo } from '../phylo/annotate.js';
import type { TreeCalibration } from '../phylo/calibrate.js';
import type { BranchTable, Layout, PhyloGraph } from '../phylo/types.js';

interface BranchRow {
  nodeIdx: number;
  parentIdx: number;
  isInternal: number;
  startLat: number;
  startLon: number;
  startGeoResolved: number;
  endLat: number;
  endLon: number;
  endGeoResolved: number;
  startTime: number;
  endTime: number;
  stateWeight: number;
}

/**
 * Split a discrete location value into its constituent states. BEAST X writes
 * a posterior MAP tie as a `+`-joined string ("Guangdong+Shandong"); a
 * resolved node is a single state. Returns [] for a non-string / empty value.
 */
function resolveStates(value: unknown): string[] {
  if (typeof value !== 'string' || value === '') return [];
  return value
    .split('+')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export function buildBranchTable(
  graph: PhyloGraph,
  calibration: TreeCalibration,
  geos: NodeGeo[],
  layout: Layout,
  discreteTraitKey?: string,
  discreteGeoLookup?: Map<string, [lat: number, lon: number]>,
): BranchTable {
  const { nodes: layoutNodes, nodeMap, maxX } = layout;
  const isDiscrete = discreteTraitKey !== undefined && discreteGeoLookup !== undefined;

  const branchRows: BranchRow[] = [];
  const nodeIdxToFirstRow = new Map<number, number>();

  for (const lnode of layoutNodes) {
    if (lnode.parentId === null) continue;

    const nodeIdx = graph.origIdToIdx.get(lnode.id);
    if (nodeIdx === undefined) continue;

    const parentLnode = nodeMap.get(lnode.parentId);
    if (parentLnode === undefined) continue;

    const parentIdx = graph.origIdToIdx.get(parentLnode.id);
    if (parentIdx === undefined) continue;

    const isInternal = lnode.isTip ? 0 : 1;
    const startTime = calibration.heightToDecYear(maxX - parentLnode.x);
    const endTime = calibration.heightToDecYear(maxX - lnode.x);

    nodeIdxToFirstRow.set(nodeIdx, branchRows.length);

    if (!isDiscrete) {
      // Continuous trait — lat/lon are on the nodes directly. One arc.
      const parentGeo = geos[parentIdx];
      const childGeo = geos[nodeIdx];
      branchRows.push({
        nodeIdx,
        parentIdx,
        isInternal,
        startLat: parentGeo?.lat ?? 0,
        startLon: parentGeo?.lon ?? 0,
        startGeoResolved: parentGeo ? 1 : 0,
        endLat: childGeo?.lat ?? 0,
        endLon: childGeo?.lon ?? 0,
        endGeoResolved: childGeo ? 1 : 0,
        startTime,
        endTime,
        stateWeight: 1,
      });
      continue;
    }

    // Discrete trait — resolve each endpoint's location value. A node whose
    // posterior MAP estimate is a tie is annotated "A+B"; emit one arc per
    // (parentState × childState) combination, with weight split evenly so a
    // tie contributes the same total lineage flux as a resolved single state.
    const lookup = discreteGeoLookup as Map<string, [number, number]>;
    const traitKey = discreteTraitKey as string;
    const parentStates = resolveStates(graph.nodes[parentIdx]?.annotations[traitKey]);
    const childStates = resolveStates(graph.nodes[nodeIdx]?.annotations[traitKey]);
    const pList = parentStates.length > 0 ? parentStates : [''];
    const cList = childStates.length > 0 ? childStates : [''];
    const weight = 1 / (pList.length * cList.length);

    for (const ps of pList) {
      for (const cs of cList) {
        const pc = lookup.get(ps);
        const cc = lookup.get(cs);
        branchRows.push({
          nodeIdx,
          parentIdx,
          isInternal,
          startLat: pc?.[0] ?? 0,
          startLon: pc?.[1] ?? 0,
          startGeoResolved: pc ? 1 : 0,
          endLat: cc?.[0] ?? 0,
          endLon: cc?.[1] ?? 0,
          endGeoResolved: cc ? 1 : 0,
          startTime,
          endTime,
          stateWeight: weight,
        });
      }
    }
  }

  const count = branchRows.length;
  const branchId = new Int32Array(count);
  const parentBranch = new Int32Array(count);
  const isInternal = new Uint8Array(count);
  const startTime = new Float32Array(count);
  const endTime = new Float32Array(count);
  const startLat = new Float32Array(count);
  const startLon = new Float32Array(count);
  const endLat = new Float32Array(count);
  const endLon = new Float32Array(count);
  const startGeoResolved = new Uint8Array(count);
  const endGeoResolved = new Uint8Array(count);
  const stateWeight = new Float32Array(count);

  let hasPosterior = false;
  for (let i = 0; i < count; i++) {
    const row = branchRows[i];
    if (row === undefined) continue;
    // BEAST NEXUS attaches posterior to the parent (internal) node, not the child
    const p = graph.nodes[row.parentIdx]?.annotations.posterior;
    if (typeof p === 'number') {
      hasPosterior = true;
      break;
    }
  }
  const posterior = hasPosterior ? new Float32Array(count) : undefined;

  for (let i = 0; i < count; i++) {
    const row = branchRows[i];
    if (row === undefined) continue;
    branchId[i] = row.nodeIdx;
    isInternal[i] = row.isInternal;
    startTime[i] = row.startTime;
    endTime[i] = row.endTime;
    startLat[i] = row.startLat;
    startLon[i] = row.startLon;
    endLat[i] = row.endLat;
    endLon[i] = row.endLon;
    startGeoResolved[i] = row.startGeoResolved;
    endGeoResolved[i] = row.endGeoResolved;
    stateWeight[i] = row.stateWeight;
    const parentRow = nodeIdxToFirstRow.get(row.parentIdx);
    parentBranch[i] = parentRow !== undefined ? parentRow : -1;
    if (posterior) {
      // BEAST NEXUS attaches posterior to the parent (internal) node, not the child
      const p = graph.nodes[row.parentIdx]?.annotations.posterior;
      posterior[i] = typeof p === 'number' ? p : 0;
    }
  }

  return {
    count,
    branchId,
    parentBranch,
    isInternal,
    startTime,
    endTime,
    startLat,
    startLon,
    endLat,
    endLon,
    startGeoResolved,
    endGeoResolved,
    stateWeight,
    ...(posterior !== undefined ? { posterior } : {}),
  };
}
