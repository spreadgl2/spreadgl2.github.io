import type { GeoSource } from '../../store/tree';
import type { ActivePanel, Palette, Theme, TreeSortOrder, VisibleViews } from '../../store/ui';
import { ENV_PALETTES, type EnvPaletteId } from '../env/palettes';
import type { TipDateFormat, TipDateSource } from '../format/tip-date-table';
import type { PlayMode, TimeWindow } from '../phylo/types';
import {
  assertRasterDimensions,
  assertTextSize,
  INPUT_LIMITS,
  InputLimitError,
} from '../security/input-limits';
import { STYLE_QUALITATIVE_PALETTES, STYLE_QUANTITATIVE_PALETTES } from '../tree-render/palettes';
import { gzipText, ungzipText } from './gzip';
import type {
  EmbeddedBoundary,
  EmbeddedChoropleth,
  EmbeddedData,
  EmbeddedEnvColumn,
  EmbeddedLayers,
} from './project-embed';

export const PROJECT_FILE_VERSION = 1 as const;

export type ProjectFileVersion = typeof PROJECT_FILE_VERSION;

export interface ProjectTreeSourceRef {
  fileName: string;
  exampleId: string | null;
  confirmedTraitKey: string | null;
  confirmedTipDatePattern: string | null;
  embeddedTree?: string;
}

export interface ProjectTimeline {
  playhead: number;
  window: TimeWindow | null;
  windowSize: number | null;
  speed: number;
  mode: PlayMode;
  arcs: boolean;
  clade: boolean;
  subtreeRootIds: string[];
  subtreeRootId: string | null;
}

export interface ProjectSelection {
  selectedIds: string[];
  selectedBranchIds: number[];
}

export interface ProjectFilters {
  focusedTaxa: string[];
  deselectedValues: string[];
  posteriorThreshold: number;
}

export interface ProjectPanels {
  activePanel: ActivePanel;
  visibleViews: VisibleViews;
  layerVisibility: Record<string, boolean>;
  layerOpacity: Record<string, number>;
}

export interface ProjectStyle {
  colorByKey: string | 'single-color';
  glyphByKey: string | 'none';
  palette: Palette;
  paletteReverse: boolean;
  showBranches: boolean;
  branchWidth: number;
  arcWidth: number;
  showTips: boolean;
  tipRadius: number;
  treeOpacity: number;
  treeSortOrder: TreeSortOrder;
  theme: Theme;
}

export interface ProjectEnvironment {
  activeKey: string | null;
  paletteOverride: Record<string, EnvPaletteId | 'auto'>;
}

export type ProjectDateOverrideSource = Extract<TipDateSource, 'manual' | 'csv' | 'missing'>;

export interface ProjectDateOverride {
  nodeId: string;
  taxon: string;
  parsedSubstring: string;
  decimalYear: number | null;
  format: TipDateFormat;
  source: ProjectDateOverrideSource;
}

type SerializeStyle = Omit<ProjectStyle, 'showBranches' | 'arcWidth' | 'showTips'> &
  Partial<Pick<ProjectStyle, 'showBranches' | 'arcWidth' | 'showTips'>>;

type SerializeTimeline = Omit<ProjectTimeline, 'windowSize' | 'subtreeRootIds'> &
  Partial<Pick<ProjectTimeline, 'windowSize' | 'subtreeRootIds'>>;

export interface ProjectFile {
  version: ProjectFileVersion;
  treeSourceRef: ProjectTreeSourceRef | null;
  timeline: ProjectTimeline;
  selection: ProjectSelection;
  filters: ProjectFilters;
  panels: ProjectPanels;
  style: ProjectStyle;
  environment: ProjectEnvironment;
  dateOverrides: ProjectDateOverride[];
  // Processed source data (coordinate lookup, BSSVS log) so a shared project is
  // self-contained and doesn't re-prompt on import. Optional / additive.
  embedded?: EmbeddedData;
}

