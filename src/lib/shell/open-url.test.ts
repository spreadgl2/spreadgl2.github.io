// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('openUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('calls window.open when not in Tauri', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { openUrl } = await import('./open-url');
    await openUrl('https://github.com/spreadgl2');
    expect(openSpy).toHaveBeenCalledWith(
      'https://github.com/spreadgl2',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('calls plugin openUrl when in Tauri', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const mockPluginOpenUrl = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@tauri-apps/plugin-opener', () => ({ openUrl: mockPluginOpenUrl }));

    const { openUrl } = await import('./open-url');
    await openUrl('https://beast.community');
    expect(mockPluginOpenUrl).toHaveBeenCalledWith('https://beast.community/');
  });

  it('rejects non-HTTPS, credentialed, and unapproved destinations', async () => {
    const { openUrl } = await import('./open-url');
    await expect(openUrl('javascript:alert(1)')).rejects.toThrow('approved HTTPS');
    await expect(openUrl('http://github.com/spreadgl2')).rejects.toThrow('approved HTTPS');
    await expect(openUrl('https://github.com@example.com')).rejects.toThrow('approved HTTPS');
    await expect(openUrl('https://example.com')).rejects.toThrow('approved HTTPS');
  });
});
