// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyboardHelpModal } from './KeyboardHelpModal';

const EXPECTED_BINDINGS = [
  'Space',
  '← / →',
  'Shift+← / Shift+→',
  'Home / End',
  '1 / 2',
  '3 / 4',
  '[ / ]',
  '/',
  '+ / −',
  'Esc',
  'Cmd/Ctrl+S',
  'Cmd/Ctrl+E',
  '?',
  'T / L / F / E / ,',
];

afterEach(() => {
  cleanup();
});

describe('KeyboardHelpModal', () => {
  it('renders all supported keybindings', () => {
    render(<KeyboardHelpModal onClose={vi.fn()} />);
    const modal = screen.getByTestId('keyboard-help-modal');
    expect(modal).toBeTruthy();

    for (const key of EXPECTED_BINDINGS) {
      expect(screen.getByText(key)).toBeTruthy();
    }
  });

  it('calls onClose when Esc is pressed', () => {
    const onClose = vi.fn();
    render(<KeyboardHelpModal onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<KeyboardHelpModal onClose={onClose} />);
    screen.getByTestId('keyboard-help-close').click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('has correct aria attributes', () => {
    render(<KeyboardHelpModal onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('keyboard-help-title');
    expect(document.activeElement).toBe(screen.getByTestId('keyboard-help-close'));
  });

  it('contains focus within the dialog', () => {
    render(<KeyboardHelpModal onClose={vi.fn()} />);
    const close = screen.getByTestId('keyboard-help-close');
    const lastLink = screen.getByText('SpreadGL2 issues');

    lastLink.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastLink);
  });
});
