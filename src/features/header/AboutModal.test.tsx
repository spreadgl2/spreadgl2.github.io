// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutModal, BIBTEX_TEXT, CITATION_TEXT } from './AboutModal';
import { LICENSE_URL, NOTICE_URL, ORCID_URL, PEARCORE_URL, PEARTREE_URL } from './app-links';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  writeText.mockClear();
});

describe('AboutModal', () => {
  it('renders product context, attribution, and citation', () => {
    render(<AboutModal onClose={vi.fn()} />);
    expect(screen.getByTestId('about-modal')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What is SpreadGL2?' })).toBeTruthy();
    expect(screen.getByText('Samuel L. Hong.').getAttribute('href')).toBe(ORCID_URL);
    expect(screen.getByTestId('citation-text').textContent?.replace(/\s+/g, ' ').trim()).toBe(
      CITATION_TEXT,
    );

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toContain(PEARTREE_URL);
    expect(hrefs).toContain(PEARCORE_URL);
    expect(hrefs).toContain(NOTICE_URL);
    expect(hrefs).toContain(LICENSE_URL);
  });

  it('copies the citation and BibTeX', async () => {
    render(<AboutModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByTestId('copy-citation-btn'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CITATION_TEXT));
    expect(screen.getByText('Citation copied.')).toBeTruthy();

    fireEvent.click(screen.getByTestId('copy-bibtex-btn'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(BIBTEX_TEXT));
    expect(screen.getByText('BibTeX copied.')).toBeTruthy();
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
