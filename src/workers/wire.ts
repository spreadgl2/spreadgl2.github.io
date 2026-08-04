import type { TipDateResult } from '../lib/format/tip-date.js';
import {
  deriveTipDateRowsFromGraph,
  type TipDateFormat,
  type TipDateRow,
} from '../lib/format/tip-date-table.js';
import { TreeCalibration } from '../lib/phylo/calibrate.js';
import type {
  BranchTable,
  GeoJSONPolygon,
  IntrospectResult,
  Layout,
  LayoutNode,
  PhyloGraph,
  PhyloNode,
} from '../lib/phylo/types.js';

export interface TipDateSample {
  label: string;
  result: TipDateResult;
}

export interface WirePhyloNode {
  idx: number;
  origId: string;
  name: string | null;
  label: string | null;
  annotations: Record<string, unknown>;
  adjacents: number[];
  lengths: number[];
}

export interface WireParseResult {
  graph: {
    nodes: WirePhyloNode[];
    root: {
      nodeA: number;
      nodeB: number;
      lenA: number;
      lenB: number;
      annotations: Record<string, unknown>;
    };
    origIds: string[];
    rooted: boolean;
  };
  layout: {
    nodes: LayoutNode[];
    maxX: number;
    maxY: number;
    xAxisMode: 'divergence' | 'height' | 'date';
  };
  branchTable: BranchTable;
  dateRange: [number, number];
  traitInfo: IntrospectResult;
  stringTable: string[];
  nodeHpds: (GeoJSONPolygon | null)[];
  allDiscreteKeys: string[];
  nodeMultiHpds: (GeoJSONPolygon[] | null)[];
  multiTreeCount?: number;
  tipDateSamples?: TipDateSample[];
  tipDateRows?: TipDateRow[];
  mrsdInfo?: MrsdInfo;
}

// Provenance of the most-recent-sampling-date anchor: which tip/label produced
// it, the raw substring, and its format. `manual` = user-supplied MRSD.
export interface MrsdInfo {
  decimalYear: number;
  substring: string;
  taxon: string | null;
  format: TipDateFormat | null;
  manual: boolean;
}

export interface RehydrateResult {
  graph: PhyloGraph;
  layout: Layout;
  branchTable: BranchTable;
  dateRange: [number, number];
  traitInfo: IntrospectResult;
  nodeHpds: (GeoJSONPolygon | null)[];
  allDiscreteKeys: string[];
  nodeMultiHpds: (GeoJSONPolygon[] | null)[];
  tipDateRows: TipDateRow[];
  mrsdInfo?: MrsdInfo;
}

export function serializeGraph(graph: PhyloGraph): WireParseResult['graph'] {
  const origIds = graph.nodes.map((n) => n.origId);
  const nodes: WirePhyloNode[] = graph.nodes.map((n: PhyloNode) => ({
    idx: n.idx,
    origId: n.origId,
    name: n.name,
    label: n.label,
    annotations: n.annotations,
    adjacents: n.adjacents,
    lengths: n.lengths,
  }));
  return {
    nodes,
    root: {
      nodeA: graph.root.nodeA,
      nodeB: graph.root.nodeB,
      lenA: graph.root.lenA,
      lenB: graph.root.lenB,
      annotations: graph.root.annotations,
    },
    origIds,
    rooted: graph.rooted,
  };
}

export function serializeLayout(layout: Layout): WireParseResult['layout'] {
  return {
    nodes: layout.nodes,
    maxX: layout.maxX,
    maxY: layout.maxY,
    xAxisMode: layout.xAxisMode,
  };
}

export function computeDateRange(branchTable: BranchTable): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < branchTable.count; i++) {
    const s = branchTable.startTime[i] ?? 0;
    const e = branchTable.endTime[i] ?? 0;
    if (s < min) min = s;
    if (e > max) max = e;
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  return [min, max];
}

export function rehydrate(wire: WireParseResult): RehydrateResult {
  const origIdToIdx = new Map<string, number>();
  for (let i = 0; i < wire.graph.origIds.length; i++) {
    const id = wire.graph.origIds[i];
    if (id !== undefined) origIdToIdx.set(id, i);
  }

  const graph: PhyloGraph = {
    nodes: wire.graph.nodes as PhyloNode[],
    root: wire.graph.root,
    origIdToIdx,
    rooted: wire.graph.rooted,
    hiddenNodeIds: new Set<string>(),
    collapsedCladeIds: new Map<string, { colour: string | null; tipCount: number }>(),
  };

  const nodeMap = new Map<string, LayoutNode>();
  for (const n of wire.layout.nodes) {
    nodeMap.set(n.id, n);
  }

  const layout: Layout = {
    nodes: wire.layout.nodes,
    nodeMap,
    maxX: wire.layout.maxX,
    maxY: wire.layout.maxY,
    xAxisMode: wire.layout.xAxisMode,
  };

  const tipDateRows = wire.tipDateRows ?? deriveTipDateRowsFromGraph(graph, layout);

  return {
    graph,
    layout,
    branchTable: wire.branchTable,
    dateRange: wire.dateRange,
    traitInfo: wire.traitInfo,
    nodeHpds: wire.nodeHpds,
    allDiscreteKeys: wire.allDiscreteKeys,
    nodeMultiHpds: wire.nodeMultiHpds,
    tipDateRows,
    ...(wire.mrsdInfo ? { mrsdInfo: wire.mrsdInfo } : {}),
  };
}

export function getTransferables(wire: WireParseResult): Transferable[] {
  const bt = wire.branchTable;
  const transferables: Transferable[] = [
    bt.branchId.buffer,
    bt.parentBranch.buffer,
    bt.isInternal.buffer,
    bt.startTime.buffer,
    bt.endTime.buffer,
    bt.startLat.buffer,
    bt.startLon.buffer,
    bt.endLat.buffer,
    bt.endLon.buffer,
    bt.stateWeight.buffer,
  ];
  if (bt.posterior) transferables.push(bt.posterior.buffer);
  if (bt.hpdIndex) transferables.push(bt.hpdIndex.buffer);
  if (bt.startGeoResolved) transferables.push(bt.startGeoResolved.buffer);
  if (bt.endGeoResolved) transferables.push(bt.endGeoResolved.buffer);
  if (bt.startLocationId) transferables.push(bt.startLocationId.buffer);
  if (bt.endLocationId) transferables.push(bt.endLocationId.buffer);
  return transferables;
}

export { TreeCalibration };
