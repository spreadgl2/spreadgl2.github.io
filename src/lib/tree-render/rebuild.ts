import { extractGeoAnnotations } from '../phylo/annotate.js';
import { TreeCalibration } from '../phylo/calibrate.js';
import { buildTimeSliceIndexes } from '../phylo/slice.js';
import type { BranchTable, IntrospectResult, Layout, PhyloGraph } from '../phylo/types.js';
import { buildBranchTable } from './branch-table.js';

/**
 * Rebuild a BranchTable from a (possibly updated) discrete geo lookup. Shared
 * by the initial parse path and the Locations panel's edit/import path so the
 * calibration + geo-annotation + slice-index sequence stays in one place.
 */
export function rebuildBranchTable(
  graph: PhyloGraph,
  layout: Layout,
  traitInfo: IntrospectResult,
  discreteGeoLookup: Map<string, [number, number]> | undefined,
): BranchTable {
  const cal = new TreeCalibration();
  cal.setAnchor('date', layout.nodeMap, layout.maxX);
  const geos = extractGeoAnnotations(graph, traitInfo);
  const traitKey = traitInfo.kind === 'discrete' ? traitInfo.key : undefined;
  const branchTable = buildBranchTable(graph, cal, geos, layout, traitKey, discreteGeoLookup);
  buildTimeSliceIndexes(branchTable);
  return branchTable;
}
