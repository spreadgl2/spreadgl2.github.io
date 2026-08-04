/**
 * Adapted from pearcore (MIT), Copyright (c) 2026 Andrew Rambaut.
 * Source: pearcore/pearcore/js/palettes.js:1-289 ("palette definitions and helpers")
 * https://github.com/rambaut/pearcore
 *
 * Adapted to strict TypeScript. The expanded palette catalogue and most application
 * helpers are SpreadGL2 additions; selected definitions and basic utilities remain.
 */

export const MISSING_DATA_COLOUR = '#aaaaaa';

export const STYLE_QUALITATIVE_PALETTES = [
  { id: 'okabe-ito', label: 'Okabe-Ito' },
  { id: 'seaborn-tab20', label: 'seaborn:tab20' },
  { id: 'glasbey-light', label: 'Glasbey Light' },
  { id: 'glasbey-dark', label: 'Glasbey Dark' },
  { id: 'tableau', label: 'Tableau' },
  { id: 'bold', label: 'Bold' },
  { id: 'solarized', label: 'Solarized' },
  { id: 'paired', label: 'Paired' },
] as const;

export const STYLE_QUANTITATIVE_PALETTES = [
  { id: 'viridis', label: 'Viridis' },
  { id: 'plasma', label: 'Plasma' },
  { id: 'magma', label: 'Magma' },
  { id: 'blues', label: 'Blues' },
  { id: 'reds', label: 'Reds' },
  { id: 'cool-warm', label: 'Cool→Warm' },
  { id: 'rd-bu', label: 'RdBu' },
] as const;

export type StyleQualitativePaletteId = (typeof STYLE_QUALITATIVE_PALETTES)[number]['id'];
export type StyleQuantitativePaletteId = (typeof STYLE_QUANTITATIVE_PALETTES)[number]['id'];
export type StylePaletteId = StyleQualitativePaletteId | StyleQuantitativePaletteId;
export type EffectivePaletteTheme = 'dark' | 'light';

export const HIGH_CARDINALITY_CATEGORY_THRESHOLD = 20;

const OKABE_ITO = [
  '#E69F00',
  '#56B4E9',
  '#009E73',
  '#F0E442',
  '#0072B2',
  '#D55E00',
  '#CC79A7',
  '#FFFFFF',
];

const SOLARIZED = [
  '#2aa198',
  '#cb4b16',
  '#268bd2',
  '#d33682',
  '#6c71c4',
  '#b58900',
  '#859900',
  '#dc322f',
];

const BOLD = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#bfef45',
  '#fabed4',
  '#469990',
];

const TABLEAU = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ac',
];

const SEABORN_TAB20 = [
  '#4c72b0',
  '#aec7e8',
  '#dd8452',
  '#ffbb78',
  '#55a868',
  '#98df8a',
  '#c44e52',
  '#ff9896',
  '#8172b3',
  '#c5b0d5',
  '#937860',
  '#c49c94',
  '#da8bc3',
  '#f7b6d2',
  '#8c8c8c',
  '#c7c7c7',
  '#bcbd22',
  '#dbdb8d',
  '#17becf',
  '#9edae5',
];

// Colorcet 3.2.1 Glasbey aliases, first 64 Bokeh hex colors:
// glasbey_light = glasbey_bw_minc_20_minl_30, intended for dark backgrounds.
// glasbey_dark = glasbey_bw_minc_20_maxl_70, intended for light backgrounds.
const GLASBEY_LIGHT = [
  '#d60000',
  '#018700',
  '#b500ff',
  '#05acc6',
  '#97ff00',
  '#ffa52f',
  '#ff8ec8',
  '#79525e',
  '#00fdcf',
  '#afa5ff',
  '#93ac83',
  '#9a6900',
  '#366962',
  '#d3008c',
  '#fdf490',
  '#c86e66',
  '#9ee2ff',
  '#00c846',
  '#a877ac',
  '#b8ba01',
  '#f4bfb1',
  '#ff28fd',
  '#f2cdff',
  '#009e7c',
  '#ff6200',
  '#56642a',
  '#953f1f',
  '#90318e',
  '#ff3464',
  '#a0e491',
  '#8c9ab1',
  '#829026',
  '#ae083f',
  '#77c6ba',
  '#bc9157',
  '#e48eff',
  '#72b8ff',
  '#c6a5c1',
  '#ff9070',
  '#d3c37c',
  '#bceddb',
  '#6b8567',
  '#916e56',
  '#f9ff00',
  '#bac1df',
  '#ac567c',
  '#ffcd03',
  '#ff49b1',
  '#c15603',
  '#5d8c90',
  '#c144bc',
  '#00753f',
  '#ba6efd',
  '#00d493',
  '#00ff75',
  '#49a150',
  '#cc9790',
  '#00ebed',
  '#db7e01',
  '#f77589',
  '#b89500',
  '#c84248',
  '#00cff9',
  '#755726',
];

