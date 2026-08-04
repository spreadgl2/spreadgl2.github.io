import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function makeFsOpenMock(content: string, chunkSize = 8) {
  const bytes = new TextEncoder().encode(content);
  let offset = 0;
  return vi.fn().mockResolvedValue({
    stat: vi.fn().mockResolvedValue({ size: bytes.byteLength }),
    read: vi.fn().mockImplementation((buf: Uint8Array) => {
      if (offset >= bytes.byteLength) return Promise.resolve(null);
      const n = Math.min(chunkSize, buf.byteLength, bytes.byteLength - offset);
      buf.set(bytes.subarray(offset, offset + n), 0);
      offset += n;
      return Promise.resolve(n);
    }),
    close: vi.fn().mockResolvedValue(undefined),
  });
}

describe('tauriReadAsArrayBuffer', () => {
  it('reads a small file in chunks and assembles into a single ArrayBuffer', async () => {
    const content = 'hello world';
    const mockFsOpen = makeFsOpenMock(content, 4);
    vi.doMock('@tauri-apps/plugin-fs', () => ({ open: mockFsOpen }));

    const { tauriReadAsArrayBuffer } = await import('./read-stream.js');
    const buf = await tauriReadAsArrayBuffer('/fake/path/tree.nex');

    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(new TextDecoder().decode(buf)).toBe(content);
    expect(mockFsOpen).toHaveBeenCalledWith('/fake/path/tree.nex', { read: true });
  });

  it('closes the file handle after reading', async () => {
    const content = 'test';
    const bytes = new TextEncoder().encode(content);
    const mockHandle = {
      stat: vi.fn().mockResolvedValue({ size: bytes.byteLength }),
      read: vi.fn().mockImplementation((buf: Uint8Array) => {
        buf.set(bytes.subarray(0, buf.byteLength));
        return Promise.resolve(buf.byteLength);
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      open: vi.fn().mockResolvedValue(mockHandle),
    }));

    const { tauriReadAsArrayBuffer } = await import('./read-stream.js');
    await tauriReadAsArrayBuffer('/fake/path/tree.nex');

    expect(mockHandle.close).toHaveBeenCalledOnce();
  });

  it('closes the file handle even if read throws', async () => {
    const mockHandle = {
      stat: vi.fn().mockResolvedValue({ size: 16 }),
      read: vi.fn().mockRejectedValue(new Error('disk error')),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      open: vi.fn().mockResolvedValue(mockHandle),
    }));

    const { tauriReadAsArrayBuffer } = await import('./read-stream.js');
    await expect(tauriReadAsArrayBuffer('/fake/path/tree.nex')).rejects.toThrow('disk error');
    expect(mockHandle.close).toHaveBeenCalledOnce();
  });

  it('handles empty files', async () => {
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      open: vi.fn().mockResolvedValue({
        stat: vi.fn().mockResolvedValue({ size: 0 }),
        read: vi.fn().mockResolvedValue(null),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    }));

    const { tauriReadAsArrayBuffer } = await import('./read-stream.js');
    const buf = await tauriReadAsArrayBuffer('/fake/empty.nex');

    expect(buf.byteLength).toBe(0);
  });

  it('rejects an over-budget file before allocating its output buffer', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      open: vi.fn().mockResolvedValue({
        stat: vi.fn().mockResolvedValue({ size: 17 }),
        read: vi.fn(),
        close,
      }),
    }));

    const { tauriReadAsArrayBuffer } = await import('./read-stream.js');
    await expect(tauriReadAsArrayBuffer('/fake/large.nex', 16)).rejects.toThrow('exceeds');
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects a short read if the selected file changes while reading', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      open: vi.fn().mockResolvedValue({
        stat: vi.fn().mockResolvedValue({ size: 8 }),
        read: vi.fn().mockResolvedValue(null),
        close,
      }),
    }));

    const { tauriReadAsArrayBuffer } = await import('./read-stream.js');
    await expect(tauriReadAsArrayBuffer('/fake/changed.nex')).rejects.toThrow('changed');
    expect(close).toHaveBeenCalledOnce();
  });
});
