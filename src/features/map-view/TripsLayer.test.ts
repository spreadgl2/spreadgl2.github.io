import { PathLayer } from '@deck.gl/layers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TripsLayer } from './TripsLayer';

describe('TripsLayer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('injects time-window filtering into PathLayer shaders', () => {
    vi.spyOn(PathLayer.prototype, 'getShaders').mockReturnValue({
      modules: [],
    } as unknown as ReturnType<PathLayer['getShaders']>);

    type Trip = { path: [number, number][]; timestamps: [number, number] };
    const layer = new TripsLayer<Trip>({
      id: 'test-trips',
      data: [],
      getPath: (d: Trip) => d.path,
      getTimestamps: (d: Trip) => d.timestamps,
    });

    const shaders = layer.getShaders();

    expect(TripsLayer.layerName).toBe('TripsLayer');
    expect(shaders.inject?.['fs:#main-start']).toContain('trips.currentTime');
    expect(shaders.inject?.['fs:DECKGL_FILTER_COLOR']).toContain('trips.trailLength');
    expect(shaders.modules.some((module: { name?: string }) => module.name === 'trips')).toBe(true);
  });
});