export interface SerializeInput {
  treeSourceRef: ProjectTreeSourceRef | null;
  timeline: SerializeTimeline;
  selection: ProjectSelection;
  filters?: ProjectFilters;
  panels: ProjectPanels;
  style: SerializeStyle;
  environment?: ProjectEnvironment;
  dateOverrides?: ProjectDateOverride[];
  rawTreeText?: string;
  embedded?: EmbeddedData | null;
}

export function serializeProject(input: SerializeInput): ProjectFile {
  return {
    version: PROJECT_FILE_VERSION,
    treeSourceRef: input.treeSourceRef,
    timeline: normalizeTimeline(input.timeline),
    selection: input.selection,
    filters: normalizeFilters(input.filters),
    panels: input.panels,
    style: normalizeStyle(input.style),
    environment: normalizeEnvironment(input.environment),
    dateOverrides: normalizeDateOverrides(input.dateOverrides),
    ...(input.embedded ? { embedded: input.embedded } : {}),
  };
}

export async function serializeProjectFile(input: SerializeInput): Promise<ProjectFile> {
  const base = serializeProject(input);
  if (base.treeSourceRef && !base.treeSourceRef.exampleId && input.rawTreeText) {
    const compressed = await gzipText(input.rawTreeText);
    return {
      ...base,
      treeSourceRef: { ...base.treeSourceRef, embeddedTree: compressed },
    };
  }
  return base;
}

export async function extractEmbeddedTree(ref: ProjectTreeSourceRef): Promise<string | null> {
  if (!ref.embeddedTree) return null;
  try {
    return await ungzipText(ref.embeddedTree, {
      maxOutputBytes: INPUT_LIMITS.treeBytes,
      label: 'Embedded tree',
    });
  } catch {
    return null;
  }
}

export type ApplyProjectResult = {
  treeSourceRef: ProjectTreeSourceRef | null;
  timeline: ProjectTimeline;
  selection: ProjectSelection;
  filters: ProjectFilters;
  panels: ProjectPanels;
  style: ProjectStyle;
  environment: ProjectEnvironment;
  dateOverrides: ProjectDateOverride[];
};

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFileError';
  }
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function projectLimit(action: () => void): void {
  try {
    action();
  } catch (error) {
    if (error instanceof InputLimitError) throw new ProjectFileError(error.message);
    throw error;
  }
}

function boundedProjectArray<T>(
  value: unknown,
  label: string,
  predicate: (entry: unknown) => entry is T,
  maximum = INPUT_LIMITS.projectCollectionEntries,
): T[] {
  if (!Array.isArray(value) || !value.every(predicate)) {
    throw new ProjectFileError(`${label} must be an array with valid entries`);
  }
  if (value.length > maximum) {
    throw new ProjectFileError(`${label} may contain at most ${maximum.toLocaleString()} entries`);
  }
  return value;
}

function isNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return isNumber(value) && value >= minimum && value <= maximum;
}

function projectBasename(value: string): string {
  const basename = value.split(/[/\\]/).pop() ?? '';
  if (basename.length === 0 || basename.length > 255) {
    throw new ProjectFileError(
      'treeSourceRef.fileName must be a basename of at most 255 characters',
    );
  }
  return basename;
}

const DEFAULT_PROJECT_VISIBLE_VIEWS: VisibleViews = {
  tree: true,
  map: true,
  analysis: true,
};

const DEFAULT_PROJECT_FILTERS: ProjectFilters = {
  focusedTaxa: [],
  deselectedValues: [],
  posteriorThreshold: 0,
};

const DEFAULT_PROJECT_ENVIRONMENT: ProjectEnvironment = {
  activeKey: null,
  paletteOverride: {},
};

function validateVersion(raw: Record<string, unknown>): void {
  if (raw['version'] !== PROJECT_FILE_VERSION) {
    throw new ProjectFileError(
      `Unsupported project file version: ${raw['version']}. Expected ${PROJECT_FILE_VERSION}.`,
    );
  }
}

