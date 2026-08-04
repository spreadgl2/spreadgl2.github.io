import { useEffect } from 'react';
import { pointInPolygon } from '../../lib/geo/point-in-polygon';
import type { BranchTable, Layout, PhyloGraph } from '../../lib/phylo/types';
import { useSelectionStore } from '../../store/selection';
import { useUiStore } from '../../store/ui';

export function computeLassoTaxa(
  vertices: Array<[number, number]>,
  branchTable: BranchTable,
  graph: PhyloGraph,
  layout: Layout,
): string[] {
  if (vertices.length < 3) return [];

  const tipOrigIds = new Set(layout.nodes.filter((n) => n.isTip).map((n) => n.id));
  const found = new Set<string>();

  for (let i = 0; i < branchTable.count; i++) {
    if (branchTable.isInternal[i]) continue;
    const lon = branchTable.endLon[i] ?? 0;
    const lat = branchTable.endLat[i] ?? 0;
    if (lon === 0 && lat === 0) continue;
    if (!pointInPolygon([lon, lat], vertices)) continue;
    const nodeIdx = branchTable.branchId[i];
    if (nodeIdx === undefined) continue;
    const origId = graph.nodes[nodeIdx]?.origId;
    if (origId && tipOrigIds.has(origId)) {
      found.add(origId);
    }
  }

  return Array.from(found);
}

interface LassoToolProps {
  branchTable: BranchTable | null;
  graph: PhyloGraph | null;
  layout: Layout | null;
}

export function LassoTool({ branchTable, graph, layout }: LassoToolProps) {
  const lassoMode = useUiStore((s) => s.lassoMode);
  const lassoVertices = useUiStore((s) => s.lassoVertices);
  const clearLasso = useUiStore((s) => s.clearLasso);
  const setFocusedTaxa = useSelectionStore((s) => s.setFocusedTaxa);

  useEffect(() => {
    if (!lassoMode) return;

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        clearLasso();
        return;
      }
      if (e.key === 'Enter') {
        if (branchTable && graph && layout) {
          const taxa = computeLassoTaxa(lassoVertices, branchTable, graph, layout);
          setFocusedTaxa(taxa);
        }
        clearLasso();
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lassoMode, lassoVertices, branchTable, graph, layout, setFocusedTaxa, clearLasso]);

  if (!lassoMode || lassoVertices.length === 0) return null;

  return (
    <div
      data-testid="lasso-vertex-count"
      style={{
        position: 'absolute',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(20, 22, 26, 0.88)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 6,
        padding: '4px 12px',
        color: 'var(--fg-secondary, #c8ccd2)',
        fontSize: 12,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {lassoVertices.length} {lassoVertices.length === 1 ? 'vertex' : 'vertices'} — Enter to close ·
      Esc to cancel
    </div>
  );
}
