import { CalendarDays, Database, GitBranch, MapPin, Palette } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { decimalYearToISO } from '../../lib/format/decimal-year';
import { buildGlyphByValue } from '../../lib/glyph-map';
import { computeLegendCounts } from '../../lib/legend/legend-counts';
import { countMissingNodeAnnotations } from '../../lib/phylo/geo-completeness';
import type { TipGlyph } from '../../lib/tree-render/glyphs';
import { paletteColorFor } from '../../lib/tree-render/palettes';
import { useRasterStore } from '../../store/raster';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { type GeoSource, useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import styles from './Sidebar.module.css';

type LogStatus = import('../../store/tree').LogStatus;

const GRADIENT_STOPS = 24;

const LEGEND_TOOLTIP =
  'Tips per state for the selected colour trait. Filtered counts show shown / total. Playback time is excluded.';

const LEGEND_TOOLTIP_TOTAL =
  'Terminal tips in the tree. Filtered counts show shown / total. Playback time is excluded.';

const GEO_SOURCE_LABEL: Record<GeoSource, string> = {
  gazetteer: 'gazetteer',
  csv: 'CSV',
  manual: 'edited',
};

// The single most common coordinate provenance across all resolved locations,
// surfaced in the Data section so the user can see at a glance whether
// coordinates came from the built-in gazetteer, a CSV, or manual edits.
function dominantGeoSource(src: Map<string, GeoSource> | null): GeoSource | null {
  if (!src || src.size === 0) return null;
  const counts: Record<GeoSource, number> = { gazetteer: 0, csv: 0, manual: 0 };
  for (const s of src.values()) counts[s] += 1;
  let best: GeoSource = 'gazetteer';
  for (const k of Object.keys(counts) as GeoSource[]) {
    if (counts[k] > counts[best]) best = k;
  }
  return best;
}

interface GlyphSwatchProps {
  glyph: TipGlyph;
  label: string;
  color?: string;
}

function GlyphSwatch({ glyph, label, color }: GlyphSwatchProps) {
  const size = 16;
  const cx = size / 2;
  const cy = size / 2;
  const r = 4;
  const fill = color ?? 'currentColor';

  let shape: React.ReactNode;
  switch (glyph) {
    case 'circle':
      shape = <circle cx={cx} cy={cy} r={r} fill={fill} />;
      break;
    case 'triangle': {
      const h = r * 1.732;
      const pts = [
        `${cx},${cy - r}`,
        `${cx + h * 0.5},${cy + r * 0.5}`,
        `${cx - h * 0.5},${cy + r * 0.5}`,
      ].join(' ');
      shape = <polygon points={pts} fill={fill} />;
      break;
    }
    case 'square': {
      const s = r * 1.2;
      shape = <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2} fill={fill} />;
      break;
    }
    case 'diamond': {
      const pts = [
        `${cx},${cy - r * 1.4}`,
        `${cx + r},${cy}`,
        `${cx},${cy + r * 1.4}`,
        `${cx - r},${cy}`,
      ].join(' ');
      shape = <polygon points={pts} fill={fill} />;
      break;
    }
  }

  return (
    <li className={styles.glyphItem} title={label}>
      <svg width={size} height={size} aria-hidden="true" className={styles.glyphShape}>
        {shape}
      </svg>
      <span className={styles.legendLabel}>{label}</span>
    </li>
  );
}

interface GlyphLegendProps {
  glyphByKey: string;
  graph: ReturnType<typeof useTreeStore.getState>['graph'];
}

function GlyphLegend({ glyphByKey, graph }: GlyphLegendProps) {
  if (!graph || glyphByKey === 'none') return null;

  const glyphMap = buildGlyphByValue(graph, glyphByKey);
  if (glyphMap.size === 0) return null;

  const entries = Array.from(glyphMap.entries());
  return (
    <ul className={styles.legendList} data-testid="glyph-legend">
      {entries.map(([v, glyph]) => (
        <GlyphSwatch key={v} glyph={glyph} label={v} />
      ))}
    </ul>
  );
}

