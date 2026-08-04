import type { KeyboardEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_PLOT_HEIGHT,
  DEFAULT_PLOT_WIDTH,
  formatCount,
  integerTicks,
  MIN_PLOT_HEIGHT,
  monthTicks,
  PAD_BOTTOM,
  PAD_LEFT,
  PAD_RIGHT,
  PAD_TOP,
  type PlotDims,
  xFor,
  yFor,
} from '../../lib/analysis/chart-utils';
import {
  buildLttSeries,
  countAtTime,
  type LttBounds,
  type LttPoint,
  sumLttSeries,
} from '../../lib/analysis/ltt';
import {
  buildTransitions,
  summariseTransitions,
  type TransitionBin,
  type TransitionLocationStack,
  type TransitionRouteTotal,
  type TransitionSummary,
  transitionBinAtTime,
} from '../../lib/analysis/transitions';
import { decimalYearToISO } from '../../lib/format/decimal-year';
import { buildSubtreeBranchIdsForRoots } from '../../lib/phylo/slice';
import { computeFocusedLineageNodeIds } from '../../lib/tree-render/focused-lineage';
import { paletteColorFor, type StylePaletteId } from '../../lib/tree-render/palettes';
import { getRangeRelativePlayheadBucket } from '../../lib/tree-render/playhead-bucket';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { usePlayheadIndicatorVisibility } from '../timeline/usePlayheadIndicatorVisibility';
import { DtaPanel } from '../viewer/DtaPanel';
import styles from './AnalysisPanel.module.css';

interface AnalysisPanelProps {
  fill?: boolean;
}

function stepPath(
  series: LttPoint[],
  maxCount: number,
  min: number,
  max: number,
  dims: PlotDims,
): string {
  if (series.length === 0) return '';
  const first = series[0];
  if (!first) return '';
  let d = `M ${xFor(first.time, min, max, dims)} ${yFor(first.count, maxCount, dims)}`;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const point = series[i];
    if (!prev || !point) continue;
    const x = xFor(point.time, min, max, dims);
    d += ` H ${x} V ${yFor(point.count, maxCount, dims)}`;
  }
  return d;
}

interface PlottedLttSeries {
  id: string;
  label: string;
  color: string;
  series: LttPoint[];
}

interface PlotFrame {
  left: number;
  width: number;
  height: number;
}

function stackedLocationSeries(
  locations: string[],
  byLocation: Map<string, LttPoint[]>,
  bounds: LttBounds,
  colorForLocation: (location: string) => string,
): PlottedLttSeries[] {
  const stack: LttPoint[][] = [];
  return locations.map((location) => {
    stack.push(byLocation.get(location) ?? []);
    return {
      id: location,
      label: location,
      color: colorForLocation(location),
      series: sumLttSeries(stack, bounds),
    };
  });
}

function activeRangeFor(
  bounds: LttBounds,
  playhead: number,
  isPlaying: boolean,
  mode: string,
  timeWindow: { start: number; end: number } | null,
): { start: number; end: number } {
  if (!isPlaying) return { start: bounds.min, end: bounds.max };
  if (mode === 'Window' && timeWindow) return { start: timeWindow.start, end: timeWindow.end };
  return { start: bounds.min, end: playhead };
}

function routeLabel(route: TransitionRouteTotal): string {
  return `${route.from} -> ${route.to}`;
}

const TRANSITION_PAD_TOP = 36;
const TRANSITION_PAD_BOTTOM = 48;

function transitionYFor(count: number, maxCount: number, dims: PlotDims): number {
  const plotHeight = dims.height - TRANSITION_PAD_TOP - TRANSITION_PAD_BOTTOM;
  if (maxCount <= 0) return TRANSITION_PAD_TOP + plotHeight;
  return TRANSITION_PAD_TOP + plotHeight - (count / maxCount) * plotHeight;
}

function transitionYForRange(value: number, min: number, max: number, dims: PlotDims): number {
  const plotHeight = dims.height - TRANSITION_PAD_TOP - TRANSITION_PAD_BOTTOM;
  if (max <= min) return TRANSITION_PAD_TOP + plotHeight;
  return TRANSITION_PAD_TOP + plotHeight - ((value - min) / (max - min)) * plotHeight;
}

function transitionBinLabel(bin: TransitionBin): string {
  return `${decimalYearToISO(bin.t0)} to ${decimalYearToISO(bin.t1)}`;
}

function normalizeBranchIds(branchIds: number[]): number[] {
  return [...new Set(branchIds)].sort((a, b) => a - b);
}

function sameBranchIds(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const aNorm = normalizeBranchIds(a);
  const bNorm = normalizeBranchIds(b);
  return aNorm.every((id, idx) => id === bNorm[idx]);
}

function selectOrClearBranchIds(
  branchIds: number[],
  highlightedBranchIds: number[],
  onSelectBranchIds: (branchIds: number[]) => void,
): void {
  const next = normalizeBranchIds(branchIds);
  if (next.length === 0) return;
  onSelectBranchIds(sameBranchIds(next, highlightedBranchIds) ? [] : next);
}

