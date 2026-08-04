import { type RefObject, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface StoredIsolation {
  count: number;
  inert: string | null;
  ariaHidden: string | null;
}

const isolatedElements = new WeakMap<HTMLElement, StoredIsolation>();

function isolate(element: HTMLElement): () => void {
  const stored = isolatedElements.get(element);
  if (stored) {
    stored.count += 1;
  } else {
    isolatedElements.set(element, {
      count: 1,
      inert: element.getAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    });
    element.setAttribute('inert', '');
    element.setAttribute('aria-hidden', 'true');
  }

  return () => {
    const current = isolatedElements.get(element);
    if (!current) return;
    current.count -= 1;
    if (current.count > 0) return;

    if (current.inert === null) element.removeAttribute('inert');
    else element.setAttribute('inert', current.inert);
    if (current.ariaHidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', current.ariaHidden);
    isolatedElements.delete(element);
  };
}

function isolateOutside(dialog: HTMLElement): () => void {
  const restore: Array<() => void> = [];
  let current: HTMLElement | null = dialog;

  while (current.parentElement) {
    const parent: HTMLElement = current.parentElement;
    for (const sibling of parent.children) {
      if (sibling !== current && sibling instanceof HTMLElement) restore.push(isolate(sibling));
    }
    if (parent === document.body) break;
    current = parent;
  }

  return () => {
    for (let index = restore.length - 1; index >= 0; index -= 1) restore[index]?.();
  };
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.closest('[inert]'),
  );
}

interface Options {
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null> | undefined;
  onEscape?: (() => void) | undefined;
  enabled?: boolean;
}

export function useModalAccessibility({
  dialogRef,
  initialFocusRef,
  returnFocusRef,
  onEscape,
  enabled = true,
}: Options): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const activeDialog: HTMLElement = dialog;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const returnFocus = returnFocusRef?.current ?? previouslyFocused;
    const restoreIsolation = isolateOutside(activeDialog);
    (initialFocusRef?.current ?? activeDialog).focus();

    function handleKeyDown(event: KeyboardEvent) {
      const close = onEscapeRef.current;
      if (event.key === 'Escape' && close) {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const elements = focusableElements(activeDialog);
      if (elements.length === 0) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !activeDialog.contains(active))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (active === last || !activeDialog.contains(active))) {
        event.preventDefault();
        first?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      restoreIsolation();
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [dialogRef, enabled, initialFocusRef, returnFocusRef]);
}
