import { describe, expect, it } from 'vitest';
import { InputLimitError } from '../security/input-limits';
import { gzipText, streamTransform, ungzipText } from './gzip';

describe('bounded gzip transforms', () => {
  it('round-trips text within its output budget', async () => {
    const compressed = await gzipText('bounded scientific data');
    await expect(
      ungzipText(compressed, { maxOutputBytes: 1024, label: 'Test payload' }),
    ).resolves.toBe('bounded scientific data');
  });

  it('aborts decompression when output exceeds the byte budget', async () => {
    const compressed = await gzipText('x'.repeat(4096));
    await expect(
      ungzipText(compressed, { maxOutputBytes: 1024, label: 'Test payload' }),
    ).rejects.toThrow(InputLimitError);
  });

  it('applies an expansion-ratio guard while streaming', async () => {
    const input = new TextEncoder().encode('x'.repeat(2 * 1024 * 1024));
    const compressed = await streamTransform(input, new CompressionStream('gzip'));
    await expect(
      streamTransform(compressed, new DecompressionStream('gzip'), {
        maxOutputBytes: 4 * 1024 * 1024,
        maxCompressionRatio: 10,
        label: 'Test payload',
      }),
    ).rejects.toThrow(InputLimitError);
  });
});
