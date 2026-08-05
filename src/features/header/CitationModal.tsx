import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import { GITHUB_URL } from './app-links';
import styles from './CitationModal.module.css';

const VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0';
const YEAR = 2026;
export const CITATION_TEXT = `Hong SL et al. (${YEAR}). SpreadGL2 (Version ${VERSION}) [Computer software]. ${GITHUB_URL}`;
export const BIBTEX_TEXT = `@software{hong_spreadgl2_${YEAR},
  author = {Hong, Samuel L. and others},
  title = {SpreadGL2},
  version = {${VERSION}},
  year = {${YEAR}},
  url = {${GITHUB_URL}}
}`;

export function CitationModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copyStatus, setCopyStatus] = useState('');
  useModalAccessibility({ dialogRef, initialFocusRef: closeRef, onEscape: onClose });

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  return (
    <div className={styles.backdrop} data-testid="citation-modal-backdrop">
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="citation-title"
        tabIndex={-1}
        data-testid="citation-modal"
      >
        <button
          ref={closeRef}
          type="button"
          className={styles.closeBtn}
          aria-label="Close citation"
          title="Close"
          onClick={onClose}
          data-testid="citation-close-btn"
        >
          <X size={17} />
        </button>

        <p className={styles.eyebrow}>Research use</p>
        <h2 id="citation-title" className={styles.title}>
          Cite SpreadGL2
        </h2>
        <p className={styles.intro}>
          Please cite the software version used to produce your analysis and figures.
        </p>
        <div className={styles.citationBox} data-testid="citation-text">
          Hong SL et al. ({YEAR}). <em>SpreadGL2</em> (Version {VERSION}) [Computer software].{' '}
          {GITHUB_URL}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.action} ${styles.primaryAction}`}
            onClick={() => void copy(CITATION_TEXT, 'Citation')}
            data-testid="copy-citation-btn"
          >
            Copy citation
          </button>
          <button
            type="button"
            className={styles.action}
            onClick={() => void copy(BIBTEX_TEXT, 'BibTeX')}
            data-testid="copy-bibtex-btn"
          >
            Copy BibTeX
          </button>
        </div>
        <p className={styles.copyStatus} aria-live="polite">
          {copyStatus}
        </p>
        <p className={styles.note}>
          The publication DOI will replace the repository URL when available.
        </p>
      </div>
    </div>
  );
}
