// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEnvStore } from '../../store/env';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { EnvLegendOverlay } from './EnvLegendOverlay';

const OVERLAY_ID = 'overlay-abc';

const CHOROPLETH = {
  id: OVERLAY_ID,
  name: 'climate',
  data: { type: 'FeatureCollection' as const, features: [] },
  valueByLocation: new Map<string, number>(),
  valueColumn: 'temperature_C',
  locationCol: 'location',
};

const TEMPERATURE_COL = {
  key: 'temperature_C',
  displayName: 'Temperature',
  units: '°C' as const,
  values: new Map([
    ['Africa', 10],
    ['Asia', 30],
  ]),
};

beforeEach(() => {
  useEnvStore.setState({ columns: [], activeKey: null, paletteOverride: {} });
  useUiStore.setState({ layerVisibility: { branches: true } });
  useTreeStore.setState({ choroplethOverlays: [] });
});

afterEach(() => {
  cleanup();
});

describe('EnvLegendOverlay', () => {
  it('renders nothing when no columns are loaded', () => {
    render(<EnvLegendOverlay />);
    expect(screen.queryByTestId('env-legend-overlay')).toBeNull();
  });

  it('renders nothing when activeKey is null', () => {
    useEnvStore.setState({ columns: [TEMPERATURE_COL], activeKey: null });
    useTreeStore.setState({ choroplethOverlays: [CHOROPLETH] });
    render(<EnvLegendOverlay />);
    expect(screen.queryByTestId('env-legend-overlay')).toBeNull();
  });

  it('renders nothing when no choropleth overlays are loaded', () => {
    useEnvStore.setState({ columns: [TEMPERATURE_COL], activeKey: 'temperature_C' });
    render(<EnvLegendOverlay />);
    expect(screen.queryByTestId('env-legend-overlay')).toBeNull();
  });

  it('renders nothing when choropleth overlay is toggled off', () => {
    useEnvStore.setState({ columns: [TEMPERATURE_COL], activeKey: 'temperature_C' });
    useTreeStore.setState({ choroplethOverlays: [CHOROPLETH] });
    useUiStore.setState({ layerVisibility: { branches: true, [OVERLAY_ID]: false } });
    render(<EnvLegendOverlay />);
    expect(screen.queryByTestId('env-legend-overlay')).toBeNull();
  });

  it('shows the legend when choropleth is loaded and visible', () => {
    useEnvStore.setState({ columns: [TEMPERATURE_COL], activeKey: 'temperature_C' });
    useTreeStore.setState({ choroplethOverlays: [CHOROPLETH] });
    useUiStore.setState({ layerVisibility: { branches: true, [OVERLAY_ID]: true } });
    render(<EnvLegendOverlay />);
    expect(screen.getByTestId('env-legend-overlay')).toBeTruthy();
    expect(screen.getByText('TEMPERATURE')).toBeTruthy();
    expect(screen.getByText('°C')).toBeTruthy();
  });

  it('shows the legend when layerVisibility has no explicit entry for overlay (defaults visible)', () => {
    useEnvStore.setState({ columns: [TEMPERATURE_COL], activeKey: 'temperature_C' });
    useTreeStore.setState({ choroplethOverlays: [CHOROPLETH] });
    render(<EnvLegendOverlay />);
    expect(screen.getByTestId('env-legend-overlay')).toBeTruthy();
  });

  it('shows min, mid, max values in the scale', () => {
    const col = {
      key: 'elevation_m',
      displayName: 'Elevation',
      units: 'm' as const,
      values: new Map([
        ['A', 0],
        ['B', 100],
        ['C', 200],
      ]),
    };
    useEnvStore.setState({ columns: [col], activeKey: 'elevation_m' });
    useTreeStore.setState({ choroplethOverlays: [CHOROPLETH] });
    render(<EnvLegendOverlay />);
    expect(screen.getByText('0.00')).toBeTruthy();
    expect(screen.getByText('100.0')).toBeTruthy();
    expect(screen.getByText('200.0')).toBeTruthy();
  });

  it('does not show units div when units is null', () => {
    const col = {
      key: 'score',
      displayName: 'Score',
      units: null,
      values: new Map([
        ['A', 1],
        ['B', 2],
      ]),
    };
    useEnvStore.setState({ columns: [col], activeKey: 'score' });
    useTreeStore.setState({ choroplethOverlays: [CHOROPLETH] });
    render(<EnvLegendOverlay />);
    expect(screen.getByTestId('env-legend-overlay')).toBeTruthy();
    const legend = screen.getByTestId('env-legend-overlay');
    expect(legend.textContent).not.toContain('null');
  });

  it('ramp has a CSS gradient background', () => {
    const col = {
      key: 'humidity_pct',
      displayName: 'Humidity',
      units: '%' as const,
      values: new Map([
        ['A', 40],
        ['B', 80],
      ]),
    };
    useEnvStore.setState({ columns: [col], activeKey: 'humidity_pct' });
    useTreeStore.setState({ choroplethOverlays: [CHOROPLETH] });
    render(<EnvLegendOverlay />);
    const ramp = screen.getByTestId('env-legend-overlay').querySelector('[style]');
    expect(ramp?.getAttribute('style')).toContain('gradient');
  });
});
