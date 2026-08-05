// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { Drawer } from './Drawer';

beforeEach(() => {
  useUiStore.setState({ activePanel: null });
  useTreeStore.setState({ traitInfo: null });
});

afterEach(() => {
  cleanup();
});

describe('Drawer', () => {
  it('is closed by default', () => {
    render(<Drawer />);
    const drawer = screen.getByTestId('drawer');
    expect(drawer.className).toContain('drawerClosed');
    expect(drawer.className).toContain('drawerIdle');
  });

  it('opens and routes each right-side panel to its content', () => {
    const cases = [
      ['style', 'style-panel'],
      ['layers', 'layers-panel'],
      ['filter', 'filter-panel'],
      ['export', 'export-panel'],
      ['settings', 'settings-panel'],
    ] as const;

    for (const [activePanel, testId] of cases) {
      useUiStore.setState({ activePanel });
      const { unmount } = render(<Drawer />);
      expect(screen.getByTestId('drawer').className).toContain('drawerOpen');
      expect(screen.getByTestId(testId)).toBeTruthy();
      unmount();
    }
  });

  it('left-anchors the locations panel beside the sidebar', () => {
    useUiStore.setState({ activePanel: 'locations' });
    render(<Drawer />);
    const drawer = screen.getByTestId('drawer');
    expect(drawer.className).toContain('drawerLocations');
    expect(screen.getByTestId('locations-panel')).toBeTruthy();
  });

  it('left-anchors the dates panel beside the sidebar', () => {
    useUiStore.setState({ activePanel: 'dates' });
    render(<Drawer />);
    const drawer = screen.getByTestId('drawer');
    expect(drawer.className).toContain('drawerLocations');
    expect(drawer.className).toContain('drawerDates');
    expect(screen.getByTestId('dates-panel')).toBeTruthy();
  });

  it('close button sets activePanel to null', () => {
    useUiStore.setState({ activePanel: 'style' });
    render(<Drawer />);
    fireEvent.click(screen.getByTestId('drawer-close-btn'));
    expect(useUiStore.getState().activePanel).toBeNull();
  });

  it('keeps the locations drawer direction while it closes', () => {
    useUiStore.setState({ activePanel: 'locations' });
    render(<Drawer />);
    const drawer = screen.getByTestId('drawer');
    fireEvent.click(screen.getByTestId('drawer-close-btn'));

    expect(useUiStore.getState().activePanel).toBeNull();
    expect(drawer.className).toContain('drawerLocations');
    expect(drawer.className).toContain('drawerClosed');

    fireEvent.transitionEnd(drawer);
    expect(drawer.className).not.toContain('drawerLocations');
    expect(drawer.className).toContain('drawerIdle');
  });

  it('Esc key closes the drawer', () => {
    useUiStore.setState({ activePanel: 'layers' });
    render(<Drawer />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUiStore.getState().activePanel).toBeNull();
  });

  it('only renders the resize handle for left-opening panels', () => {
    useUiStore.setState({ activePanel: 'style' });
    const { rerender } = render(<Drawer />);
    expect(screen.queryByTestId('drawer-resize-handle')).toBeNull();

    useUiStore.setState({ activePanel: 'dates' });
    rerender(<Drawer />);
    expect(screen.getByTestId('drawer-resize-handle')).toBeTruthy();
  });

  it('applies the stored dates-panel width as a CSS variable', () => {
    useUiStore.setState({ activePanel: 'dates', datesPanelWidth: 620 });
    render(<Drawer />);
    const drawer = screen.getByTestId('drawer');
    expect(drawer.style.getPropertyValue('--drawer-width')).toBe('620px');
  });

  it('dragging the handle widens the dates panel and clamps to the max', () => {
    useUiStore.setState({ activePanel: 'dates', datesPanelWidth: 480 });
    render(<Drawer />);
    const handle = screen.getByTestId('drawer-resize-handle');

    fireEvent.mouseDown(handle, { clientX: 480 });
    fireEvent.mouseMove(window, { clientX: 700 });
    expect(useUiStore.getState().datesPanelWidth).toBe(700);

    // Beyond the max clamp.
    fireEvent.mouseMove(window, { clientX: 5000 });
    expect(useUiStore.getState().datesPanelWidth).toBe(1000);
    fireEvent.mouseUp(window);

    // After releasing, further movement is ignored.
    fireEvent.mouseMove(window, { clientX: 350 });
    expect(useUiStore.getState().datesPanelWidth).toBe(1000);
  });

  it('clamps a resized left panel to the available viewport width', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    useUiStore.setState({ activePanel: 'dates', datesPanelWidth: 480 });
    render(<Drawer />);

    fireEvent.mouseDown(screen.getByTestId('drawer-resize-handle'), { clientX: 480 });
    fireEvent.mouseMove(window, { clientX: 5000 });
    fireEvent.mouseUp(window);

    expect(useUiStore.getState().datesPanelWidth).toBe(784);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('resizes the locations panel independently of the dates panel', () => {
    useUiStore.setState({
      activePanel: 'locations',
      locationsPanelWidth: 384,
      datesPanelWidth: 480,
    });
    render(<Drawer />);
    fireEvent.mouseDown(screen.getByTestId('drawer-resize-handle'), { clientX: 384 });
    fireEvent.mouseMove(window, { clientX: 560 });
    fireEvent.mouseUp(window);

    expect(useUiStore.getState().locationsPanelWidth).toBe(560);
    expect(useUiStore.getState().datesPanelWidth).toBe(480);
  });

  it('updates aria-hidden with the open state', () => {
    const { rerender } = render(<Drawer />);
    const drawer = screen.getByTestId('drawer');
    expect(drawer.getAttribute('aria-hidden')).toBe('true');

    useUiStore.setState({ activePanel: 'filter' });
    rerender(<Drawer />);
    expect(drawer.getAttribute('aria-hidden')).toBe('false');
  });
});
