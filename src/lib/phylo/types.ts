/**
 * Adapted from peartree (MIT), Copyright (c) 2026 Andrew Rambaut.
 * Source: pearcore/peartree/js/phylograph.js:30-77 ("PhyloNode / PhyloGraph types")
 * https://github.com/artic-network/peartree
 *
 * The adjacency-list model is retained; application-specific types are SpreadGL2 additions.
 */

export type PlayMode = 'Trail' | 'Window';

export interface TimeWindow {
  start: number;
  end: number;
}

export interface PhyloNode {
  idx: number;
  origId: string;
  name: string | null;
  label: string | null;
  annotations: Record<string, unknown>;
  adjacents: number[];
  lengths: number[];
}

export interface PhyloGraphRoot {
  nodeA: number;
  nodeB: number;
  lenA: number;
  lenB: number;
  annotations: Record<string, unknown>;
}

export interface PhyloGraph {
  nodes: PhyloNode[];
  root: PhyloGraphRoot;
  origIdToIdx: Map<string, number>;
  rooted: boolean;
  hiddenNodeIds: Set<string>;
  collapsedCladeIds: Map<string, { colour: string | null; tipCount: number }>;
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  isTip: boolean;
  parentId: string | null;
  children: string[];
  isCollapsed?: boolean;
  collapsedTipCount?: number;
  annotations: Record<string, unknown>;
}

export interface Layout {
  nodes: LayoutNode[];
  nodeMap: Map<string, LayoutNode>;
  maxX: number;
  maxY: number;
  xAxisMode: 'divergence' | 'height' | 'date';
}

type GeoJSONPosition = number[];
export type GeoJSONPolygon = {
  type: 'Polygon';
  coordinates: GeoJSONPosition[][];
};

export type NodeHpd = GeoJSONPolygon | null;

export type NodeMultiHpd = GeoJSONPolygon[] | null;

export type IntrospectResult =
  | { kind: 'continuous'; keyFamily: { lat: string; lon: string }; wgs84: boolean }
  | { kind: 'discrete'; key: string; values: string[]; ambiguous: false }
  | { kind: 'discrete-ambiguous'; candidates: Array<{ key: string; values: string[] }> }
  | { kind: 'unrecognized'; reason: string };

export interface ViewingRefusal {
  code: 'non_wgs84' | 'no_geo' | 'no_dates';
  title: string;
  body: string;
  action?: string;
}

export type ValidationResult = { ok: true } | { ok: false; refusal: ViewingRefusal };

export type NodeGeo = { lat: number; lon: number } | null;

export interface BranchTable {
  count: number;
  branchId: Int32Array;
  parentBranch: Int32Array;
  isInternal: Uint8Array;
  startTime: Float32Array;
  endTime: Float32Array;
  startLat: Float32Array;
  startLon: Float32Array;
  endLat: Float32Array;
  endLon: Float32Array;
  startGeoResolved?: Uint8Array;
  endGeoResolved?: Uint8Array;
  stateWeight: Float32Array;
  posterior?: Float32Array;
  hpdIndex?: Int32Array;
  hpdPolygons?: GeoJSONPolygon[];
  startLocationId?: Int32Array;
  endLocationId?: Int32Array;
}
