import { describe, expect, it } from 'vitest';
import { shouldWarmColdStartResources } from './cold-start-warmup';

describe('shouldWarmColdStartResources', () => {
  it('warms only on unconstrained devices and connections', () => {
    expect(
      shouldWarmColdStartResources({
        hardwareConcurrency: 8,
        deviceMemory: 8,
        connection: { effectiveType: '4g' },
      }),
    ).toBe(true);
    expect(shouldWarmColdStartResources({ hardwareConcurrency: 4 })).toBe(false);
    expect(shouldWarmColdStartResources({ deviceMemory: 4 })).toBe(false);
    expect(shouldWarmColdStartResources({ connection: { saveData: true } })).toBe(false);
    expect(shouldWarmColdStartResources({ connection: { effectiveType: '2g' } })).toBe(false);
  });
});
