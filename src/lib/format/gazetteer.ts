type GazetteerKind = 'country' | 'admin1' | 'region';

interface GazetteerEntry {
  name: string;
  iso2: string;
  lat: number;
  lon: number;
  aliases: string[];
  kind?: GazetteerKind;
  countryIso2?: string;
  source?: string;
  sourceFeatureId?: string;
  pointMethod?: string;
}

interface GazetteerCandidate {
  iso2: string;
  coord: [number, number];
  kind: GazetteerKind;
  countryIso2: string;
}

interface GazetteerLookup {
  lookupGazetteer: (value: string) => [number, number] | null;
  matchGazetteer: (values: string[]) => Map<string, [number, number]>;
}

let gazetteerPromise: Promise<GazetteerLookup> | null = null;

const TRANSLITERATION = new Map<string, string>([
  ['Æ', 'AE'],
  ['æ', 'ae'],
  ['Œ', 'OE'],
  ['œ', 'oe'],
  ['Ø', 'O'],
  ['ø', 'o'],
  ['Ð', 'D'],
  ['ð', 'd'],
  ['Đ', 'D'],
  ['đ', 'd'],
  ['Þ', 'Th'],
  ['þ', 'th'],
  ['Ł', 'L'],
  ['ł', 'l'],
  ['Ŋ', 'N'],
  ['ŋ', 'n'],
  ['Ħ', 'H'],
  ['ħ', 'h'],
  ['Ə', 'E'],
  ['ə', 'e'],
  ['Ŧ', 'T'],
  ['ŧ', 't'],
  ['ß', 'ss'],
  ['ẞ', 'SS'],
  ['İ', 'I'],
  ['ı', 'i'],
  ['’', "'"],
  ['‘', "'"],
  ['ʼ', "'"],
  ['ʻ', "'"],
  ['ʿ', "'"],
  ['“', '"'],
  ['”', '"'],
  ['–', '-'],
  ['—', '-'],
  ['−', '-'],
]);

function transliterate(value: string): string {
  let out = '';
  for (const ch of value) out += TRANSLITERATION.get(ch) ?? ch;
  return out;
}

function exactLookupKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedLookupKey(value: string): string {
  return transliterate(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
}

function registerCandidate(
  target: Map<string, GazetteerCandidate[]>,
  key: string,
  candidate: GazetteerCandidate,
): void {
  if (key === '') return;
  const candidates = target.get(key) ?? [];
  if (!candidates.includes(candidate)) candidates.push(candidate);
  target.set(key, candidates);
}

function inferredKind(entry: GazetteerEntry): GazetteerKind {
  if (entry.kind) return entry.kind;
  if (!entry.iso2) return 'region';
  return entry.iso2.includes('-') ? 'admin1' : 'country';
}

function inferredCountryIso2(entry: GazetteerEntry, kind: GazetteerKind): string {
  if (entry.countryIso2) return entry.countryIso2;
  if (kind === 'country') return entry.iso2;
  const prefix = entry.iso2.split('-', 1)[0];
  return prefix ?? '';
}

function explicitAdmin1Country(value: string): string | null {
  const match = value
    .trim()
    .toUpperCase()
    .match(/^([A-Z]{2})-/);
  return match?.[1] ?? null;
}

function preferredAdmin1Country(
  values: string[],
  candidatesByValue: GazetteerCandidate[][],
): string | null {
  for (const value of values) {
    const country = explicitAdmin1Country(value);
    if (country !== null) return country;
  }

  const counts = new Map<string, number>();
  for (const candidates of candidatesByValue) {
    const countries = new Set(
      candidates
        .filter((candidate) => candidate.kind === 'admin1' && candidate.countryIso2 !== '')
        .map((candidate) => candidate.countryIso2),
    );
    for (const country of countries) counts.set(country, (counts.get(country) ?? 0) + 1);
  }

  let best: { country: string; count: number } | null = null;
  for (const [country, count] of counts) {
    if (count < 2) continue;
    if (best === null || count > best.count) best = { country, count };
  }
  return best?.country ?? null;
}

function chooseCandidate(
  candidates: GazetteerCandidate[],
  preferredCountry: string | null,
): GazetteerCandidate | null {
  if (preferredCountry !== null) {
    const admin1Candidate = candidates.find(
      (candidate) =>
        candidate.kind === 'admin1' && candidate.countryIso2.toUpperCase() === preferredCountry,
    );
    if (admin1Candidate) return admin1Candidate;
  }
  return candidates[0] ?? null;
}

export function createGazetteerLookup(rawEntries: readonly GazetteerEntry[]): GazetteerLookup {
  const exactIndex = new Map<string, GazetteerCandidate[]>();
  const normalizedIndex = new Map<string, GazetteerCandidate[]>();

  function register(key: string, candidate: GazetteerCandidate): void {
    registerCandidate(exactIndex, exactLookupKey(key), candidate);
    registerCandidate(normalizedIndex, normalizedLookupKey(key), candidate);
  }

  function candidatesFor(value: string): GazetteerCandidate[] {
    return (
      exactIndex.get(exactLookupKey(value)) ?? normalizedIndex.get(normalizedLookupKey(value)) ?? []
    );
  }

  for (const entry of rawEntries) {
    const kind = inferredKind(entry);
    const candidate: GazetteerCandidate = {
      iso2: entry.iso2,
      coord: [entry.lat, entry.lon],
      kind,
      countryIso2: inferredCountryIso2(entry, kind).toUpperCase(),
    };
    register(entry.name, candidate);
    if (entry.iso2) register(entry.iso2, candidate);
    for (const alias of entry.aliases) register(alias, candidate);
  }

  return {
    lookupGazetteer: (value) => chooseCandidate(candidatesFor(value), null)?.coord ?? null,
    matchGazetteer: (values) => {
      const result = new Map<string, [number, number]>();
      const candidatesByValue = values.map((value) => candidatesFor(value));
      const preferredCountry = preferredAdmin1Country(values, candidatesByValue);
      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value === undefined) continue;
        const candidate = chooseCandidate(candidatesByValue[i] ?? [], preferredCountry);
        if (candidate !== null) result.set(value, candidate.coord);
      }
      return result;
    },
  };
}

export function loadGazetteer(): Promise<GazetteerLookup> {
  gazetteerPromise ??= import('../../assets/gazetteer.json').then((module) =>
    createGazetteerLookup(module.default as GazetteerEntry[]),
  );
  return gazetteerPromise;
}

export async function lookupGazetteer(value: string): Promise<[number, number] | null> {
  return (await loadGazetteer()).lookupGazetteer(value);
}

export async function matchGazetteer(values: string[]): Promise<Map<string, [number, number]>> {
  return (await loadGazetteer()).matchGazetteer(values);
}
