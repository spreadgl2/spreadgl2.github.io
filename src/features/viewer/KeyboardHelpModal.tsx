import { useRef } from 'react';
import { openUrl } from '../../lib/shell/open-url';
import { ISSUES_URL } from '../header/app-links';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import styles from './KeyboardHelpModal.module.css';

const EXTERNAL_LINKS: Array<{ label: string; href: string }> = [
  { label: 'peartree', href: 'https://github.com/artic-network/peartree' },
  { label: 'pearcore', href: 'https://github.com/rambaut/pearcore' },
  { label: 'BEAST X docs', href: 'https://beast.community' },
  { label: 'SpreadGL2 issues', href: ISSUES_URL },
];

const BINDINGS: Array<{ key: string; action: string }> = [
  { key: 'Space', action: 'Play / pause' },
  { key: '← / →', action: 'Step playhead by 1 day' },
  { key: 'Shift+← / Shift+→', action: 'Step by 1 year' },
  { key: 'Home / End', action: 'Jump to bounds' },
  { key: '1 / 2', action: 'Pick playback mode (Trail / Window)' },
  { key: '3 / 4', action: 'Toggle Arcs / Clade' },
  { key: '[ / ]', action: 'Decrease / increase window size (Window mode)' },
  { key: '/', action: 'Focus search in Filter panel' },
  { key: '+ / −', action: 'Zoom tree x-axis' },
  { key: 'Esc', action: 'Clear selection / close panel / close modal' },
  { key: 'Cmd/Ctrl+S', action: 'Save project' },
  { key: 'Cmd/Ctrl+E', action: 'Export…' },
  { key: '?', action: 'Keyboard shortcut help overlay' },
  { key: 'T / L / F / E / ,', action: 'Toggle Style / Layers / Filter / Export / Settings' },
];

interface Props {
  onClose: () => void;
}

export function KeyboardHelpModal({ onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalAccessibility({ dialogRef, initialFocusRef: closeRef, onEscape: onClose });

  return (
    <div className={styles.backdrop} data-testid="keyboard-help-backdrop">
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-help-title"
        tabIndex={-1}
        data-testid="keyboard-help-modal"
      >
        <div className={styles.header}>
          <h2 id="keyboard-help-title" className={styles.title}>
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            ref={closeRef}
            className={styles.closeBtn}
            aria-label="Close keyboard help"
            data-testid="keyboard-help-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <table className={styles.table} data-testid="keyboard-help-table">
          <thead>
            <tr>
              <th className={styles.th}>Key</th>
              <th className={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {BINDINGS.map((b) => (
              <tr key={b.key} className={styles.row}>
                <td className={styles.keyCell}>
                  <kbd className={styles.kbd}>{b.key}</kbd>
                </td>
                <td className={styles.actionCell}>{b.action}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.links} data-testid="keyboard-help-links">
          {EXTERNAL_LINKS.map((link) => (
            <button
              key={link.href}
              type="button"
              className={styles.linkBtn}
              onClick={() => openUrl(link.href)}
            >
              {link.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
