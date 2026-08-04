export interface FixtureMeta {
  id: string;
  label: string;
  tipCount: number;
  traitName: string;
  traitKind?: 'continuous' | 'discrete';
  dateSpan: [number, number];
  blurb: string;
  treePath: string;
  locationsPath?: string;
  boundariesPath?: string;
  environmentPath?: string;
}

export interface FixturesManifest {
  examples: FixtureMeta[];
}
