// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { DtaPanel } from './DtaPanel';

// A log with two BSSVS traits: geographic `state` (matches the tree states) and
// `host` (no coordinates). All indicators are named routes.
function twoTraitLog() {
  const col = (v: number) => new Float64Array([v]);
  return {
    columnNames: [
      'state',
      'state.indicators.Arizona.California',
      'state.indicators.Arizona.Texas',
      'state.indicators.California.Texas',
      'host.indicators.Ap.Ef',
      'host.indicators.Ap.Cn',
      'host.indicators.Cn.Ef',
    ],
    columns: [col(0), col(1), col(1), col(0), col(1), col(0), col(1)],
    rowCount: 1,
  };
}

beforeEach(() => {
  useTreeStore.setState({
    traitInfo: {
      kind: 'discrete',
      key: 'state',
      values: ['Arizona', 'California', 'Texas'],
      ambiguous: false,
    },
    discreteGeoLookup: new Map<string, [number, number]>([
      ['Arizona', [34, -111]],
      ['California', [37, -119]],
      ['Texas', [31, -99]],
    ]),
    logTable: twoTraitLog(),
  });
  useUiStore.setState({ dtaMapOverlay: 'none', symmetryMode: 'symmetric', bssvsBfThreshold: 0 });
});

afterEach(() => {
  cleanup();
});

function bodyRowCount(): number {
  return screen.getByTestId('dta-table').querySelectorAll('tbody tr').length;
}

function firstFromCell(): string {
  return screen.getByTestId('dta-table').querySelector('tbody tr td')?.textContent ?? '';
}

describe('DtaPanel', () => {
  it('lists all BSSVS traits in the dropdown, location trait first', () => {
    render(<DtaPanel />);
    const select = screen.getByTestId('dta-trait-select') as HTMLSelectElement;
    expect(select.value).toBe('state');
    expect([...select.options].map((o) => o.value)).toEqual(['state', 'host']);
  });

  it('enables the map overlay for the geographic (state) trait', () => {
    render(<DtaPanel />);
    expect((screen.getByTestId('dta-overlay-bf') as HTMLInputElement).disabled).toBe(false);
    expect(firstFromCell()).toBe('Arizona');
  });

  it('shows the BF legend beside the overlay radios when the overlay is active', () => {
    useUiStore.setState({ dtaMapOverlay: 'bf' });
    render(<DtaPanel />);
    expect(screen.getByTestId('bf-legend')).toBeTruthy();
  });

  it('hides the BF legend when the overlay is off', () => {
    useUiStore.setState({ dtaMapOverlay: 'none' });
    render(<DtaPanel />);
    expect(screen.queryByTestId('bf-legend')).toBeNull();
  });

  it('switching to host shows host routes and disables the map overlay', () => {
    render(<DtaPanel />);
    fireEvent.change(screen.getByTestId('dta-trait-select'), { target: { value: 'host' } });

    expect((screen.getByTestId('dta-overlay-bf') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByTestId('dta-overlay-none') as HTMLInputElement).disabled).toBe(true);
    // Host routes use host states, not tree locations.
    expect(screen.getByTestId('dta-table').textContent).toContain('Ap');
    expect(screen.getByTestId('dta-table').textContent).not.toContain('Arizona');
  });

  it('forces the overlay off when switching to a trait without coordinates', () => {
    useUiStore.setState({ dtaMapOverlay: 'bf' });
    render(<DtaPanel />);
    fireEvent.change(screen.getByTestId('dta-trait-select'), { target: { value: 'host' } });
    expect(useUiStore.getState().dtaMapOverlay).toBe('none');
  });

  it('filters the table to routes at or above the BF threshold', () => {
    render(<DtaPanel />);
    // state routes: Arizona→California (∞), Arizona→Texas (∞), California→Texas (BF 0).
    expect(bodyRowCount()).toBe(3);
    fireEvent.change(screen.getByTestId('dta-bf-threshold'), { target: { value: '1' } });
    expect(bodyRowCount()).toBe(2);
  });

  it('lets the BF threshold field be cleared back to empty (threshold 0)', () => {
    render(<DtaPanel />);
    const input = screen.getByTestId('dta-bf-threshold') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    expect(useUiStore.getState().bssvsBfThreshold).toBe(5);
    // Clearing the field is possible and resets the threshold to 0.
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(useUiStore.getState().bssvsBfThreshold).toBe(0);
    expect(bodyRowCount()).toBe(3);
  });
});
