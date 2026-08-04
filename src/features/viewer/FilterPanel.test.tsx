// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchTable, Layout, PhyloGraph } from '../../lib/phylo/types';
import { useSelectionStore } from '../../store/selection';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { FilterPanel } from './FilterPanel';
import styles from './FilterPanel.module.css';

function makeLayout(tipIds: string[]): Layout {
  const nodes = tipIds.map((id) => ({
    id,
    x: 1,
    y: 1,
    isTip: true,
    parentId: null,
    children: [],
    annotations: {},
  }));
  return {
    nodes,
    nodeMap: new Map(nodes.map((n) => [n.id, n])),
    maxX: 10,
    maxY: tipIds.length,
    xAxisMode: 'date',
  };
}

function makeBranchTableWithPosterior(posteriorValues: number[]): BranchTable {
  const count = posteriorValues.length;
  const posterior = new Float32Array(posteriorValues);
  return {
    count,
    branchId: new Int32Array(Array.from({ length: count }, (_, i) => i)),
    parentBranch: new Int32Array(count),
    isInternal: new Uint8Array(count),
    startTime: new Float32Array(count),
    endTime: new Float32Array(count),
    startLat: new Float32Array(count),
    startLon: new Float32Array(count),
    endLat: new Float32Array(count),
    endLon: new Float32Array(count),
    stateWeight: new Float32Array(count).fill(1),
    posterior,
  };
}

beforeEach(() => {
  useTreeStore.setState({ layout: null, branchTable: null });
  useSelectionStore.setState({ selectedIds: [], selectedScrollTarget: null, focusedTaxa: [] });
  useUiStore.setState({ posteriorThreshold: 0 });
});

afterEach(() => {
  cleanup();
});

describe('FilterPanel', () => {
  it('shows no results list when query is empty', () => {
    render(<FilterPanel />);
    expect(screen.queryByTestId('filter-results-list')).toBeNull();
  });

  it('shows no-matches message when query does not match any taxon', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A', 'Dog_B']) });
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('shows matching results when query matches taxa', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A', 'Dog_B', 'Bat_C']) });
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'Bat' } });
    expect(screen.getByTestId('filter-results-list')).toBeTruthy();
    expect(screen.getByTestId('filter-result-Bat_A')).toBeTruthy();
    expect(screen.getByTestId('filter-result-Bat_C')).toBeTruthy();
    expect(screen.queryByTestId('filter-result-Dog_B')).toBeNull();
  });

  it('plain click solos the result and sets the tree scroll target', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A', 'Bat_B']) });
    useSelectionStore.setState({ focusedTaxa: ['Bat_B'] });
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'Bat' } });
    fireEvent.click(screen.getByTestId('filter-result-Bat_A'));
    expect(useSelectionStore.getState().focusedTaxa).toEqual(['Bat_A']);
    expect(useSelectionStore.getState().selectedScrollTarget).toBe('Bat_A');
  });

  it('shift-click toggles a result in the focused taxa set', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A', 'Bat_B']) });
    useSelectionStore.setState({ focusedTaxa: ['Bat_B'] });
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'Bat' } });
    fireEvent.click(screen.getByTestId('filter-result-Bat_A'), { shiftKey: true });
    const taxa = useSelectionStore.getState().focusedTaxa;
    expect(taxa).toContain('Bat_A');
    expect(taxa).toContain('Bat_B');

    fireEvent.click(screen.getByTestId('filter-result-Bat_A'), { shiftKey: true });
    expect(useSelectionStore.getState().focusedTaxa).toEqual(['Bat_B']);
  });

  it('"Show all" button clears focusedTaxa', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A']) });
    useSelectionStore.setState({ focusedTaxa: ['Bat_A'] });
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'Bat' } });
    fireEvent.click(screen.getByTestId('filter-show-all'));
    expect(useSelectionStore.getState().focusedTaxa).toEqual([]);
  });

  it('"Show all" button is absent when focusedTaxa is empty', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A']) });
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'Bat' } });
    expect(screen.queryByTestId('filter-show-all')).toBeNull();
  });

  it('renders without layout (no results)', () => {
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'Bat' } });
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('exact match appears before prefix match', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A', 'Bat']) });
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'Bat' } });
    const list = screen.getByTestId('filter-results-list');
    const buttons = list.querySelectorAll('button[role="option"]');
    expect(buttons[0]?.textContent).toBe('Bat');
    expect(buttons[1]?.textContent).toBe('Bat_A');
  });
});

