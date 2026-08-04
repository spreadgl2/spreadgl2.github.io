// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutModal } from './AboutModal';
import { DOCS_URL, GITHUB_URL } from './app-links';

afterEach(cleanup);

describe('AboutModal', () => {
  it('renders the About content with docs and GitHub links', () => {
    render(<AboutModal onClose={vi.fn()} />);
    expect(screen.getByTestId('about-modal')).toBeTruthy();
    expect(screen.getByText(/BEAST X/)).toBeTruthy();

    // "GitHub" also appears in body prose, so match the links by href.
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain(DOCS_URL);
    expect(hrefs).toContain(GITHUB_URL);
  });

  it('closes via the close button', () => {
    const onClose = vi.fn();
    render(<AboutModal onClose={onClose} />);
    fireEvent.click(screen.getByTestId('about-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<AboutModal onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
