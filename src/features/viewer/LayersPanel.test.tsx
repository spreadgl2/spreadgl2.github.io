// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEnvStore } from '../../store/env';
import { useRasterStore } from '../../store/raster';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { LayersPanel } from './LayersPanel';

beforeEach(() => {
  useUiStore.setState({
    layerVisibility: { branches: true, 'hpd-polygons': true, 'cluster-endpoints': true },
    layerOpacity: { branches: 100, 'hpd-polygons': 100, 'cluster-endpoints': 100 },
    arcWidth: 100,
  });
  useTreeStore.setState({
    nodeHpds: null,
    traitInfo: null,
    customOverlays: [],
    choroplethOverlays: [],
  });
  useEnvStore.setState({ columns: [], activeKey: null, paletteOverride: {} });
  useRasterStore.setState({ raster: null });
});

afterEach(() => {
  cleanup();
});

describe('LayersPanel', () => {
  it('renders a boundary layer row for each loaded custom overlay', () => {
    useTreeStore.setState({
      customOverlays: [
        { id: 'ov-1', name: 'china', data: { type: 'FeatureCollection', features: [] } },
      ],
    });
    render(<LayersPanel />);
    expect(screen.getByTestId('layer-card-ov-1')).toBeTruthy();
  });

  it('shows no Clear Data buttons when nothing is loaded', () => {
    render(<LayersPanel />);
    expect(screen.queryByTestId('clear-boundary-btn')).toBeNull();
    expect(screen.queryByTestId('clear-region-btn')).toBeNull();
    expect(screen.queryByTestId('clear-raster-btn')).toBeNull();
  });

  it('Clear Data removes boundary overlays and hides their cards', () => {
    useTreeStore.setState({
      customOverlays: [
        { id: 'ov-1', name: 'china', data: { type: 'FeatureCollection', features: [] } },
      ],
    });
    render(<LayersPanel />);
    fireEvent.click(screen.getByTestId('clear-boundary-btn'));
    expect(useTreeStore.getState().customOverlays).toHaveLength(0);
    expect(screen.queryByTestId('layer-card-ov-1')).toBeNull();
    expect(screen.queryByTestId('clear-boundary-btn')).toBeNull();
  });

  it('Clear Data removes region choropleths and env columns', () => {
    useTreeStore.setState({
      choroplethOverlays: [
        {
          id: 'c1',
          name: 'env',
          data: { type: 'FeatureCollection', features: [] },
          valueByLocation: new Map(),
          valueColumn: 'x',
          locationCol: 'loc',
        },
      ],
    });
    useEnvStore.setState({
      columns: [{ key: 't', displayName: 'Temp', units: '°C', values: new Map() }],
      activeKey: 't',
    });
    render(<LayersPanel />);
    fireEvent.click(screen.getByTestId('clear-region-btn'));
    expect(useTreeStore.getState().choroplethOverlays).toHaveLength(0);
    expect(useEnvStore.getState().columns).toHaveLength(0);
    expect(screen.queryByTestId('env-subcontrols')).toBeNull();
  });

  it('Clear Data removes the raster overlay', () => {
    useRasterStore.setState({
      raster: { width: 1, height: 1 } as never,
    });
    render(<LayersPanel />);
    expect(screen.getByTestId('clear-raster-btn')).toBeTruthy();
    fireEvent.click(screen.getByTestId('clear-raster-btn'));
    expect(useRasterStore.getState().raster).toBeNull();
  });

  it('renders Add overlay button', () => {
    render(<LayersPanel />);
    expect(screen.getByTestId('add-overlay-btn')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add boundaries (GeoJSON)' })).toBeTruthy();
  });

  it('enables region data import only after boundaries are loaded', () => {
    const { rerender } = render(<LayersPanel />);
    const button = screen.getByTestId('add-env-csv-btn') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe(
      'Load a boundary GeoJSON first so CSV values can be matched to regions.',
    );
    expect(screen.getByRole('button', { name: 'Add region data (CSV)' })).toBeTruthy();

    useTreeStore.setState({
      customOverlays: [
        {
          id: 'boundaries',
          name: 'boundaries',
          data: { type: 'FeatureCollection', features: [] },
        },
      ],
    });
    rerender(<LayersPanel />);
    expect(button.disabled).toBe(false);
    expect(button.title).toBe('');
  });

  it('renders choropleth overlay rows from store', () => {
    const overlayId = 'test-choropleth-1';
    useTreeStore.setState({
      choroplethOverlays: [
        {
          id: overlayId,
          name: 'Environment',
          data: { type: 'FeatureCollection', features: [] },
          valueByLocation: new Map([['Africa', 28.5]]),
          valueColumn: 'temperature',
          locationCol: 'location',
        },
      ],
    });
    render(<LayersPanel />);
    expect(screen.getByTestId(`layer-card-${overlayId}`)).toBeTruthy();
  });

  it('shows loaded environment columns and updates the active variable', () => {
    const { rerender } = render(<LayersPanel />);
    expect(screen.queryByTestId('env-subcontrols')).toBeNull();

    useEnvStore.setState({
      columns: [
        { key: 'temperature_C', displayName: 'Temperature', units: '°C', values: new Map() },
        { key: 'humidity_pct', displayName: 'Humidity', units: '%', values: new Map() },
      ],
      activeKey: 'temperature_C',
    });
    rerender(<LayersPanel />);
    expect(screen.getByTestId('env-subcontrols')).toBeTruthy();
    const select = screen.getByTestId('env-variable-select') as HTMLSelectElement;
    const opts = Array.from(select.options).map((o) => o.text);
    expect(opts).toContain('Temperature');
    expect(opts).toContain('Humidity');

    fireEvent.change(select, { target: { value: 'humidity_pct' } });
    expect(useEnvStore.getState().activeKey).toBe('humidity_pct');
  });

  it('selecting a palette overrides auto and stores it per-column', () => {
    useEnvStore.setState({
      columns: [
        { key: 'temperature_C', displayName: 'Temperature', units: '°C', values: new Map() },
      ],
      activeKey: 'temperature_C',
    });
    render(<LayersPanel />);
    const select = screen.getByTestId('env-palette-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'magma' } });
    expect(useEnvStore.getState().paletteOverride['temperature_C']).toBe('magma');
  });

  it('T099: renders Load GeoTIFF button', () => {
    render(<LayersPanel />);
    expect(screen.getByTestId('add-geotiff-btn')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add raster (GeoTIFF)' })).toBeTruthy();
  });

  it('T099: shows the raster layer row only when raster data is loaded', () => {
    const { rerender } = render(<LayersPanel />);
    expect(screen.queryByTestId('layer-card-raster-overlay')).toBeNull();

    useRasterStore.setState({
      raster: {
        data: new Uint8ClampedArray(16),
        width: 2,
        height: 2,
        bounds: [-180, -90, 180, 90],
      },
    });
    rerender(<LayersPanel />);
    expect(screen.getByTestId('layer-card-raster-overlay')).toBeTruthy();
  });
});
