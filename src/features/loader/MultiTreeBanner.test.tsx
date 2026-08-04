// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../store/ui';
import { MultiTreeBanner } from './MultiTreeBanner';

function resetStore() {
  useUiStore.setState({ multiTreeCount: 1, multiTreeNoticeDismissed: false });
}

beforeEach(resetStore);
afterEach(() => {
  cleanup();
  resetStore();
});

describe('MultiTreeBanner', () => {
  it('does not render when multiTreeCount is 1', () => {
    render(<MultiTreeBanner />);
    expect(screen.queryByTestId('multi-tree-banner')).toBeNull();
  });

  it('renders with substituted count when multiTreeCount > 1', () => {
    useUiStore.setState({ multiTreeCount: 3 });
    render(<MultiTreeBanner />);
    const banner = screen.getByTestId('multi-tree-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('3 trees');
    expect(banner.textContent).toContain('We loaded the first');
  });

  it('dismiss button hides the banner', async () => {
    useUiStore.setState({ multiTreeCount: 3 });
    render(<MultiTreeBanner />);
    expect(screen.getByTestId('multi-tree-banner')).toBeTruthy();

    await userEvent.click(screen.getByTestId('multi-tree-banner-dismiss'));

    expect(screen.queryByTestId('multi-tree-banner')).toBeNull();
  });

  it('does not render when notice is dismissed even if count > 1', () => {
    useUiStore.setState({ multiTreeCount: 5, multiTreeNoticeDismissed: true });
    render(<MultiTreeBanner />);
    expect(screen.queryByTestId('multi-tree-banner')).toBeNull();
  });

  it('re-shows banner when a new multi-tree file is loaded (setMultiTreeCount resets dismissed)', () => {
    useUiStore.setState({ multiTreeCount: 3, multiTreeNoticeDismissed: true });
    useUiStore.getState().setMultiTreeCount(4);
    render(<MultiTreeBanner />);
    expect(screen.getByTestId('multi-tree-banner')).toBeTruthy();
    expect(screen.getByTestId('multi-tree-banner').textContent).toContain('4 trees');
  });
});
