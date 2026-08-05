import { ShieldCheck } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { AboutModal } from '../header/AboutModal';
import { DECKGL_URL, DOCS_URL, GITHUB_URL, PRIVACY_URL } from '../header/app-links';
import { CitationModal } from '../header/CitationModal';
import styles from './LandingPage.module.css';

interface LandingPageProps {
  action: ReactNode;
}

export function LandingPage({ action }: LandingPageProps) {
  const [showCitation, setShowCitation] = useState(false);
  const [showCredits, setShowCredits] = useState(false);

  return (
    <div className={styles.scroll} data-testid="landing-page">
      <main className={styles.shell}>
        <section className={styles.intro} aria-labelledby="landing-title">
          <h1 id="landing-title" className={styles.title} data-testid="landing-title">
            SpreadGL2
          </h1>
          <p className={styles.subtitle} data-testid="landing-subtitle">
            High-performance interactive visualization for BEAST X phylogeographic analyses
          </p>
        </section>

        <section
          className={styles.actionPanel}
          aria-label="Open a tree or example"
          data-testid="landing-action"
        >
          {action}
        </section>

        <section
          className={styles.details}
          aria-label="About SpreadGL2"
          data-testid="landing-details"
        >
          <p className={styles.description}>
            SpreadGL2 is a client-side application for visualizing time-scaled phylogenies alongside
            their inferred geographic spread in linked tree and map views. SpreadGL2 uses{' '}
            <a
              className={styles.inlineLink}
              href={DECKGL_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              deck.gl
            </a>{' '}
            for GPU-accelerated visualization of phylogeographic reconstructions with thousands of
            taxa. You can use SpreadGL2 to animate lineage movement through space and time, inspect
            geographic uncertainty, and export figures, tables, and reusable project files.
          </p>

          <h2 className={styles.detailsTitle}>What SpreadGL2 supports:</h2>
          <ul className={styles.capabilities}>
            <li>Discrete and continuous phylogeography, including geographic HPD regions</li>
            <li>
              Lineage-through-time curves, migration transition counts, and BSSVS Bayes factors
            </li>
            <li>GeoJSON boundaries, choropleths with environmental data, and raster overlays</li>
          </ul>

          <aside className={styles.privacy} aria-labelledby="privacy-title">
            <ShieldCheck className={styles.privacyIcon} aria-hidden="true" />
            <div>
              <h2 id="privacy-title">Your research data stays on your device</h2>
              <p>
                Tree, log, overlay, and project files are all processed locally. SpreadGL2 has no
                accounts, data uploads, or telemetry. CARTO basemap tiles are requested only after a
                tree is opened.{' '}
                <a
                  className={styles.inlineLink}
                  href={PRIVACY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy details
                </a>
              </p>
            </div>
          </aside>

          <nav className={styles.supportLinks} aria-label="Project resources">
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              Documentation
            </a>
            <button
              type="button"
              className={styles.resourceButton}
              onClick={() => setShowCitation(true)}
              data-testid="landing-citation-btn"
            >
              Cite SpreadGL2
            </button>
            <button
              type="button"
              className={styles.resourceButton}
              onClick={() => setShowCredits(true)}
              data-testid="landing-credits-btn"
            >
              Credits
            </button>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              Source on GitHub
            </a>
          </nav>
        </section>
      </main>

      {showCitation && <CitationModal onClose={() => setShowCitation(false)} />}
      {showCredits && <AboutModal onClose={() => setShowCredits(false)} />}
    </div>
  );
}
