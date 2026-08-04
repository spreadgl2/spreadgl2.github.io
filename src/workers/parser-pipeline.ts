import { isoToDecimalYear } from '../lib/format/decimal-year.js';
import { extractTipDate } from '../lib/format/tip-date.js';
import {
  buildTipDateRowFromInput,
  type TipDateFormat,
  type TipDateRow,
} from '../lib/format/tip-date-table.js';
import {
  extractGeoAnnotations,
  extractHpdPolygons,
  extractMultiModalHpdPolygons,
} from '../lib/phylo/annotate.js';
import { TreeCalibration } from '../lib/phylo/calibrate.js';
import {
  collectAllDiscreteTipKeys,
  collectTipStringValues,
  introspect,
} from '../lib/phylo/introspect.js';
import { computeLayoutFromGraph } from '../lib/phylo/layout.js';
import { parseTreeFileMeta } from '../lib/phylo/parse.js';
import { buildTimeSliceIndexes } from '../lib/phylo/slice.js';
import type { PhyloGraph } from '../lib/phylo/types.js';
import { assertTextSize, INPUT_LIMITS, InputLimitError } from '../lib/security/input-limits.js';
import { buildBranchTable } from '../lib/tree-render/branch-table.js';
import type { TipDateSample } from './wire.js';
import { computeDateRange, serializeGraph, serializeLayout, type WireParseResult } from './wire.js';

export type ParseStage = 'read' | 'calibrate' | 'geo' | 'table' | 'layout';

export type ParseErrorCode = 'not_nexus' | 'no_geo' | 'non_wgs84' | 'no_dates' | 'needs_mrsd';

export type ProgressCallback = (stage: ParseStage, percent: number) => void;
export type ConfirmedAnalysisKind = 'continuous' | 'discrete';

const PARSE_ERROR_PREFIX = 'PARSE_ERROR:';

export function encodeParseError(code: ParseErrorCode): string {
  return `${PARSE_ERROR_PREFIX}${JSON.stringify({ code })}`;
}

export function decodeParseError(message: string): ParseErrorCode | null {
  if (!message.startsWith(PARSE_ERROR_PREFIX)) return null;
  try {
    const parsed = JSON.parse(message.slice(PARSE_ERROR_PREFIX.length)) as { code: ParseErrorCode };
    return parsed.code;
  } catch {
    return null;
  }
}

export function runPipeline(
  input: string | File,
  onProgress?: ProgressCallback,
  confirmedTraitKey?: string,
  confirmedTipDatePattern?: string,
  manualMrsdIso?: string,
  confirmedCoordinateKeys?: string,
  confirmedAnalysisKind?: ConfirmedAnalysisKind,
  confirmedHpdKeys?: string | null,
): Promise<WireParseResult> {
  if (typeof input !== 'string') {
    return input
      .text()
      .then((text) =>
        runPipelineFromString(
          text,
          onProgress,
          confirmedTraitKey,
          confirmedTipDatePattern,
          manualMrsdIso,
          confirmedCoordinateKeys,
          confirmedAnalysisKind,
          confirmedHpdKeys,
        ),
      );
  }
  return Promise.resolve(
    runPipelineFromString(
      input,
      onProgress,
      confirmedTraitKey,
      confirmedTipDatePattern,
      manualMrsdIso,
      confirmedCoordinateKeys,
      confirmedAnalysisKind,
      confirmedHpdKeys,
    ),
  );
}