function validateTreeSourceRef(raw: unknown): ProjectTreeSourceRef | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) throw new ProjectFileError('treeSourceRef must be an object or null');
  const fileName = raw['fileName'];
  if (!isString(fileName)) throw new ProjectFileError('treeSourceRef.fileName must be a string');
  const exampleId = raw['exampleId'];
  if (exampleId !== null && exampleId !== undefined && !isString(exampleId)) {
    throw new ProjectFileError('treeSourceRef.exampleId must be a string or null');
  }
  const confirmedTraitKey = raw['confirmedTraitKey'];
  if (confirmedTraitKey !== null && !isString(confirmedTraitKey)) {
    throw new ProjectFileError('treeSourceRef.confirmedTraitKey must be a string or null');
  }
  const confirmedTipDatePattern = raw['confirmedTipDatePattern'];
  if (confirmedTipDatePattern !== null && !isString(confirmedTipDatePattern)) {
    throw new ProjectFileError('treeSourceRef.confirmedTipDatePattern must be a string or null');
  }
  const embeddedTree = raw['embeddedTree'];
  if (embeddedTree !== null && embeddedTree !== undefined && !isString(embeddedTree)) {
    throw new ProjectFileError('treeSourceRef.embeddedTree must be a string or absent');
  }
  return {
    fileName: projectBasename(fileName),
    exampleId: isString(exampleId) ? exampleId : null,
    confirmedTraitKey: isString(confirmedTraitKey) ? confirmedTraitKey : null,
    confirmedTipDatePattern: isString(confirmedTipDatePattern) ? confirmedTipDatePattern : null,
    ...(isString(embeddedTree) ? { embeddedTree } : {}),
  };
}

function normalizeTimeline(timeline: SerializeTimeline): ProjectTimeline {
  const subtreeRootIds =
    timeline.subtreeRootIds ?? (timeline.subtreeRootId ? [timeline.subtreeRootId] : []);
  return {
    ...timeline,
    subtreeRootIds,
    subtreeRootId: subtreeRootIds[0] ?? timeline.subtreeRootId,
    windowSize:
      timeline.windowSize ?? (timeline.window ? timeline.window.end - timeline.window.start : null),
  };
}

function validateTimeline(raw: unknown): ProjectTimeline {
  if (!isRecord(raw)) throw new ProjectFileError('timeline must be an object');
  const playhead = raw['playhead'];
  if (!isNumberInRange(playhead, -1_000_000, 1_000_000)) {
    throw new ProjectFileError('timeline.playhead is outside the supported range');
  }
  const speed = raw['speed'];
  if (!isNumberInRange(speed, 0.01, 100)) {
    throw new ProjectFileError('timeline.speed must be between 0.01 and 100');
  }
  const mode = raw['mode'];
  if (mode !== 'Trail' && mode !== 'Window') {
    throw new ProjectFileError('timeline.mode must be "Trail" or "Window"');
  }
  const arcs = raw['arcs'];
  if (!isBoolean(arcs)) throw new ProjectFileError('timeline.arcs must be a boolean');
  const clade = raw['clade'];
  if (!isBoolean(clade)) throw new ProjectFileError('timeline.clade must be a boolean');
  const subtreeRootIdsRaw = raw['subtreeRootIds'];
  if (
    subtreeRootIdsRaw !== undefined &&
    (!Array.isArray(subtreeRootIdsRaw) ||
      subtreeRootIdsRaw.length > INPUT_LIMITS.projectCollectionEntries ||
      !subtreeRootIdsRaw.every(isString))
  ) {
    throw new ProjectFileError('timeline.subtreeRootIds must be an array of strings');
  }
  const subtreeRootId = raw['subtreeRootId'];
  if (subtreeRootId !== null && subtreeRootId !== undefined && !isString(subtreeRootId)) {
    throw new ProjectFileError('timeline.subtreeRootId must be a string or null');
  }
  const subtreeRootIds =
    subtreeRootIdsRaw !== undefined
      ? subtreeRootIdsRaw
      : isString(subtreeRootId)
        ? [subtreeRootId]
        : [];

  let window: TimeWindow | null = null;
  const rawWindow = raw['window'];
  if (rawWindow !== null && rawWindow !== undefined) {
    if (!isRecord(rawWindow))
      throw new ProjectFileError('timeline.window must be an object or null');
    const start = rawWindow['start'];
    const end = rawWindow['end'];
    if (
      !isNumberInRange(start, -1_000_000, 1_000_000) ||
      !isNumberInRange(end, -1_000_000, 1_000_000) ||
      start > end
    ) {
      throw new ProjectFileError('timeline.window must be an ordered, supported date range');
    }
    window = { start, end };
  }

  const rawWindowSize = raw['windowSize'];
  let windowSize: number | null = null;
  if (rawWindowSize !== null && rawWindowSize !== undefined) {
    if (!isNumberInRange(rawWindowSize, 0, 2_000_000)) {
      throw new ProjectFileError('timeline.windowSize is outside the supported range');
    }
    windowSize = rawWindowSize;
  } else if (window) {
    windowSize = window.end - window.start;
  }

  return {
    playhead,
    window,
    windowSize,
    speed,
    mode,
    arcs,
    clade,
    subtreeRootIds,
    subtreeRootId: subtreeRootIds[0] ?? null,
  };
}

