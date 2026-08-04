// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../store/ui';
import { DOCS_URL } from './app-links';
import { BrandControls } from './BrandControls';

afterEach(cleanup);
beforeEach(() => {
  useUiStore.setState({ theme: 'dark' });
});

describe('BrandControls', () => {
  it('renders the theme toggle, docs link, and about button', () => {
    render(<BrandControls />);
    expect(screen.getByTestId('theme-toggle')).toBeTruthy();
    const docs = screen.getByTestId('header-docs-link') as HTMLAnchorElement;
    expect(docs.getAttribute('href')).toBe(DOCS_URL);
    expect(docs.getAttribute('target')).toBe('_blank');
    expect(docs.getAttribute('rel')).toContain('noopener');
    expect(screen.getByTestId('header-about-btn')).toBeTruthy();
  });

  it('the theme toggle flips dark → light → dark and persists', () => {
    useUiStore.setState({ theme: 'dark' });
    render(<BrandControls />);
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(useUiStore.getState().theme).toBe('light');
    fireEvent.click(screen.getByTestId('theme-toggle'));
    expect(useUiStore.getState().theme).toBe('dark');
  });

  it('opens and closes the About modal', () => {
    render(<BrandControls />);
    expect(screen.queryByTestId('about-modal')).toBeNull();
    fireEvent.click(screen.getByTestId('header-about-btn'));
    expect(screen.getByTestId('about-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('about-close-btn'));
    expect(screen.queryByTestId('about-modal')).toBeNull();
  });
});