const GLASBEY_DARK = [
  '#d60000',
  '#8c3bff',
  '#018700',
  '#00acc6',
  '#e6a500',
  '#ff7ed1',
  '#6b004f',
  '#573b00',
  '#005659',
  '#15e18c',
  '#0000dd',
  '#a17569',
  '#bcb6ff',
  '#bf03b8',
  '#645472',
  '#790000',
  '#0774d8',
  '#729a7c',
  '#ff7752',
  '#004b00',
  '#8e7b01',
  '#f2007b',
  '#8eba00',
  '#a57bb8',
  '#5901a3',
  '#e2afaf',
  '#a03a52',
  '#a1c8c8',
  '#9e4b00',
  '#546744',
  '#bac389',
  '#5e7b87',
  '#60383b',
  '#8287ff',
  '#380000',
  '#e252ff',
  '#2f5282',
  '#7ecaff',
  '#c4668e',
  '#008069',
  '#919eb6',
  '#cc7407',
  '#7e2a8e',
  '#00bda3',
  '#2db152',
  '#4d33ff',
  '#00e400',
  '#ff00cd',
  '#c85748',
  '#e49cff',
  '#1ca1ff',
  '#6e70aa',
  '#c89a69',
  '#77563b',
  '#03dae6',
  '#c1a3c3',
  '#ff6989',
  '#ba00fd',
  '#915280',
  '#9e0174',
  '#93a14f',
  '#364424',
  '#af6dff',
  '#596d00',
];

const PAIRED = [
  '#a6cee3',
  '#1f78b4',
  '#b2df8a',
  '#33a02c',
  '#fb9a99',
  '#e31a1c',
  '#fdbf6f',
  '#ff7f00',
  '#cab2d6',
  '#6a3d9a',
  '#ffff99',
  '#b15928',
];

export const CATEGORICAL_PALETTE_STOPS: Record<StyleQualitativePaletteId, string[]> = {
  // Okabe-Ito's 8th color is black — invisible against the dark basemap, so
  // replace with white for the SpreadGL2 dark theme.
  'okabe-ito': OKABE_ITO,
  'seaborn-tab20': SEABORN_TAB20,
  'glasbey-light': GLASBEY_LIGHT,
  'glasbey-dark': GLASBEY_DARK,
  tableau: TABLEAU,
  bold: BOLD,
  solarized: SOLARIZED,
  paired: PAIRED,
};

export const CATEGORICAL_PALETTES: Record<string, string[]> = {
  'Okabe-Ito': OKABE_ITO,
  'seaborn:tab20': SEABORN_TAB20,
  'Glasbey Light': GLASBEY_LIGHT,
  'Glasbey Dark': GLASBEY_DARK,
  Tableau: TABLEAU,
  Bold: BOLD,
  Solarized: SOLARIZED,
  Paired: PAIRED,
};

