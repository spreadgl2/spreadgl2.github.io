import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NodeGeo } from '../phylo/annotate.js';
import { extractGeoAnnotations } from '../phylo/annotate.js';
import { TreeCalibration } from '../phylo/calibrate.js';
import { introspect } from '../phylo/introspect.js';
import { computeLayoutFromGraph } from '../phylo/layout.js';
import { parseTreeFile } from '../phylo/parse.js';
import type { PhyloGraph } from '../phylo/types.js';
import { buildBranchTable } from './branch-table.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../../tests/fixtures');

describe('buildBranchTable — continuous-tiny.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const introspectResult = introspect(graph);
  const geos = extractGeoAnnotations(graph, introspectResult);
  const layout = computeLayoutFromGraph(graph);
  const cal = new TreeCalibration();
  cal.setAnchor('date', layout.nodeMap, layout.maxX);
  const bt = buildBranchTable(graph, cal, geos, layout);

  it('count equals nodes minus 1', () => {
    expect(bt.count).toBe(graph.nodes.length - 1);
  });

  it('all typed arrays have length equal to count', () => {
    expect(bt.branchId).toHaveLength(bt.count);
    expect(bt.parentBranch).toHaveLength(bt.count);
    expect(bt.isInternal).toHaveLength(bt.count);
    expect(bt.startTime).toHaveLength(bt.count);
    expect(bt.endTime).toHaveLength(bt.count);
    expect(bt.startLat).toHaveLength(bt.count);
    expect(bt.startLon).toHaveLength(bt.count);
    expect(bt.endLat).toHaveLength(bt.count);
    expect(bt.endLon).toHaveLength(bt.count);
    expect(bt.startGeoResolved).toHaveLength(bt.count);
    expect(bt.endGeoResolved).toHaveLength(bt.count);
    expect(bt.stateWeight).toHaveLength(bt.count);
  });

  it('typed arrays are the correct types', () => {
    expect(bt.branchId).toBeInstanceOf(Int32Array);
    expect(bt.parentBranch).toBeInstanceOf(Int32Array);
    expect(bt.isInternal).toBeInstanceOf(Uint8Array);
    expect(bt.startTime).toBeInstanceOf(Float32Array);
    expect(bt.endTime).toBeInstanceOf(Float32Array);
    expect(bt.startLat).toBeInstanceOf(Float32Array);
    expect(bt.startLon).toBeInstanceOf(Float32Array);
    expect(bt.endLat).toBeInstanceOf(Float32Array);
    expect(bt.endLon).toBeInstanceOf(Float32Array);
    expect(bt.startGeoResolved).toBeInstanceOf(Uint8Array);
    expect(bt.endGeoResolved).toBeInstanceOf(Uint8Array);
    expect(bt.stateWeight).toBeInstanceOf(Float32Array);
  });

  it('all stateWeight values are 1.0 for continuous-trait', () => {
    for (let i = 0; i < bt.count; i++) {
      expect(bt.stateWeight[i]).toBeCloseTo(1.0, 5);
    }
  });

  it('all branchId values map to valid PhyloGraph nodes', () => {
    for (let i = 0; i < bt.count; i++) {
      const idx = bt.branchId[i] ?? -1;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(graph.nodes.length);
    }
  });

  it('TipA branch (branchId=3) has correct start/end times and geo', () => {
    // TipA is node n3 (idx=3), parent is n2 (idx=2)
    let rowIdx = -1;
    for (let i = 0; i < bt.count; i++) {
      if (bt.branchId[i] === 3) {
        rowIdx = i;
        break;
      }
    }
    expect(rowIdx).toBeGreaterThanOrEqual(0);

    // startTime should be n2's (parent's) decimal year; endTime = n3's (TipA's) decimal year
    // TipA date is 2010-05-12 ≈ 2010.36..., but calibration is based on layout heights
    // From our computation: endTime ≈ 2013.038 (TipA's calibrated year), startTime ≈ 2012.538
    expect(bt.startTime[rowIdx]).toBeCloseTo(2012.538, 1);
    expect(bt.endTime[rowIdx]).toBeCloseTo(2013.038, 1);

    // startLat/startLon = n2's geo (parent)
    expect(bt.startLat[rowIdx]).toBeCloseTo(40.1134, 3);
    expect(bt.startLon[rowIdx]).toBeCloseTo(-91.4723, 3);

    // endLat/endLon = TipA's geo
    expect(bt.endLat[rowIdx]).toBeCloseTo(38.5234, 3);
    expect(bt.endLon[rowIdx]).toBeCloseTo(-95.3127, 3);
  });

  it('startTime is always less than endTime for all rows', () => {
    for (let i = 0; i < bt.count; i++) {
      expect(bt.startTime[i]).toBeLessThan(bt.endTime[i] ?? Infinity);
    }
  });

  it('root (idx=0) does not appear in branchId', () => {
    for (let i = 0; i < bt.count; i++) {
      expect(bt.branchId[i]).not.toBe(0);
    }
  });

  it('parentBranch values are either -1 (no parent branch) or valid row indices', () => {
    for (let i = 0; i < bt.count; i++) {
      const pb = bt.parentBranch[i] ?? -2;
      expect(pb === -1 || (pb >= 0 && pb < bt.count)).toBe(true);
    }
  });
});

