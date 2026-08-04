// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeLayoutFromGraph } from '../../lib/phylo/layout';
import type { IntrospectResult, PhyloGraph } from '../../lib/phylo/types';
import { rebuildBranchTable } from '../../lib/tree-render/rebuild';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { LocationsPanel } from './LocationsPanel';

function makeDiscreteGraph(): PhyloGraph {
  const nodes = [
    {
      idx: 0,
      origId: 'n0',
      name: null,
      label: null,
      annotations: { location: 'NY' },
      adjacents: [1, 2],
      lengths: [1, 1],
    },
    {
      idx: 1,
      origId: 'n1',
      name: 'TipNY',
      label: null,
      annotations: { location: 'NY', date: '2013.0' },
      adjacents: [0],
      lengths: [1],
    },
    {
      idx: 2,
      origId: 'n2',
      name: 'TipTX',
      label: null,
      annotations: { location: 'TX', date: '2013.0' },
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

beforeEach(() => {
  useTreeStore.setState({
    traitInfo: { kind: 'discrete', key: 'location', values: ['NY', 'CA', 'TX'], ambiguous: false },
    discreteGeoLookup: new Map<string, [number, number]>([
      ['NY', [40.7, -74.0]],
      ['CA', [36.7, -119.4]],
    ]),
    discreteGeoSource: new Map([
      ['NY', 'gazetteer'],
      ['CA', 'csv'],
    ]),
    graph: null,
    layout: null,
  });
  useUiStore.setState({
    visibleViews: { tree: true, map: true, analysis: false },
    pickLocationName: null,
    hoveredLocationName: null,
    lassoMode: false,
    lassoVertices: [],
  });
});

afterEach(() => {
  cleanup();
});

describe('LocationsPanel', () => {
  it('lists every discrete trait value as a row', () => {
    render(<LocationsPanel />);
    expect(screen.getByTestId('location-row-NY')).toBeTruthy();
    expect(screen.getByTestId('location-row-CA')).toBeTruthy();
    expect(screen.getByTestId('location-row-TX')).toBeTruthy();
  });

  it('counts unmatched locations (TX has no coordinate)', () => {
    render(<LocationsPanel />);
    expect(screen.getByTestId('locations-unmatched-count').textContent).toContain('1 unmatched');
  });

  it('retains a warning when internal nodes lack the location annotation', () => {
    const graph = makeDiscreteGraph();
    delete graph.nodes[0]?.annotations.location;
    useTreeStore.setState({ graph });
    render(<LocationsPanel />);
    const notice = screen.getByTestId('missing-location-annotations-notice');
    expect(notice.textContent).toContain('1 internal node has no location annotation');
    expect(notice.textContent).toContain('Branches touching them will be omitted from the map');
  });

  it('explains how unmatched locations can be resolved', () => {
    render(<LocationsPanel />);
    const help = screen.getByTestId('locations-unmatched-help').textContent ?? '';
    expect(help).toContain('Load a CSV');
    expect(help).toContain('enter latitude and longitude manually');
    expect(help).toContain('click a pin icon');
  });

  it('sorts the unmatched row to the top', () => {
    render(<LocationsPanel />);
    const firstRow = screen.getAllByTestId(/^location-row-/)[0];
    expect(firstRow?.getAttribute('data-testid')).toBe('location-row-TX');
  });

  it('shows coordinates with at most two decimal places', () => {
    useTreeStore.setState({
      discreteGeoLookup: new Map<string, [number, number]>([
        ['NY', [40.7128, -74.009]],
        ['CA', [36.7, -119.4]],
      ]),
    });
    render(<LocationsPanel />);
    expect((screen.getByLabelText('Latitude for NY') as HTMLInputElement).value).toBe('40.71');
    expect((screen.getByLabelText('Longitude for NY') as HTMLInputElement).value).toBe('-74.01');
  });

  it('a manual coordinate edit writes the lookup and tags it manual', () => {
    render(<LocationsPanel />);
    const latInput = screen.getByLabelText('Latitude for TX') as HTMLInputElement;
    const lonInput = screen.getByLabelText('Longitude for TX') as HTMLInputElement;
    fireEvent.change(latInput, { target: { value: '31.0' } });
    fireEvent.change(lonInput, { target: { value: '-100.0' } });
    fireEvent.blur(lonInput);

    const st = useTreeStore.getState();
    expect(st.discreteGeoLookup?.get('TX')).toEqual([31.0, -100.0]);
    expect(st.discreteGeoSource?.get('TX')).toBe('manual');
  });

  it('rounds manual coordinate edits to two decimal places on commit', () => {
    render(<LocationsPanel />);
    const latInput = screen.getByLabelText('Latitude for TX') as HTMLInputElement;
    const lonInput = screen.getByLabelText('Longitude for TX') as HTMLInputElement;
    fireEvent.change(latInput, { target: { value: '31.236' } });
    fireEvent.change(lonInput, { target: { value: '-100.004' } });
    fireEvent.blur(lonInput);

    expect(useTreeStore.getState().discreteGeoLookup?.get('TX')).toEqual([31.24, -100]);
    expect(latInput.value).toBe('31.24');
    expect(lonInput.value).toBe('-100');
  });

  it('keeps a partially entered unmatched coordinate until the pair is complete', () => {
    render(<LocationsPanel />);
    const latInput = screen.getByLabelText('Latitude for TX') as HTMLInputElement;
    const lonInput = screen.getByLabelText('Longitude for TX') as HTMLInputElement;

    fireEvent.change(latInput, { target: { value: '31.0' } });
    fireEvent.blur(latInput);
    expect(latInput.value).toBe('31.0');
    expect(useTreeStore.getState().discreteGeoLookup?.get('TX')).toBeUndefined();

    fireEvent.change(lonInput, { target: { value: '-100.0' } });
    fireEvent.blur(lonInput);

    expect(useTreeStore.getState().discreteGeoLookup?.get('TX')).toEqual([31.0, -100.0]);
  });

  it('rebuilds the BranchTable when an unmatched location receives manual coordinates', () => {
    const graph = makeDiscreteGraph();
    const layout = computeLayoutFromGraph(graph);
    const traitInfo: IntrospectResult = {
      kind: 'discrete',
      key: 'location',
      values: ['NY', 'TX'],
      ambiguous: false,
    };
    const lookup = new Map<string, [number, number]>([['NY', [40.7, -74.0]]]);
    const branchTable = rebuildBranchTable(graph, layout, traitInfo, lookup);
    useTreeStore.setState({
      graph,
      layout,
      traitInfo,
      branchTable,
      discreteGeoLookup: lookup,
      discreteGeoSource: new Map([['NY', 'gazetteer']]),
    });
    render(<LocationsPanel />);

    fireEvent.change(screen.getByLabelText('Latitude for TX'), { target: { value: '31.0' } });
    fireEvent.change(screen.getByLabelText('Longitude for TX'), { target: { value: '-100.0' } });
    fireEvent.blur(screen.getByLabelText('Longitude for TX'));

    const nextBranchTable = useTreeStore.getState().branchTable;
    expect(nextBranchTable).not.toBe(branchTable);
    expect(nextBranchTable).not.toBeNull();
    if (!nextBranchTable) return;
    let txRow = -1;
    for (let i = 0; i < nextBranchTable.count; i++) {
      if (nextBranchTable.branchId[i] === 2) txRow = i;
    }
    expect(txRow).toBeGreaterThanOrEqual(0);
    expect(nextBranchTable.endLat[txRow]).toBeCloseTo(31.0, 3);
    expect(nextBranchTable.endLon[txRow]).toBeCloseTo(-100.0, 3);
  });

  it('explains an out-of-range latitude and retains it for correction', () => {
    render(<LocationsPanel />);
    const latInput = screen.getByLabelText('Latitude for NY') as HTMLInputElement;
    fireEvent.change(latInput, { target: { value: '999' } });
    fireEvent.blur(latInput);
    expect(useTreeStore.getState().discreteGeoLookup?.get('NY')).toEqual([40.7, -74.0]);
    expect(latInput.value).toBe('999');
    expect(latInput.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Latitude must be between -90 and 90.');
  });

  it('restores the previous coordinate when an invalid edit is cancelled with Escape', () => {
    render(<LocationsPanel />);
    const latInput = screen.getByLabelText('Latitude for NY') as HTMLInputElement;
    fireEvent.change(latInput, { target: { value: '999' } });
    fireEvent.blur(latInput);
    fireEvent.keyDown(latInput, { key: 'Escape' });
    expect(latInput.value).toBe('40.7');
    expect(latInput.getAttribute('aria-invalid')).toBeNull();
  });

  it('shows the discrete-only note when the trait is not discrete', () => {
    useTreeStore.setState({ traitInfo: { kind: 'unrecognized', reason: 'no geo' } });
    render(<LocationsPanel />);
    expect(screen.getByTestId('locations-panel').textContent).toContain('discrete-trait trees');
  });

  it('pick icon click sets pickLocationName to the row name', () => {
    render(<LocationsPanel />);
    fireEvent.click(screen.getByTestId('location-pick-TX'));
    expect(useUiStore.getState().pickLocationName).toBe('TX');
  });

  it('pick icon hover exposes the row coordinate target to the map', () => {
    render(<LocationsPanel />);
    const button = screen.getByTestId('location-pick-NY');
    fireEvent.mouseEnter(button);
    expect(useUiStore.getState().hoveredLocationName).toBe('NY');
    fireEvent.mouseLeave(button);
    expect(useUiStore.getState().hoveredLocationName).toBeNull();
  });

  it('pick icon toggles off when clicking the same row again', () => {
    useUiStore.setState({ pickLocationName: 'TX' });
    render(<LocationsPanel />);
    fireEvent.click(screen.getByTestId('location-pick-TX'));
    expect(useUiStore.getState().pickLocationName).toBeNull();
  });

  it('clicking a different pick icon switches the target', () => {
    useUiStore.setState({ pickLocationName: 'TX' });
    render(<LocationsPanel />);
    fireEvent.click(screen.getByTestId('location-pick-NY'));
    expect(useUiStore.getState().pickLocationName).toBe('NY');
  });

  it('pick icon is disabled with tooltip when the map is hidden', () => {
    useUiStore.setState({ visibleViews: { tree: true, map: false, analysis: false } });
    render(<LocationsPanel />);
    const button = screen.getByTestId('location-pick-TX') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Show the map to use this');
  });

  it('pick icon exposes active state via aria-pressed', () => {
    useUiStore.setState({ pickLocationName: 'TX' });
    render(<LocationsPanel />);
    expect(screen.getByTestId('location-pick-TX').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('location-pick-NY').getAttribute('aria-pressed')).toBe('false');
  });
});
