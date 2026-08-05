// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BIBTEX_TEXT, CITATION_TEXT, CitationModal } from './CitationModal';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.stubGlobal('navigator', { clipboard: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  writeText.mockClear();
});

describe('CitationModal', () => {
  it('keeps the displayed and copied citation in sync', async () => {
    render(<CitationModal onClose={vi.fn()} />);
    expect(screen.getByTestId('citation-text').textContent?.replace(/\s+/g, ' ').trim()).toBe(
      CITATION_TEXT,
    );

    fireEvent.click(screen.getByTestId('copy-citation-btn'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CITATION_TEXT));

    fireEvent.click(screen.getByTestId('copy-bibtex-btn'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(BIBTEX_TEXT));
  });

  it('closes via the close button and Escape', () => {
    const onClose = vi.fn();
    render(<CitationModal onClose={onClose} />);
    fireEvent.click(screen.getByTestId('citation-close-btn'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
