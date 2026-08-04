// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useModalAccessibility } from './useModalAccessibility';

function Fixture({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  useModalAccessibility({ dialogRef, initialFocusRef: firstRef, onEscape: onClose });
  return (
    <div>
      <button type="button" data-testid="trigger">
        Trigger
      </button>
      <div data-testid="background">
        <button type="button">Background action</button>
      </div>
      <div>
        <div ref={dialogRef} role="dialog" tabIndex={-1}>
          <button ref={firstRef} type="button">
            First
          </button>
          <button type="button">Last</button>
        </div>
      </div>
    </div>
  );
}

afterEach(cleanup);

describe('useModalAccessibility', () => {
  it('places focus, isolates the background, and restores focus on unmount', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();

    const { unmount } = render(<Fixture onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByText('First'));
    expect(screen.getByTestId('background').hasAttribute('inert')).toBe(true);
    expect(screen.getByTestId('background').getAttribute('aria-hidden')).toBe('true');

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('contains forward and reverse Tab navigation', () => {
    render(<Fixture onClose={vi.fn()} />);
    const first = screen.getByText('First');
    const last = screen.getByText('Last');

    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('uses Escape only when cancellation is provided', () => {
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