function selectBranchesOnKeyDown(
  event: KeyboardEvent<SVGRectElement>,
  branchIds: number[],
  highlightedBranchIds: number[],
  onSelectBranchIds: (branchIds: number[]) => void,
): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  selectOrClearBranchIds(branchIds, highlightedBranchIds, onSelectBranchIds);
}

function transitionBinTooltip(
  summary: TransitionSummary,
  bin: TransitionBin | null,
  playhead: number,
): string {
  const date = decimalYearToISO(playhead);
  if (!bin) return `${date}: no transition bin`;
  if (summary.mode === 'focal') {
    return `${date}: ${formatCount(bin.introductions)} introductions, ${formatCount(
      bin.exports,
    )} exports`;
  }
  return `${date}: ${formatCount(bin.total)} jumps`;
}

function orderedStackSegments(
  segments: TransitionLocationStack[],
  values: string[],
): TransitionLocationStack[] {
  const order = new Map(values.map((value, index) => [value, index]));
  return [...segments].sort((a, b) => {
    const ai = order.get(a.location) ?? Number.POSITIVE_INFINITY;
    const bi = order.get(b.location) ?? Number.POSITIVE_INFINITY;
    return ai - bi || a.location.localeCompare(b.location);
  });
}

interface TransitionsChartProps {
  summary: TransitionSummary;
  values: string[];
  palette: StylePaletteId;
  paletteReverse: boolean;
  plotFrame: PlotFrame | null;
  plotDims: PlotDims;
  playhead: number;
  playheadIndicatorVisible: boolean;
  activeRange: { start: number; end: number };
  highlightedBranchIds: number[];
  onSelectBranchIds: (branchIds: number[]) => void;
}

