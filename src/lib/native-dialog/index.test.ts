// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('openFilePicker — web fallback', () => {
  it('returns null when input is cancelled', async () => {
    const input = document.createElement('input');
    vi.spyOn(document, 'createElement').mockReturnValue(input as HTMLInputElement);
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {
      input.oncancel?.(new Event('cancel'));
    });

    const { openFilePicker } = await import('./index');
    const result = await openFilePicker();

    expect(clickSpy).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('returns OpenFileResult when a file is selected', async () => {
    const input = document.createElement('input');
    const file = new File(['hello tree'], 'rabv.nex', { type: 'text/plain' });
    vi.spyOn(document, 'createElement').mockReturnValue(input as HTMLInputElement);
    vi.spyOn(input, 'click').mockImplementation(() => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.onchange?.(new Event('change'));
    });

    const { openFilePicker } = await import('./index');
    const result = await openFilePicker();

    expect(result).not.toBeNull();
    expect(result?.name).toBe('rabv.nex');
    expect(result?.size).toBe(file.size);
    const text = await result?.text();
    expect(text).toBe('hello tree');
  });

  it('returns null when file list is empty', async () => {
    const input = document.createElement('input');
    vi.spyOn(document, 'createElement').mockReturnValue(input as HTMLInputElement);
    vi.spyOn(input, 'click').mockImplementation(() => {
      Object.defineProperty(input, 'files', { value: [], configurable: true });
      input.onchange?.(new Event('change'));
    });

    const { openFilePicker } = await import('./index');
    const result = await openFilePicker();

    expect(result).toBeNull();
  });
});

function makeFsOpenMock(content: string) {
  const bytes = new TextEncoder().encode(content);
  let offset = 0;
  return vi.fn().mockResolvedValue({
    stat: vi.fn().mockResolvedValue({ size: bytes.byteLength }),
    read: vi.fn().mockImplementation((buf: Uint8Array) => {
      if (offset >= bytes.byteLength) return Promise.resolve(null);
      const n = Math.min(buf.byteLength, bytes.byteLength - offset);
      buf.set(bytes.subarray(offset, offset + n), 0);
      offset += n;
      return Promise.resolve(n);
    }),
    close: vi.fn().mockResolvedValue(undefined),
  });
}

describe('openFilePicker — Tauri path', () => {
  it('calls dialog open, returns null when dialog cancelled', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const mockOpen = vi.fn().mockResolvedValue(null);
    vi.doMock('@tauri-apps/plugin-dialog', () => ({ open: mockOpen }));

    const { openFilePicker } = await import('./index');
    const result = await openFilePicker();

    expect(mockOpen).toHaveBeenCalledWith({ multiple: false, filters: expect.any(Array) });
    expect(result).toBeNull();
  });

  it('returns OpenFileResult with arrayBuffer() and text() backed by chunked native FS read', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const mockOpen = vi.fn().mockResolvedValue('/home/user/rabv.nex');
    const mockFsOpen = makeFsOpenMock('NEXUS content');
    vi.doMock('@tauri-apps/plugin-dialog', () => ({ open: mockOpen }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({ open: mockFsOpen }));

    const { openFilePicker } = await import('./index');
    const result = await openFilePicker();

    expect(result).not.toBeNull();
    expect(result?.name).toBe('rabv.nex');
    expect(typeof result?.arrayBuffer).toBe('function');
    const buf = await result!.arrayBuffer!();
    expect(new TextDecoder().decode(buf)).toBe('NEXUS content');
  });

  it('text() decodes the native FS read as UTF-8', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const mockOpen = vi.fn().mockResolvedValue('/home/user/rabv.nex');
    const mockFsOpen = makeFsOpenMock('NEXUS content');
    vi.doMock('@tauri-apps/plugin-dialog', () => ({ open: mockOpen }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({ open: mockFsOpen }));

    const { openFilePicker } = await import('./index');
    const result = await openFilePicker();
    const text = await result?.text();
    expect(text).toBe('NEXUS content');
  });

  it('rejects with wrapped message when dialog open() throws', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    vi.doMock('@tauri-apps/plugin-dialog', () => ({
      open: vi.fn().mockRejectedValue(new Error('permission denied')),
    }));

    const { openFilePicker } = await import('./index');
    await expect(openFilePicker()).rejects.toThrow('Native file dialog failed: permission denied');
  });
});

describe('saveFileAs — web fallback', () => {
  it('creates a download anchor and revokes the object URL', async () => {
    const anchor = document.createElement('a');
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');

    const { saveFileAs } = await import('./index');
    await saveFileAs('{"v":1}', 'project.spreadgl2.json');

    expect(clickSpy).toHaveBeenCalled();
    expect(anchor.download).toBe('project.spreadgl2.json');
    expect(revokeSpy).toHaveBeenCalledWith('blob:fake');
  });
});

describe('saveFileAs — Tauri path', () => {
  it('calls save dialog and writeTextFile with chosen path', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const mockSave = vi.fn().mockResolvedValue('/home/user/project.spreadgl2.json');
    const mockWriteTextFile = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/plugin-dialog', () => ({ save: mockSave }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({ writeTextFile: mockWriteTextFile }));

    const { saveFileAs } = await import('./index');
    await saveFileAs('{"v":1}', 'project.spreadgl2.json');

    expect(mockSave).toHaveBeenCalledWith({
      defaultPath: 'project.spreadgl2.json',
      filters: [{ name: 'SpreadGL2 project', extensions: ['json'] }],
    });
    expect(mockWriteTextFile).toHaveBeenCalledWith('/home/user/project.spreadgl2.json', '{"v":1}');
  });

  it('does not call writeTextFile when save dialog is cancelled', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const mockSave = vi.fn().mockResolvedValue(null);
    const mockWriteTextFile = vi.fn();
    vi.doMock('@tauri-apps/plugin-dialog', () => ({ save: mockSave }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({ writeTextFile: mockWriteTextFile }));

    const { saveFileAs } = await import('./index');
    await saveFileAs('{"v":1}', 'project.spreadgl2.json');

    expect(mockWriteTextFile).not.toHaveBeenCalled();
  });
});
