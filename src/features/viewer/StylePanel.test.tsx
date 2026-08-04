// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { StylePanel } from './StylePanel';

beforeEach(() => {
  useUiStore.setState({
    colorByKey: 'single-color',
    glyphByKey: 'none',
    theme: 'dark',
    palette: 'okabe-ito',
    paletteReverse: false,
    showBranches: true,
    branchWidth: 1.5,
    showTips: true,
    tipRadius: 2.5,
    layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    layerOpacity: { branches: 100, 'hpd-polygons': 100, 'cluster-endpoints': 100 },
    arcWidth: 100,
  });
  useTreeStore.setState({
    traitInfo: null,
    allDiscreteKeys: [],
    graph: null,
    nodeHpds: null,
    nodeMultiHpds: null,
  });
});

afterEach(() => {
  cleanup();
});

describe('StylePanel', () => {
  it('renders color-by select with single-color default', () => {
    render(<StylePanel />);
    const select = screen.getByTestId('color-by-select') as HTMLSelectElement;
    expect(select.value).toBe('single-color');
  });

  it('shows primary geo trait key when traitInfo is discrete', () => {
    useTreeStore.setState({
      traitInfo: {
        kind: 'discrete',
        key: 'location',
        values: ['Africa', 'Asia'],
        ambiguous: false,
      },
      allDiscreteKeys: ['location'],
    });
    render(<StylePanel />);
    const select = screen.getByTestId('color-by-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('location');
  });

  it('changing color-by updates store', () => {
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'location', values: ['Africa'], ambiguous: false },
      allDiscreteKeys: ['location'],
    });
    render(<StylePanel />);
    const select = screen.getByTestId('color-by-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'location' } });
    expect(useUiStore.getState().colorByKey).toBe('location');
  });

  it('lists all discrete annotation keys when allDiscreteKeys is populated', () => {
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'location', values: ['Africa'], ambiguous: false },
      allDiscreteKeys: ['location', 'ecoregion', 'host_type'],
    });
    render(<StylePanel />);
    const select = screen.getByTestId('color-by-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('location');
    expect(options).toContain('ecoregion');
    expect(options).toContain('host_type');
  });

  it('switching to a secondary discrete key updates store', () => {
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'location', values: ['Africa'], ambiguous: false },
      allDiscreteKeys: ['location', 'host_type'],
    });
    render(<StylePanel />);
    const select = screen.getByTestId('color-by-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'host_type' } });
    expect(useUiStore.getState().colorByKey).toBe('host_type');
  });

  it('switching to a high-cardinality discrete key chooses Glasbey Light on dark theme', () => {
    const values = Array.from({ length: 26 }, (_, i) => `state-${i + 1}`);
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'location', values, ambiguous: false },
      allDiscreteKeys: ['location'],
    });
    render(<StylePanel />);
    const select = screen.getByTestId('color-by-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'location' } });
    expect(useUiStore.getState().palette).toBe('glasbey-light');
  });

  it('switching to a high-cardinality discrete key chooses Glasbey Dark on light theme', () => {
    const values = Array.from({ length: 26 }, (_, i) => `state-${i + 1}`);
    useUiStore.setState({ theme: 'light' });
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'location', values, ambiguous: false },
      allDiscreteKeys: ['location'],
    });
    render(<StylePanel />);
    const select = screen.getByTestId('color-by-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'location' } });
    expect(useUiStore.getState().palette).toBe('glasbey-dark');
  });

  it('warns when the selected qualitative palette repeats colors', () => {
    const values = Array.from({ length: 26 }, (_, i) => `state-${i + 1}`);
    useUiStore.setState({ colorByKey: 'location', palette: 'okabe-ito' });
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'location', values, ambiguous: false },
      allDiscreteKeys: ['location'],
    });
    render(<StylePanel />);
    expect(screen.getByTestId('palette-repeat-warning').textContent).toBe(
      '8 colors for 26 states; colors repeat.',
    );
  });

  it('does not warn when Glasbey covers all active states', () => {
    const values = Array.from({ length: 26 }, (_, i) => `state-${i + 1}`);
    useUiStore.setState({ colorByKey: 'location', palette: 'glasbey-light' });
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'location', values, ambiguous: false },
      allDiscreteKeys: ['location'],
    });
    render(<StylePanel />);
    expect(screen.queryByTestId('palette-repeat-warning')).toBeNull();
  });

  it('shows only single-color when traitInfo is null and allDiscreteKeys is empty', () => {
    render(<StylePanel />);
    const select = screen.getByTestId('color-by-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(['single-color']);
  });

  it('renders grouped palette dropdown with qualitative and quantitative palettes', () => {
    render(<StylePanel />);
    const select = screen.getByTestId('palette-select') as HTMLSelectElement;
    const groups = Array.from(select.querySelectorAll('optgroup'));
    expect(groups.map((group) => group.label)).toEqual(['Qualitative', 'Quantitative']);

    const qualitative = Array.from(groups[0]?.querySelectorAll('option') ?? []).map((o) => ({
      label: o.textContent,
      value: o.value,
    }));
    // Sorted by colour count (fewest first); the count is shown in the label.
    // Ties keep registry order (Okabe-Ito before Solarized; Tableau before Bold).
    expect(qualitative).toEqual([
      { label: 'Okabe-Ito (8)', value: 'okabe-ito' },
      { label: 'Solarized (8)', value: 'solarized' },
      { label: 'Tableau (10)', value: 'tableau' },
      { label: 'Bold (10)', value: 'bold' },
      { label: 'Paired (12)', value: 'paired' },
      { label: 'seaborn:tab20 (20)', value: 'seaborn-tab20' },
      { label: 'Glasbey Light (64)', value: 'glasbey-light' },
      { label: 'Glasbey Dark (64)', value: 'glasbey-dark' },
    ]);

    const quantitative = Array.from(groups[1]?.querySelectorAll('option') ?? []).map((o) => ({
      label: o.textContent,
      value: o.value,
    }));
    expect(quantitative).toEqual([
      { label: 'Viridis', value: 'viridis' },
      { label: 'Plasma', value: 'plasma' },
      { label: 'Magma', value: 'magma' },
      { label: 'Blues', value: 'blues' },
      { label: 'Reds', value: 'reds' },
      { label: 'Cool→Warm', value: 'cool-warm' },
      { label: 'RdBu', value: 'rd-bu' },
    ]);
  });

  it('updates palette and tree appearance controls in the store', () => {
    render(<StylePanel />);
    fireEvent.change(screen.getByTestId('palette-select'), {
      target: { value: 'seaborn-tab20' },
    });
    expect(useUiStore.getState().palette).toBe('seaborn-tab20');

    fireEvent.click(screen.getByTestId('palette-reverse-checkbox'));
    expect(useUiStore.getState().paletteReverse).toBe(true);

    fireEvent.change(screen.getByTestId('branch-width-slider'), { target: { value: '3' } });
    expect(useUiStore.getState().branchWidth).toBe(3);

    fireEvent.click(screen.getByTestId('show-branches-checkbox'));
    expect(useUiStore.getState().showBranches).toBe(false);

    fireEvent.change(screen.getByTestId('tip-radius-slider'), { target: { value: '5' } });
    expect(useUiStore.getState().tipRadius).toBe(5);

    fireEvent.click(screen.getByTestId('show-tips-checkbox'));
    expect(useUiStore.getState().showTips).toBe(false);
  });

  it('disables size controls when their tree elements are hidden', () => {
    useUiStore.setState({ showBranches: false, showTips: false });
    render(<StylePanel />);
    expect((screen.getByTestId('branch-width-slider') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('tip-radius-slider') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('StylePanel — Glyph by (T068)', () => {
  it('hides glyph controls without a discrete trait', () => {
    const { rerender } = render(<StylePanel />);
    expect(screen.queryByTestId('glyph-by-select')).toBeNull();

    useTreeStore.setState({
      traitInfo: {
        kind: 'continuous',
        keyFamily: { lat: 'lat', lon: 'lon' },
        wgs84: true,
      },
      allDiscreteKeys: [],
    });
    rerender(<StylePanel />);
    expect(screen.queryByTestId('glyph-by-select')).toBeNull();
  });

  it('lists discrete keys and updates glyph-by selection', () => {
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'location', values: ['Africa'], ambiguous: false },
      allDiscreteKeys: ['location', 'host_type'],
    });
    render(<StylePanel />);
    const select = screen.getByTestId('glyph-by-select') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(select.value).toBe('none');
    expect(options).toEqual(['none', 'location', 'host_type']);
    fireEvent.change(select, { target: { value: 'host_type' } });
    expect(useUiStore.getState().glyphByKey).toBe('host_type');
  });

  it('glyph legend is never in the Style panel even when glyphByKey is set', () => {
    useUiStore.setState({ glyphByKey: 'host_type' });
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'location', values: ['Africa'], ambiguous: false },
      allDiscreteKeys: ['location', 'host_type'],
      graph: {
        nodes: [
          { origId: 'n1', idx: 0, annotations: { host_type: 'bat' }, adjacents: [], lengths: [] },
          { origId: 'n2', idx: 1, annotations: { host_type: 'dog' }, adjacents: [], lengths: [] },
        ],
        origIdToIdx: new Map([
          ['n1', 0],
          ['n2', 1],
        ]),
        rootIdx: 0,
      } as never,
    });
    render(<StylePanel />);
    expect(screen.queryByTestId('glyph-legend')).toBeNull();
  });
});