function TransitionsChart({
  summary,
  values,
  palette,
  paletteReverse,
  plotFrame,
  plotDims,
  playhead,
  playheadIndicatorVisible,
  activeRange,
  highlightedBranchIds,
  onSelectBranchIds,
}: TransitionsChartProps) {
  const clipId = `transitions-active-${useId().replace(/:/g, '')}`;
  const xTicks = useMemo(
    () => monthTicks(summary.bounds.min, summary.bounds.max, plotDims.width),
    [plotDims.width, summary.bounds.max, summary.bounds.min],
  );
  const activeX0 = xFor(
    Math.min(activeRange.start, activeRange.end),
    summary.bounds.min,
    summary.bounds.max,
    plotDims,
  );
  const activeX1 = xFor(
    Math.max(activeRange.start, activeRange.end),
    summary.bounds.min,
    summary.bounds.max,
    plotDims,
  );
  const activeWidth = Math.max(0, activeX1 - activeX0);
  const playheadX = xFor(playhead, summary.bounds.min, summary.bounds.max, plotDims);
  const currentBin = transitionBinAtTime(summary, playhead);
  const tooltip = transitionBinTooltip(summary, currentBin, playhead);
  const hasTransitions = summary.totals.total > 0;
  const chartModel = useMemo(() => {
    const hasHighlightedBranches = highlightedBranchIds.length > 0;
    const barClasses = (
      branchIds: number[],
      kindClass: string | undefined,
      active: boolean,
    ): string =>
      [
        styles.transitionBar,
        styles.transitionBarInteractive,
        kindClass,
        active ? styles.transitionBarActive : styles.transitionBarDim,
        hasHighlightedBranches && !sameBranchIds(branchIds, highlightedBranchIds)
          ? styles.transitionBarUnselected
          : '',
        branchIds.length > 0 && sameBranchIds(branchIds, highlightedBranchIds)
          ? styles.transitionBarSelected
          : '',
      ]
        .filter(Boolean)
        .join(' ');
    const colorForStack = (location: string) =>
      paletteColorFor(location, values, palette, paletteReverse);

    if (summary.mode === 'focal') {
      const maxAbs = Math.max(
        1,
        ...summary.bins.flatMap((bin) => [
          bin.introductions,
          bin.exports,
          Math.abs(bin.introductions - bin.exports),
        ]),
      );
      const yTicks = integerTicks(maxAbs, Math.max(2, Math.floor(plotDims.height / 52)));
      const signedTicks = [
        ...yTicks
          .slice(1)
          .reverse()
          .map((tick) => -tick),
        0,
        ...yTicks.slice(1),
      ];
      const baselineY = transitionYForRange(0, -maxAbs, maxAbs, plotDims);

      const renderFocalBars = (active: boolean) =>
        summary.bins.flatMap((bin) => {
          const x0 = xFor(bin.t0, summary.bounds.min, summary.bounds.max, plotDims);
          const x1 = xFor(bin.t1, summary.bounds.min, summary.bounds.max, plotDims);
          const width = Math.max(1, x1 - x0 - 1);
          const introBars = orderedStackSegments(bin.introductionStacks, values).map(
            (segment, index, segments) => {
              const offset = segments.slice(0, index).reduce((sum, item) => sum + item.weight, 0);
              const y0 = transitionYForRange(offset + segment.weight, -maxAbs, maxAbs, plotDims);
              const y1 = transitionYForRange(offset, -maxAbs, maxAbs, plotDims);
              return (
                // biome-ignore lint/a11y/useSemanticElements: SVG chart marks cannot be replaced with HTML buttons inside an SVG.
                <rect
                  key={`intro-${bin.t0}-${bin.t1}-${segment.location}`}
                  className={barClasses(segment.branchIds, styles.transitionIntroBar, active)}
                  style={{ fill: colorForStack(segment.location) }}
                  x={x0}
                  y={y0}
                  width={width}
                  height={Math.max(0, y1 - y0)}
                  onClick={() =>
                    selectOrClearBranchIds(
                      segment.branchIds,
                      highlightedBranchIds,
                      onSelectBranchIds,
                    )
                  }
                  onKeyDown={(event) =>
                    selectBranchesOnKeyDown(
                      event,
                      segment.branchIds,
                      highlightedBranchIds,
                      onSelectBranchIds,
                    )
                  }
                  role="button"
                  tabIndex={0}
                  aria-label={`${transitionBinLabel(bin)}: ${formatCount(
                    segment.weight,
                  )} ${segment.location} introductions`}
                  data-location={segment.location}
                  data-testid="analysis-jumps-intro-bar"
                >
                  <title>
                    {transitionBinLabel(bin)}: {segment.location} {formatCount(segment.weight)}{' '}
                    introductions
                  </title>
                </rect>
              );
            },
          );
          const exportBars = orderedStackSegments(bin.exportStacks, values).map(
            (segment, index, segments) => {
              const offset = segments.slice(0, index).reduce((sum, item) => sum + item.weight, 0);
              const y0 = transitionYForRange(-offset, -maxAbs, maxAbs, plotDims);
              const y1 = transitionYForRange(-(offset + segment.weight), -maxAbs, maxAbs, plotDims);
              return (
                // biome-ignore lint/a11y/useSemanticElements: SVG chart marks cannot be replaced with HTML buttons inside an SVG.
                <rect
                  key={`export-${bin.t0}-${bin.t1}-${segment.location}`}
                  className={barClasses(segment.branchIds, styles.transitionExportBar, active)}
                  style={{ fill: colorForStack(segment.location) }}
                  x={x0}
                  y={y0}
                  width={width}
                  height={Math.max(0, y1 - y0)}
                  onClick={() =>
                    selectOrClearBranchIds(
                      segment.branchIds,
                      highlightedBranchIds,
                      onSelectBranchIds,
                    )
                  }
                  onKeyDown={(event) =>
                    selectBranchesOnKeyDown(
                      event,
                      segment.branchIds,
                      highlightedBranchIds,
                      onSelectBranchIds,
                    )
                  }
                  role="button"
                  tabIndex={0}
                  aria-label={`${transitionBinLabel(bin)}: ${formatCount(
                    segment.weight,
                  )} ${segment.location} exports`}
                  data-location={segment.location}
                  data-testid="analysis-jumps-export-bar"
                >
                  <title>
                    {transitionBinLabel(bin)}: {segment.location} {formatCount(segment.weight)}{' '}
                    exports
                  </title>
                </rect>
              );
            },
          );
          return [...introBars, ...exportBars];
        });

      return {
        mode: 'focal' as const,
        maxAbs,
        signedTicks,
        baselineY,
        inactiveBars: renderFocalBars(false),
        activeBars: renderFocalBars(true),
      };
    }

    const maxCount = Math.max(1, ...summary.bins.map((bin) => bin.total));
    const yTicks = integerTicks(maxCount, Math.max(3, Math.floor(plotDims.height / 42)));
    const yAxisMax = Math.max(maxCount, yTicks[yTicks.length - 1] ?? maxCount);
    const baselineY = transitionYFor(0, yAxisMax, plotDims);

    const renderTotalBars = (active: boolean) =>
      summary.bins.flatMap((bin) => {
        const x0 = xFor(bin.t0, summary.bounds.min, summary.bounds.max, plotDims);
        const x1 = xFor(bin.t1, summary.bounds.min, summary.bounds.max, plotDims);
        const width = Math.max(1, x1 - x0 - 1);
        return orderedStackSegments(bin.totalStacks, values).map((segment, index, segments) => {
          const offset = segments.slice(0, index).reduce((sum, item) => sum + item.weight, 0);
          const y0 = transitionYFor(offset + segment.weight, yAxisMax, plotDims);
          const y1 = transitionYFor(offset, yAxisMax, plotDims);
          return (
            // biome-ignore lint/a11y/useSemanticElements: SVG chart marks cannot be replaced with HTML buttons inside an SVG.
            <rect
              key={`total-${bin.t0}-${bin.t1}-${segment.location}`}
              className={barClasses(segment.branchIds, '', active)}
              style={{ fill: colorForStack(segment.location) }}
              x={x0}
              y={y0}
              width={width}
              height={Math.max(0, y1 - y0)}
              onClick={() =>
                selectOrClearBranchIds(segment.branchIds, highlightedBranchIds, onSelectBranchIds)
              }
              onKeyDown={(event) =>
                selectBranchesOnKeyDown(
                  event,
                  segment.branchIds,
                  highlightedBranchIds,
                  onSelectBranchIds,
                )
              }
              role="button"
              tabIndex={0}
              aria-label={`${transitionBinLabel(bin)}: ${formatCount(segment.weight)} ${
                segment.location
              } jumps`}
              data-location={segment.location}
              data-testid="analysis-jumps-total-bar"
            >
              <title>
                {transitionBinLabel(bin)}: {segment.location} {formatCount(segment.weight)} jumps
              </title>
            </rect>
          );
        });
      });

    return {
      mode: 'total' as const,
      yTicks,
      yAxisMax,
      baselineY,
      inactiveBars: renderTotalBars(false),
      activeBars: renderTotalBars(true),
    };
  }, [highlightedBranchIds, onSelectBranchIds, palette, paletteReverse, plotDims, summary, values]);

  if (chartModel.mode === 'focal') {
    return (
      <>
        <TransitionsStats summary={summary} />
        <svg
          className={styles.plot}
          style={
            plotFrame
              ? { marginLeft: plotFrame.left, width: plotFrame.width, height: plotFrame.height }
              : undefined
          }
          viewBox={`0 0 ${plotDims.width} ${plotDims.height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Discrete jumps through time"
          data-testid="analysis-transitions-plot"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={activeX0} y={0} width={activeWidth} height={plotDims.height} />
            </clipPath>
          </defs>
          {chartModel.signedTicks.map((tick) => {
            const y = transitionYForRange(tick, -chartModel.maxAbs, chartModel.maxAbs, plotDims);
            return (
              <g key={`y-${tick}`}>
                <line
                  className={tick === 0 ? styles.axis : styles.grid}
                  x1={PAD_LEFT}
                  x2={plotDims.width - PAD_RIGHT}
                  y1={y}
                  y2={y}
                />
                <text
                  className={styles.tickText}
                  x={PAD_LEFT - 8}
                  y={y + 3}
                  textAnchor="end"
                  data-testid="analysis-transitions-y-tick"
                >
                  {formatCount(tick)}
                </text>
              </g>
            );
          })}
          {xTicks.map((tick) => {
            const x = xFor(tick.time, summary.bounds.min, summary.bounds.max, plotDims);
            return (
              <g key={`x-${tick.time}`}>
                <line
                  className={styles.grid}
                  x1={x}
                  x2={x}
                  y1={TRANSITION_PAD_TOP}
                  y2={plotDims.height - TRANSITION_PAD_BOTTOM}
                />
                <text
                  className={styles.tickText}
                  x={x}
                  y={plotDims.height - TRANSITION_PAD_BOTTOM + 18}
                  textAnchor="middle"
                  data-testid="analysis-transitions-x-tick"
                >
                  {tick.label}
                </text>
              </g>
            );
          })}
          {chartModel.inactiveBars}
          <g clipPath={`url(#${clipId})`}>{chartModel.activeBars}</g>
          {playheadIndicatorVisible && (
            <g data-testid="analysis-transitions-playhead" className={styles.playheadMarker}>
              <line
                className={styles.playheadHitArea}
                x1={playheadX}
                x2={playheadX}
                y1={TRANSITION_PAD_TOP}
                y2={plotDims.height - TRANSITION_PAD_BOTTOM}
              >
                <title>{tooltip}</title>
              </line>
              <line
                className={styles.playheadLine}
                data-testid="analysis-transitions-playhead-line"
                x1={playheadX}
                x2={playheadX}
                y1={TRANSITION_PAD_TOP}
                y2={plotDims.height - TRANSITION_PAD_BOTTOM}
              />
            </g>
          )}
        </svg>
        {!hasTransitions && <div className={styles.emptyState}>No focal boundary jumps.</div>}
        <TransitionsBreakdown
          summary={summary}
          values={values}
          palette={palette}
          reverse={paletteReverse}
        />
      </>
    );
  }

  return (
    <>
      <TransitionsStats summary={summary} />
      <svg
        className={styles.plot}
        style={
          plotFrame
            ? { marginLeft: plotFrame.left, width: plotFrame.width, height: plotFrame.height }
            : undefined
        }
        viewBox={`0 0 ${plotDims.width} ${plotDims.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Discrete jumps through time"
        data-testid="analysis-transitions-plot"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={activeX0} y={0} width={activeWidth} height={plotDims.height} />
          </clipPath>
        </defs>
        {chartModel.yTicks.map((tick) => {
          const y = transitionYFor(tick, chartModel.yAxisMax, plotDims);
          return (
            <g key={`y-${tick}`}>
              <line
                className={styles.grid}
                x1={PAD_LEFT}
                x2={plotDims.width - PAD_RIGHT}
                y1={y}
                y2={y}
              />
              <text
                className={styles.tickText}
                x={PAD_LEFT - 8}
                y={y + 3}
                textAnchor="end"
                data-testid="analysis-transitions-y-tick"
              >
                {formatCount(tick)}
              </text>
            </g>
          );
        })}
        {xTicks.map((tick) => {
          const x = xFor(tick.time, summary.bounds.min, summary.bounds.max, plotDims);
          return (
            <g key={`x-${tick.time}`}>
              <line
                className={styles.grid}
                x1={x}
                x2={x}
                y1={TRANSITION_PAD_TOP}
                y2={plotDims.height - TRANSITION_PAD_BOTTOM}
              />
              <text
                className={styles.tickText}
                x={x}
                y={plotDims.height - TRANSITION_PAD_BOTTOM + 18}
                textAnchor="middle"
                data-testid="analysis-transitions-x-tick"
              >
                {tick.label}
              </text>
            </g>
          );
        })}
        <line
          className={styles.axis}
          x1={PAD_LEFT}
          x2={plotDims.width - PAD_RIGHT}
          y1={chartModel.baselineY}
          y2={chartModel.baselineY}
        />
        {chartModel.inactiveBars}
        <g clipPath={`url(#${clipId})`}>{chartModel.activeBars}</g>
        {playheadIndicatorVisible && (
          <g data-testid="analysis-transitions-playhead" className={styles.playheadMarker}>
            <line
              className={styles.playheadHitArea}
              x1={playheadX}
              x2={playheadX}
              y1={TRANSITION_PAD_TOP}
              y2={plotDims.height - TRANSITION_PAD_BOTTOM}
            >
              <title>{tooltip}</title>
            </line>
            <line
              className={styles.playheadLine}
              data-testid="analysis-transitions-playhead-line"
              x1={playheadX}
              x2={playheadX}
              y1={TRANSITION_PAD_TOP}
              y2={plotDims.height - TRANSITION_PAD_BOTTOM}
            />
          </g>
        )}
      </svg>
      {!hasTransitions && <div className={styles.emptyState}>No discrete jumps in range.</div>}
      <TransitionsBreakdown
        summary={summary}
        values={values}
        palette={palette}
        reverse={paletteReverse}
      />
    </>
  );
}

function TransitionsStats({ summary }: { summary: TransitionSummary }) {
  const metrics =
    summary.mode === 'focal'
      ? [
          ['Introductions', summary.totals.introductions],
          ['Exports', summary.totals.exports],
          ['Net', summary.totals.net],
        ]
      : [['Jumps', summary.totals.total]];

  return (
    <div className={styles.transitionStats} data-testid="analysis-transitions-stats">
      {metrics.map(([label, value]) => (
        <div key={label} className={styles.transitionMetric}>
          <span className={styles.metricLabel}>{label}</span>
          <span className={styles.metricValue}>{formatCount(Number(value))}</span>
        </div>
      ))}
      <span className={styles.transitionNote}>
        {summary.binSizeDays}-day bins - counted on the MCC tree
      </span>
    </div>
  );
}

function TransitionsBreakdown({
  summary,
  values,
  palette,
  reverse,
}: {
  summary: TransitionSummary;
  values: string[];
  palette: StylePaletteId;
  reverse: boolean;
}) {
  const routes = summary.topSegments.slice(0, 3);
  if (routes.length === 0) return null;
  return (
    <div className={styles.transitionBreakdown} data-testid="analysis-transitions-breakdown">
      {routes.map((route) => (
        <span key={routeLabel(route)} className={styles.routePill} title={routeLabel(route)}>
          <span
            className={styles.routeSwatch}
            style={{ background: paletteColorFor(route.to, values, palette, reverse) }}
          />
          <span className={styles.routeLabel}>{routeLabel(route)}</span>
          <span className={styles.routeValue}>{formatCount(route.weight)}</span>
        </span>
      ))}
    </div>
  );
}

export function AnalysisPanel({ fill = false }: AnalysisPanelProps) {
  const clipId = `ltt-active-${useId().replace(/:/g, '')}`;
  const plotWrapRef = useRef<HTMLDivElement | null>(null);
  const [plotFrame, setPlotFrame] = useState<PlotFrame | null>(null);
  // Tab lives in the store so App can open the panel on the BSSVS tab when a
  // BSSVS log loads. The effect below still resets it when a tab goes away.
  const activeTab = useUiStore((s) => s.analysisTab);
  const setActiveTab = useUiStore((s) => s.setAnalysisTab);
  const branchTable = useTreeStore((s) => s.branchTable);
  const graph = useTreeStore((s) => s.graph);
  const layout = useTreeStore((s) => s.layout);
  const traitInfo = useTreeStore((s) => s.traitInfo);
  const logStatus = useTreeStore((s) => s.logStatus);
  const discreteGeoLookup = useTreeStore((s) => s.discreteGeoLookup);
  const bounds = useTimelineStore((s) => s.bounds);
  const playhead = useTimelineStore((s) =>
    getRangeRelativePlayheadBucket(s.playhead, s.bounds, s.isPlaying),
  );
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const playheadIndicatorVisible = usePlayheadIndicatorVisibility(
    isPlaying,
    3000,
    isPlaying ? null : playhead,
  );
  const mode = useTimelineStore((s) => s.mode);
  const timeWindow = useTimelineStore((s) => s.window);
  const clade = useTimelineStore((s) => s.clade);
  const subtreeRootIds = useTimelineStore((s) => s.subtreeRootIds);
  const subtreeRootId = useTimelineStore((s) => s.subtreeRootId);
  const focusedTaxa = useSelectionStore((s) => s.focusedTaxa);
  const highlightedBranchIds = useSelectionStore((s) => s.highlightedBranchIds);
  const setHighlightedBranchIds = useSelectionStore((s) => s.setHighlightedBranchIds);
  const colorByKey = useUiStore((s) => s.colorByKey);
  const deselectedValues = useUiStore((s) => s.deselectedValues);
  const posteriorThreshold = useUiStore((s) => s.posteriorThreshold);
  const palette = useUiStore((s) => s.palette);
  const paletteReverse = useUiStore((s) => s.paletteReverse);

  useEffect(() => {
    const updatePlotFrame = () => {
      const wrap = plotWrapRef.current;
      const track = document.querySelector<HTMLElement>('[data-testid="timeline-track"]');
      if (!wrap || !track) {
        setPlotFrame(null);
        return;
      }

      const wrapRect = wrap.getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();
      if (wrapRect.width <= 0 || trackRect.width <= 0) {
        setPlotFrame(null);
        return;
      }

      const style = getComputedStyle(wrap);
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const paddingBottom = parseFloat(style.paddingBottom) || 0;
      const left = Math.max(0, trackRect.left - wrapRect.left);
      const right = Math.min(wrapRect.width, trackRect.right - wrapRect.left);
      const width = Math.max(1, right - left);
      const height = Math.max(MIN_PLOT_HEIGHT, wrapRect.height - paddingTop - paddingBottom);
      setPlotFrame((prev) =>
        prev &&
        Math.abs(prev.left - left) < 0.5 &&
        Math.abs(prev.width - width) < 0.5 &&
        Math.abs(prev.height - height) < 0.5
          ? prev
          : { left, width, height },
      );
    };

    updatePlotFrame();
    const wrap = plotWrapRef.current;
    const track = document.querySelector<HTMLElement>('[data-testid="timeline-track"]');
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePlotFrame) : null;
    if (wrap) ro?.observe(wrap);
    if (track) ro?.observe(track);
    window.addEventListener('resize', updatePlotFrame);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updatePlotFrame);
    };
  }, []);

  const locationConfig = useMemo(() => {
    if (traitInfo?.kind !== 'discrete' || !discreteGeoLookup) return null;
    return { values: traitInfo.values, coordByValue: discreteGeoLookup };
  }, [traitInfo, discreteGeoLookup]);
  const hasTransitionsTab = traitInfo?.kind === 'discrete';
  // BSSVS Bayes factors need a discrete trait AND a loaded BEAST log.
  const hasBssvsTab = traitInfo?.kind === 'discrete' && logStatus === 'loaded';
  const transitionTraitKey = traitInfo?.kind === 'discrete' ? traitInfo.key : null;
  const transitionValues = useMemo(
    () => (traitInfo?.kind === 'discrete' ? traitInfo.values : []),
    [traitInfo],
  );

  useEffect(() => {
    if (activeTab === 'transitions' && !hasTransitionsTab) setActiveTab('ltt');
    if (activeTab === 'bssvs' && !hasBssvsTab) setActiveTab('ltt');
  }, [activeTab, hasTransitionsTab, hasBssvsTab, setActiveTab]);

  useEffect(() => () => setHighlightedBranchIds([]), [setHighlightedBranchIds]);

  const subtreeBranchIds = useMemo<Set<number> | null>(() => {
    const selectedSubtreeRootIds =
      subtreeRootIds.length > 0 ? subtreeRootIds : subtreeRootId !== null ? [subtreeRootId] : [];
    if (!clade || selectedSubtreeRootIds.length === 0 || !graph || !layout) return null;
    return buildSubtreeBranchIdsForRoots(graph, layout, selectedSubtreeRootIds);
  }, [clade, subtreeRootIds, subtreeRootId, graph, layout]);

  const focusedLineageBranchIds = useMemo<Set<number>>(() => {
    if (!layout || !graph || focusedTaxa.length === 0) return new Set();
    const nodeIds = computeFocusedLineageNodeIds(layout, focusedTaxa);
    const result = new Set<number>();
    for (const origId of nodeIds) {
      const idx = graph.origIdToIdx.get(origId);
      if (idx !== undefined) result.add(idx);
    }
    return result;
  }, [layout, graph, focusedTaxa]);

  const lttBranchFilter = useMemo(() => {
    if (!branchTable) return undefined;
    const posterior = branchTable.posterior;
    const hasPosteriorFilter = posterior !== undefined && posteriorThreshold > 0;
    const hasFocusedFilter = focusedLineageBranchIds.size > 0;
    const hasLegendFilter =
      deselectedValues.size > 0 && colorByKey !== 'single-color' && colorByKey !== '__time__';
    if (!subtreeBranchIds && !hasPosteriorFilter && !hasFocusedFilter && !hasLegendFilter) {
      return undefined;
    }

    return (idx: number): boolean => {
      const branchId = branchTable.branchId[idx] ?? idx;
      if (subtreeBranchIds && !subtreeBranchIds.has(branchId)) return false;
      if (hasFocusedFilter && !focusedLineageBranchIds.has(branchId)) return false;
      if (hasPosteriorFilter && (posterior?.[idx] ?? 1) < posteriorThreshold) return false;
      if (hasLegendFilter && graph) {
        const node = graph.nodes[branchId];
        const traitVal = node?.annotations[colorByKey];
        if (typeof traitVal === 'string' && deselectedValues.has(traitVal)) return false;
      }
      return true;
    };
  }, [
    branchTable,
    colorByKey,
    deselectedValues,
    focusedLineageBranchIds,
    graph,
    posteriorThreshold,
    subtreeBranchIds,
  ]);

  const transitionBranchFilter = useMemo(() => {
    if (!branchTable) return undefined;
    const posterior = branchTable.posterior;
    const hasPosteriorFilter = posterior !== undefined && posteriorThreshold > 0;
    const hasFocusedFilter = focusedLineageBranchIds.size > 0;
    if (!subtreeBranchIds && !hasPosteriorFilter && !hasFocusedFilter) return undefined;

    return (idx: number, branchId: number): boolean => {
      if (subtreeBranchIds && !subtreeBranchIds.has(branchId)) return false;
      if (hasFocusedFilter && !focusedLineageBranchIds.has(branchId)) return false;
      if (hasPosteriorFilter && (posterior?.[idx] ?? 1) < posteriorThreshold) return false;
      return true;
    };
  }, [branchTable, focusedLineageBranchIds, posteriorThreshold, subtreeBranchIds]);

  const bundle = useMemo(
    () => buildLttSeries(branchTable, bounds, locationConfig, lttBranchFilter),
    [branchTable, bounds, locationConfig, lttBranchFilter],
  );
  const transitions = useMemo(
    () => buildTransitions(branchTable, graph, layout, transitionTraitKey, transitionBranchFilter),
    [branchTable, graph, layout, transitionTraitKey, transitionBranchFilter],
  );
  const transitionSummary = useMemo(
    () =>
      summariseTransitions(transitions, {
        bounds,
        values: transitionValues,
        deselectedValues,
      }),
    [bounds, deselectedValues, transitionValues, transitions],
  );
  const legendColorValues = locationConfig?.values ?? bundle.locations;
  const hasFocusedLineageFilter = focusedLineageBranchIds.size > 0;

  const plottedSeries = useMemo<PlottedLttSeries[]>(() => {
    const locationLegendFiltered = legendColorValues.some((value) => deselectedValues.has(value));
    const shouldStackLocations =
      bundle.locations.length > 0 &&
      (locationLegendFiltered || (hasFocusedLineageFilter && locationConfig !== null));

    if (!shouldStackLocations) {
      return [
        {
          id: 'global',
          label: 'All lineages',
          color: 'var(--accent)',
          series: bundle.global,
        },
      ];
    }

    const selected = locationLegendFiltered
      ? bundle.locations.filter((value) => !deselectedValues.has(value))
      : bundle.locations;
    const activeLocations = selected.length > 0 ? selected : bundle.locations;
    return stackedLocationSeries(activeLocations, bundle.byLocation, bundle.bounds, (location) =>
      paletteColorFor(location, legendColorValues, palette, paletteReverse),
    );
  }, [
    bundle,
    deselectedValues,
    hasFocusedLineageFilter,
    legendColorValues,
    locationConfig,
    palette,
    paletteReverse,
  ]);

  const topPlottedSeries = plottedSeries[plottedSeries.length - 1];
  const activeSeries =
    topPlottedSeries && topPlottedSeries.series.length > 0
      ? topPlottedSeries.series
      : bundle.global;
  const activeMax = Math.max(1, ...activeSeries.map((point) => point.count));
  const plotDims = useMemo<PlotDims>(
    () =>
      plotFrame
        ? { width: plotFrame.width, height: plotFrame.height }
        : { width: DEFAULT_PLOT_WIDTH, height: DEFAULT_PLOT_HEIGHT },
    [plotFrame],
  );
  const yTicks = integerTicks(activeMax, Math.max(3, Math.floor(plotDims.height / 42)));
  const yAxisMax = Math.max(activeMax, yTicks[yTicks.length - 1] ?? activeMax);
  const currentCount = countAtTime(activeSeries, playhead);
  const activeTimeRange = activeRangeFor(bundle.bounds, playhead, isPlaying, mode, timeWindow);
  const transitionActiveTimeRange = activeRangeFor(
    transitionSummary.bounds,
    playhead,
    isPlaying,
    mode,
    timeWindow,
  );
  const activeX0 = xFor(
    Math.min(activeTimeRange.start, activeTimeRange.end),
    bundle.bounds.min,
    bundle.bounds.max,
    plotDims,
  );
  const activeX1 = xFor(
    Math.max(activeTimeRange.start, activeTimeRange.end),
    bundle.bounds.min,
    bundle.bounds.max,
    plotDims,
  );
  const activeWidth = Math.max(0, activeX1 - activeX0);
  const playheadX = xFor(playhead, bundle.bounds.min, bundle.bounds.max, plotDims);
  const paths = plottedSeries.map((item) => ({
    ...item,
    path: stepPath(item.series, yAxisMax, bundle.bounds.min, bundle.bounds.max, plotDims),
  }));
  const xTicks = monthTicks(bundle.bounds.min, bundle.bounds.max, plotDims.width);
  const lineageTooltip = `${decimalYearToISO(playhead)}: ${formatCount(currentCount)} ${
    Math.abs(currentCount - 1) < 1e-4 ? 'lineage' : 'lineages'
  }`;

  return (
    <section
      className={[styles.panel, fill ? styles.fill : ''].filter(Boolean).join(' ')}
      data-testid="analysis-panel"
      aria-label="Analysis"
    >
      <div className={styles.plotWrap} ref={plotWrapRef} data-testid="analysis-ltt-plot-wrap">
        {activeTab === 'bssvs' ? (
          <div className={styles.bssvsPane} data-testid="analysis-bssvs">
            <DtaPanel />
          </div>
        ) : activeTab === 'ltt' ? (
          <svg
            className={styles.plot}
            style={
              plotFrame
                ? { marginLeft: plotFrame.left, width: plotFrame.width, height: plotFrame.height }
                : undefined
            }
            viewBox={`0 0 ${plotDims.width} ${plotDims.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Lineages through time"
            data-testid="analysis-ltt-plot"
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={activeX0} y={0} width={activeWidth} height={plotDims.height} />
              </clipPath>
            </defs>
            {yTicks.map((tick) => {
              const y = yFor(tick, yAxisMax, plotDims);
              return (
                <g key={`y-${tick}`}>
                  <line
                    className={styles.grid}
                    x1={PAD_LEFT}
                    x2={plotDims.width - PAD_RIGHT}
                    y1={y}
                    y2={y}
                  />
                  <text
                    className={styles.tickText}
                    x={PAD_LEFT - 8}
                    y={y + 3}
                    textAnchor="end"
                    data-testid="analysis-ltt-y-tick"
                  >
                    {formatCount(tick)}
                  </text>
                </g>
              );
            })}
            {xTicks.map((tick) => {
              const x = xFor(tick.time, bundle.bounds.min, bundle.bounds.max, plotDims);
              return (
                <g key={`x-${tick.time}`}>
                  <line
                    className={styles.grid}
                    x1={x}
                    x2={x}
                    y1={PAD_TOP}
                    y2={plotDims.height - PAD_BOTTOM}
                  />
                  <text
                    className={styles.tickText}
                    x={x}
                    y={plotDims.height - 7}
                    textAnchor="middle"
                    data-testid="analysis-ltt-x-tick"
                  >
                    {tick.label}
                  </text>
                </g>
              );
            })}
            <line
              className={styles.axis}
              x1={PAD_LEFT}
              x2={PAD_LEFT}
              y1={PAD_TOP}
              y2={plotDims.height - PAD_BOTTOM}
            />
            <line
              className={styles.axis}
              x1={PAD_LEFT}
              x2={plotDims.width - PAD_RIGHT}
              y1={plotDims.height - PAD_BOTTOM}
              y2={plotDims.height - PAD_BOTTOM}
            />
            {paths.map((item) => (
              <path
                key={item.id}
                className={[styles.series, styles.seriesDim].join(' ')}
                d={item.path}
                stroke={item.color}
                data-testid="analysis-ltt-series-base"
                data-location={item.label}
              />
            ))}
            {paths.map((item) => (
              <path
                key={`${item.id}-active`}
                className={[styles.series, styles.seriesActive].join(' ')}
                d={item.path}
                stroke={item.color}
                clipPath={`url(#${clipId})`}
                data-testid="analysis-ltt-series-active"
                data-location={item.label}
              />
            ))}
            {playheadIndicatorVisible && (
              <g data-testid="analysis-ltt-playhead" className={styles.playheadMarker}>
                <line
                  className={styles.playheadHitArea}
                  x1={playheadX}
                  x2={playheadX}
                  y1={PAD_TOP}
                  y2={plotDims.height - PAD_BOTTOM}
                >
                  <title>{lineageTooltip}</title>
                </line>
                <line
                  className={styles.playheadLine}
                  data-testid="analysis-ltt-playhead-line"
                  x1={playheadX}
                  x2={playheadX}
                  y1={PAD_TOP}
                  y2={plotDims.height - PAD_BOTTOM}
                />
              </g>
            )}
          </svg>
        ) : (
          <TransitionsChart
            summary={transitionSummary}
            values={transitionValues}
            palette={palette}
            paletteReverse={paletteReverse}
            plotFrame={plotFrame}
            plotDims={plotDims}
            playhead={playhead}
            playheadIndicatorVisible={playheadIndicatorVisible}
            activeRange={transitionActiveTimeRange}
            highlightedBranchIds={highlightedBranchIds}
            onSelectBranchIds={setHighlightedBranchIds}
          />
        )}
        <div
          className={styles.edgeTabs}
          role="tablist"
          aria-label="Analysis tabs"
          data-testid="analysis-ltt-edge-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'ltt'}
            className={[
              styles.tab,
              activeTab === 'ltt' ? styles.tabActive : '',
              styles.edgeTab,
            ].join(' ')}
            data-testid="analysis-tab-ltt"
            onClick={() => setActiveTab('ltt')}
          >
            LTT
          </button>
          {hasTransitionsTab && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'transitions'}
              className={[
                styles.tab,
                activeTab === 'transitions' ? styles.tabActive : '',
                styles.edgeTab,
              ].join(' ')}
              data-testid="analysis-tab-jumps"
              onClick={() => setActiveTab('transitions')}
            >
              Jumps
            </button>
          )}
          {hasBssvsTab && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'bssvs'}
              className={[
                styles.tab,
                activeTab === 'bssvs' ? styles.tabActive : '',
                styles.edgeTab,
              ].join(' ')}
              data-testid="analysis-tab-bssvs"
              onClick={() => setActiveTab('bssvs')}
            >
              BSSVS
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
