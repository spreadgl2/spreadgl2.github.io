import { useMemo } from 'react';
import { getPaletteCssGradient, suggestPaletteForVariable } from '../../lib/env/palettes';
import { useEnvStore } from '../../store/env';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import styles from './EnvLegendOverlay.module.css';

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function EnvLegendOverlay() {
  const layerVisibility = useUiStore((s) => s.layerVisibility);
  const choroplethOverlays = useTreeStore((s) => s.choroplethOverlays);
  const columns = useEnvStore((s) => s.columns);
  const activeKey = useEnvStore((s) => s.activeKey);
  const paletteOverride = useEnvStore((s) => s.paletteOverride);

  const col = columns.find((c) => c.key === activeKey) ?? null;

  const resolvedPalette = useMemo(() => {
    if (!col) return 'viridis' as const;
    const override = paletteOverride[col.key];
    if (override && override !== 'auto') return override;
    return suggestPaletteForVariable(col.displayName);
  }, [col, paletteOverride]);

  const { min, mid, max } = useMemo(() => {
    if (!col) return { min: 0, mid: 0, max: 0 };
    const vals = Array.from(col.values.values());
    if (vals.length === 0) return { min: 0, mid: 0, max: 0 };
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    return { min: minVal, mid: (minVal + maxVal) / 2, max: maxVal };
  }, [col]);

  if (columns.length === 0 || !activeKey || !col) return null;

  // Show only when at least one choropleth overlay is loaded and visible.
  const anyChoroplethVisible =
    choroplethOverlays.length > 0 &&
    choroplethOverlays.some((o) => layerVisibility[o.id] !== false);

  if (!anyChoroplethVisible) return null;

  const gradient = getPaletteCssGradient(resolvedPalette);

  return (
    <div className={styles.legend} data-testid="env-legend-overlay">
      <div className={styles.title}>{col.displayName.toUpperCase()}</div>
      <div className={styles.ramp} style={{ background: gradient }} />
      <div className={styles.scale}>
        <span>{formatNumber(min)}</span>
        <span>{formatNumber(mid)}</span>
        <span>{formatNumber(max)}</span>
      </div>
      {col.units && <div className={styles.units}>{col.units}</div>}
    </div>
  );
}
