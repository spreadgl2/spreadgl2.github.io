export interface BranchSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  branchId: string;
}

interface EndpointEntry {
  px: number;
  py: number;
  segment: BranchSegment;
  left: EndpointEntry | null;
  right: EndpointEntry | null;
}

export interface KDTree {
  root: EndpointEntry | null;
}

function segmentDistSq(seg: BranchSegment, px: number, py: number): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - seg.x1;
    const ey = py - seg.y1;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((px - seg.x1) * dx + (py - seg.y1) * dy) / lenSq));
  const cx = seg.x1 + t * dx - px;
  const cy = seg.y1 + t * dy - py;
  return cx * cx + cy * cy;
}

function buildNode(entries: EndpointEntry[], depth: number): EndpointEntry | null {
  if (entries.length === 0) return null;
  const axis = depth % 2;
  entries.sort((a, b) => (axis === 0 ? a.px - b.px : a.py - b.py));
  const mid = Math.floor(entries.length / 2);
  const node = entries[mid];
  if (!node) return null;
  node.left = buildNode(entries.slice(0, mid), depth + 1);
  node.right = buildNode(entries.slice(mid + 1), depth + 1);
  return node;
}

interface BestResult {
  distSq: number;
  seg: BranchSegment | null;
}

function searchNode(
  node: EndpointEntry | null,
  x: number,
  y: number,
  depth: number,
  best: BestResult,
): void {
  if (!node) return;

  const d = segmentDistSq(node.segment, x, y);
  if (d < best.distSq) {
    best.distSq = d;
    best.seg = node.segment;
  }

  const axis = depth % 2;
  // Prune against the endpoint coordinate on this axis (sound for point entries).
  const diff = axis === 0 ? x - node.px : y - node.py;

  const [near, far] = diff < 0 ? [node.left, node.right] : [node.right, node.left];
  searchNode(near, x, y, depth + 1, best);
  if (diff * diff < best.distSq) {
    searchNode(far, x, y, depth + 1, best);
  }
}

export function buildKDTree(segments: BranchSegment[]): KDTree {
  // Each segment is inserted as two endpoint entries so that splitting-plane pruning
  // (which is sound for points) cannot skip a long segment whose midpoint is far from
  // the query but whose body passes close to it.
  const entries: EndpointEntry[] = [];
  for (const seg of segments) {
    entries.push({ px: seg.x1, py: seg.y1, segment: seg, left: null, right: null });
    entries.push({ px: seg.x2, py: seg.y2, segment: seg, left: null, right: null });
  }
  return { root: buildNode(entries, 0) };
}

export function kdQueryNearest(
  tree: KDTree,
  x: number,
  y: number,
  maxDist: number,
): BranchSegment | null {
  const best: BestResult = { distSq: maxDist * maxDist + 1, seg: null };
  searchNode(tree.root, x, y, 0, best);
  if (!best.seg || best.distSq > maxDist * maxDist) return null;
  return best.seg;
}
