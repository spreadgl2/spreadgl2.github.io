export type EnvPaletteId = 'viridis' | 'plasma' | 'magma' | 'blues' | 'reds' | 'cool-warm';

export const ENV_PALETTES: { id: EnvPaletteId; label: string; type: 'sequential' | 'diverging' }[] =
  [
    { id: 'viridis', label: 'Viridis', type: 'sequential' },
    { id: 'plasma', label: 'Plasma', type: 'sequential' },
    { id: 'magma', label: 'Magma', type: 'sequential' },
    { id: 'blues', label: 'Blues', type: 'sequential' },
    { id: 'reds', label: 'Reds', type: 'sequential' },
    { id: 'cool-warm', label: 'Cool→Warm', type: 'diverging' },
  ];

export function suggestPaletteForVariable(displayName: string): EnvPaletteId {
  const n = displayName.toLowerCase();
  if (/temp/.test(n)) return 'cool-warm';
  if (/humid|precip|rainfall|moisture/.test(n)) return 'blues';
  if (/elev|altitude|height/.test(n)) return 'viridis';
  if (/ndvi|veget|forest|chl/.test(n)) return 'viridis';
  if (/popul|density|gdp/.test(n)) return 'reds';
  return 'viridis';
}

type RGBStop = [number, number, number];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateStops(stops: RGBStop[], t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  if (stops.length === 1) return stops[0] as [number, number, number];
  const segment = clamped * (stops.length - 1);
  const lo = Math.floor(segment);
  const hi = Math.min(lo + 1, stops.length - 1);
  const f = segment - lo;
  const a = stops[lo] as RGBStop;
  const b = stops[hi] as RGBStop;
  return [
    Math.round(lerp(a[0], b[0], f)),
    Math.round(lerp(a[1], b[1], f)),
    Math.round(lerp(a[2], b[2], f)),
  ];
}

const PALETTE_STOPS: Record<EnvPaletteId, RGBStop[]> = {
  viridis: [
    [68, 1, 84],
    [59, 82, 139],
    [33, 145, 140],
    [94, 201, 98],
    [253, 231, 37],
  ],
  plasma: [
    [13, 8, 135],
    [126, 3, 168],
    [204, 71, 120],
    [248, 149, 64],
    [240, 249, 33],
  ],
  magma: [
    [0, 0, 4],
    [81, 18, 124],
    [183, 55, 121],
    [252, 140, 99],
    [252, 253, 191],
  ],
  blues: [
    [247, 251, 255],
    [198, 219, 239],
    [107, 174, 214],
    [33, 113, 181],
    [8, 48, 107],
  ],
  reds: [
    [255, 245, 240],
    [252, 187, 161],
    [252, 106, 74],
    [203, 24, 29],
    [103, 0, 13],
  ],
  'cool-warm': [
    [59, 76, 192],
    [144, 178, 254],
    [221, 221, 221],
    [245, 154, 111],
    [180, 4, 38],
  ],
};

export function getPaletteColor(id: EnvPaletteId, t: number): [number, number, number] {
  const stops = PALETTE_STOPS[id];
  return interpolateStops(stops, t);
}

export function getPaletteCssGradient(id: EnvPaletteId): string {
  const stops = PALETTE_STOPS[id];
  const parts = stops.map((s, i) => {
    const pct = Math.round((i / (stops.length - 1)) * 100);
    return `rgb(${s[0]},${s[1]},${s[2]}) ${pct}%`;
  });
  return `linear-gradient(to right, ${parts.join(', ')})`;
}