function validateSelection(raw: unknown): ProjectSelection {
  if (!isRecord(raw)) throw new ProjectFileError('selection must be an object');
  const selectedIds = raw['selectedIds'];
  const validSelectedIds = boundedProjectArray(selectedIds, 'selection.selectedIds', isString);
  const selectedBranchIds = raw['selectedBranchIds'];
  const validSelectedBranchIds = boundedProjectArray(
    selectedBranchIds,
    'selection.selectedBranchIds',
    (entry): entry is number => Number.isSafeInteger(entry) && Number(entry) >= 0,
  );
  return { selectedIds: validSelectedIds, selectedBranchIds: validSelectedBranchIds };
}

function normalizeFilters(filters: ProjectFilters | undefined): ProjectFilters {
  if (!filters) return { ...DEFAULT_PROJECT_FILTERS };
  return {
    focusedTaxa: [...filters.focusedTaxa],
    deselectedValues: [...filters.deselectedValues],
    posteriorThreshold: filters.posteriorThreshold,
  };
}

function validateFilters(raw: unknown): ProjectFilters {
  if (raw === undefined) return { ...DEFAULT_PROJECT_FILTERS };
  if (!isRecord(raw)) throw new ProjectFileError('filters must be an object');

  const focusedTaxa = raw['focusedTaxa'];
  const validFocusedTaxa =
    focusedTaxa === undefined
      ? []
      : boundedProjectArray(focusedTaxa, 'filters.focusedTaxa', isString);

  const deselectedValues = raw['deselectedValues'];
  const validDeselectedValues =
    deselectedValues === undefined
      ? []
      : boundedProjectArray(deselectedValues, 'filters.deselectedValues', isString);

  const posteriorThreshold = raw['posteriorThreshold'];
  if (posteriorThreshold !== undefined && !isNumberInRange(posteriorThreshold, 0, 1)) {
    throw new ProjectFileError('filters.posteriorThreshold must be between 0 and 1');
  }

  return {
    focusedTaxa: validFocusedTaxa,
    deselectedValues: validDeselectedValues,
    posteriorThreshold: posteriorThreshold === undefined ? 0 : posteriorThreshold,
  };
}

const VALID_PANELS: ActivePanel[] = [
  'style',
  'layers',
  'filter',
  'locations',
  'dates',
  'export',
  'settings',
  null,
];

