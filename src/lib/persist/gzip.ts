import { formatMiB, INPUT_LIMITS, InputLimitError } from '../security/input-limits';

export interface TransformLimits {
  maxOutputBytes: number;
  maxCompressionRatio?: number;
  label?: string;
}

export async function streamTransform(
  input: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  limits?: TransformLimits,
): Promise<Uint8Array> {
  const buffer = input.buffer.slice(
    input.byteOffset,
    input.byteOffset + input.byteLength,
  ) as ArrayBuffer;
  const chunk = new Uint8Array(buffer);

  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  let writeError: unknown = null;
  const writePromise = writer
    .write(chunk)
    .then(() => writer.close())
    .catch(async (err: unknown) => {
      writeError = err;
      try {
        await reader.cancel(err);
      } catch {}
    });

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (limits) {
        const ratioLimit =
          limits.maxCompressionRatio === undefined
            ? Number.POSITIVE_INFINITY
            : Math.max(
                INPUT_LIMITS.decompressionRatioFloorBytes,
                input.byteLength * limits.maxCompressionRatio,
              );
        if (total > limits.maxOutputBytes || total > ratioLimit) {
          const label = limits.label ?? 'Decompressed data';
          throw new InputLimitError(
            `${label} exceeds the ${formatMiB(limits.maxOutputBytes)} decompression limit.`,
          );
        }
      }
      chunks.push(value);
    }
  } catch (err) {
    try {
      await reader.cancel(err);
    } catch {}
    try {
      await writer.abort(err);
    } catch {}
    await writePromise;
    throw err;
  }
  await writePromise;
  if (writeError !== null) throw writeError;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function uint8ToBase64(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.byteLength; i++) {
    s += String.fromCharCode(data[i] ?? 0);
  }
  return btoa(s);
}

export function base64ToUint8(b64: string, maxBytes = Number.POSITIVE_INFINITY): Uint8Array {
  const estimatedBytes = Math.floor((b64.length * 3) / 4);
  if (estimatedBytes > maxBytes) {
    throw new InputLimitError(`Compressed data exceeds the ${formatMiB(maxBytes)} input limit.`);
  }
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    out[i] = s.charCodeAt(i);
  }
  return out;
}

export async function gzipText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const compressed = await streamTransform(bytes, new CompressionStream('gzip'));
  return uint8ToBase64(compressed);
}

export async function ungzipText(
  b64: string,
  limits: { maxOutputBytes: number; label: string },
): Promise<string> {
  const bytes = base64ToUint8(
    b64,
    Math.max(limits.maxOutputBytes, INPUT_LIMITS.decompressionRatioFloorBytes),
  );
  const decompressed = await streamTransform(bytes, new DecompressionStream('gzip'), {
    ...limits,
    maxCompressionRatio: INPUT_LIMITS.decompressionRatio,
  });
  return new TextDecoder().decode(decompressed);
}
