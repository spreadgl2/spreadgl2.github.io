// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapLibreBasemap } from './MapLibreBasemap';

const mapLibreState = vi.hoisted(() => ({
  setWorkerUrl: vi.fn(),
}));

vi.mock('maplibre-gl', () => ({
  setWorkerUrl: mapLibreState.setWorkerUrl,
}));

vi.mock('react-map-gl/maplibre', () => ({
  Map: () => <div data-testid="maplibre-map" />,
}));

afterEach(() => {
  cleanup();
});

describe('MapLibreBasemap', () => {
  it('configures the emitted MapLibre worker and renders the map', () => {
    render(
      <MapLibreBasemap
        mapRef={{ current: null }}
        mapStyle="style"
        canvasContextAttributes={{ preserveDrawingBuffer: true }}
        onLoad={vi.fn()}
      />,
    );

    expect(screen.getByTestId('maplibre-map')).toBeTruthy();
    expect(mapLibreState.setWorkerUrl).toHaveBeenCalledOnce();
    expect(String(mapLibreState.setWorkerUrl.mock.calls[0]?.[0])).toContain('maplibre-gl-worker');
  });
});
