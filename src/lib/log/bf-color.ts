import type { EvidenceLabel } from './bssvs';

// Kass & Raftery evidence bins for a Bayes factor > 1 (routes below 1 are not
// drawn). Colours are a warm sequential ramp — amber (weak) to crimson (very
// strong) — with deeper light-theme variants for contrast on the light basemap.
export type BfBin = 'weak' | 'positive' | 'strong' | 'very strong';

const DARK: Record<BfBin, [number, number, number]> = {
  weak: [250, 204, 21],
  positive: [251, 146, 60],
  strong: [239, 68, 68],
  'very strong': [225, 29, 72],
};

const LIGHT: Record<BfBin, [number, number, number]> = {
  weak: [202, 138, 4],
  positive: [234, 88, 12],
  strong: [220, 38, 38],
  'very strong': [159, 18, 57],
};

export function bfBinColor(bin: BfBin, dark: boolean): [number, number, number] {
  return (dark ? DARK : LIGHT)[bin];
}

// Colour for a route by its Kass & Raftery evidence label. 'no support' (BF < 1)
// is a muted grey and is not normally drawn.
export function bfColor(label: EvidenceLabel, dark: boolean): [number, number, number] {
  if (label === 'no support') return dark ? [120, 120, 120] : [150, 150, 150];
  return bfBinColor(label, dark);
}

export interface BfLegendEntry {
  bin: BfBin;
  label: string;
  range: string;
}

// Legend segments plus the boundary ticks 1 · 3 · 20 · 150 · ∞.
export const BF_LEGEND: BfLegendEntry[] = [
  { bin: 'weak', label: 'Weak', range: '1–3' },
  { bin: 'positive', label: 'Positive', range: '3–20' },
  { bin: 'strong', label: 'Strong', range: '20–150' },
  { bin: 'very strong', label: 'Very strong', range: '≥ 150' },
];

export const BF_LEGEND_TICKS = ['1', '3', '20', '150', '∞'];
