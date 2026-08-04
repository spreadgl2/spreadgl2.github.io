// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorPanel } from './ErrorPanel';
import { ERROR_COPY } from './error-copy';

afterEach(() => {
  cleanup();
});

describe('ErrorPanel — not_nexus', () => {
  it('renders title and body', () => {
    render(<ErrorPanel copy={ERROR_COPY.not_nexus} onTryAgain={vi.fn()} />);
    expect(screen.getByTestId('error-title').textContent).toBe("This isn't a BEAST X tree");
    expect(screen.getByTestId('error-body').textContent).toBe(
      "We couldn't recognize this file as NEXUS or Newick. Open it in a text editor — it should start with #NEXUS.",
    );
    expect(screen.queryByTestId('error-action')).toBeNull();
    expect(screen.getByTestId('error-try-again').textContent).toBe('Try again');
    expect(screen.getByRole('alert')).toBe(document.activeElement);
  });
});

describe('ErrorPanel — no_geo', () => {
  it('renders title, body, and action', () => {
    render(<ErrorPanel copy={ERROR_COPY.no_geo} onTryAgain={vi.fn()} />);
    expect(screen.getByTestId('error-title').textContent).toBe('No geographic annotations');
    expect(screen.getByTestId('error-body').textContent).toBe(
      'SpreadGL2 visualizes phylogeography, which needs location traits like location1/location2 (continuous) or region (discrete).',
    );
    expect(screen.getByTestId('error-action').textContent).toBe(
      'Re-run BEAST with a geographic prior, or try one of the examples.',
    );
    expect(screen.getByTestId('error-try-again').textContent).toBe('Try again');
  });
});

describe('ErrorPanel — non_wgs84', () => {
  it('renders title, body, and action', () => {
    render(<ErrorPanel copy={ERROR_COPY.non_wgs84} onTryAgain={vi.fn()} />);
    expect(screen.getByTestId('error-title').textContent).toBe("Coordinates aren't WGS84");
    expect(screen.getByTestId('error-body').textContent).toBe(
      'The coordinates in this tree look like a projected CRS (values out of lat/lon range). SpreadGL2 needs WGS84.',
    );
    expect(screen.getByTestId('error-action').textContent).toBe(
      'Reproject offline (e.g. with cs2cs) and reload.',
    );
    expect(screen.getByTestId('error-try-again').textContent).toBe('Try again');
  });
});

describe('ErrorPanel — no_dates', () => {
  it('renders title, body, and action', () => {
    render(<ErrorPanel copy={ERROR_COPY.no_dates} onTryAgain={vi.fn()} />);
    expect(screen.getByTestId('error-title').textContent).toBe('No tip dates');
    expect(screen.getByTestId('error-body').textContent).toBe(
      "We couldn't find dates in tip labels or annotations.",
    );
    expect(screen.getByTestId('error-action').textContent).toBe(
      'Try renaming tips to name|YYYY-MM-DD, or add a date annotation.',
    );
    expect(screen.getByTestId('error-try-again').textContent).toBe('Try again');
  });
});

describe('ErrorPanel — Try again button', () => {
  it('calls onTryAgain when clicked', async () => {
    const onTryAgain = vi.fn();
    render(<ErrorPanel copy={ERROR_COPY.not_nexus} onTryAgain={onTryAgain} />);
    await userEvent.click(screen.getByTestId('error-try-again'));
    expect(onTryAgain).toHaveBeenCalledOnce();
  });
});
