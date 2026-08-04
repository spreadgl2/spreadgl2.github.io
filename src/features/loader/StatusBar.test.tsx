// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useTreeStore } from '../../store/tree';
import { StatusBar } from './StatusBar';

afterEach(() => {
  cleanup();
  useTreeStore.getState().reset();
});

describe('StatusBar', () => {
  it('shows no progress bars when parseStage is null', () => {
    render(<StatusBar />);
    expect(screen.queryByTestId('stage-fill-read')).toBeNull();
  });

  it('shows active stage with partial progress', () => {
    useTreeStore.setState({ parseStage: 'read', parseProgress: 50 });
    render(<StatusBar />);
    const fill = screen.getByTestId('stage-fill-read');
    expect(fill).toBeTruthy();
    expect(fill.style.width).toBe('50%');
    expect(screen.getByTestId('stage-percent-read').textContent).toBe('50%');
  });

  it('shows completed stage at 100%', () => {
    useTreeStore.setState({ parseStage: 'read', parseProgress: 100 });
    render(<StatusBar />);
    const fill = screen.getByTestId('stage-fill-read');
    expect(fill.style.width).toBe('100%');
    expect(screen.getByTestId('stage-percent-read').textContent).toBe('100%');
  });

  it('shows previous stages as done when a later stage is active', () => {
    useTreeStore.setState({ parseStage: 'calibrate', parseProgress: 30 });
    render(<StatusBar />);
    expect(screen.getByTestId('stage-fill-read').style.width).toBe('100%');
    expect(screen.getByTestId('stage-fill-layout').style.width).toBe('100%');
    expect(screen.getByTestId('stage-fill-calibrate').style.width).toBe('30%');
    expect(screen.queryByTestId('stage-fill-geo')).toBeNull();
    expect(screen.queryByTestId('stage-fill-table')).toBeNull();
  });

  it('shows stage label text for active stage', () => {
    useTreeStore.setState({ parseStage: 'geo', parseProgress: 0 });
    render(<StatusBar />);
    expect(screen.getByText('Reading geographic keys…')).toBeTruthy();
  });
});