describe('StylePanel — Tree/Map sections', () => {
  it('updates map branch visibility, opacity, and width from one control group', () => {
    render(<StylePanel />);
    const card = screen.getByTestId('layer-card-branches');
    expect(card).toBeTruthy();
    // Both the layer opacity and the arc-width slider live inside the card.
    expect(within(card).getByTestId('layer-opacity-branches')).toBeTruthy();
    expect(within(card).getByTestId('arc-width-slider')).toBeTruthy();
    expect(Number((screen.getByTestId('arc-width-slider') as HTMLInputElement).value)).toBe(100);

    fireEvent.change(screen.getByTestId('layer-opacity-branches'), { target: { value: '50' } });
    expect(useUiStore.getState().layerOpacity.branches).toBe(50);

    fireEvent.change(screen.getByTestId('arc-width-slider'), { target: { value: '40' } });
    expect(useUiStore.getState().arcWidth).toBe(40);

    fireEvent.click(screen.getByTestId('layer-toggle-branches'));
    expect(useUiStore.getState().layerVisibility.branches).toBe(false);
  });

  it('hides HPD and cluster rows by default; shows them when applicable', () => {
    const { rerender } = render(<StylePanel />);
    expect(screen.queryByTestId('layer-card-hpd-polygons')).toBeNull();
    expect(screen.queryByTestId('layer-card-cluster-endpoints')).toBeNull();

    useTreeStore.setState({
      nodeHpds: [
        {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        },
      ],
      traitInfo: { kind: 'discrete', key: 'location', values: ['Africa'], ambiguous: false },
    });
    rerender(<StylePanel />);
    expect(screen.getByTestId('layer-card-hpd-polygons')).toBeTruthy();
    expect(screen.getByTestId('layer-card-cluster-endpoints')).toBeTruthy();
  });
});
