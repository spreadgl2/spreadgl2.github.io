import { describe, expect, it } from 'vitest';
import type { BranchTable, GeoJSONPolygon } from '../phylo/types';
import { buildHpdRenderData, buildMultiHpdRenderData } from './hpd-render-data';

function branchTable(branchIds: number[], startTimes: number[], endTimes: number[]): BranchTable {
  const count = branchIds.length;
  return {
    count,
    branchId: new Int32Array(branchIds),
    parentBranch: new Int32Array(count),
    isInternal: new Uint8Array(count),
    startTime: new Float32Array(startTimes),
    endTime: new Float32Array(endTimes),
    startLat: new Float32Array(count),
    startLon: new Float32Array(count),
    endLat: new Float32Array(count),
    endLon: new Float32Array(count),
    stateWeight: new Float32Array(count).fill(1),
  };
}

function polygon(offset: number): GeoJSONPolygon {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [offset, offset],
        [offset + 1, offset],
        [offset + 1, offset + 1],
        [offset, offset],
      ],
    ],
  };
}

describe('HPD render-data precompute', () => {
  it('returns empty data when HPDs or branch table are unavailable', () => {
    const bt = branchTable([1], [2000], [2001]);

    expect(buildHpdRenderData(null, bt)).toEqual([]);
    expect(buildHpdRenderData([polygon(0)], null)).toEqual([]);
    expect(buildMultiHpdRenderData(null, bt)).toEqual([]);
    expect(buildMultiHpdRenderData([[polygon(0)]], null)).toEqual([]);
  });

  it('uses branch end times for child-node HPD polygons', () => {
    const bt = branchTable([1, 2], [2000, 2001], [2001, 2002]);
    const p = polygon(10);

    expect(buildHpdRenderData([null, p, null], bt)).toEqual([
      { polygon: p, nodeTime: 2001, nodeIdx: 1 },
    ]);
  });

  it('assigns the root HPD polygon to the earliest branch start time', () => {
    const bt = branchTable([1, 2], [1999.5, 2000], [2001, 2002]);
    const p = polygon(20);

    expect(buildHpdRenderData([p, null, null], bt)).toEqual([
      { polygon: p, nodeTime: 1999.5, nodeIdx: 0 },
    ]);
  });

  it('expands multimodal HPDs into one render datum per polygon', () => {
    const bt = branchTable([1], [2000], [2001]);
    const p1 = polygon(30);
    const p2 = polygon(40);

    expect(buildMultiHpdRenderData([null, [p1, p2]], bt)).toEqual([
      { polygon: p1, nodeTime: 2001, nodeIdx: 1 },
      { polygon: p2, nodeTime: 2001, nodeIdx: 1 },
    ]);
  });
});
