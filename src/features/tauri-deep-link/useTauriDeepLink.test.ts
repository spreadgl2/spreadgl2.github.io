// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
const mockListen = vi.fn().mockResolvedValue(() => {});

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }));

describe('useTauriDeepLink', () => {
  afterEach(() => {
    // @ts-expect-error -- cleaning up jsdom window property
    delete window.__TAURI_INTERNALS__;
    vi.clearAllMocks();
  });

  it('does nothing outside Tauri', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useTauriDeepLink } = await import('./useTauriDeepLink');
    const onFilePath = vi.fn();
    renderHook(() => useTauriDeepLink({ onFilePath })).unmount();
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockListen).not.toHaveBeenCalled();
  });

  describe('inside Tauri', () => {
    beforeEach(() => {
      Object.defineProperty(window, '__TAURI_INTERNALS__', {
        value: {},
        configurable: true,
      });
      mockInvoke.mockResolvedValue(null);
      mockListen.mockResolvedValue(() => {});
    });

    it('loads only the Rust-authorized pending file and passes no path to invoke', async () => {
      const { renderHook, waitFor } = await import('@testing-library/react');
      const { useTauriDeepLink } = await import('./useTauriDeepLink');
      const onFilePath = vi.fn();
      mockInvoke.mockResolvedValue({ path: '/data/sample.nex', text: '#NEXUS', error: null });

      const { unmount } = renderHook(() => useTauriDeepLink({ onFilePath }));
      await waitFor(() => expect(onFilePath).toHaveBeenCalledWith('/data/sample.nex', '#NEXUS'));
      expect(mockInvoke).toHaveBeenCalledWith('take_pending_tree_file');
      expect(mockInvoke.mock.calls[0]).toHaveLength(1);
      unmount();
    });

    it('loads files from native events without a frontend read command', async () => {
      const { renderHook, waitFor } = await import('@testing-library/react');
      const { useTauriDeepLink } = await import('./useTauriDeepLink');
      const onFilePath = vi.fn();
      let listener: ((event: { payload: unknown }) => void) | undefined;
      mockListen.mockImplementation((_event, callback) => {
        listener = callback;
        return Promise.resolve(() => {});
      });

      const { unmount } = renderHook(() => useTauriDeepLink({ onFilePath }));
      await waitFor(() => expect(listener).toBeDefined());
      listener?.({ payload: { path: 'C:\\data\\sample.tree', text: 'tree data', error: null } });
      expect(onFilePath).toHaveBeenCalledWith('C:\\data\\sample.tree', 'tree data');
      expect(mockInvoke).not.toHaveBeenCalledWith('read_text_file', expect.anything());
      unmount();
    });

    it('surfaces backend validation errors without delivering file contents', async () => {
      const { renderHook, waitFor } = await import('@testing-library/react');
      const { useTauriDeepLink } = await import('./useTauriDeepLink');
      const onFilePath = vi.fn();
      const onFileError = vi.fn();
      mockInvoke.mockResolvedValue({
        path: '/data/large.tree',
        text: null,
        error: 'Tree files must be 128 MiB or smaller.',
      });

      const { unmount } = renderHook(() => useTauriDeepLink({ onFilePath, onFileError }));
      await waitFor(() =>
        expect(onFileError).toHaveBeenCalledWith(expect.stringContaining('128 MiB')),
      );
      expect(onFilePath).not.toHaveBeenCalled();
      unmount();
    });
  });
});