function validatePanels(raw: unknown): ProjectPanels {
  if (!isRecord(raw)) throw new ProjectFileError('panels must be an object');
  // Legacy: the 'dta' drawer became an Analysis-panel tab; coerce old saved
  // values to null so pre-existing project files still load.
  const activePanel = raw['activePanel'] === 'dta' ? null : raw['activePanel'];
  if (!VALID_PANELS.includes(activePanel as ActivePanel)) {
    throw new ProjectFileError(`panels.activePanel has invalid value: ${String(activePanel)}`);
  }
  const rawVisibleViews = raw['visibleViews'];
  let visibleViews = DEFAULT_PROJECT_VISIBLE_VIEWS;
  if (rawVisibleViews !== undefined) {
    if (!isRecord(rawVisibleViews)) {
      throw new ProjectFileError('panels.visibleViews must be an object');
    }
    const tree = rawVisibleViews['tree'];
    const map = rawVisibleViews['map'];
    const analysis = rawVisibleViews['analysis'];
    if (!isBoolean(tree) || !isBoolean(map) || !isBoolean(analysis)) {
      throw new ProjectFileError('panels.visibleViews must contain tree/map/analysis booleans');
    }
    if (!tree && !map && !analysis) {
      throw new ProjectFileError('panels.visibleViews must keep at least one view visible');
    }
    visibleViews = { tree, map, analysis };
  }
  const layerVisibility = raw['layerVisibility'];
  if (
    !isRecord(layerVisibility) ||
    Object.keys(layerVisibility).length > INPUT_LIMITS.projectLayerEntries ||
    !Object.values(layerVisibility).every(isBoolean)
  ) {
    throw new ProjectFileError('panels.layerVisibility must be a record of booleans');
  }
  const layerOpacity = raw['layerOpacity'];
  if (
    !isRecord(layerOpacity) ||
    Object.keys(layerOpacity).length > INPUT_LIMITS.projectLayerEntries ||
    !Object.values(layerOpacity).every((value) => isNumberInRange(value, 0, 100))
  ) {
    throw new ProjectFileError('panels.layerOpacity must be a record of numbers');
  }
  return {
    activePanel: activePanel as ActivePanel,
    visibleViews,
    layerVisibility: layerVisibility as Record<string, boolean>,
    layerOpacity: layerOpacity as Record<string, number>,
  };
}

const VALID_PALETTES: Palette[] = [
  ...STYLE_QUALITATIVE_PALETTES.map((p) => p.id),
  ...STYLE_QUANTITATIVE_PALETTES.map((p) => p.id),
];
const VALID_SORT_ORDERS: TreeSortOrder[] = ['file', 'asc', 'desc'];
const VALID_THEMES: Theme[] = ['dark', 'light', 'system'];
const VALID_ENV_PALETTES = new Set<string>(['auto', ...ENV_PALETTES.map((p) => p.id)]);

function normalizeStyle(raw: SerializeStyle): ProjectStyle {
  return {
    ...raw,
    showBranches: raw.showBranches ?? true,
    arcWidth: raw.arcWidth ?? 20,
    showTips: raw.showTips ?? true,
  };
}

function validateStyle(raw: unknown): ProjectStyle {
  if (!isRecord(raw)) throw new ProjectFileError('style must be an object');

  const colorByKey = raw['colorByKey'];
  if (!isString(colorByKey)) throw new ProjectFileError('style.colorByKey must be a string');

  const glyphByKey = raw['glyphByKey'];
  if (!isString(glyphByKey)) throw new ProjectFileError('style.glyphByKey must be a string');

  const palette = raw['palette'];
  if (!VALID_PALETTES.includes(palette as Palette)) {
    throw new ProjectFileError(`style.palette has invalid value: ${String(palette)}`);
  }

  const paletteReverse = raw['paletteReverse'];
  if (!isBoolean(paletteReverse))
    throw new ProjectFileError('style.paletteReverse must be a boolean');

  const showBranches = raw['showBranches'];
  if (showBranches !== undefined && !isBoolean(showBranches)) {
    throw new ProjectFileError('style.showBranches must be a boolean');
  }

  const branchWidth = raw['branchWidth'];
  if (!isNumberInRange(branchWidth, 0.1, 100)) {
    throw new ProjectFileError('style.branchWidth must be between 0.1 and 100');
  }

  const arcWidth = raw['arcWidth'];
  if (arcWidth !== undefined && !isNumberInRange(arcWidth, 0.1, 1_000)) {
    throw new ProjectFileError('style.arcWidth must be between 0.1 and 1000');
  }

  const showTips = raw['showTips'];
  if (showTips !== undefined && !isBoolean(showTips)) {
    throw new ProjectFileError('style.showTips must be a boolean');
  }

  const tipRadius = raw['tipRadius'];
  if (!isNumberInRange(tipRadius, 0.1, 100)) {
    throw new ProjectFileError('style.tipRadius must be between 0.1 and 100');
  }

  const rawTreeOpacity = raw['treeOpacity'] ?? raw['mapOpacity'];
  if (!isNumberInRange(rawTreeOpacity, 0, 100)) {
    throw new ProjectFileError('style.treeOpacity must be between 0 and 100');
  }

  const treeSortOrder = raw['treeSortOrder'];
  if (!VALID_SORT_ORDERS.includes(treeSortOrder as TreeSortOrder)) {
    throw new ProjectFileError(`style.treeSortOrder has invalid value: ${String(treeSortOrder)}`);
  }

  const theme = raw['theme'];
  if (!VALID_THEMES.includes(theme as Theme)) {
    throw new ProjectFileError(`style.theme has invalid value: ${String(theme)}`);
  }

  return {
    colorByKey,
    glyphByKey,
    palette: palette as Palette,
    paletteReverse,
    showBranches: showBranches === undefined ? true : showBranches,
    branchWidth,
    arcWidth: arcWidth === undefined ? 20 : arcWidth,
    showTips: showTips === undefined ? true : showTips,
    tipRadius,
    treeOpacity: rawTreeOpacity,
    treeSortOrder: treeSortOrder as TreeSortOrder,
    theme: theme as Theme,
  };
}