describe('FilterPanel taxon name display from graph', () => {
  function makeGraph(tipId: string, name: string): PhyloGraph {
    return {
      nodes: [
        {
          idx: 0,
          origId: tipId,
          name,
          label: null,
          annotations: {},
          adjacents: [],
          lengths: [],
        },
      ],
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map([[tipId, 0]]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
  }

  it('searches and displays taxon names while selecting their internal ID', () => {
    const tipId = 'n42';
    const taxonName = 'MERS_Saudi_Arabia_2012';
    useTreeStore.setState({
      layout: makeLayout([tipId]),
      graph: makeGraph(tipId, taxonName),
    });
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'saudi' } });
    const result = screen.getByTestId(`filter-result-${tipId}`);
    expect(result.textContent).toBe(taxonName);
    fireEvent.click(result);
    expect(useSelectionStore.getState().focusedTaxa).toEqual([tipId]);
  });
});

describe('FilterPanel chips section', () => {
  function makeGraph(tipId: string, name: string): PhyloGraph {
    return {
      nodes: [
        {
          idx: 0,
          origId: tipId,
          name,
          label: null,
          annotations: {},
          adjacents: [],
          lengths: [],
        },
      ],
      root: { nodeA: 0, nodeB: 0, lenA: 0, lenB: 0, annotations: {} },
      origIdToIdx: new Map([[tipId, 0]]),
      rooted: true,
      hiddenNodeIds: new Set(),
      collapsedCladeIds: new Map(),
    };
  }

  it('chips section hidden when focusedTaxa is empty', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A']) });
    render(<FilterPanel />);
    expect(screen.queryByTestId('filter-chips-section')).toBeNull();
  });

  it('keeps focused chips visible independently of the current query', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A', 'Dog_B']) });
    useSelectionStore.setState({ focusedTaxa: ['Dog_B'] });
    render(<FilterPanel />);
    expect(screen.queryByTestId('filter-search-input')).toBeTruthy();
    expect(screen.queryByTestId('filter-results-list')).toBeNull();
    expect(screen.getByTestId('filter-chips-section')).toBeTruthy();

    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'Bat' } });
    expect(screen.getByTestId('filter-chips-section')).toBeTruthy();
    expect(screen.getByTestId('filter-chip-remove-Dog_B')).toBeTruthy();
  });

  it('Clear all button empties the focus set', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A', 'Bat_B']) });
    useSelectionStore.setState({ focusedTaxa: ['Bat_A', 'Bat_B'] });
    render(<FilterPanel />);
    fireEvent.click(screen.getByTestId('filter-clear-all'));
    expect(useSelectionStore.getState().focusedTaxa).toEqual([]);
  });

  it('per-chip removal updates the set and hides the section after the final removal', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A', 'Bat_B']) });
    useSelectionStore.setState({ focusedTaxa: ['Bat_A', 'Bat_B'] });
    render(<FilterPanel />);
    fireEvent.click(screen.getByTestId('filter-chip-remove-Bat_A'));
    const taxa = useSelectionStore.getState().focusedTaxa;
    expect(taxa).not.toContain('Bat_A');
    expect(taxa).toContain('Bat_B');

    fireEvent.click(screen.getByTestId('filter-chip-remove-Bat_B'));
    expect(screen.queryByTestId('filter-chips-section')).toBeNull();
  });

  it('chip label resolves to node.name not internal ID', () => {
    const tipId = 'n42';
    const taxonName = 'MERS_Saudi_Arabia_2012';
    useTreeStore.setState({
      layout: makeLayout([tipId]),
      graph: makeGraph(tipId, taxonName),
    });
    useSelectionStore.setState({ focusedTaxa: [tipId] });
    render(<FilterPanel />);
    expect(screen.getByTestId('filter-chips-section').textContent).toContain(taxonName);
    expect(screen.getByTestId('filter-chips-section').textContent).not.toContain(tipId);
  });
});

