import { describe, expect, it } from 'vitest';
import { type BranchSegment, buildKDTree, kdQueryNearest } from './branch-kdtree';

function seg(x1: number, y1: number, x2: number, y2: number, id: string): BranchSegment {
  return { x1, y1, x2, y2, branchId: id };
}

describe('buildKDTree', () => {
  it('returns a tree with null root for empty input', () => {
    const tree = buildKDTree([]);
    expect(tree.root).toBeNull();
  });

  it('builds a non-null root for a single segment', () => {
    const tree = buildKDTree([seg(0, 0, 10, 0, 'a')]);
    expect(tree.root).not.toBeNull();
    expect(tree.root?.segment.branchId).toBe('a');
  });

  it('builds from multiple segments without throwing', () => {
    const segments = [
      seg(0, 0, 100, 0, 'root'),
      seg(100, 0, 200, 0, 'tip_a'),
      seg(100, 50, 200, 50, 'tip_b'),
      seg(100, 100, 200, 100, 'tip_c'),
    ];
    expect(() => buildKDTree(segments)).not.toThrow();
    const tree = buildKDTree(segments);
    expect(tree.root).not.toBeNull();
  });
});

describe('kdQueryNearest', () => {
  it('returns null for empty tree', () => {
    const tree = buildKDTree([]);
    expect(kdQueryNearest(tree, 50, 50, 10)).toBeNull();
  });

  it('returns null when query is beyond maxDist', () => {
    const tree = buildKDTree([seg(0, 0, 100, 0, 'a')]);
    // nearest point on segment is (50, 0); query at (50, 20) is distance 20, maxDist=10
    expect(kdQueryNearest(tree, 50, 20, 10)).toBeNull();
  });

  it('returns segment when query is within maxDist', () => {
    const tree = buildKDTree([seg(0, 0, 100, 0, 'a')]);
    // query at (50, 4) → distance 4 < maxDist=6
    const result = kdQueryNearest(tree, 50, 4, 6);
    expect(result).not.toBeNull();
    expect(result?.branchId).toBe('a');
  });

  it('returns exact hit on segment endpoint', () => {
    const tree = buildKDTree([seg(32, 16, 468, 16, 'tip_a')]);
    const result = kdQueryNearest(tree, 32, 16, 6);
    expect(result?.branchId).toBe('tip_a');
  });

  it('returns nearest of two segments', () => {
    const tree = buildKDTree([seg(0, 0, 100, 0, 'near'), seg(0, 100, 100, 100, 'far')]);
    // query at (50, 5) — distance 5 from 'near', distance 95 from 'far'
    const result = kdQueryNearest(tree, 50, 5, 10);
    expect(result?.branchId).toBe('near');
  });

  it('returns correct branch in 4-segment tree matching TreeViewGL layout', () => {
    // Simulate MOCK_LAYOUT with PANEL_W=500, PANEL_H=900:
    // scaleX = (500 - 64) / 2 = 218, scaleY = (900 - 32) / 1 = 868
    // originX=32, originY=16
    // tip_a branch: (32,16) → (468,16)  midpoint=(250,16)
    // tip_b branch: (32,884) → (468,884) midpoint=(250,884)
    const tree = buildKDTree([seg(32, 16, 468, 16, 'tip_a'), seg(32, 884, 468, 884, 'tip_b')]);
    expect(kdQueryNearest(tree, 250, 16, 6)?.branchId).toBe('tip_a');
    expect(kdQueryNearest(tree, 250, 884, 6)?.branchId).toBe('tip_b');
    // Midway between the two, closer to tip_a
    expect(kdQueryNearest(tree, 250, 400, 6)).toBeNull();
  });

  it('handles vertical segment (elbow)', () => {
    const tree = buildKDTree([seg(100, 10, 100, 90, 'elbow')]);
    // query at (102, 50) → closest point on vertical seg is (100, 50), distance=2
    const result = kdQueryNearest(tree, 102, 50, 6);
    expect(result?.branchId).toBe('elbow');
  });

  it('handles degenerate zero-length segment', () => {
    const tree = buildKDTree([seg(50, 50, 50, 50, 'point')]);
    const result = kdQueryNearest(tree, 50, 50, 1);
    expect(result?.branchId).toBe('point');
    expect(kdQueryNearest(tree, 56, 50, 5)).toBeNull();
  });

  it('adversarial: long horizontal segment beats short distractor near one end', () => {
    // Long segment (0,0)→(200,0) plus short distractor (190,10)→(195,10).
    // Query at (1,0,6) — nearest point on long seg is (1,0), distance=0.
    // Midpoint of long seg is (100,0), far from query. Endpoint-based pruning must
    // still find it because endpoint (0,0) is close.
    const tree = buildKDTree([seg(0, 0, 200, 0, 'long'), seg(190, 10, 195, 10, 'short')]);
    expect(kdQueryNearest(tree, 1, 0, 6)?.branchId).toBe('long');
  });

  it('root-elbow regression: tall vertical segment found when query near top endpoint', () => {
    // Realistic tree layout: root-elbow vertical (50,20)→(50,880), plus 100 small
    // horizontal branches scattered in y. Query near top of elbow must not miss it.
    const segments: BranchSegment[] = [seg(50, 20, 50, 880, 'root_elbow')];
    for (let i = 0; i < 100; i++) {
      const y = 30 + i * 8;
      segments.push(seg(50, y, 150 + (i % 5) * 20, y, `branch_${i}`));
    }
    const tree = buildKDTree(segments);
    // Query at (52, 25) — 2px right of the elbow, 5px below its top endpoint.
    // True distance to root_elbow is 2; must be within maxDist=6.
    const result = kdQueryNearest(tree, 52, 25, 6);
    expect(result?.branchId).toBe('root_elbow');
  });
});
