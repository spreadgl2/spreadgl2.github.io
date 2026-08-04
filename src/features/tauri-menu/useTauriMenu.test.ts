import { describe, expect, it, vi } from 'vitest';
import type { MenuDispatchContext } from './useTauriMenu';
import { dispatchMenuAction } from './useTauriMenu';

function makeCtx(overrides: Partial<MenuDispatchContext> = {}): MenuDispatchContext {
  return {
    currentPanel: null,
    setActivePanel: vi.fn(),
    setIsPlaying: vi.fn(),
    resetTree: vi.fn(),
    ...overrides,
  };
}

describe('dispatchMenuAction — file actions', () => {
  it('file:open calls onOpenFile when provided', () => {
    const onOpenFile = vi.fn();
    const ctx = makeCtx({ onOpenFile });
    dispatchMenuAction('file:open', ctx);
    expect(onOpenFile).toHaveBeenCalledOnce();
    expect(ctx.setIsPlaying).not.toHaveBeenCalled();
    expect(ctx.resetTree).not.toHaveBeenCalled();
  });

  it('file:open stops playback and resets tree when no callback', () => {
    const ctx = makeCtx();
    dispatchMenuAction('file:open', ctx);
    expect(ctx.setIsPlaying).toHaveBeenCalledWith(false);
    expect(ctx.resetTree).toHaveBeenCalledOnce();
  });

  it('file:save-project calls onSaveProject when provided', () => {
    const onSaveProject = vi.fn();
    const ctx = makeCtx({ onSaveProject });
    dispatchMenuAction('file:save-project', ctx);
    expect(onSaveProject).toHaveBeenCalledOnce();
    expect(ctx.setActivePanel).not.toHaveBeenCalled();
  });

  it('file:save-project opens export panel when no callback', () => {
    const ctx = makeCtx();
    dispatchMenuAction('file:save-project', ctx);
    expect(ctx.setActivePanel).toHaveBeenCalledWith('export');
  });

  it('file:export calls onExport when provided', () => {
    const onExport = vi.fn();
    const ctx = makeCtx({ onExport });
    dispatchMenuAction('file:export', ctx);
    expect(onExport).toHaveBeenCalledOnce();
    expect(ctx.setActivePanel).not.toHaveBeenCalled();
  });

  it('file:export opens export panel when no callback', () => {
    const ctx = makeCtx();
    dispatchMenuAction('file:export', ctx);
    expect(ctx.setActivePanel).toHaveBeenCalledWith('export');
  });
});

describe('dispatchMenuAction — view panel toggles', () => {
  const panels = ['style', 'layers', 'filter', 'export', 'settings'] as const;

  for (const panel of panels) {
    it(`view:${panel} opens panel when closed`, () => {
      const ctx = makeCtx({ currentPanel: null });
      dispatchMenuAction(`view:${panel}`, ctx);
      expect(ctx.setActivePanel).toHaveBeenCalledWith(panel);
    });

    it(`view:${panel} closes panel when already open`, () => {
      const ctx = makeCtx({ currentPanel: panel });
      dispatchMenuAction(`view:${panel}`, ctx);
      expect(ctx.setActivePanel).toHaveBeenCalledWith(null);
    });

    it(`view:${panel} switches from a different panel`, () => {
      const other = panels.find((p) => p !== panel) ?? 'style';
      const ctx = makeCtx({ currentPanel: other });
      dispatchMenuAction(`view:${panel}`, ctx);
      expect(ctx.setActivePanel).toHaveBeenCalledWith(panel);
    });
  }
});

describe('dispatchMenuAction — help actions', () => {
  it('help:keyboard-shortcuts calls onHelp when provided', () => {
    const onHelp = vi.fn();
    const ctx = makeCtx({ onHelp });
    dispatchMenuAction('help:keyboard-shortcuts', ctx);
    expect(onHelp).toHaveBeenCalledOnce();
  });

  it('help:keyboard-shortcuts is a no-op when onHelp is absent', () => {
    const ctx = makeCtx();
    expect(() => dispatchMenuAction('help:keyboard-shortcuts', ctx)).not.toThrow();
  });
});

describe('dispatchMenuAction — unknown action', () => {
  it('unknown action is a no-op', () => {
    const ctx = makeCtx();
    dispatchMenuAction('unknown:action', ctx);
    expect(ctx.setActivePanel).not.toHaveBeenCalled();
    expect(ctx.setIsPlaying).not.toHaveBeenCalled();
    expect(ctx.resetTree).not.toHaveBeenCalled();
  });
});
