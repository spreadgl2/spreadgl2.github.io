import { rebuildBranchTable } from '../lib/tree-render/rebuild';
import { useTreeStore } from './tree';

export function rebuildFromStore(): void {
  const st = useTreeStore.getState();
  if (!st.graph || !st.layout || st.traitInfo?.kind !== 'discrete') return;
  const lookup = st.discreteGeoLookup ?? new Map<string, [number, number]>();
  st.setBranchTable(rebuildBranchTable(st.graph, st.layout, st.traitInfo, lookup));
}
