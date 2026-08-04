// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDimPlayheadBucket } from './dim-playhead-bucket';

let computeCalls = 0;

function Probe({
  playhead,
  bounds,
  isPlaying,
  posteriorThreshold,
}: {
  playhead: number;
  bounds: { min: number; max: number } | null;
  isPlaying: boolean;
  posteriorThreshold: number;
}) {
  const playheadBucket = getDimPlayheadBucket(playhead, bounds, isPlaying);
  // biome-ignore lint/correctness/useExhaustiveDependencies: this test verifies the bucketed dependency pattern.
  const value = useMemo(() => {
    computeCalls += 1;
    return `${playhead}:${posteriorThreshold}`;
  }, [playheadBucket, posteriorThreshold]);

  return <output data-testid="value">{value}</output>;
}

describe('getDimPlayheadBucket', () => {
  beforeEach(() => {
    computeCalls = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps tiny playback moves in the same range-relative bucket cached', () => {
    const bounds = { min: 10, max: 11 };
    const { rerender } = render(
      <Probe playhead={10.01} bounds={bounds} isPlaying posteriorThreshold={0} />,
    );
    rerender(<Probe playhead={10.0105} bounds={bounds} isPlaying posteriorThreshold={0} />);

    expect(computeCalls).toBe(1);
    expect(screen.getByTestId('value').textContent).toBe('10.01:0');
  });

  it('recomputes when playback crosses a range-relative bucket', () => {
    const bounds = { min: 10, max: 11 };
    const { rerender } = render(
      <Probe playhead={10.01} bounds={bounds} isPlaying posteriorThreshold={0} />,
    );
    rerender(<Probe playhead={10.012} bounds={bounds} isPlaying posteriorThreshold={0} />);

    expect(computeCalls).toBe(2);
    expect(screen.getByTestId('value').textContent).toBe('10.012:0');
  });

  it('does not use fixed decimal-year buckets on short-span trees', () => {
    const b117Bounds = { min: 2020.68, max: 2021.03 };
    const first = getDimPlayheadBucket(2020.68, b117Bounds, true);
    const second = getDimPlayheadBucket(2020.75, b117Bounds, true);

    expect(second).not.toBe(first);
  });

  it('recomputes immediately when a non-playhead dependency changes', () => {
    const bounds = { min: 10, max: 11 };
    const { rerender } = render(
      <Probe playhead={10.01} bounds={bounds} isPlaying posteriorThreshold={0} />,
    );
    rerender(<Probe playhead={10.0105} bounds={bounds} isPlaying posteriorThreshold={0.5} />);

    expect(computeCalls).toBe(2);
    expect(screen.getByTestId('value').textContent).toBe('10.0105:0.5');
  });

  it('uses exact playhead values when playback is paused', () => {
    const { rerender } = render(
      <Probe
        playhead={10.01}
        bounds={{ min: 10, max: 11 }}
        isPlaying={false}
        posteriorThreshold={0}
      />,
    );
    rerender(
      <Probe
        playhead={10.02}
        bounds={{ min: 10, max: 11 }}
        isPlaying={false}
        posteriorThreshold={0}
      />,
    );

    expect(computeCalls).toBe(2);
    expect(screen.getByTestId('value').textContent).toBe('10.02:0');
  });
});
