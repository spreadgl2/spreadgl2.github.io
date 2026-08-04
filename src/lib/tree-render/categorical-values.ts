import type { IntrospectResult, PhyloGraph } from '../phylo/types';

export function collectStringAnnotationValues(graph: PhyloGraph | null, key: string): string[] {
  if (!graph) return [];
  const seen = new Set<string>();
  for (const node of graph.nodes) {
    const value = node.annotations[key];
    if (typeof value === 'string') seen.add(value);
  }
  return Array.from(seen).sort();
}

export function categoricalValuesForColorKey(
  traitInfo: IntrospectResult | null,
  graph: PhyloGraph | null,
  allDiscreteKeys: string[],
  colorByKey: string,
): string[] | null {
  if (colorByKey === 'single-color' || colorByKey === '__time__') return null;

  if (traitInfo?.kind === 'discrete') {
    return colorByKey === traitInfo.key
      ? traitInfo.values
      : collectStringAnnotationValues(graph, colorByKey);
  }

  if (traitInfo?.kind === 'continuous' && allDiscreteKeys.includes(colorByKey)) {
    return collectStringAnnotationValues(graph, colorByKey);
  }

  return null;
}