export const SEQUENTIAL_PALETTES: Record<string, string[]> = {
  Viridis: [
    '#440154',
    '#482878',
    '#3e4989',
    '#31688e',
    '#26828e',
    '#1f9e89',
    '#35b779',
    '#6ece58',
    '#b5de2b',
    '#fde725',
  ],

  Plasma: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'],

  Magma: ['#000004', '#51127c', '#b73779', '#fc8c63', '#fcfdbf'],

  Blues: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'],

  Reds: ['#fff5f0', '#fcbba1', '#fc6a4a', '#cb181d', '#67000d'],

  'Cool-Warm': ['#3b4cc0', '#90b2fe', '#dddddd', '#f59a6f', '#b40426'],

  RdBu: [
    '#2166ac',
    '#4393c3',
    '#92c5de',
    '#d1e5f0',
    '#f7f7f7',
    '#fddbc7',
    '#f4a582',
    '#d6604d',
    '#b2182b',
  ],

  'Teal-Red': ['#2aa198', '#dc322f'],

  Inferno: ['#000004', '#fcffa4'],

  Greyscale: ['#f5f5f5', '#111111'],
};

export const SEQUENTIAL_PALETTE_STOPS: Record<StyleQuantitativePaletteId, string[]> = {
  viridis: SEQUENTIAL_PALETTES.Viridis as string[],
  plasma: SEQUENTIAL_PALETTES.Plasma as string[],
  magma: SEQUENTIAL_PALETTES.Magma as string[],
  blues: SEQUENTIAL_PALETTES.Blues as string[],
  reds: SEQUENTIAL_PALETTES.Reds as string[],
  'cool-warm': SEQUENTIAL_PALETTES['Cool-Warm'] as string[],
  'rd-bu': SEQUENTIAL_PALETTES.RdBu as string[],
};

export const DEFAULT_CATEGORICAL_PALETTE = 'Okabe-Ito';

export const DEFAULT_SEQUENTIAL_PALETTE = 'Viridis';

const _OKABE_ITO = CATEGORICAL_PALETTE_STOPS['okabe-ito'];
const _VIRIDIS = SEQUENTIAL_PALETTES[DEFAULT_SEQUENTIAL_PALETTE] as string[];

export function isQualitativePaletteId(
  palette: StylePaletteId,
): palette is StyleQualitativePaletteId {
  return palette in CATEGORICAL_PALETTE_STOPS;
}

export function isGlasbeyPalette(palette: StylePaletteId): boolean {
  return palette === 'glasbey-light' || palette === 'glasbey-dark';
}

export function categoricalPaletteSize(palette: StylePaletteId): number | null {
  return CATEGORICAL_PALETTE_STOPS[palette as StyleQualitativePaletteId]?.length ?? null;
}

export function paletteRepeatsForCategoryCount(
  palette: StylePaletteId,
  categoryCount: number,
): boolean {
  const size = categoricalPaletteSize(palette);
  return size !== null && categoryCount > size;
}

export function suggestedCategoricalPaletteForCount(
  categoryCount: number,
  effectiveTheme: EffectivePaletteTheme,
): StyleQualitativePaletteId {
  if (categoryCount > HIGH_CARDINALITY_CATEGORY_THRESHOLD) {
    return effectiveTheme === 'dark' ? 'glasbey-light' : 'glasbey-dark';
  }
  if (categoryCount > _OKABE_ITO.length) return 'seaborn-tab20';
  return 'okabe-ito';
}

export function getCategoricalPalette(name?: string): string[] {
  return (
    CATEGORICAL_PALETTE_STOPS[name as StyleQualitativePaletteId] ??
    CATEGORICAL_PALETTES[name ?? DEFAULT_CATEGORICAL_PALETTE] ??
    _OKABE_ITO
  );
}

export function buildCategoricalColourMap(
  values: string[],
  paletteName?: string,
): Map<string, string> {
  const palette = getCategoricalPalette(paletteName);
  const n = values.length;
  const p = palette.length;
  const map = new Map<string, string>();
  values.forEach((v, i) => {
    const idx =
      paletteName === 'glasbey-light' || paletteName === 'glasbey-dark'
        ? i % p
        : n <= p
          ? Math.round((i * (p - 1)) / Math.max(n - 1, 1))
          : i % p;
    map.set(v, palette[idx] ?? MISSING_DATA_COLOUR);
  });
  return map;
}

