const CHUNK = 4 * 1024 * 1024;

export async function tauriReadAsArrayBuffer(
  path: string,
  maxBytes = 128 * 1024 * 1024,
): Promise<ArrayBuffer> {
  const { open } = await import('@tauri-apps/plugin-fs');
  const fh = await open(path, { read: true });
  try {
    const { size } = await fh.stat();
    if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
      throw new Error(`Selected file exceeds the ${Math.round(maxBytes / 1024 / 1024)} MiB limit.`);
    }
    const out = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      const slice = out.subarray(offset, Math.min(offset + CHUNK, size));
      const n = await fh.read(slice);
      if (n === null) break;
      offset += n;
    }
    if (offset !== size) throw new Error('Selected file changed while it was being read.');
    return out.buffer;
  } finally {
    await fh.close();
  }
}
