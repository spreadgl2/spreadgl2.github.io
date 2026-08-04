import { BrandControls } from '../header/BrandControls';
import styles from './LandingHeader.module.css';

// The top bar on the landing (no-tree) screen. Matches the app header's
// height/style; the brand wordmark is followed by the shared quick controls
// (light/dark toggle, docs link, About).
export function LandingHeader() {
  return (
    <header className={styles.header} data-testid="landing-header">
      <span className={styles.brand}>SpreadGL2</span>
      <BrandControls />
      <div className={styles.spacer} />
    </header>
  );
}