describe('buildBranchTable — discrete modal location only', () => {
  // Synthetic tree: root(0) → internal(1) → tips(3,4,5); root(0) → tip(2).
  // internal(1) ALSO carries location_set=['NY','CA'] / location_set_prob —
  // a BEAST posterior set. The branch table must IGNORE the set and use only
  // the modal `location` scalar: one arc per branch, no multi-state fan-out.
  function makeDiscreteGraph(): PhyloGraph {
    const nodes = [
      {
        idx: 0,
        origId: 'n0',
        name: null,
        label: null,
        annotations: { location: 'NY' },
        adjacents: [1, 2],
        lengths: [1.0, 1.0],
      },
      {
        idx: 1,
        origId: 'n1',
        name: null,
        label: null,
        annotations: {
          location: 'NY',
          location_set: ['NY', 'CA'],
          location_set_prob: [0.7, 0.3],
        },
        adjacents: [0, 3, 4, 5],
        lengths: [1.0, 0.5, 0.5, 0.5],
      },
      {
        idx: 2,
        origId: 'n2',
        name: 'TipX',
        label: null,
        annotations: { location: 'TX', date: '2013.0' },
        adjacents: [0],
        lengths: [1.0],
      },
      {
        idx: 3,
        origId: 'n3',
        name: 'TipA',
        label: null,
        annotations: { location: 'NY', date: '2013.0' },
        adjacents: [1],
        lengths: [0.5],
      },
      {
        idx: 4,
        origId: 'n4',
        name: 'TipB',
        label: null,
        annotations: { location: 'CA', date: '2013.0' },
        adjacents: [1],
        lengths: [0.5],
      },
      {
        idx: 5,
        origId: 'n5',
        name: 'TipC',
        label: null,
        annotations: { location: 'NY', date: '2013.0' },
        adjacents: [1],
        lengths: [0.5],
      },
    ];
    return {
      nodes,
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map(nodes.map((n) => [n.origId, n.idx])),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
  }

  const graph = makeDiscreteGraph();
  const layout = computeLayoutFromGraph(graph);
  const cal = new TreeCalibration();
  cal.setAnchor('date', layout.nodeMap, layout.maxX);

  // geos are null for discrete; startLat/Lon come from lookup
  const geos = graph.nodes.map(() => null);

  const lookup = new Map<string, [number, number]>([
    ['NY', [40.7, -74.0]],
    ['CA', [36.7, -119.4]],
    ['TX', [31.0, -100.0]],
  ]);

  const bt = buildBranchTable(graph, cal, geos, layout, 'location', lookup);

  it('emits exactly one row per branch (5 non-root nodes → 5 rows)', () => {
    expect(bt.count).toBe(5);
  });

  it('every row has stateWeight 1.0 — no posterior-set fan-out', () => {
    for (let i = 0; i < bt.count; i++) {
      expect(bt.stateWeight[i]).toBeCloseTo(1.0, 5);
    }
  });

  it("node 1's child branches all start at node 1's MODAL location (NY), ignoring location_set", () => {
    const childIdxs = new Set([3, 4, 5]);
    let rows = 0;
    for (let i = 0; i < bt.count; i++) {
      if (!childIdxs.has(bt.branchId[i] ?? -1)) continue;
      // node 1 modal location = 'NY' → (40.7, -74.0). The CA entry in
      // location_set must NOT appear as a start coordinate.
      expect(bt.startLat[i]).toBeCloseTo(40.7, 3);
      expect(bt.startLon[i]).toBeCloseTo(-74.0, 3);
      rows++;
    }
    expect(rows).toBe(3);
  });

  it('end coordinates use the child node modal location', () => {
    // branchId 4 = TipB, location 'CA' → (36.7, -119.4)
    for (let i = 0; i < bt.count; i++) {
      if ((bt.branchId[i] ?? -1) !== 4) continue;
      expect(bt.endLat[i]).toBeCloseTo(36.7, 3);
      expect(bt.endLon[i]).toBeCloseTo(-119.4, 3);
    }
  });

  it('marks branches touching an unannotated internal node as geographically unresolved', () => {
    const incompleteGraph = makeDiscreteGraph();
    delete incompleteGraph.nodes[0]?.annotations.location;
    const incompleteLayout = computeLayoutFromGraph(incompleteGraph);
    const incompleteCal = new TreeCalibration();
    incompleteCal.setAnchor('date', incompleteLayout.nodeMap, incompleteLayout.maxX);
    const table = buildBranchTable(
      incompleteGraph,
      incompleteCal,
      incompleteGraph.nodes.map(() => null),
      incompleteLayout,
      'location',
      lookup,
    );

    for (let i = 0; i < table.count; i++) {
      const branchId = table.branchId[i];
      expect(table.startGeoResolved?.[i]).toBe(branchId === 1 || branchId === 2 ? 0 : 1);
      expect(table.endGeoResolved?.[i]).toBe(1);
    }
  });

  it('distinguishes a valid coordinate at (0,0) from a missing coordinate', () => {
    const zeroLookup = new Map(lookup);
    zeroLookup.set('NY', [0, 0]);
    const table = buildBranchTable(graph, cal, geos, layout, 'location', zeroLookup);
    const nyRow = Array.from(table.branchId).indexOf(3);

    expect(table.startLat[nyRow]).toBe(0);
    expect(table.startLon[nyRow]).toBe(0);
    expect(table.startGeoResolved?.[nyRow]).toBe(1);
    expect(table.endGeoResolved?.[nyRow]).toBe(1);
  });
});

describe('buildBranchTable — compound tie expansion (A+B)', () => {
  // Two tips off a single root: TipP at 'TX', TipTie at 'NY+CA' (a BEAST X
  // posterior MAP tie). Root is 'TX'.
  function makeTieGraph(): PhyloGraph {
    const nodes = [
      {
        idx: 0,
        origId: 'r',
        name: null,
        label: null,
        annotations: { location: 'TX' },
        adjacents: [1, 2],
        lengths: [1, 1],
      },
      {
        idx: 1,
        origId: 'p',
        name: 'TipP',
        label: null,
        annotations: { location: 'TX', date: '2013.0' },
        adjacents: [0],
        lengths: [1],
      },
      {
        idx: 2,
        origId: 'tie',
        name: 'TipTie',
        label: null,
        annotations: { location: 'NY+CA', date: '2013.0' },
        adjacents: [0],
        lengths: [1],
      },
    ];
    return {
      nodes,
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map(nodes.map((n) => [n.origId, n.idx])),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
  }

  const graph = makeTieGraph();
  const layout = computeLayoutFromGraph(graph);
  const cal = new TreeCalibration();
  cal.setAnchor('date', layout.nodeMap, layout.maxX);
  const geos = graph.nodes.map(() => null);
  const lookup = new Map<string, [number, number]>([
    ['NY', [40.7, -74.0]],
    ['CA', [36.7, -119.4]],
    ['TX', [31.0, -100.0]],
  ]);
  const bt = buildBranchTable(graph, cal, geos, layout, 'location', lookup);

  it('a tied "NY+CA" tip emits two rows — one arc per state', () => {
    const tieRows = Array.from({ length: bt.count }, (_, i) => i).filter(
      (i) => bt.branchId[i] === 2,
    );
    expect(tieRows).toHaveLength(2);
  });

  it('each tied row carries half weight (0.5) so the tie sums to one lineage', () => {
    let total = 0;
    for (let i = 0; i < bt.count; i++) {
      if (bt.branchId[i] === 2) {
        expect(bt.stateWeight[i]).toBeCloseTo(0.5, 5);
        total += bt.stateWeight[i] ?? 0;
      }
    }
    expect(total).toBeCloseTo(1.0, 5);
  });

  it('the two tied rows end at NY and CA respectively', () => {
    const ends = new Set<string>();
    for (let i = 0; i < bt.count; i++) {
      if (bt.branchId[i] === 2) ends.add(`${bt.endLat[i]?.toFixed(1)},${bt.endLon[i]?.toFixed(1)}`);
    }
    expect(ends.has('40.7,-74.0')).toBe(true);
    expect(ends.has('36.7,-119.4')).toBe(true);
  });

  it('the single-state tip emits exactly one row', () => {
    const pRows = Array.from({ length: bt.count }, (_, i) => i).filter((i) => bt.branchId[i] === 1);
    expect(pRows).toHaveLength(1);
    expect(bt.stateWeight[pRows[0] ?? 0]).toBeCloseTo(1.0, 5);
  });
});

describe('buildBranchTable — posterior reads from parent (internal) node', () => {
  // BEAST NEXUS puts posterior on internal nodes: (A,B)[&posterior=0.95]:len
  // Tips never carry posterior. A branch-table build on a tree where only internal
  // nodes have posterior annotations must still produce a populated posterior array.
  // This is the regression test for the T094 bug where nodeIdx (child) was read
  // instead of parentIdx (parent/internal).
  function makePosteriorGraph(): PhyloGraph {
    // Tree topology: root(0) -> internal(1) -> tips(2,3); root(0) -> tip(4)
    // posterior on root(0)=0.90, internal(1)=0.95; tips have no posterior
    const nodes = [
      {
        idx: 0,
        origId: 'root',
        name: null,
        label: null,
        annotations: { posterior: 0.9, date: '2013.0' },
        adjacents: [1, 4],
        lengths: [1.0, 1.0],
      },
      {
        idx: 1,
        origId: 'internal1',
        name: null,
        label: null,
        annotations: { posterior: 0.95 },
        adjacents: [0, 2, 3],
        lengths: [1.0, 0.5, 0.5],
      },
      {
        idx: 2,
        origId: 'tipA',
        name: 'TipA',
        label: null,
        annotations: { date: '2013.0' },
        adjacents: [1],
        lengths: [0.5],
      },
      {
        idx: 3,
        origId: 'tipB',
        name: 'TipB',
        label: null,
        annotations: { date: '2013.0' },
        adjacents: [1],
        lengths: [0.5],
      },
      {
        idx: 4,
        origId: 'tipC',
        name: 'TipC',
        label: null,
        annotations: { date: '2013.0' },
        adjacents: [0],
        lengths: [1.0],
      },
    ];
    return {
      nodes,
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map(nodes.map((n) => [n.origId, n.idx])),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
  }

  const graph = makePosteriorGraph();
  const layout = computeLayoutFromGraph(graph);
  const cal = new TreeCalibration();
  cal.setAnchor('date', layout.nodeMap, layout.maxX);
  const geos: NodeGeo[] = [
    { lat: 51.5, lon: -0.1 },
    { lat: 51.4, lon: -0.05 },
    { lat: 51.3, lon: 0.0 },
    { lat: 51.6, lon: -0.2 },
    { lat: 51.7, lon: -0.3 },
  ];
  const bt = buildBranchTable(graph, cal, geos, layout);

  it('posterior array is allocated when only internal nodes carry posterior', () => {
    expect(bt.posterior).toBeDefined();
    expect(bt.posterior).toBeInstanceOf(Float32Array);
    expect((bt.posterior as Float32Array).length).toBe(bt.count);
  });

  it('branch leading to internal1 (parentIdx=root) carries root posterior 0.9', () => {
    let foundRow = -1;
    for (let i = 0; i < bt.count; i++) {
      if (bt.branchId[i] === 1) {
        foundRow = i;
        break;
      }
    }
    expect(foundRow).toBeGreaterThanOrEqual(0);
    expect(bt.posterior?.[foundRow]).toBeCloseTo(0.9, 4);
  });

  it('branches leading to tips under internal1 carry internal1 posterior 0.95', () => {
    const tipIdxs = new Set([2, 3]);
    let count = 0;
    for (let i = 0; i < bt.count; i++) {
      if (!tipIdxs.has(bt.branchId[i] ?? -1)) continue;
      expect(bt.posterior?.[i]).toBeCloseTo(0.95, 4);
      count++;
    }
    expect(count).toBe(2);
  });

  it('tip branches themselves do not contribute posterior (parent carries it)', () => {
    // Verify that if we (wrongly) read child node posterior, tips would give 0
    // For branchId=2 (TipA): graph.nodes[2].annotations.posterior is undefined
    // The fix ensures we read parentIdx=1 instead (posterior=0.95)
    expect(graph.nodes[2]?.annotations.posterior).toBeUndefined();
    expect(graph.nodes[3]?.annotations.posterior).toBeUndefined();
    expect(graph.nodes[4]?.annotations.posterior).toBeUndefined();
  });
});