function normalizeEnvironment(environment: ProjectEnvironment | undefined): ProjectEnvironment {
  if (!environment) return { ...DEFAULT_PROJECT_ENVIRONMENT };
  return {
    activeKey: environment.activeKey,
    paletteOverride: { ...environment.paletteOverride },
  };
}

function validateEnvironment(raw: unknown): ProjectEnvironment {
  if (raw === undefined) return { ...DEFAULT_PROJECT_ENVIRONMENT };
  if (!isRecord(raw)) throw new ProjectFileError('environment must be an object');

  const activeKey = raw['activeKey'];
  if (activeKey !== null && activeKey !== undefined && !isString(activeKey)) {
    throw new ProjectFileError('environment.activeKey must be a string or null');
  }

  const paletteOverride = raw['paletteOverride'];
  if (!isRecord(paletteOverride)) {
    throw new ProjectFileError('environment.paletteOverride must be an object');
  }
  if (Object.keys(paletteOverride).length > INPUT_LIMITS.projectLayerEntries) {
    throw new ProjectFileError('environment.paletteOverride contains too many entries');
  }
  for (const value of Object.values(paletteOverride)) {
    if (!isString(value) || !VALID_ENV_PALETTES.has(value)) {
      throw new ProjectFileError('environment.paletteOverride has an invalid palette');
    }
  }

  return {
    activeKey: isString(activeKey) ? activeKey : null,
    paletteOverride: paletteOverride as Record<string, EnvPaletteId | 'auto'>,
  };
}

const VALID_TIP_DATE_FORMATS = new Set<TipDateFormat>([
  'iso-pipe',
  'day-month-year',
  'year-pipe',
  'decimal-underscore',
  'decimal-year-underscore',
  'year-month-slash',
  'year-only',
  'ambiguous',
  'iso-date',
  'year-month',
  'decimal-year',
  'unknown',
]);

const VALID_DATE_OVERRIDE_SOURCES = new Set<ProjectDateOverrideSource>([
  'manual',
  'csv',
  'missing',
]);

function normalizeDateOverrides(
  overrides: ProjectDateOverride[] | undefined,
): ProjectDateOverride[] {
  if (!overrides) return [];
  return overrides.map((override) => ({ ...override }));
}

