import { categoricalValuesForColorKey } from '../../lib/tree-render/categorical-values';
import {
  categoricalPaletteSize,
  HIGH_CARDINALITY_CATEGORY_THRESHOLD,
  paletteRepeatsForCategoryCount,
  STYLE_QUALITATIVE_PALETTES,
  STYLE_QUANTITATIVE_PALETTES,
  suggestedCategoricalPaletteForCount,
} from '../../lib/tree-render/palettes';
import { useTreeStore } from '../../store/tree';
import { effectiveThemeForPreference, useUiStore } from '../../store/ui';
import { LayerCard, LayerSlider, LayerToggleCard } from './LayerCard';
import styles from './StylePanel.module.css';

function primaryGeoTraitKey(
  traitInfo: ReturnType<typeof useTreeStore.getState>['traitInfo'],
): string | null {
  if (!traitInfo) return null;
  if (traitInfo.kind === 'discrete') return traitInfo.key;
  if (traitInfo.kind === 'continuous') return traitInfo.keyFamily.lat;
  return null;
}

// Qualitative palettes sorted by colour count (fewest first), with the count
// shown in the label — so users can pick one with enough distinct colours for
// their number of states. Stable sort keeps ties (e.g. Okabe-Ito before
// Solarized, both 8) in the registry's order, so the default stays on top.
const QUALITATIVE_PALETTE_OPTIONS = STYLE_QUALITATIVE_PALETTES.map((p) => ({
  id: p.id,
  label: p.label,
  size: categoricalPaletteSize(p.id) ?? 0,
})).sort((a, b) => a.size - b.size);

