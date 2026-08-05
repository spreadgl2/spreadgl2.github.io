import { BrandControls } from '../header/BrandControls';
import styles from './LandingHeader.module.css';

const HOME_URL = import.meta.env.BASE_URL || '/';

// The top bar on the landing (no-tree) screen. Matches the app header's
// height/style; the brand wordmark is followed by the shared quick controls
// (light/dark toggle, docs link, About).
export function LandingHeader() {
  return (
    <header className={styles.header} data-testid="landing-header">
      <a
        className={styles.brand}
        href={HOME_URL}
        aria-label="SpreadGL2 home"
        data-testid="landing-brand-link"
      >
        SpreadGL2
      </a>
      <BrandControls />
      <div className={styles.spacer} />
    </header>
  );
}
