// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { summarizeAxes } from '../../lib/format/geojson-axis';
import { GeoJsonAxisModal } from './GeoJsonAxisModal';

afterEach(() => {
  cleanup();
});

function summaryOf(...positions: number[][]) {
  const data: FeatureCollection = {
    type: 'FeatureCollection',
    features: positions.map((coordinates) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates },
    })),
  };
  return summarizeAxes(data);
}

function renderModal(summary = summaryOf([10, 20], [12, 22])) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <GeoJsonAxisModal
      fileName="regions"
      summary={summary}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

function selectValue(testId: string): string {
  return (screen.getByTestId(testId) as HTMLSelectElement).value;
}

describe('GeoJsonAxisModal', () => {
  it('is a named dialog showing sample positions and per-position ranges', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Coordinate order' })).toBeTruthy();
    expect(screen.getByText('[10.0000, 20.0000]')).toBeTruthy();
    expect(screen.getByTestId('geojson-axis-position-1-range').textContent).toBe(
      '10.0000 to 12.0000',
    );
    expect(screen.getByTestId('geojson-axis-position-2-range').textContent).toBe(
      '20.0000 to 22.0000',
    );
  });

  it('defaults to longitude first and confirms that order', () => {
    const { onConfirm } = renderModal();
    expect(selectValue('geojson-axis-position-1')).toBe('longitude');
    expect(selectValue('geojson-axis-position-2')).toBe('latitude');
    fireEvent.click(screen.getByTestId('geojson-axis-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('lon-lat');
  });

  it('pre-selects latitude first when position 2 exceeds ±90', () => {
    renderModal(summaryOf([39.9, 116.4]));
    expect(selectValue('geojson-axis-position-1')).toBe('latitude');
    expect(selectValue('geojson-axis-position-2')).toBe('longitude');
  });

  it('keeps the two positions on different axes when one is changed', () => {
    const { onConfirm } = renderModal();
    fireEvent.change(screen.getByTestId('geojson-axis-position-2'), {
      target: { value: 'longitude' },
    });
    expect(selectValue('geojson-axis-position-1')).toBe('latitude');
    fireEvent.click(screen.getByTestId('geojson-axis-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('lat-lon');
  });

  it('blocks an order that puts out-of-range values on latitude', () => {
    const { onConfirm } = renderModal(summaryOf([39.9, 116.4]));
    fireEvent.change(screen.getByTestId('geojson-axis-position-1'), {
      target: { value: 'longitude' },
    });
    expect(screen.getByTestId('geojson-axis-error')).toBeTruthy();
    const confirm = screen.getByTestId('geojson-axis-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels from the button and from Escape', () => {
    const { onCancel } = renderModal();
    fireEvent.click(screen.getByTestId('geojson-axis-cancel'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
