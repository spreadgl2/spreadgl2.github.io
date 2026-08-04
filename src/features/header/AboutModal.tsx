import { ExternalLink, X } from 'lucide-react';
import { useRef } from 'react';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import styles from './AboutModal.module.css';
import {
  BEAST_URL,
  DECKGL_URL,
  DOCS_URL,
  GITHUB_URL,
  ISSUES_URL,
  SPREADGL_PAPER_URL,
} from './app-links';

const VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0';

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
  useModalAccessibility({ dialogRef, initialFocusRef: closeRef, onEscape: onClose });

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
          aria-label="Close"
          data-testid="about-close-btn"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <h2 id="about-title" className={styles.title}>
          SpreadGL2 <span className={styles.version}>v{VERSION}</span>
        </h2>

        <p className={styles.body}>
          SpreadGL2 is a client-side, high-performance web application for visualizing Bayesian
          phylogeographic reconstructions from <InlineLink href={BEAST_URL}>BEAST X</InlineLink>{' '}
          analyses. It is a complete rewrite of{' '}
          <InlineLink href={SPREADGL_PAPER_URL}>Spread.gl</InlineLink> using{' '}
          <InlineLink href={DECKGL_URL}>deck.gl</InlineLink> for user-friendly GPU-accelerated
          visualization of large, time-scaled phylogenies alongside their inferred geographic
          spread.
        </p>
        <p className={styles.body}>
          SpreadGL2 supports discrete and continuous phylogeography, HPD uncertainty regions, BSSVS
          Bayes-factor support for migration rates, and environmental and raster overlays. For a
          more detailed description of all the features, see the documentation.
        </p>
        <p className={styles.body}>
          SpreadGL2 processes{' '}
          <strong>tree, log, and data files locally; they never leave your computer</strong>. The
          map requests basemap tiles from CARTO when opened. The desktop build uses the same
          local-processing model but is not fully offline.
        </p>
        <p className={styles.body}>
          If you use SpreadGL2 in your research, please cite using the following citation:{' '}
          <em className={styles.citation}>[citation placeholder]</em>.
        </p>

        <div className={styles.links}>
          <a className={styles.link} href={DOCS_URL} target="_blank" rel="noopener noreferrer">
            Documentation <ExternalLink size={12} />
          </a>
          <a className={styles.link} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            GitHub <ExternalLink size={12} />
          </a>
        </div>

        <p className={styles.footnote}>
          Found a bug or have a request? Open an{' '}
          <a
            className={styles.inlineLink}
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            issue
          </a>{' '}
          on GitHub.
        </p>
      </div>
    </div>
  );
}