describe('FilterPanel marquee on hover', () => {
  const scrollTextClass = styles.scrollText!;
  const scrollingClass = styles.scrolling!;
  const chipLabelClass = styles.chipLabel!;

  function mockOverflow(
    el: HTMLElement,
    innerScrollWidth: number,
    clientWidth: number,
    paddingLeft = 0,
    paddingRight = 0,
  ) {
    const inner = el.querySelector<HTMLElement>(`.${scrollTextClass}`);
    if (!inner) throw new Error('no .scrollText found');
    Object.defineProperty(inner, 'scrollWidth', { configurable: true, value: innerScrollWidth });
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingLeft: `${paddingLeft}px`,
      paddingRight: `${paddingRight}px`,
    } as CSSStyleDeclaration);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scrolls an overflowing result with padding correction and restores it on leave', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A']) });
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'Bat' } });

    const row = screen.getByTestId('filter-result-Bat_A');
    mockOverflow(row, 150, 124, 12, 12);
    fireEvent.mouseEnter(row);

    expect(row.classList.contains(scrollingClass)).toBe(true);
    expect(row.style.getPropertyValue('--scroll-distance')).toBe('-58px');
    expect(row.getAttribute('title')).toBe('Bat_A');
    fireEvent.mouseLeave(row);
    expect(row.classList.contains(scrollingClass)).toBe(false);
  });

  it('short result-row label (no overflow) does NOT trigger scrolling class', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A']) });
    render(<FilterPanel />);
    fireEvent.change(screen.getByTestId('filter-search-input'), { target: { value: 'Bat' } });

    const row = screen.getByTestId('filter-result-Bat_A');
    Object.defineProperty(
      row.querySelector<HTMLElement>(`.${scrollTextClass}`) ?? row,
      'scrollWidth',
      { configurable: true, value: 50 },
    );
    Object.defineProperty(row, 'clientWidth', { configurable: true, value: 100 });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingLeft: '0px',
      paddingRight: '0px',
    } as CSSStyleDeclaration);
    fireEvent.mouseEnter(row);
    expect(row.classList.contains(scrollingClass)).toBe(false);
  });

  it('scrolls an overflowing chip, restores it on leave, and retains its tooltip', () => {
    useTreeStore.setState({ layout: makeLayout(['Bat_A']) });
    useSelectionStore.setState({ focusedTaxa: ['Bat_A'] });
    render(<FilterPanel />);

    const chipsSection = screen.getByTestId('filter-chips-section');
    const chipLabel = chipsSection.querySelector<HTMLElement>(`.${chipLabelClass}`);
    if (!chipLabel) throw new Error('no .chipLabel found');

    mockOverflow(chipLabel, 150, 80);

    fireEvent.mouseEnter(chipLabel);
    expect(chipLabel.classList.contains(scrollingClass)).toBe(true);
    fireEvent.mouseLeave(chipLabel);
    expect(chipLabel.classList.contains(scrollingClass)).toBe(false);
    expect(chipLabel.getAttribute('title')).toBe('Bat_A');
  });
});

describe('FilterPanel posterior threshold slider', () => {
  it('reads, formats, and writes the posterior threshold when data is available', () => {
    useTreeStore.setState({ branchTable: makeBranchTableWithPosterior([0.9, 0.3]) });
    useUiStore.setState({ posteriorThreshold: 0.42 });
    render(<FilterPanel />);
    const slider = screen.getByTestId('posterior-threshold-slider') as HTMLInputElement;
    expect(slider.disabled).toBe(false);
    expect(slider.value).toBe('0.42');
    expect(screen.getByTestId('posterior-threshold-value').textContent).toBe('0.42');
    fireEvent.change(slider, { target: { value: '0.75' } });
    expect(useUiStore.getState().posteriorThreshold).toBe(0.75);
  });

  it('renders a disabled em-dash state without posterior data', () => {
    useTreeStore.setState({ branchTable: null });
    render(<FilterPanel />);
    const row = screen.getByTestId('posterior-threshold-row-disabled');
    expect(row.textContent).toContain('—');
    expect(screen.queryByTestId('posterior-threshold-slider')).toBeNull();
  });
});