function logStatusClass(status: LogStatus): string {
  switch (status) {
    case 'loaded':
      return styles.dataIconLoaded ?? '';
    case 'loading':
      return styles.dataIconEmpty ?? '';
    case 'error':
      return styles.dataIconWarn ?? '';
    default:
      return styles.dataIconEmpty ?? '';
  }
}

function logStatusLabel(status: LogStatus, fileName: string | null): string {
  switch (status) {
    case 'loaded':
      return fileName ?? 'loaded';
    case 'loading':
      return 'loading…';
    case 'error':
      return 'error';
    default:
      return 'optional';
  }
}

interface SidebarProps {
  onReplaceFile?: () => void;
}

export function Sidebar({ onReplaceFile }: SidebarProps) {
  const fileName = useTreeStore((s) => s.fileName);
  const graph = useTreeStore((s) => s.graph);
  const layout = useTreeStore((s) => s.layout);
  const branchTable = useTreeStore((s) => s.branchTable);
  // Filter state for legend tip counts (NOT playhead — counts stay stable during playback).
  const focusedTaxaForCounts = useSelectionStore((s) => s.focusedTaxa);
  const subtreeRootIds = useTimelineStore((s) => s.subtreeRootIds);
  const subtreeRootId = useTimelineStore((s) => s.subtreeRootId);
  const clade = useTimelineStore((s) => s.clade);
  const traitInfo = useTreeStore((s) => s.traitInfo);
  const confirmedTraitKey = useTreeStore((s) => s.confirmedTraitKey);
  const discreteGeoLookup = useTreeStore((s) => s.discreteGeoLookup);
  const discreteGeoSource = useTreeStore((s) => s.discreteGeoSource);
  const customOverlays = useTreeStore((s) => s.customOverlays);
  const choroplethOverlays = useTreeStore((s) => s.choroplethOverlays);
  const raster = useRasterStore((s) => s.raster);
  // Every loaded map overlay: boundary GeoJSONs + region choropleths + a raster.
  const loadedLayerCount = customOverlays.length + choroplethOverlays.length + (raster ? 1 : 0);
  const allDiscreteKeys = useTreeStore((s) => s.allDiscreteKeys);
  const logStatus = useTreeStore((s) => s.logStatus);
  const logFileName = useTreeStore((s) => s.logFileName);
  const colorByTrait = useUiStore((s) => s.colorByKey);
  const glyphByKey = useUiStore((s) => s.glyphByKey);
  const palette = useUiStore((s) => s.palette);
  const paletteReverse = useUiStore((s) => s.paletteReverse);
  const activePanel = useUiStore((s) => s.activePanel);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const setShowLogDropZone = useUiStore((s) => s.setShowLogDropZone);
  const bounds = useTimelineStore((s) => s.bounds);
  const deselectedValues = useUiStore((s) => s.deselectedValues);
  const toggleLegendValue = useUiStore((s) => s.toggleLegendValue);
  const soloLegendValue = useUiStore((s) => s.soloLegendValue);
  const resetLegendFilter = useUiStore((s) => s.resetLegendFilter);

  // The Data → Coordinates row doubles as the Locations-panel trigger; flag it
  // amber with the count of trait values that still have no coordinate.
  const coordTotal = traitInfo?.kind === 'discrete' ? traitInfo.values.length : 0;
  const unmatchedCount =
    traitInfo?.kind === 'discrete'
      ? traitInfo.values.filter((v) => !discreteGeoLookup?.has(v)).length
      : 0;
  const missingAnnotationCount =
    graph && traitInfo?.kind === 'discrete'
      ? countMissingNodeAnnotations(graph, traitInfo.key).internal
      : 0;
  const coordSource = dominantGeoSource(discreteGeoSource);
  // No location has coordinates (e.g. the user continued without a lookup CSV):
  // flag the row red. A partial match stays amber.
  const coordMissing = coordTotal > 0 && unmatchedCount === coordTotal;
  const coordValueLabel = coordMissing
    ? 'missing'
    : unmatchedCount > 0
      ? `${coordTotal - unmatchedCount}/${coordTotal} located`
      : missingAnnotationCount > 0
        ? `${missingAnnotationCount} ${missingAnnotationCount === 1 ? 'node' : 'nodes'} unannotated`
        : `${coordSource ? GEO_SOURCE_LABEL[coordSource] : 'resolved'} · ${coordTotal}`;

  const tipCount = layout ? layout.nodes.filter((n) => n.isTip).length : null;
  const dateRange = bounds ? `${Math.round(bounds.min)}–${Math.round(bounds.max)}` : null;
  const traitKind =
    traitInfo?.kind === 'discrete' || traitInfo?.kind === 'continuous' ? traitInfo.kind : null;
  const traitStateCount = traitInfo?.kind === 'discrete' ? traitInfo.values.length : null;
  // Prefer the live traitInfo: after import confirmation its key already
  // reflects the selected trait (reparse/rehydrate both update it), so it is
  // always current. confirmedTraitKey persists across imports and is only a
  // fallback when the tree isn't a recognized discrete/continuous trait.
  const traitName =
    traitInfo?.kind === 'discrete'
      ? traitInfo.key
      : traitInfo?.kind === 'continuous'
        ? `${traitInfo.keyFamily.lat}, ${traitInfo.keyFamily.lon}`
        : (confirmedTraitKey ?? 'Location');

  // Discrete trait → enumerated swatches per state value.
  // Also fires when a continuous tree is colored by a discrete secondary key.
  const legendEntries = (() => {
    if (colorByTrait === 'single-color') return null;

    if (traitInfo?.kind === 'discrete') {
      return traitInfo.values.map((value) => ({
        value,
        color: paletteColorFor(value, traitInfo.values, palette, paletteReverse),
      }));
    }

    if (
      traitInfo?.kind === 'continuous' &&
      colorByTrait !== '__time__' &&
      allDiscreteKeys.includes(colorByTrait) &&
      graph
    ) {
      const seen = new Set<string>();
      for (const node of graph.nodes) {
        const v = node.annotations[colorByTrait];
        if (typeof v === 'string') seen.add(v);
      }
      const values = Array.from(seen).sort();
      return values.map((value) => ({
        value,
        color: paletteColorFor(value, values, palette, paletteReverse),
      }));
    }

    return null;
  })();

  // Combined legend when color and glyph encode the same discrete trait.
  const combinedLegendEntries = (() => {
    if (
      glyphByKey === 'none' ||
      colorByTrait === 'single-color' ||
      colorByTrait === '__time__' ||
      glyphByKey !== colorByTrait ||
      !legendEntries ||
      legendEntries.length === 0 ||
      !graph
    )
      return null;
    const glyphMap = buildGlyphByValue(graph, glyphByKey);
    if (glyphMap.size === 0) return null;
    return legendEntries.map(({ value, color }) => ({
      value,
      color,
      glyph: glyphMap.get(value) ?? ('circle' as const),
    }));
  })();

  // Continuous trait coloring by time → gradient ramp with min/max date.
  const timeGradient =
    traitInfo?.kind === 'continuous' && colorByTrait === '__time__' && bounds
      ? {
          stops: Array.from({ length: GRADIENT_STOPS }, (_, i) => {
            const t = i / (GRADIENT_STOPS - 1);
            return paletteColorFor(t, null, palette, paletteReverse);
          }),
          minLabel: decimalYearToISO(bounds.min),
          maxLabel: decimalYearToISO(bounds.max),
        }
      : null;

  // The discrete trait the legend breaks down by (primary discrete trait, or a
  // discrete secondary key). Null → continuous/gradient legend: overall tip
  // total only, no per-state rows.
  const legendCountKey =
    traitInfo?.kind === 'discrete'
      ? traitInfo.key
      : traitInfo?.kind === 'continuous' && allDiscreteKeys.includes(colorByTrait)
        ? colorByTrait
        : null;

  // Any legend at all — discrete rows, combined, or a continuous gradient. The
  // tip total attaches to all of them.
  const hasLegend = !!(legendEntries || combinedLegendEntries || timeGradient);

  // Terminal-tip counts. Memoised on the tree + persistent filters — deliberately
  // not the playhead, so counts don't churn during playback. A discrete legend
  // gets a per-state breakdown; a gradient gets only the total/shown.
  const legendCounts = useMemo(() => {
    if (!graph || !layout || !branchTable || !hasLegend) return null;
    return computeLegendCounts({
      graph,
      layout,
      branchTable,
      colorByKey: legendCountKey,
      deselectedValues,
      focusedTaxa: focusedTaxaForCounts,
      subtreeRootIds,
      subtreeRootId,
      clade,
    });
  }, [
    graph,
    layout,
    branchTable,
    hasLegend,
    legendCountKey,
    deselectedValues,
    focusedTaxaForCounts,
    subtreeRootIds,
    subtreeRootId,
    clade,
  ]);

  // The title doubles as a sort control only when there are per-state rows to
  // sort (discrete); a gradient legend shows the total but isn't sortable.
  const legendSortable = !!legendCounts && legendCounts.perValue.size > 0;

  const [legendSort, setLegendSort] = useState<'count' | 'az'>('count');

  // Order rows by tip count (desc, "which dominate") or A–Z. With no counts
  // (e.g. no branch table yet) keep the natural order.
  function orderLegend<T extends { value: string }>(entries: T[]): T[] {
    if (!legendCounts) return entries;
    if (legendSort === 'az') return [...entries].sort((a, b) => a.value.localeCompare(b.value));
    // Sort by count: when filtered, rank by the shown count (numerator) so the
    // ordering matches what's actually visible; otherwise by the total.
    const countOf = (v: string) => {
      const c = legendCounts.perValue.get(v);
      if (!c) return 0;
      return legendCounts.filtered ? c.shown : c.total;
    };
    return [...entries].sort(
      (a, b) => countOf(b.value) - countOf(a.value) || a.value.localeCompare(b.value),
    );
  }
  const orderedLegendEntries = legendEntries ? orderLegend(legendEntries) : null;
  const orderedCombinedEntries = combinedLegendEntries ? orderLegend(combinedLegendEntries) : null;

  function tipCountNode(value: string): ReactNode {
    const c = legendCounts?.perValue.get(value);
    if (!c) return null;
    if (!legendCounts?.filtered) {
      return <span className={styles.legendCount}>{c.total}</span>;
    }
    // Filtered: colour the shown count (numerator) in the FILTERED accent.
    return (
      <span className={styles.legendCount}>
        <span className={styles.legendCountShown} data-testid={`legend-shown-${value}`}>
          {c.shown}
        </span>{' '}
        / {c.total}
      </span>
    );
  }

  return (
    <aside className={styles.sidebar} data-testid="sidebar">
      <div className={styles.section} data-testid="sidebar-project">
        <button
          type="button"
          className={styles.railIcon}
          title={fileName ?? 'Project'}
          aria-label="Project"
          data-testid="sidebar-rail-project"
        >
          <GitBranch size={16} />
        </button>
        <div className={styles.sectionTitle}>Project</div>
        {fileName ? (
          <div className={styles.fileName} data-testid="sidebar-file-name">
            {fileName}
          </div>
        ) : (
          <div className={styles.traitEmpty}>—</div>
        )}
        {tipCount !== null && (
          <div className={styles.tipCount} data-testid="sidebar-tip-count">
            {tipCount} tips
          </div>
        )}
        {graph && (
          <div className={styles.projectTrait} data-testid="sidebar-project-trait">
            <div className={styles.traitNameRow}>
              <span className={styles.traitLabel}>Trait: </span>
              <span className={styles.traitName} data-testid="sidebar-trait-name">
                {traitName}
              </span>
            </div>
            {traitKind && (
              <div className={styles.traitMeta} data-testid="sidebar-trait-meta">
                <span className={styles.traitKind} data-testid="sidebar-trait-kind">
                  {traitKind}
                </span>
                {traitStateCount !== null && (
                  <>
                    <span className={styles.traitSeparator} aria-hidden="true">
                      ·
                    </span>
                    <span className={styles.traitStates}>{traitStateCount} states</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className={styles.replaceBtn}
          data-testid="sidebar-replace-btn"
          onClick={onReplaceFile}
        >
          Replace file
        </button>
      </div>

      <div className={styles.section} data-testid="sidebar-data">
        <button
          type="button"
          className={styles.railIcon}
          title="Data"
          aria-label="Data"
          data-testid="sidebar-rail-data"
        >
          <Database size={16} />
        </button>
        <div className={styles.sectionTitle}>Data</div>

        {fileName ? (
          <>
            <div
              className={[styles.dataItem, styles.dataItemLoaded].join(' ')}
              data-testid="sidebar-tree-row"
              title="Loaded tree file"
            >
              <span className={[styles.dataIcon, styles.dataIconLoaded].join(' ')} />
              <span className={styles.dataLabel}>Tree</span>
              <span className={styles.dataValue}>{fileName}</span>
            </div>

            {dateRange && (
              <button
                type="button"
                className={[styles.dataItem, styles.dataItemLoaded, styles.dataItemBtn].join(' ')}
                data-testid="sidebar-dates-row"
                title="Open the Dates panel to view or edit parsed tip dates"
                onClick={() => setActivePanel(activePanel === 'dates' ? null : 'dates')}
              >
                <span className={[styles.dataIcon, styles.dataIconLoaded].join(' ')} />
                <span className={styles.dataLabel}>Dates</span>
                <CalendarDays className={styles.dataPin} size={13} aria-hidden="true" />
                <span className={styles.dataValue}>{dateRange}</span>
              </button>
            )}

            {traitInfo?.kind === 'discrete' && (
              <button
                type="button"
                className={[styles.dataItem, styles.dataItemLoaded, styles.dataItemBtn].join(' ')}
                data-testid="sidebar-coordinates-row"
                title={
                  missingAnnotationCount > 0
                    ? `${missingAnnotationCount} internal ${missingAnnotationCount === 1 ? 'node has' : 'nodes have'} no ${traitInfo.key} annotation. Open the Locations panel for details.`
                    : 'Open the Locations panel to view or edit coordinates'
                }
                onClick={() => setActivePanel(activePanel === 'locations' ? null : 'locations')}
              >
                <span
                  className={[
                    styles.dataIcon,
                    coordMissing
                      ? styles.dataIconError
                      : unmatchedCount > 0 || missingAnnotationCount > 0
                        ? styles.dataIconWarn
                        : styles.dataIconLoaded,
                  ].join(' ')}
                />
                <span className={styles.dataLabel}>Coordinates</span>
                <MapPin className={styles.dataPin} size={13} aria-hidden="true" />
                <span
                  className={[
                    styles.dataValue,
                    coordMissing
                      ? styles.dataValueError
                      : unmatchedCount > 0 || missingAnnotationCount > 0
                        ? styles.dataValueWarn
                        : '',
                  ].join(' ')}
                >
                  {coordValueLabel}
                </span>
              </button>
            )}

            {traitInfo?.kind === 'continuous' && (
              <div className={[styles.dataItem, styles.dataItemLoaded].join(' ')}>
                <span className={[styles.dataIcon, styles.dataIconLoaded].join(' ')} />
                <span className={styles.dataLabel}>Coordinates</span>
                <span className={styles.dataValue}>tree annotations</span>
              </div>
            )}

            <button
              type="button"
              className={[
                styles.dataItem,
                logStatus === 'loaded' ? styles.dataItemLoaded : styles.dataItemEmpty,
                styles.dataItemBtn,
              ].join(' ')}
              data-testid="sidebar-log-row"
              title={logStatus === 'loaded' ? 'BEAST log file loaded' : 'Load a BEAST .log file'}
              onClick={() => setShowLogDropZone(true)}
            >
              <span className={[styles.dataIcon, logStatusClass(logStatus)].join(' ')} />
              <span className={styles.dataLabel}>Log</span>
              <span
                className={[
                  styles.dataValue,
                  logStatus === 'error' ? styles.dataValueWarn : '',
                ].join(' ')}
              >
                {logStatusLabel(logStatus, logFileName)}
              </span>
            </button>

            <button
              type="button"
              className={[
                styles.dataItem,
                loadedLayerCount > 0 ? styles.dataItemLoaded : styles.dataItemEmpty,
                styles.dataItemBtn,
              ].join(' ')}
              data-testid="sidebar-layers-row"
              title="Open the Layers panel to add boundary, region, or raster overlays"
              onClick={() => setActivePanel(activePanel === 'layers' ? null : 'layers')}
            >
              <span
                className={[
                  styles.dataIcon,
                  loadedLayerCount > 0 ? styles.dataIconLoaded : styles.dataIconEmpty,
                ].join(' ')}
              />
              <span className={styles.dataLabel}>Layers</span>
              <span className={styles.dataValue}>
                {loadedLayerCount > 0 ? `${loadedLayerCount} loaded` : 'optional'}
              </span>
            </button>
          </>
        ) : (
          <div className={[styles.dataItem, styles.dataItemEmpty].join(' ')}>
            <span className={[styles.dataIcon, styles.dataIconEmpty].join(' ')} />
            No file loaded
          </div>
        )}
      </div>

      <div
        className={[styles.section, styles.sectionLegend].join(' ')}
        data-testid="sidebar-legend"
      >
        <button
          type="button"
          className={styles.railIcon}
          title="Legend"
          aria-label="Legend"
          data-testid="sidebar-rail-legend"
        >
          <Palette size={16} />
        </button>
        <div className={styles.legendHeader}>
          <div className={styles.legendTitleWrap}>
            {legendSortable ? (
              // For a discrete legend the title doubles as the sort control:
              // click to toggle count ↔ A–Z.
              <button
                type="button"
                className={[styles.sectionTitle, styles.legendTitleBtn].join(' ')}
                data-testid="legend-sort"
                onClick={() => setLegendSort((s) => (s === 'count' ? 'az' : 'count'))}
                aria-label={`Sort legend ${legendSort === 'count' ? 'A to Z' : 'by tip count'}`}
                title={`${LEGEND_TOOLTIP}\nClick to sort ${legendSort === 'count' ? 'A–Z' : 'by count'}.`}
              >
                Legend
              </button>
            ) : (
              <span
                className={styles.sectionTitle}
                title={legendCounts ? LEGEND_TOOLTIP_TOTAL : LEGEND_TOOLTIP}
              >
                Legend
              </span>
            )}
            {legendCounts && !legendCounts.filtered && (
              <span className={styles.legendTipTotal} data-testid="legend-tip-total">
                ({legendCounts.total} tips)
              </span>
            )}
            {legendCounts?.filtered && (
              // Filtered: the shown count lives in the badge, next to the title
              // (the shown / total tally is redundant with the per-row counts).
              <span className={styles.legendFilteredBadge} data-testid="legend-filtered-badge">
                Filtered ({legendCounts.shown})
              </span>
            )}
          </div>
          <div className={styles.legendHeaderActions}>
            {deselectedValues.size > 0 && (
              <button
                type="button"
                className={styles.showAllBtn}
                data-testid="legend-show-all"
                onClick={resetLegendFilter}
              >
                show all
              </button>
            )}
          </div>
        </div>
        {orderedCombinedEntries ? (
          <>
            <div className={styles.legendSubLabel}>{colorByTrait}</div>
            <ul className={styles.legendList} data-testid="sidebar-legend-combined">
              {orderedCombinedEntries.map(({ value, color, glyph }) => {
                const isDeselected = deselectedValues.has(value);
                const allValues = orderedCombinedEntries.map((e) => e.value);
                return (
                  <li key={value} className={styles.legendItemWrap}>
                    <button
                      type="button"
                      className={[
                        styles.glyphItem,
                        styles.legendClickable,
                        isDeselected ? styles.legendDeselected : '',
                      ].join(' ')}
                      title={`Click to solo "${value}" · Shift-click to add/remove from focus set`}
                      data-testid={`legend-row-${value}`}
                      aria-pressed={!isDeselected}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          toggleLegendValue(value, allValues);
                        } else {
                          soloLegendValue(value, allValues);
                        }
                      }}
                    >
                      <svg width={16} height={16} aria-hidden="true" className={styles.glyphShape}>
                        {(() => {
                          const cx = 8;
                          const cy = 8;
                          const r = 4;
                          const fill = isDeselected ? 'rgba(136,136,136,0.3)' : color;
                          switch (glyph) {
                            case 'circle':
                              return <circle cx={cx} cy={cy} r={r} fill={fill} />;
                            case 'triangle': {
                              const h = r * 1.732;
                              const pts = [
                                `${cx},${cy - r}`,
                                `${cx + h * 0.5},${cy + r * 0.5}`,
                                `${cx - h * 0.5},${cy + r * 0.5}`,
                              ].join(' ');
                              return <polygon points={pts} fill={fill} />;
                            }
                            case 'square': {
                              const s = r * 1.2;
                              return (
                                <rect
                                  x={cx - s}
                                  y={cy - s}
                                  width={s * 2}
                                  height={s * 2}
                                  fill={fill}
                                />
                              );
                            }
                            case 'diamond': {
                              const pts = [
                                `${cx},${cy - r * 1.4}`,
                                `${cx + r},${cy}`,
                                `${cx},${cy + r * 1.4}`,
                                `${cx - r},${cy}`,
                              ].join(' ');
                              return <polygon points={pts} fill={fill} />;
                            }
                          }
                        })()}
                      </svg>
                      <span className={styles.legendLabel}>{value}</span>
                      {tipCountNode(value)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : orderedLegendEntries && orderedLegendEntries.length > 0 ? (
          <>
            {glyphByKey !== 'none' && <div className={styles.legendSubLabel}>Color</div>}
            <ul className={styles.legendList} data-testid="sidebar-legend-list">
              {orderedLegendEntries.map((entry) => {
                const isDeselected = deselectedValues.has(entry.value);
                const allValues = orderedLegendEntries.map((e) => e.value);
                return (
                  <li key={entry.value} className={styles.legendItemWrap}>
                    <button
                      type="button"
                      className={[
                        styles.legendItem,
                        styles.legendClickable,
                        isDeselected ? styles.legendDeselected : '',
                      ].join(' ')}
                      title={`Click to solo "${entry.value}" · Shift-click to add/remove from focus set`}
                      data-testid={`legend-row-${entry.value}`}
                      aria-pressed={!isDeselected}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          toggleLegendValue(entry.value, allValues);
                        } else {
                          soloLegendValue(entry.value, allValues);
                        }
                      }}
                    >
                      <span
                        className={styles.legendSwatch}
                        style={{ background: isDeselected ? 'rgba(136,136,136,0.3)' : entry.color }}
                        aria-hidden="true"
                      />
                      <span className={styles.legendLabel}>{entry.value}</span>
                      {tipCountNode(entry.value)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : timeGradient ? (
          <>
            {glyphByKey !== 'none' && <div className={styles.legendSubLabel}>Color</div>}
            <div className={styles.legendGradientWrap} data-testid="sidebar-legend-gradient">
              <div
                className={styles.legendGradientBar}
                style={{ background: `linear-gradient(to right, ${timeGradient.stops.join(',')})` }}
                aria-hidden="true"
              />
              <div className={styles.legendGradientLabels}>
                <span>{timeGradient.minLabel}</span>
                <span>{timeGradient.maxLabel}</span>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.legendPlaceholder} data-testid="sidebar-legend-placeholder">
            Color legend appears here when a trait is selected
          </div>
        )}
        {glyphByKey !== 'none' && graph && !combinedLegendEntries && (
          <>
            <div className={styles.legendSubLabel}>Shape</div>
            <GlyphLegend glyphByKey={glyphByKey} graph={graph} />
          </>
        )}
      </div>
    </aside>
  );
}
