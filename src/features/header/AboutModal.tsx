import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import styles from './AboutModal.module.css';
import {
  GITHUB_URL,
  LICENSE_URL,
  NOTICE_URL,
  ORCID_URL,
  PEARCORE_URL,
  PEARTREE_URL,
  SPREADGL_PAPER_URL,
} from './app-links';

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

function InlineLink({ href, children }: { href: string; children: string }) {
  return (
    <a className={styles.inlineLink} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function AboutModal({ onClose }: { onClose: () => void }) {
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
    <div className={styles.backdrop} data-testid="about-modal-backdrop">
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        tabIndex={-1}
        data-testid="about-modal"
      >
        <button
          ref={closeRef}
          type="button"
          className={styles.closeBtn}
          aria-label="Close About"
          title="Close"
          data-testid="about-close-btn"
          onClick={onClose}
        >
          <X size={17} />
        </button>

        <p className={styles.eyebrow}>About</p>
        <h2 id="about-title" className={styles.title}>
          What is SpreadGL2?
        </h2>

        <section className={styles.creditSection}>
          <h3>SpreadGL2</h3>
          <p>
            SpreadGL2 is a client-side application for visualizing Bayesian phylogeographic
            reconstructions from BEAST X analyses.
          </p>
          <p>
            SpreadGL2 is a complete rewrite of{' '}
            <InlineLink href={SPREADGL_PAPER_URL}>Spread.gl</InlineLink>, retaining and expanding its 
            features while using a new rendering and application architecture.
          </p>
          <p>
            Tree parsing, graph construction, layout, date calibration, and selected palette
            utilities include adapted code from Andrew Rambaut's{' '}
            <InlineLink href={PEARTREE_URL}>peartree</InlineLink> and{' '}
            <InlineLink href={PEARCORE_URL}>pearcore</InlineLink>, both MIT-licensed.
          </p>
          <p className={styles.developerCredit}>
            Main developer:{' '}
            <a
              className={`${styles.inlineLink} ${styles.developerLink}`}
              href={ORCID_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Samuel L. Hong.
            </a>
          </p>
        </section>

        <section className={styles.creditSection}>
          <h3>Citation</h3>
          <p>To cite SpreadGL2, please use the following citation:</p>
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
        </section>

        <div className={styles.footer}>
          <InlineLink href={NOTICE_URL}>Full third-party notices</InlineLink>
          <InlineLink href={LICENSE_URL}>MIT License</InlineLink>
        </div>
      </div>
    </div>
  );
}
