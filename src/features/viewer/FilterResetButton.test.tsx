// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from '../../store/selection';
import { useUiStore } from '../../store/ui';
import { FilterResetButton } from './FilterResetButton';

beforeEach(() => {
  useSelectionStore.setState({ focusedTaxa: [] });
  useUiStore.setState({ posteriorThreshold: 0, lassoMode: false, lassoVertices: [] });
});

afterEach(() => {
  cleanup();
});

describe('FilterResetButton', () => {
  it('renders nothing when no filter is applied', () => {
    render(<FilterResetButton />);
    expect(screen.queryByTestId('filter-reset-btn')).toBeNull();
  });

  it('appears when a focus set is active', () => {
    useSelectionStore.setState({ focusedTaxa: ['tipA'] });
    render(<FilterResetButton />);
    expect(screen.getByTestId('filter-reset-btn')).toBeTruthy();
  });

  it('appears when the posterior threshold is above zero', () => {
    useUiStore.setState({ posteriorThreshold: 0.5 });
    render(<FilterResetButton />);
    expect(screen.getByTestId('filter-reset-btn')).toBeTruthy();
  });

  it('appears while lasso mode is active', () => {
    useUiStore.setState({ lassoMode: true });
    render(<FilterResetButton />);
    expect(screen.getByTestId('filter-reset-btn')).toBeTruthy();
  });

  it('clears the focus set, posterior threshold, and lasso on click', () => {
    useSelectionStore.setState({ focusedTaxa: ['tipA', 'tipB'] });
    useUiStore.setState({ posteriorThreshold: 0.7, lassoMode: true, lassoVertices: [[0, 0]] });
    render(<FilterResetButton />);

    fireEvent.click(screen.getByTestId('filter-reset-btn'));

    expect(useSelectionStore.getState().focusedTaxa).toEqual([]);
    expect(useUiStore.getState().posteriorThreshold).toBe(0);
    expect(useUiStore.getState().lassoMode).toBe(false);
    expect(useUiStore.getState().lassoVertices).toEqual([]);
  });
});
