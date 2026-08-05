import { X } from 'lucide-react';
import { useRef } from 'react';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import styles from './AboutModal.module.css';
import {
  LICENSE_URL,
  NOTICE_URL,
  ORCID_URL,
  PEARCORE_URL,
  PEARTREE_URL,
  SPREADGL_PAPER_URL,
} from './app-links';

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
          aria-label="Close credits"
          title="Close"
          data-testid="about-close-btn"
          onClick={onClose}
        >
          <X size={17} />
        </button>

        <p className={styles.eyebrow}>About</p>
        <h2 id="about-title" className={styles.title}>
          Credits and prior work
        </h2>

        <section className={styles.creditSection}>
          <h3>SpreadGL2</h3>
          <p>
            SpreadGL2 is a client-side application for visualizing Bayesian phylogeographic
            reconstructions from BEAST X analyses.
            <span className={styles.developerCredit}>
              Main developer:{' '}
              <a
                className={`${styles.inlineLink} ${styles.developerLink}`}
                href={ORCID_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Samuel L. Hong
              </a>
              , PhD.
            </span>
          </p>
        </section>

        <section className={styles.creditSection}>
          <h3>Spread.gl</h3>
          <p>
            SpreadGL2 is a complete rewrite of{' '}
            <InlineLink href={SPREADGL_PAPER_URL}>Spread.gl</InlineLink>, retaining its scientific
            purpose while using a new rendering and application architecture.
          </p>
        </section>

        <section className={styles.creditSection}>
          <h3>peartree and pearcore</h3>
          <p>
            Tree parsing, graph construction, layout, date calibration, and selected palette
            utilities include adapted code from Andrew Rambaut's{' '}
            <InlineLink href={PEARTREE_URL}>peartree</InlineLink> and{' '}
            <InlineLink href={PEARCORE_URL}>pearcore</InlineLink>, both MIT-licensed.
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