export function runPipelineFromString(
  text: string,
  onProgress?: ProgressCallback,
  confirmedTraitKey?: string,
  confirmedTipDatePattern?: string,
  manualMrsdIso?: string,
  confirmedCoordinateKeys?: string,
  confirmedAnalysisKind?: ConfirmedAnalysisKind,
  confirmedHpdKeys?: string | null,
): WireParseResult {
  assertTextSize('tree', text);
  onProgress?.('read', 0);
  let graph: PhyloGraph;
  let multiTreeCount: number;
  try {
    ({ graph, multiTreeCount } = parseTreeFileMeta(text));
  } catch {
    throw new Error(encodeParseError('not_nexus'));
  }
  if (graph.nodes.length > INPUT_LIMITS.treeNodes) {
    throw new InputLimitError(
      `Trees may contain at most ${INPUT_LIMITS.treeNodes.toLocaleString()} nodes.`,
    );
  }
  let annotationEntries = 0;
  for (const node of graph.nodes) {
    annotationEntries += Object.keys(node.annotations).length;
    if (annotationEntries > INPUT_LIMITS.treeAnnotationEntries) {
      throw new InputLimitError('Tree annotations exceed the supported limit.');
    }
  }
  onProgress?.('read', 100);

  const coordinateParts = confirmedCoordinateKeys?.split('|');
  const preferredCoordinateFamily =
    coordinateParts?.[0] && coordinateParts[1]
      ? { lat: coordinateParts[0], lon: coordinateParts[1] }
      : undefined;
  const allDiscreteKeys = collectAllDiscreteTipKeys(graph);
  let introspectResult = introspect(graph, preferredCoordinateFamily);
  if (confirmedAnalysisKind === 'discrete') {
    const selectedTraitKey =
      confirmedTraitKey !== undefined && allDiscreteKeys.includes(confirmedTraitKey)
        ? confirmedTraitKey
        : allDiscreteKeys[0];
    if (selectedTraitKey !== undefined) {
      introspectResult = {
        kind: 'discrete',
        key: selectedTraitKey,
        values: collectTipStringValues(graph, selectedTraitKey),
        ambiguous: false,
      };
    }
  } else if (confirmedTraitKey !== undefined) {
    if (introspectResult.kind === 'discrete-ambiguous') {
      const matched = introspectResult.candidates.find((c) => c.key === confirmedTraitKey);
      if (matched !== undefined) {
        introspectResult = {
          kind: 'discrete',
          key: matched.key,
          values: matched.values,
          ambiguous: false,
        };
      }
    } else if (allDiscreteKeys.includes(confirmedTraitKey)) {
      introspectResult = {
        kind: 'discrete',
        key: confirmedTraitKey,
        values: collectTipStringValues(graph, confirmedTraitKey),
        ambiguous: false,
      };
    }
  }
  if (introspectResult.kind === 'unrecognized') {
    throw new Error(encodeParseError('no_geo'));
  }
  if (introspectResult.kind === 'continuous' && !introspectResult.wgs84) {
    throw new Error(encodeParseError('non_wgs84'));
  }

  onProgress?.('layout', 0);
  const layout = computeLayoutFromGraph(graph);
  onProgress?.('layout', 100);

  onProgress?.('calibrate', 0);
  const tipDateSamplesAll: TipDateSample[] = [];
  const tipDateRows: TipDateRow[] = [];
  let mrsd: number | null = null;
  let mrsdRaw = '';
  let mrsdTaxon: string | null = null;
  let mrsdFormat: TipDateFormat | null = null;
  let hasNonHighConfidence = false;
  type PatternHint = NonNullable<Parameters<typeof extractTipDate>[1]>['patternHint'];
  const patternHint = confirmedTipDatePattern as PatternHint;

  if (manualMrsdIso !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manualMrsdIso)) throw new Error(encodeParseError('needs_mrsd'));
    mrsd = isoToDecimalYear(manualMrsdIso);
    mrsdRaw = manualMrsdIso;
    mrsdFormat = 'iso-date';
  }

  for (const node of graph.nodes) {
    const layoutNode = layout.nodeMap.get(node.origId);
    if (!layoutNode?.isTip) continue;
    const label = node.name ?? node.origId ?? '';
    const annotatedDate = node.annotations.date;

    const tipDate =
      patternHint !== undefined ? extractTipDate(label, { patternHint }) : extractTipDate(label);
    const row = buildTipDateRowFromInput({
      nodeId: node.origId,
      label,
      annotatedDate,
      ...(patternHint !== undefined ? { patternHint } : {}),
    });

    if (
      manualMrsdIso === undefined &&
      row.decimalYear !== null &&
      Number.isFinite(row.decimalYear) &&
      (mrsd === null || row.decimalYear > mrsd)
    ) {
      mrsd = row.decimalYear;
      mrsdRaw = row.parsedSubstring;
      mrsdTaxon = row.taxon;
      mrsdFormat = row.format;
    }

    if (row.source === 'parsed' && tipDate !== null) {
      if (tipDate.confidence !== 'high') hasNonHighConfidence = true;
      if (tipDateSamplesAll.length < 3) tipDateSamplesAll.push({ label, result: tipDate });
    }

    tipDateRows.push(row);
  }

  if (mrsd === null || !Number.isFinite(mrsd)) throw new Error(encodeParseError('needs_mrsd'));

  const treeHeightRows: TipDateRow[] = [];
  for (let i = 0; i < tipDateRows.length; i++) {
    const row = tipDateRows[i];
    if (row === undefined) continue;
    const layoutNode = layout.nodeMap.get(row.nodeId);
    if (!layoutNode?.isTip) continue;
    const height = layout.maxX - layoutNode.x;
    const decimalYear = mrsd - height;
    const idx = graph.origIdToIdx.get(row.nodeId);
    const node = idx === undefined ? undefined : graph.nodes[idx];
    if (node !== undefined) node.annotations.date = String(decimalYear);
    treeHeightRows.push({
      // Keep each tip's own raw substring from its label; fall back to the MRSD
      // substring only for tips that have no date of their own (e.g. a manually
      // supplied MRSD, or an undated tip). Only the decimal-year value is
      // recomputed from the calibrated tree height.
      ...row,
      parsedSubstring: row.parsedSubstring || mrsdRaw,
      decimalYear,
      format: 'decimal-year',
      source: 'tree-height',
    });
  }

  const tipDateSamples =
    manualMrsdIso === undefined && hasNonHighConfidence && confirmedTipDatePattern === undefined
      ? tipDateSamplesAll
      : undefined;
  const cal = new TreeCalibration();
  const datesFound = cal.setAnchor('date', layout.nodeMap, layout.maxX);
  if (!datesFound) {
    throw new Error(encodeParseError('no_dates'));
  }
  onProgress?.('calibrate', 100);

  onProgress?.('geo', 0);
  const geos = extractGeoAnnotations(graph, introspectResult);
  const hpdParts = confirmedHpdKeys?.split('|');
  const hpdFamily =
    confirmedHpdKeys === null
      ? null
      : hpdParts?.[0] && hpdParts[1]
        ? { lat: hpdParts[0], lon: hpdParts[1] }
        : undefined;
  const nodeHpds = extractHpdPolygons(graph, introspectResult, hpdFamily);
  const nodeMultiHpds = extractMultiModalHpdPolygons(graph, introspectResult);
  onProgress?.('geo', 100);

  onProgress?.('table', 0);
  const branchTable = buildBranchTable(graph, cal, geos, layout);
  buildTimeSliceIndexes(branchTable);
  onProgress?.('table', 100);

  const dateRange = computeDateRange(branchTable);

  return {
    graph: serializeGraph(graph),
    layout: serializeLayout(layout),
    branchTable,
    dateRange,
    traitInfo: introspectResult,
    stringTable: [],
    nodeHpds,
    allDiscreteKeys,
    nodeMultiHpds,
    tipDateRows: treeHeightRows,
    mrsdInfo: {
      decimalYear: mrsd,
      substring: mrsdRaw,
      taxon: mrsdTaxon,
      format: mrsdFormat,
      manual: manualMrsdIso !== undefined,
    },
    ...(multiTreeCount > 1 ? { multiTreeCount } : {}),
    ...(tipDateSamples !== undefined ? { tipDateSamples } : {}),
  };
}