function validateDateOverrides(raw: unknown): ProjectDateOverride[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new ProjectFileError('dateOverrides must be an array');
  if (raw.length > INPUT_LIMITS.projectCollectionEntries) {
    throw new ProjectFileError('dateOverrides contains too many entries');
  }

  return raw.map((entry, index) => {
    if (!isRecord(entry)) throw new ProjectFileError(`dateOverrides[${index}] must be an object`);

    const nodeId = entry['nodeId'];
    if (!isString(nodeId)) {
      throw new ProjectFileError(`dateOverrides[${index}].nodeId must be a string`);
    }

    const taxon = entry['taxon'];
    if (!isString(taxon)) {
      throw new ProjectFileError(`dateOverrides[${index}].taxon must be a string`);
    }

    const parsedSubstring = entry['parsedSubstring'];
    if (!isString(parsedSubstring)) {
      throw new ProjectFileError(`dateOverrides[${index}].parsedSubstring must be a string`);
    }

    const decimalYear = entry['decimalYear'];
    if (decimalYear !== null && !isNumber(decimalYear)) {
      throw new ProjectFileError(`dateOverrides[${index}].decimalYear must be a number or null`);
    }

    const format = entry['format'];
    if (!isString(format) || !VALID_TIP_DATE_FORMATS.has(format as TipDateFormat)) {
      throw new ProjectFileError(`dateOverrides[${index}].format has invalid value`);
    }

    const source = entry['source'];
    if (
      !isString(source) ||
      !VALID_DATE_OVERRIDE_SOURCES.has(source as ProjectDateOverrideSource)
    ) {
      throw new ProjectFileError(`dateOverrides[${index}].source has invalid value`);
    }

    return {
      nodeId,
      taxon,
      parsedSubstring,
      decimalYear,
      format: format as TipDateFormat,
      source: source as ProjectDateOverrideSource,
    };
  });
}

export function applyProject(file: ProjectFile): ApplyProjectResult {
  return {
    treeSourceRef: file.treeSourceRef,
    timeline: file.timeline,
    selection: file.selection,
    filters: file.filters,
    panels: file.panels,
    style: file.style,
    environment: file.environment,
    dateOverrides: file.dateOverrides,
  };
}

const GEO_SOURCES: GeoSource[] = ['gazetteer', 'csv', 'manual'];

function isStringNumberPair(e: unknown): e is [string, number] {
  return Array.isArray(e) && e.length === 2 && isString(e[0]) && isNumber(e[1]);
}

// Lenient validation of the embedded map layers; each malformed layer is
// dropped rather than failing the load.
function validateEmbeddedLayers(raw: unknown): EmbeddedLayers | undefined {
  if (!isRecord(raw)) return undefined;
  const out: EmbeddedLayers = {};

  const boundaries = raw['boundaries'];
  if (Array.isArray(boundaries)) {
    if (boundaries.length > INPUT_LIMITS.projectLayerEntries) {
      throw new ProjectFileError('embedded.layers.boundaries contains too many entries');
    }
    const valid = boundaries.filter(
      (b): b is EmbeddedBoundary =>
        isRecord(b) && isString(b['id']) && isString(b['name']) && isString(b['dataGz']),
    );
    if (valid.length > 0) out.boundaries = valid;
  }

  const choropleths = raw['choropleths'];
  if (Array.isArray(choropleths)) {
    if (choropleths.length > INPUT_LIMITS.projectLayerEntries) {
      throw new ProjectFileError('embedded.layers.choropleths contains too many entries');
    }
    const valid = choropleths.filter(
      (c): c is EmbeddedChoropleth =>
        isRecord(c) &&
        isString(c['id']) &&
        isString(c['name']) &&
        isString(c['dataGz']) &&
        isString(c['valueColumn']) &&
        isString(c['locationCol']) &&
        Array.isArray(c['valueByLocation']) &&
        c['valueByLocation'].length <= INPUT_LIMITS.projectCollectionEntries &&
        c['valueByLocation'].every(isStringNumberPair),
    );
    if (valid.length > 0) out.choropleths = valid;
  }

  const envColumns = raw['envColumns'];
  if (Array.isArray(envColumns)) {
    if (envColumns.length > INPUT_LIMITS.projectLayerEntries) {
      throw new ProjectFileError('embedded.layers.envColumns contains too many entries');
    }
    const valid = envColumns.filter(
      (c): c is EmbeddedEnvColumn =>
        isRecord(c) &&
        isString(c['key']) &&
        isString(c['displayName']) &&
        (c['units'] === null || isString(c['units'])) &&
        Array.isArray(c['values']) &&
        c['values'].length <= INPUT_LIMITS.projectCollectionEntries &&
        c['values'].every(isStringNumberPair),
    );
    if (valid.length > 0) out.envColumns = valid;
  }

  const raster = raw['raster'];
  if (
    isRecord(raster) &&
    isNumber(raster['width']) &&
    isNumber(raster['height']) &&
    Array.isArray(raster['bounds']) &&
    raster['bounds'].length === 4 &&
    raster['bounds'].every(isNumber) &&
    isString(raster['dataGz'])
  ) {
    projectLimit(() =>
      assertRasterDimensions(raster['width'] as number, raster['height'] as number),
    );
    out.raster = {
      width: raster['width'],
      height: raster['height'],
      bounds: raster['bounds'] as [number, number, number, number],
      dataGz: raster['dataGz'],
    };
  }

  return out.boundaries || out.choropleths || out.envColumns || out.raster ? out : undefined;
}

