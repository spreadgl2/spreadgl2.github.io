import { BF_LEGEND, BF_LEGEND_TICKS, bfBinColor } from '../../lib/log/bf-color';
import { useUiStore } from '../../store/ui';
import styles from './BfLegend.module.css';

function useDarkTheme(): boolean {
  const theme = useUiStore((s) => s.theme);
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : true;
}

// Colour key for the BF-arrow overlay: a binned Kass & Raftery ramp with the
// boundary ticks 1 · 3 · 20 · 150 · ∞. Colours match the map arcs.
export function BfLegend() {
  const dark = useDarkTheme();
  return (
    <div className={styles.legend} data-testid="bf-legend">
      <div className={styles.legendTitle}>Bayes factor</div>
      <div className={styles.legendBar}>
        {BF_LEGEND.map((entry) => (
          <div
            key={entry.bin}
            className={styles.legendSeg}
            style={{ background: `rgb(${bfBinColor(entry.bin, dark).join(', ')})` }}
            title={`${entry.label} (${entry.range})`}
          />
        ))}
      </div>
      <div className={styles.legendTicks}>
        {BF_LEGEND_TICKS.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  );
}