export function StylePanel() {
  const traitInfo = useTreeStore((s) => s.traitInfo);
  const allDiscreteKeys = useTreeStore((s) => s.allDiscreteKeys);
  const graph = useTreeStore((s) => s.graph);
  const nodeHpds = useTreeStore((s) => s.nodeHpds);
  const nodeMultiHpds = useTreeStore((s) => s.nodeMultiHpds);
  const colorByKey = useUiStore((s) => s.colorByKey);
  const glyphByKey = useUiStore((s) => s.glyphByKey);
  const palette = useUiStore((s) => s.palette);
  const paletteReverse = useUiStore((s) => s.paletteReverse);
  const showBranches = useUiStore((s) => s.showBranches);
  const branchWidth = useUiStore((s) => s.branchWidth);
  const showTips = useUiStore((s) => s.showTips);
  const tipRadius = useUiStore((s) => s.tipRadius);
  const setColorByKey = useUiStore((s) => s.setColorByKey);
  const setGlyphByKey = useUiStore((s) => s.setGlyphByKey);
  const setPalette = useUiStore((s) => s.setPalette);
  const setPaletteReverse = useUiStore((s) => s.setPaletteReverse);
  const setShowBranches = useUiStore((s) => s.setShowBranches);
  const setBranchWidth = useUiStore((s) => s.setBranchWidth);
  const setShowTips = useUiStore((s) => s.setShowTips);
  const setTipRadius = useUiStore((s) => s.setTipRadius);
  const arcWidth = useUiStore((s) => s.arcWidth);
  const setArcWidth = useUiStore((s) => s.setArcWidth);
  const theme = useUiStore((s) => s.theme);

  const primaryKey = primaryGeoTraitKey(traitInfo);
  const discreteKeys =
    traitInfo?.kind === 'discrete'
      ? allDiscreteKeys.length > 0
        ? allDiscreteKeys
        : primaryKey
          ? [primaryKey]
          : []
      : traitInfo?.kind === 'continuous'
        ? allDiscreteKeys
        : [];

  const hasHpd =
    (nodeHpds?.some((p) => p !== null) ?? false) ||
    (nodeMultiHpds?.some((p) => p !== null) ?? false);
  const isDiscrete = traitInfo?.kind === 'discrete';
  const colorValues = categoricalValuesForColorKey(traitInfo, graph, allDiscreteKeys, colorByKey);
  const colorValueCount = colorValues?.length ?? 0;
  const paletteSize = categoricalPaletteSize(palette);
  const paletteRepeats =
    colorValues !== null && paletteRepeatsForCategoryCount(palette, colorValueCount);

  function handleColorByChange(nextColorByKey: string) {
    setColorByKey(nextColorByKey);

    const nextValues = categoricalValuesForColorKey(
      traitInfo,
      graph,
      allDiscreteKeys,
      nextColorByKey,
    );
    if (!nextValues || nextValues.length <= HIGH_CARDINALITY_CATEGORY_THRESHOLD) return;

    setPalette(
      suggestedCategoricalPaletteForCount(nextValues.length, effectiveThemeForPreference(theme)),
    );
  }

  return (
    <div className={styles.panel} data-testid="style-panel">
      <section className={styles.section}>
        <label className={styles.label} htmlFor="color-by-select">
          Color by
        </label>
        <select
          id="color-by-select"
          data-testid="color-by-select"
          className={styles.select}
          value={colorByKey}
          onChange={(e) => handleColorByChange(e.target.value)}
        >
          <option value="single-color">Single color</option>
          {traitInfo?.kind === 'discrete' &&
            discreteKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          {traitInfo?.kind === 'continuous' && <option value="__time__">Time</option>}
          {traitInfo?.kind === 'continuous' &&
            allDiscreteKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
        </select>
      </section>

      {(traitInfo?.kind === 'discrete' || traitInfo?.kind === 'continuous') &&
        discreteKeys.length > 0 && (
          <section className={styles.section}>
            <label className={styles.label} htmlFor="glyph-by-select">
              Glyph by
            </label>
            <select
              id="glyph-by-select"
              data-testid="glyph-by-select"
              className={styles.select}
              value={glyphByKey}
              onChange={(e) => setGlyphByKey(e.target.value)}
            >
              <option value="none">None</option>
              {discreteKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </section>
        )}

      <section className={styles.section}>
        <label className={styles.label} htmlFor="palette-select">
          Palette
        </label>
        <select
          id="palette-select"
          data-testid="palette-select"
          className={styles.select}
          value={palette}
          onChange={(e) => setPalette(e.target.value as typeof palette)}
        >
          <optgroup label="Qualitative" data-testid="palette-group-qualitative">
            {QUALITATIVE_PALETTE_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.size})
              </option>
            ))}
          </optgroup>
          <optgroup label="Quantitative" data-testid="palette-group-quantitative">
            {STYLE_QUANTITATIVE_PALETTES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </optgroup>
        </select>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            data-testid="palette-reverse-checkbox"
            checked={paletteReverse}
            onChange={(e) => setPaletteReverse(e.target.checked)}
          />
          <span>Reverse</span>
        </label>
        {paletteRepeats && paletteSize !== null && (
          <p className={styles.warning} data-testid="palette-repeat-warning">
            {paletteSize} colors for {colorValueCount} states; colors repeat.
          </p>
        )}
      </section>

      <div className={styles.subhead} data-testid="style-tree-heading">
        Tree settings
      </div>

      <LayerCard
        title="Branches"
        checked={showBranches}
        onCheckedChange={setShowBranches}
        checkboxTestId="show-branches-checkbox"
      >
        <LayerSlider
          label="Width"
          displayValue={`${branchWidth} px`}
          value={branchWidth}
          min={1}
          max={6}
          step={0.5}
          onChange={setBranchWidth}
          sliderTestId="branch-width-slider"
          disabled={!showBranches}
        />
      </LayerCard>

      <LayerCard
        title="Tips"
        checked={showTips}
        onCheckedChange={setShowTips}
        checkboxTestId="show-tips-checkbox"
      >
        <LayerSlider
          label="Radius"
          displayValue={`${tipRadius} px`}
          value={tipRadius}
          min={1}
          max={8}
          step={0.5}
          onChange={setTipRadius}
          sliderTestId="tip-radius-slider"
          disabled={!showTips}
        />
      </LayerCard>

      <div className={styles.subhead} data-testid="style-map-heading">
        Map settings
      </div>
      <LayerToggleCard id="branches" title="Branches">
        <LayerSlider
          label="Width"
          displayValue={`${arcWidth}%`}
          value={arcWidth}
          min={0}
          max={100}
          step={1}
          onChange={setArcWidth}
          sliderTestId="arc-width-slider"
        />
      </LayerToggleCard>
      {hasHpd && <LayerToggleCard id="hpd-polygons" title="HPD polygons" />}
      {isDiscrete && <LayerToggleCard id="cluster-endpoints" title="Cluster endpoints" />}
    </div>
  );
}
