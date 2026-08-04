import { BookOpen, Info, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { setPreference } from '../../lib/persist/preferences';
import { type Theme, useUiStore } from '../../store/ui';
import { AboutModal } from './AboutModal';
import { DOCS_URL } from './app-links';
import styles from './BrandControls.module.css';

// Resolve the currently-effective theme (dark vs light), following the OS when
// the stored preference is "system".
function isEffectiveDark(theme: Theme): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Quick controls shown next to the "SpreadGL2" wordmark in both the landing top
// bar and the loaded-app header: a light/dark toggle (sun = light, moon = dark),
// a docs link, and an About modal.
export function BrandControls() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const [showAbout, setShowAbout] = useState(false);
  const dark = isEffectiveDark(theme);
  const nextTheme: Theme = dark ? 'light' : 'dark';

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.iconBtn}
        data-testid="theme-toggle"
        aria-label={`Switch to ${nextTheme} mode`}
        title={`Switch to ${nextTheme} mode`}
        onClick={() => {
          setTheme(nextTheme);
          setPreference('theme', nextTheme);
        }}
      >
        {dark ? <Moon size={16} /> : <Sun size={16} />}
      </button>

      <a
        className={styles.iconBtn}
        href={DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="Documentation"
        aria-label="Documentation"
        data-testid="header-docs-link"
      >
        <BookOpen size={16} />
      </a>

      <button
        type="button"
        className={styles.iconBtn}
        title="About SpreadGL2"
        aria-label="About SpreadGL2"
        data-testid="header-about-btn"
        onClick={() => setShowAbout(true)}
      >
        <Info size={16} />
      </button>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}
