import type { BranchTable, GeoJSONPolygon } from '../phylo/types';

export interface HpdPolygonRenderDatum {
  polygon: GeoJSONPolygon;
  nodeTime: number;
  nodeIdx: number;
}

function buildNodeEndTimeMap(branchTable: BranchTable | null): Map<number, number> | null {
  if (!branchTable) return null;
  const result = new Map<number, number>();
  let minStartTime = Number.POSITIVE_INFINITY;
  const branchIds = new Set<number>();

  for (let i = 0; i < branchTable.count; i++) {
    const nodeIdx = branchTable.branchId[i] ?? i;
    branchIds.add(nodeIdx);
    if (!result.has(nodeIdx)) result.set(nodeIdx, branchTable.endTime[i] ?? 0);
    const startTime = branchTable.startTime[i] ?? Number.POSITIVE_INFINITY;
    if (startTime < minStartTime) minStartTime = startTime;
  }

  if (branchTable.count > 0 && Number.isFinite(minStartTime)) {
    for (let candidate = 0; candidate <= branchTable.count; candidate++) {
      if (!branchIds.has(candidate)) {
        if (!result.has(candidate)) result.set(candidate, minStartTime);
        break;
      }
    }
  }

  return result;
}

export function buildHpdRenderData(
  nodeHpds: (GeoJSONPolygon | null)[] | null,
  branchTable: BranchTable | null,
): HpdPolygonRenderDatum[] {
  const nodeEndTimeMap = buildNodeEndTimeMap(branchTable);
  if (!nodeHpds || !nodeEndTimeMap) return [];

  const result: HpdPolygonRenderDatum[] = [];
  for (let nodeIdx = 0; nodeIdx < nodeHpds.length; nodeIdx++) {
    const polygon = nodeHpds[nodeIdx] ?? null;
    if (polygon === null) continue;
    result.push({
      polygon,
      nodeTime: nodeEndTimeMap.get(nodeIdx) ?? Number.POSITIVE_INFINITY,
      nodeIdx,
    });
  }
  return result;
}

export function buildMultiHpdRenderData(
  nodeMultiHpds: (GeoJSONPolygon[] | null)[] | null,
  branchTable: BranchTable | null,
): HpdPolygonRenderDatum[] {
  const nodeEndTimeMap = buildNodeEndTimeMap(branchTable);
  if (!nodeMultiHpds || !nodeEndTimeMap) return [];

  const result: HpdPolygonRenderDatum[] = [];
  for (let nodeIdx = 0; nodeIdx < nodeMultiHpds.length; nodeIdx++) {
    const entry = nodeMultiHpds[nodeIdx] ?? null;
    if (entry === null) continue;
    const nodeTime = nodeEndTimeMap.get(nodeIdx) ?? Number.POSITIVE_INFINITY;
    for (const polygon of entry) result.push({ polygon, nodeTime, nodeIdx });
  }
  return result;
}
