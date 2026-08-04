import { assertInputSize, inputKindForFileName, maxBytesForInput } from '../security/input-limits';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface OpenFileResult {
  name: string;
  size?: number;
  text: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

const TREE_FILTERS = [
  { name: 'BEAST X tree files', extensions: ['tree', 'nex', 'nexus', 'trees'] },
  { name: 'SpreadGL2 project', extensions: ['json'] },
  { name: 'All files', extensions: ['*'] },
];

export async function openFilePicker(): Promise<OpenFileResult | null> {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({ multiple: false, filters: TREE_FILTERS });
      if (!path) return null;
      const name = path.split(/[/\\]/).pop() ?? path;
      const kind = inputKindForFileName(name);
      if (!kind) throw new Error('Select a supported tree or .spreadgl2.json project file.');
      const maximum = maxBytesForInput(kind);
      const read = async () => {
        const { tauriReadAsArrayBuffer } = await import('../native-fs/read-stream.js');
        return tauriReadAsArrayBuffer(path, maximum);
      };
      return {
        name,
        arrayBuffer: read,
        text: async () => {
          const buf = await read();
          return new TextDecoder().decode(buf);
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Native file dialog failed: ${msg}`);
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tree,.nex,.nexus,.trees,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const kind = inputKindForFileName(file.name);
      if (!kind) {
        resolve(null);
        return;
      }
      try {
        assertInputSize(kind, file.size);
      } catch {
        resolve({
          name: file.name,
          size: file.size,
          text: () => Promise.reject(new Error('Selected file exceeds its supported size limit.')),
        });
        return;
      }
      resolve({ name: file.name, size: file.size, text: () => file.text() });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function saveFileAs(content: string, suggestedName: string): Promise<void> {
  if (isTauri()) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const ext = suggestedName.split('.').pop() ?? 'json';
      const path = await save({
        defaultPath: suggestedName,
        filters: [{ name: 'SpreadGL2 project', extensions: [ext] }],
      });
      if (!path) return;
      await writeTextFile(path, content);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Native file dialog failed: ${msg}`);
    }
  }

  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}
