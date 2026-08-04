import { useEffect, useRef } from 'react';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import type { ActivePanel } from '../../store/ui';
import { useUiStore } from '../../store/ui';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface UseTauriMenuOpts {
  onOpenFile?: () => void;
  onSaveProject?: () => void;
  onExport?: () => void;
  onHelp?: () => void;
}

export interface MenuDispatchContext {
  currentPanel: ActivePanel;
  setActivePanel: (panel: ActivePanel) => void;
  setIsPlaying: (playing: boolean) => void;
  resetTree: () => void;
  onOpenFile?: () => void;
  onSaveProject?: () => void;
  onExport?: () => void;
  onHelp?: () => void;
}

export function dispatchMenuAction(action: string, ctx: MenuDispatchContext): void {
  function togglePanel(panel: NonNullable<ActivePanel>) {
    ctx.setActivePanel(ctx.currentPanel === panel ? null : panel);
  }

  switch (action) {
    case 'file:open':
      if (ctx.onOpenFile) {
        ctx.onOpenFile();
      } else {
        ctx.setIsPlaying(false);
        ctx.resetTree();
      }
      break;
    case 'file:save-project':
      if (ctx.onSaveProject) {
        ctx.onSaveProject();
      } else {
        ctx.setActivePanel('export');
      }
      break;
    case 'file:export':
      if (ctx.onExport) {
        ctx.onExport();
      } else {
        ctx.setActivePanel('export');
      }
      break;
    case 'view:style':
      togglePanel('style');
      break;
    case 'view:layers':
      togglePanel('layers');
      break;
    case 'view:filter':
      togglePanel('filter');
      break;
    case 'view:export':
      togglePanel('export');
      break;
    case 'view:settings':
      togglePanel('settings');
      break;
    case 'help:keyboard-shortcuts':
      ctx.onHelp?.();
      break;
    default:
      break;
  }
}

export function useTauriMenu({
  onOpenFile,
  onSaveProject,
  onExport,
  onHelp,
}: UseTauriMenuOpts = {}) {
  const onOpenFileRef = useRef(onOpenFile);
  const onSaveProjectRef = useRef(onSaveProject);
  const onExportRef = useRef(onExport);
  const onHelpRef = useRef(onHelp);

  onOpenFileRef.current = onOpenFile;
  onSaveProjectRef.current = onSaveProject;
  onExportRef.current = onExport;
  onHelpRef.current = onHelp;

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    import('@tauri-apps/api/event')
      .then(({ listen }) => {
        return listen<string>('menu-action', (event) => {
          const { setActivePanel } = useUiStore.getState();
          const ctx: MenuDispatchContext = {
            currentPanel: useUiStore.getState().activePanel,
            setActivePanel,
            setIsPlaying: useTimelineStore.getState().setIsPlaying,
            resetTree: useTreeStore.getState().reset,
          };
          if (onOpenFileRef.current) ctx.onOpenFile = onOpenFileRef.current;
          if (onSaveProjectRef.current) ctx.onSaveProject = onSaveProjectRef.current;
          if (onExportRef.current) ctx.onExport = onExportRef.current;
          if (onHelpRef.current) ctx.onHelp = onHelpRef.current;
          dispatchMenuAction(event.payload, ctx);
        });
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