export function getSequentialPalette(name?: string): string[] {
  return (
    SEQUENTIAL_PALETTE_STOPS[name as StyleQuantitativePaletteId] ??
    SEQUENTIAL_PALETTES[name ?? DEFAULT_SEQUENTIAL_PALETTE] ??
    _VIRIDIS
  );
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (hex.startsWith('#')) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(hex);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return { r: 0, g: 0, b: 0 };
}

/**
 * Lift each channel halfway toward 255. Used to derive a light "halo" color
 * for a trail's outline pass against a dark basemap — keeps the branch's
 * hue identity but raises luminance enough to read against dark tiles.
 *
 * Example: viridis low end `#440154` = RGB(68, 1, 84) → RGB(161, 128, 169) —
 * the same purple family but bright enough to outline against dark-matter.
 */
export function liftColorTowardWhite(
  rgb: [number, number, number, number],
  factor = 0.5,
): [number, number, number, number] {
  return [
    Math.round(255 - (255 - rgb[0]) * factor),
    Math.round(255 - (255 - rgb[1]) * factor),
    Math.round(255 - (255 - rgb[2]) * factor),
    rgb[3],
  ];
}

/**
 * Scale each channel down toward 0. Used to derive a dark "halo" color
 * for a trail's outline pass against a light basemap (CARTO Positron/Voyager,
 * OSM). Mirrors `liftColorTowardWhite` for the inverse contrast direction.
 */
export function darkenColorTowardBlack(
  rgb: [number, number, number, number],
  factor = 0.5,
): [number, number, number, number] {
  return [
    Math.round(rgb[0] * factor),
    Math.round(rgb[1] * factor),
    Math.round(rgb[2] * factor),
    rgb[3],
  ];
}

export function lerpSequential(t: number, stops: string[]): string {
  const tc = Math.max(0, Math.min(1, t));
  const n = stops.length;
  if (n === 0) return '#000000';
  if (n === 1) return stops[0] ?? '#000000';
  const scaled = tc * (n - 1);
  const lo = Math.min(Math.floor(scaled), n - 2);
  const lt = scaled - lo;
  const loC = hexToRgb(stops[lo] ?? '#000000');
  const hiC = hexToRgb(stops[lo + 1] ?? '#000000');
  const r = Math.round(loC.r + lt * (hiC.r - loC.r));
  const g = Math.round(loC.g + lt * (hiC.g - loC.g));
  const b = Math.round(loC.b + lt * (hiC.b - loC.b));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Map a value (categorical string or 0–1 numeric) to a hex color using the
 * specified palette key.
 * palette: qualitative or quantitative tree style palette id.
 * For categorical values, pass the ordered list of all values and the value's index.
 */
export function paletteColorFor(
  value: string | number,
  allValues: string[] | null,
  palette: StylePaletteId,
  reverse: boolean,
): string {
  const categoricalStops = CATEGORICAL_PALETTE_STOPS[palette as StyleQualitativePaletteId];
  if (categoricalStops) {
    const stops = reverse ? [...categoricalStops].reverse() : categoricalStops;
    if (typeof value === 'string' && allValues) {
      const idx = allValues.indexOf(value);
      if (idx < 0) return MISSING_DATA_COLOUR;
      const p = stops.length;
      const n = allValues.length;
      const i =
        palette === 'glasbey-light' || palette === 'glasbey-dark'
          ? idx % p
          : n <= p
            ? Math.round((idx * (p - 1)) / Math.max(n - 1, 1))
            : idx % p;
      return stops[i] ?? MISSING_DATA_COLOUR;
    }
    if (typeof value === 'number') {
      const i = Math.round(Math.max(0, Math.min(1, value)) * Math.max(stops.length - 1, 0));
      return stops[i] ?? MISSING_DATA_COLOUR;
    }
    return stops[0] ?? MISSING_DATA_COLOUR;
  }

  const stops = SEQUENTIAL_PALETTE_STOPS[palette as StyleQuantitativePaletteId] ?? _VIRIDIS;
  const ordered = reverse ? [...stops].reverse() : stops;

  const t =
    typeof value === 'number'
      ? value
      : allValues
        ? allValues.indexOf(value) / Math.max(allValues.length - 1, 1)
        : 0;

  return lerpSequential(t, ordered);
}
