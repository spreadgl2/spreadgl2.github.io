/** @original SpreadGL2 - tests for the peartree-adapted anchor calibration. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isoToDecimalYear } from '../format/decimal-year.js';
import { TreeCalibration } from './calibrate.js';
import { parseTreeFile } from './parse.js';
import type { LayoutNode } from './types.js';

const FIXTURES_DIR = join(import.meta.dirname, '../../../tests/fixtures');

const TIP_DATES: Record<string, string> = {
  'TipA|2010-05-12': '2010-05-12',
  'TipB|2011-03-08': '2011-03-08',
  'TipC|2012-07-22': '2012-07-22',
  'TipD|2009-11-30': '2009-11-30',
  'TipE|2013-01-15': '2013-01-15',
};

function buildLayoutNodeMap(graph: ReturnType<typeof parseTreeFile>): {
  nodeMap: Map<string, LayoutNode>;
  maxX: number;
} {
  const tipDecYears: number[] = [];
  for (const iso of Object.values(TIP_DATES)) {
    tipDecYears.push(isoToDecimalYear(iso));
  }
  const maxX = Math.max(...tipDecYears);

  const nodeMap = new Map<string, LayoutNode>();

  for (const node of graph.nodes) {
    const isTip = node.adjacents.length === 1;
    const name = node.name ?? '';
    const dateIso = TIP_DATES[name];
    let x: number;
    if (isTip && dateIso !== undefined) {
      x = isoToDecimalYear(dateIso);
    } else {
      x = maxX - 2.0;
    }
    const layoutNode: LayoutNode = {
      id: node.origId,
      x,
      y: 0,
      isTip,
      parentId: null,
      children: [],
      annotations: { ...node.annotations },
    };
    nodeMap.set(node.origId, layoutNode);
  }

  return { nodeMap, maxX };
}

describe('TreeCalibration — continuous-tiny.nex', () => {
  const text = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
  const graph = parseTreeFile(text);
  const { nodeMap, maxX } = buildLayoutNodeMap(graph);
  const cal = new TreeCalibration();
  const ok = cal.setAnchor('date', nodeMap, maxX);

  it('setAnchor returns true', () => {
    expect(ok).toBe(true);
  });

  it('active is true after setAnchor', () => {
    expect(cal.active).toBe(true);
  });

  it('each tip maps to correct decimal year ±1e-4', () => {
    for (const node of nodeMap.values()) {
      if (!node.isTip) continue;
      const h = maxX - node.x;
      const computed = cal.heightToDecYear(h);
      const expected = node.x;
      expect(Math.abs(computed - expected)).toBeLessThan(1e-4);
    }
  });

  it('internal nodes are monotonically older than their children', () => {
    for (const node of nodeMap.values()) {
      if (node.isTip) continue;
      const parentDecYear = cal.heightToDecYear(maxX - node.x);
      for (const childId of node.children) {
        const child = nodeMap.get(childId);
        if (!child) continue;
        const childDecYear = cal.heightToDecYear(maxX - child.x);
        expect(parentDecYear).toBeLessThan(childDecYear);
      }
    }
  });
});

describe('TreeCalibration.parseDateToDecYear', () => {
  it('parses ISO date', () => {
    const dec = TreeCalibration.parseDateToDecYear('2013-01-15');
    if (dec === null) throw new Error('expected non-null');
    expect(Math.abs(dec - isoToDecimalYear('2013-01-15'))).toBeLessThan(1e-9);
  });

  it('parses year-only', () => {
    const dec = TreeCalibration.parseDateToDecYear('2013');
    if (dec === null) throw new Error('expected non-null');
    expect(Math.abs(dec - isoToDecimalYear('2013-01-01'))).toBeLessThan(1e-9);
  });

  it('parses decimal year', () => {
    const dec = TreeCalibration.parseDateToDecYear('2013.04');
    if (dec === null) throw new Error('expected non-null');
    expect(Math.abs(dec - 2013.04)).toBeLessThan(1e-9);
  });

  it('returns null for garbage', () => {
    expect(TreeCalibration.parseDateToDecYear('not-a-date')).toBeNull();
  });
});

describe('TreeCalibration.decYearToDate', () => {
  it('round-trips ISO date through decimal year', () => {
    const iso = '2013-01-15';
    const dec = isoToDecimalYear(iso);
    const back = TreeCalibration.decYearToDate(dec);
    expect(back).toBe(iso);
  });
});

describe('TreeCalibration — decYearToHeight inverse', () => {
  it('decYearToHeight is inverse of heightToDecYear', () => {
    const text = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
    const graph = parseTreeFile(text);
    const { nodeMap, maxX } = buildLayoutNodeMap(graph);
    const cal = new TreeCalibration();
    cal.setAnchor('date', nodeMap, maxX);

    const testHeight = 1.5;
    const dec = cal.heightToDecYear(testHeight);
    const back = cal.decYearToHeight(dec);
    expect(Math.abs(back - testHeight)).toBeLessThan(1e-9);
  });
});

describe('TreeCalibration — setAnchor null clears', () => {
  it('returns false on null key', () => {
    const text = readFileSync(join(FIXTURES_DIR, 'continuous-tiny.nex'), 'utf8');
    const graph = parseTreeFile(text);
    const { nodeMap, maxX } = buildLayoutNodeMap(graph);
    const cal = new TreeCalibration();
    cal.setAnchor('date', nodeMap, maxX);
    expect(cal.active).toBe(true);
    const result = cal.setAnchor(null, nodeMap, maxX);
    expect(result).toBe(false);
    expect(cal.active).toBe(false);
  });
});
