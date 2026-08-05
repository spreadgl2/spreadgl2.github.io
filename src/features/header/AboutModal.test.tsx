// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutModal } from './AboutModal';
import { LICENSE_URL, NOTICE_URL, ORCID_URL, PEARCORE_URL, PEARTREE_URL } from './app-links';

afterEach(cleanup);

describe('AboutModal', () => {
  it('renders credits, prior work, and attribution links', () => {
    render(<AboutModal onClose={vi.fn()} />);
    expect(screen.getByTestId('about-modal')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Credits and prior work' })).toBeTruthy();
    expect(screen.getByText('Samuel L. Hong').getAttribute('href')).toBe(ORCID_URL);

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain(PEARTREE_URL);
    expect(hrefs).toContain(PEARCORE_URL);
    expect(hrefs).toContain(NOTICE_URL);
    expect(hrefs).toContain(LICENSE_URL);
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
