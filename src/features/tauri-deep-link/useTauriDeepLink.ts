import { useEffect, useRef } from 'react';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

interface OpenedTreeFile {
  path: string;
  text: string | null;
  error: string | null;
}

export interface UseTauriDeepLinkOpts {
  onFilePath: (path: string, text: string) => void;
  onFileError?: (message: string) => void;
}

export function useTauriDeepLink({ onFilePath, onFileError }: UseTauriDeepLinkOpts) {
  const onFilePathRef = useRef(onFilePath);
  const onFileErrorRef = useRef(onFileError);
  onFilePathRef.current = onFilePath;
  onFileErrorRef.current = onFileError;

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const delivered = new Set<string>();

    function deliver(payload: OpenedTreeFile | null) {
      if (!payload || cancelled) return;
      const key = `${payload.path}\0${payload.text?.length ?? -1}\0${payload.error ?? ''}`;
      if (delivered.has(key)) return;
      if (delivered.size >= 32) delivered.clear();
      delivered.add(key);

      if (payload.error) {
        onFileErrorRef.current?.(payload.error);
      } else if (payload.text !== null) {
        onFilePathRef.current(payload.path, payload.text);
      }
    }

    async function setup() {
      const [{ invoke }, { listen }] = await Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/event'),
      ]);
      if (cancelled) return;
      unlisten = await listen<OpenedTreeFile>('opened-tree-file', (event) =>
        deliver(event.payload),
      );
      if (cancelled) {
        unlisten();
        return;
      }
      deliver(await invoke<OpenedTreeFile | null>('take_pending_tree_file'));
    }

    void setup();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
