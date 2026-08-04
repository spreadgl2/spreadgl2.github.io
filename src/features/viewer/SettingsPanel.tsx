import { useEffect, useState } from 'react';
import { clearCache } from '../../lib/persist/cache';
import { clearAllPreferences, setPreference } from '../../lib/persist/preferences';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import type { DateDisplay, RenderQuality, Theme } from '../../store/ui';
import { useUiStore } from '../../store/ui';
import { shouldUsePerformanceMode } from './performance-policy';
import styles from './SettingsPanel.module.css';

const VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0';

function ThemeSection() {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  function handleChange(value: Theme) {
    setTheme(value);
    setPreference('theme', value);
  }

  return (
    <section className={styles.section} data-testid="settings-theme-section">
      <span className={styles.label}>Theme</span>
      <div className={styles.radioGroup} role="radiogroup" aria-label="Theme">
        {(['dark', 'light', 'system'] as Theme[]).map((t) => (
          <label key={t} className={styles.radioLabel}>
            <input
              type="radio"
              name="theme"
              value={t}
              checked={theme === t}
              onChange={() => handleChange(t)}
              data-testid={`settings-theme-${t}`}
            />
            <span>{t === 'dark' ? 'Dark' : t === 'light' ? 'Light' : 'System'}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function DateDisplaySection() {
  const dateDisplay = useUiStore((s) => s.dateDisplay);
  const setDateDisplay = useUiStore((s) => s.setDateDisplay);

  function handleChange(value: DateDisplay) {
    setDateDisplay(value);
    setPreference('dateDisplay', value);
  }

  return (
    <section className={styles.section} data-testid="settings-date-section">
      <span className={styles.label}>Date display</span>
      <div className={styles.radioGroup} role="radiogroup" aria-label="Date display">
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name="dateDisplay"
            value="iso"
            checked={dateDisplay === 'iso'}
            onChange={() => handleChange('iso')}
            data-testid="settings-date-iso"
          />
          <span>ISO-8601</span>
        </label>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name="dateDisplay"
            value="decimal"
            checked={dateDisplay === 'decimal'}
            onChange={() => handleChange('decimal')}
            data-testid="settings-date-decimal"
          />
          <span>Decimal year</span>
        </label>
      </div>
    </section>
  );
}

function ReducedMotionSection() {
  const reducedMotion = useUiStore((s) => s.reducedMotion);
  const setReducedMotion = useUiStore((s) => s.setReducedMotion);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.checked;
    setReducedMotion(val);
    setPreference('reducedMotion', val);
  }

  return (
    <section className={styles.section} data-testid="settings-motion-section">
      <label className={styles.checkLabel}>
        <input
          type="checkbox"
          checked={reducedMotion}
          onChange={handleChange}
          data-testid="settings-reduced-motion"
        />
        <span>Reduced motion</span>
      </label>
      <p className={styles.hint}>
        Stops automatic playback and animated transitions. Manual timeline controls remain
        available.
      </p>
    </section>
  );
}

function RenderQualitySection() {
  const renderQuality = useUiStore((s) => s.renderQuality);
  const setRenderQuality = useUiStore((s) => s.setRenderQuality);
  const branchCount = useTreeStore((s) => s.branchTable?.count ?? 0);
  const autoUsesPerformance = shouldUsePerformanceMode('auto', branchCount);

  function handleChange(value: RenderQuality) {
    setRenderQuality(value);
    setPreference('renderQuality', value);
  }

  return (
    <section className={styles.section} data-testid="settings-render-quality-section">
      <span className={styles.label}>Rendering</span>
      <div className={styles.radioGroup} role="radiogroup" aria-label="Rendering quality">
        {(['auto', 'quality', 'performance'] as RenderQuality[]).map((quality) => (
          <label key={quality} className={styles.radioLabel}>
            <input
              type="radio"
              name="render-quality"
              value={quality}
              checked={renderQuality === quality}
              onChange={() => handleChange(quality)}
              data-testid={`settings-render-quality-${quality}`}
            />
            <span>
              {quality === 'auto' ? 'Auto' : quality === 'quality' ? 'Quality' : 'Performance'}
            </span>
          </label>
        ))}
      </div>
      <p className={styles.hint} data-testid="settings-render-quality-status">
        {renderQuality === 'auto'
          ? `Auto is using ${autoUsesPerformance ? 'Performance' : 'Quality'} for this device and dataset.`
          : renderQuality === 'quality'
            ? 'Uses up to 2x display pixels and full trail depth.'
            : 'Caps display pixels and reduces animation render passes.'}
      </p>
    </section>
  );
}

function KeyboardSection() {
  return (
    <section className={styles.section} data-testid="settings-keyboard-section">
      <span className={styles.label}>Keyboard shortcuts</span>
      <table className={styles.kbdTable}>
        <tbody>
          <tr>
            <td>
              <kbd className={styles.kbd}>Space</kbd>
            </td>
            <td className={styles.kbdAction}>Play / pause</td>
          </tr>
          <tr>
            <td>
              <kbd className={styles.kbd}>← / →</kbd>
            </td>
            <td className={styles.kbdAction}>Step playhead by 1 day</td>
          </tr>
          <tr>
            <td>
              <kbd className={styles.kbd}>Shift+← / →</kbd>
            </td>
            <td className={styles.kbdAction}>Step by 1 year</td>
          </tr>
          <tr>
            <td>
              <kbd className={styles.kbd}>Home / End</kbd>
            </td>
            <td className={styles.kbdAction}>Jump to bounds</td>
          </tr>
          <tr>
            <td>
              <kbd className={styles.kbd}>1 / 2</kbd>
            </td>
            <td className={styles.kbdAction}>Trail / Window mode</td>
          </tr>
          <tr>
            <td>
              <kbd className={styles.kbd}>3 / 4</kbd>
            </td>
            <td className={styles.kbdAction}>Toggle Arcs / Clade</td>
          </tr>
          <tr>
            <td>
              <kbd className={styles.kbd}>[ / ]</kbd>
            </td>
            <td className={styles.kbdAction}>Resize window</td>
          </tr>
          <tr>
            <td>
              <kbd className={styles.kbd}>?</kbd>
            </td>
            <td className={styles.kbdAction}>Keyboard help overlay</td>
          </tr>
          <tr>
            <td>
              <kbd className={styles.kbd}>Esc</kbd>
            </td>
            <td className={styles.kbdAction}>Close panel / clear selection</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function AboutSection() {
  return (
    <section className={styles.section} data-testid="settings-about-section">
      <span className={styles.label}>About</span>
      <p className={styles.aboutText}>
        SpreadGL2 v{VERSION}
        <br />
        Phylogeographic tree visualizer. Deck.gl + maplibre-gl + Tauri 2.
        <br />
        Tree parsing and layout adapted from{' '}
        <a
          href="https://github.com/artic-network/peartree"
          className={styles.link}
          target="_blank"
          rel="noreferrer"
        >
          peartree
        </a>{' '}
        , palette utilities adapted from{' '}
        <a
          href="https://github.com/rambaut/pearcore"
          className={styles.link}
          target="_blank"
          rel="noreferrer"
        >
          pearcore
        </a>{' '}
        .
      </p>
    </section>
  );
}

function BurnInSection() {
  const burnIn = useUiStore((s) => s.logBurnIn);
  const setLogBurnIn = useUiStore((s) => s.setLogBurnIn);
  const logTable = useTreeStore((s) => s.logTable);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Math.max(0, Math.min(0.5, Number(e.target.value) / 100));
    setLogBurnIn(val);
    setPreference('logBurnIn', val);
  }

  return (
    <section className={styles.section} data-testid="settings-burnin-section">
      <span className={styles.label}>Log burn-in</span>
      <div className={styles.burnInRow}>
        <input
          type="number"
          min={0}
          max={50}
          step={1}
          value={Math.round(burnIn * 100)}
          onChange={handleChange}
          className={styles.burnInInput}
          data-testid="settings-burnin-input"
        />
        <span className={styles.burnInUnit}>%</span>
      </div>
      <p className={styles.hint}>
        Drop the first N% of BEAST log samples before analysis.
        {logTable !== null && (
          <> Currently {logTable.rowCount.toLocaleString()} post-burn-in rows.</>
        )}
      </p>
    </section>
  );
}

function DataPrivacySection() {
  const [status, setStatus] = useState<'idle' | 'clearing' | 'cleared' | 'error'>('idle');

  async function handleClearCache() {
    setStatus('clearing');
    try {
      await clearCache();
      setStatus('cleared');
    } catch {
      setStatus('error');
    }
  }

  return (
    <section className={styles.section} data-testid="settings-data-section">
      <span className={styles.label}>Local data</span>
      <p className={styles.hint}>
        Parsed trees may be cached on this device for faster reopening, up to 200 MiB. Files are not
        uploaded.
      </p>
      <button
        type="button"
        className={styles.resetBtn}
        onClick={() => void handleClearCache()}
        disabled={status === 'clearing'}
        data-testid="settings-clear-cache-btn"
      >
        {status === 'clearing'
          ? 'Clearing cache'
          : status === 'cleared'
            ? 'Tree cache cleared'
            : 'Clear tree cache'}
      </button>
      {status === 'error' && (
        <p className={styles.errorText} role="alert">
          The tree cache could not be cleared.
        </p>
      )}
    </section>
  );
}

function ResetSection() {
  const setTheme = useUiStore((s) => s.setTheme);
  const setDateDisplay = useUiStore((s) => s.setDateDisplay);
  const setReducedMotion = useUiStore((s) => s.setReducedMotion);
  const setRenderQuality = useUiStore((s) => s.setRenderQuality);
  const setSidePanelWidth = useUiStore((s) => s.setSidePanelWidth);
  const setLogBurnIn = useUiStore((s) => s.setLogBurnIn);
  const setSpeed = useTimelineStore((s) => s.setSpeed);
  const setMode = useTimelineStore((s) => s.setMode);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!confirmed) return;
    const t = setTimeout(() => setConfirmed(false), 2000);
    return () => clearTimeout(t);
  }, [confirmed]);

  function handleReset() {
    setTheme('dark');
    setDateDisplay('iso');
    const sysReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(sysReduced);
    setRenderQuality('auto');
    setSidePanelWidth(280);
    setLogBurnIn(0.1);
    setSpeed(1);
    setMode('Trail');
    void clearAllPreferences();
    setConfirmed(true);
  }

  return (
    <section className={styles.section} data-testid="settings-reset-section">
      <button
        type="button"
        className={styles.resetBtn}
        onClick={handleReset}
        data-testid="settings-reset-btn"
      >
        {confirmed ? 'Reset complete' : 'Reset to defaults'}
      </button>
    </section>
  );
}

export function SettingsPanel() {
  return (
    <div className={styles.panel} data-testid="settings-panel">
      <ThemeSection />
      <DateDisplaySection />
      <ReducedMotionSection />
      <RenderQualitySection />
      <BurnInSection />
      <DataPrivacySection />
      <KeyboardSection />
      <AboutSection />
      <ResetSection />
    </div>
  );
}