// Lenient validation of the embedded blob: drop malformed pieces rather than
// failing the whole project load (the user can still re-load that source).
function validateEmbedded(raw: unknown): EmbeddedData | undefined {
  if (!isRecord(raw)) return undefined;
  const out: EmbeddedData = {};

  const geo = raw['geo'];
  if (isRecord(geo) && Array.isArray(geo['entries'])) {
    if (geo['entries'].length > INPUT_LIMITS.projectCollectionEntries) {
      throw new ProjectFileError('embedded.geo.entries contains too many entries');
    }
    const source = GEO_SOURCES.includes(geo['source'] as GeoSource)
      ? (geo['source'] as GeoSource)
      : 'csv';
    const entries = geo['entries'].filter(
      (e): e is [string, number, number] =>
        Array.isArray(e) &&
        e.length === 3 &&
        isString(e[0]) &&
        isNumberInRange(e[1], -90, 90) &&
        isNumberInRange(e[2], -180, 180),
    );
    if (entries.length > 0) out.geo = { source, entries };
  }

  const log = raw['log'];
  if (
    isRecord(log) &&
    isString(log['fileName']) &&
    Array.isArray(log['columnNames']) &&
    log['columnNames'].length > 0 &&
    log['columnNames'].length <= INPUT_LIMITS.logColumns &&
    log['columnNames'].every(isString) &&
    Number.isSafeInteger(log['rowCount']) &&
    Number(log['rowCount']) > 0 &&
    Number(log['rowCount']) <= INPUT_LIMITS.logRows &&
    Number(log['rowCount']) * log['columnNames'].length <= INPUT_LIMITS.logCells &&
    isString(log['columnsGz'])
  ) {
    out.log = {
      fileName: log['fileName'],
      columnNames: log['columnNames'] as string[],
      rowCount: Number(log['rowCount']),
      columnsGz: log['columnsGz'],
    };
  }

  const layers = validateEmbeddedLayers(raw['layers']);
  if (layers) out.layers = layers;

  return out.geo || out.log || out.layers ? out : undefined;
}

export function parseProjectFile(json: string): ProjectFile {
  projectLimit(() => assertTextSize('project', json));
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ProjectFileError('Invalid JSON in project file');
  }

  if (!isRecord(raw)) throw new ProjectFileError('Project file must be a JSON object');

  validateVersion(raw);

  const embedded = validateEmbedded(raw['embedded']);

  return {
    version: PROJECT_FILE_VERSION,
    treeSourceRef: validateTreeSourceRef(raw['treeSourceRef']),
    timeline: validateTimeline(raw['timeline']),
    selection: validateSelection(raw['selection']),
    filters: validateFilters(raw['filters']),
    panels: validatePanels(raw['panels']),
    style: validateStyle(raw['style']),
    environment: validateEnvironment(raw['environment']),
    dateOverrides: validateDateOverrides(raw['dateOverrides']),
    ...(embedded ? { embedded } : {}),
  };
}
