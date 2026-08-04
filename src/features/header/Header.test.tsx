// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from '../../store/selection';
import { useTreeStore } from '../../store/tree';
import { DEFAULT_VISIBLE_VIEWS, useUiStore } from '../../store/ui';
import { Header } from './Header';

beforeEach(() => {
  useUiStore.setState({
    activePanel: null,
    visibleViews: { ...DEFAULT_VISIBLE_VIEWS },
    posteriorThreshold: 0,
    lassoMode: false,
  });
  useSelectionStore.setState({ focusedTaxa: [] });
  useTreeStore.setState({ fileName: null });
});

afterEach(() => {
  cleanup();
});

describe('Header', () => {
  it('renders brand mark', () => {
    render(<Header />);
    expect(screen.getByText('SpreadGL2')).toBeTruthy();
  });

  it('renders the shared brand controls (theme/docs/about) and no file label', () => {
    useTreeStore.setState({ fileName: 'rabv_us.tree' });
    render(<Header />);
    // The filename is redundant with the sidebar Project section — dropped here.
    expect(screen.queryByTestId('header-file-label')).toBeNull();
    expect(screen.getByTestId('theme-toggle')).toBeTruthy();
    expect(screen.getByTestId('header-docs-link')).toBeTruthy();
    expect(screen.getByTestId('header-about-btn')).toBeTruthy();
  });

  it('clicking Style button sets activePanel to style', () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId('header-btn-style'));
    expect(useUiStore.getState().activePanel).toBe('style');
  });

  it('clicking Style button again toggles activePanel to null', () => {
    useUiStore.setState({ activePanel: 'style' });
    render(<Header />);
    fireEvent.click(screen.getByTestId('header-btn-style'));
    expect(useUiStore.getState().activePanel).toBeNull();
  });

  it('clicking Layers button sets activePanel to layers', () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId('header-btn-layers'));
    expect(useUiStore.getState().activePanel).toBe('layers');
  });

  it('clicking Filter button sets activePanel to filter', () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId('header-btn-filter'));
    expect(useUiStore.getState().activePanel).toBe('filter');
  });

  it('clicking Export button sets activePanel to export', () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId('header-btn-export'));
    expect(useUiStore.getState().activePanel).toBe('export');
  });

  it('clicking Settings button sets activePanel to settings', () => {
    render(<Header />);
    fireEvent.click(screen.getByTestId('header-btn-settings'));
    expect(useUiStore.getState().activePanel).toBe('settings');
  });

  it('an open drawer button shows the panelBtnOpen indicator and reports expanded', () => {
    useUiStore.setState({ activePanel: 'layers' });
    render(<Header />);
    const btn = screen.getByTestId('header-btn-layers');
    expect(btn.className).toContain('panelBtnOpen');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-controls')).toBe('app-drawer');
  });

  it('a closed drawer button reports collapsed and does not show the fill class', () => {
    render(<Header />);
    const btn = screen.getByTestId('header-btn-style');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.className).not.toContain('viewBtnActive');
  });

  it('a visible view toggle is pressed and filled', () => {
    render(<Header />);
    const tree = screen.getByTestId('header-toggle-tree');
    expect(tree.getAttribute('aria-pressed')).toBe('true');
    expect(tree.className).toContain('viewBtnActive');
  });

  it('marks the Filter button when focused taxa are filtering the view', () => {
    useSelectionStore.setState({ focusedTaxa: ['tip-a'] });
    render(<Header />);
    const btn = screen.getByTestId('header-btn-filter');
    expect(btn.className).toContain('panelBtnFiltered');
    expect(btn.getAttribute('aria-label')).toBe('Filter active');
  });

  it('marks the Filter button when posterior filtering is active', () => {
    useUiStore.setState({ posteriorThreshold: 0.5 });
    render(<Header />);
    expect(screen.getByTestId('header-btn-filter').className).toContain('panelBtnFiltered');
  });

  it('marks the Filter button while lasso filtering mode is active', () => {
    useUiStore.setState({ lassoMode: true });
    render(<Header />);
    expect(screen.getByTestId('header-btn-filter').className).toContain('panelBtnFiltered');
  });

  it('groups the view toggles as a segmented control, in order', () => {
    render(<Header />);
    const group = screen.getByTestId('header-view-group');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.children[0]).toBe(screen.getByTestId('header-toggle-tree'));
    expect(group.children[1]).toBe(screen.getByTestId('header-toggle-map'));
    expect(group.children[2]).toBe(screen.getByTestId('header-toggle-analysis'));

    fireEvent.click(screen.getByTestId('header-toggle-map'));
    expect(useUiStore.getState().visibleViews.map).toBe(false);
  });
});
