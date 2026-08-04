import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractGeoAnnotations,
  extractHpdPolygons,
  extractMultiModalHpdPolygons,
} from '../lib/phylo/annotate.js';
import { TreeCalibration } from '../lib/phylo/calibrate.js';
import { collectAllDiscreteTipKeys, introspect } from '../lib/phylo/introspect.js';
import { computeLayoutFromGraph } from '../lib/phylo/layout.js';
import { parseTreeFileMeta } from '../lib/phylo/parse.js';
import { buildTimeSliceIndexes } from '../lib/phylo/slice.js';
import { buildBranchTable } from '../lib/tree-render/branch-table.js';
import {
  computeDateRange,
  getTransferables,
  rehydrate,
  serializeGraph,
  serializeLayout,
} from './wire.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../tests/fixtures');

function buildWireResult(fixtureName: string) {
  const text = readFileSync(join(FIXTURES_DIR, fixtureName), 'utf8');
  const { graph } = parseTreeFileMeta(text);
  const introspectResult = introspect(graph);
  const geos = extractGeoAnnotations(graph, introspectResult);
  const layout = computeLayoutFromGraph(graph);
  const cal = new TreeCalibration();
  cal.setAnchor('date', layout.nodeMap, layout.maxX);
  const branchTable = buildBranchTable(graph, cal, geos, layout);
  buildTimeSliceIndexes(branchTable);
  const nodeHpds = extractHpdPolygons(graph, introspectResult);
  const nodeMultiHpds = extractMultiModalHpdPolygons(graph, introspectResult);
  return {
    graph: serializeGraph(graph),
    layout: serializeLayout(layout),
    branchTable,
    dateRange: computeDateRange(branchTable),
    traitInfo: introspectResult,
    stringTable: [] as string[],
    nodeHpds,
    allDiscreteKeys: collectAllDiscreteTipKeys(graph),
    nodeMultiHpds,
  };
}

describe('getTransferables — continuous-tiny.nex', () => {
  const wire = buildWireResult('continuous-tiny.nex');

  it('returns an array of ArrayBuffer instances', () => {
    const transferables = getTransferables(wire);
    expect(Array.isArray(transferables)).toBe(true);
    for (const t of transferables) {
      expect(t).toBeInstanceOf(ArrayBuffer);
    }
  });

  it('covers all required BranchTable columns', () => {
    const transferables = getTransferables(wire);
    const bt = wire.branchTable;
    const expectedBuffers = [
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
    for (const buf of expectedBuffers) {
      expect(transferables).toContain(buf);
    }
  });

  it('each buffer is non-empty (count > 0)', () => {
    const transferables = getTransferables(wire);
    expect(wire.branchTable.count).toBeGreaterThan(0);
    for (const t of transferables) {
      expect((t as ArrayBuffer).byteLength).toBeGreaterThan(0);
    }
  });

  it('all buffer references are unique (no double-transfer)', () => {
    const transferables = getTransferables(wire);
    const set = new Set(transferables);
    expect(set.size).toBe(transferables.length);
  });
});

describe('getTransferables — optional columns', () => {
  it('includes posterior.buffer when present', () => {
    const wire = buildWireResult('continuous-tiny.nex');
    const bt = wire.branchTable;
    const mockPosterior = new Float32Array(bt.count);
    bt.posterior = mockPosterior;
    const transferables = getTransferables(wire);
    expect(transferables).toContain(mockPosterior.buffer);
  });

  it('includes hpdIndex.buffer when present', () => {
    const wire = buildWireResult('continuous-tiny.nex');
    const bt = wire.branchTable;
    const mockHpdIndex = new Int32Array(bt.count);
    bt.hpdIndex = mockHpdIndex;
    const transferables = getTransferables(wire);
    expect(transferables).toContain(mockHpdIndex.buffer);
  });

  it('includes startLocationId.buffer when present', () => {
    const wire = buildWireResult('continuous-tiny.nex');
    const bt = wire.branchTable;
    const mockLocId = new Int32Array(bt.count);
    bt.startLocationId = mockLocId;
    const transferables = getTransferables(wire);
    expect(transferables).toContain(mockLocId.buffer);
  });

  it('includes endLocationId.buffer when present', () => {
    const wire = buildWireResult('continuous-tiny.nex');
    const bt = wire.branchTable;
    const mockLocId = new Int32Array(bt.count);
    bt.endLocationId = mockLocId;
    const transferables = getTransferables(wire);
    expect(transferables).toContain(mockLocId.buffer);
  });

  it('includes geographic-resolution mask buffers when present', () => {
    const wire = buildWireResult('continuous-tiny.nex');
    const { startGeoResolved, endGeoResolved } = wire.branchTable;
    expect(startGeoResolved).toBeDefined();
    expect(endGeoResolved).toBeDefined();
    const transferables = getTransferables(wire);
    expect(transferables).toContain(startGeoResolved?.buffer);
    expect(transferables).toContain(endGeoResolved?.buffer);
  });
});

describe('rehydrate — legacy cached results', () => {
  it('derives tip-date rows when cached wire output lacks the new payload field', () => {
    const wire = buildWireResult('continuous-tiny.nex');

    const result = rehydrate(wire);

    expect(result.tipDateRows).toHaveLength(5);
    expect(result.tipDateRows[0]).toMatchObject({
      taxon: 'TipA|2010-05-12',
      parsedSubstring: '2010-05-12',
      format: 'iso-pipe',
      source: 'parsed',
    });
  });
});
