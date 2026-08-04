// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LocationAnnotationWarning,
  MissingLocationAnnotationsNotice,
} from './LocationAnnotationWarning';

afterEach(cleanup);

describe('LocationAnnotationWarning', () => {
  it('states the missing annotation count and geographic consequence', () => {
    render(<LocationAnnotationWarning count={14} traitName="location_rate" onContinue={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('14 internal nodes have no location_rate annotation');
    expect(dialog.textContent).toContain('Branches touching them will be omitted from the map');
  });

  it('requires an explicit continue action', () => {
    const onContinue = vi.fn();
    render(<LocationAnnotationWarning count={1} traitName="region" onContinue={onContinue} />);
    fireEvent.click(screen.getByTestId('location-annotation-warning-continue'));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});

describe('MissingLocationAnnotationsNotice', () => {
  it('renders nothing when annotations are complete', () => {
    const { container } = render(<MissingLocationAnnotationsNotice count={0} traitName="region" />);
    expect(container.textContent).toBe('');
  });
});
