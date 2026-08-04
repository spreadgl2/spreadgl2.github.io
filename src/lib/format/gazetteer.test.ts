import { describe, expect, it } from 'vitest';
import entries from '../../assets/gazetteer.json';
import { createGazetteerLookup, lookupGazetteer, matchGazetteer } from './gazetteer';

const US_STATES = [
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
];

const generatedLookup = createGazetteerLookup([
  {
    name: 'Georgia',
    iso2: 'GE',
    lat: 42.286955,
    lon: 43.636963,
    aliases: [],
    kind: 'country',
    countryIso2: 'GE',
    source: 'natural-earth-admin0-10m',
    sourceFeatureId: 'GEO',
    pointMethod: 'representative_point',
  },
  {
    name: 'Georgia',
    iso2: 'US-GA',
    lat: 32.629579,
    lon: -83.423511,
    aliases: [],
    kind: 'admin1',
    countryIso2: 'US',
    source: 'us-census-gazetteer-2025',
    sourceFeatureId: '0400000US13',
    pointMethod: 'census_internal_point',
  },
  {
    name: 'Florida',
    iso2: 'US-FL',
    lat: 28.398978,
    lon: -82.5143,
    aliases: [],
    kind: 'admin1',
    countryIso2: 'US',
    source: 'us-census-gazetteer-2025',
    sourceFeatureId: '0400000US12',
    pointMethod: 'census_internal_point',
  },
  {
    name: 'Canada',
    iso2: 'CA',
    lat: 61.362063,
    lon: -98.30777,
    aliases: [],
    kind: 'country',
    countryIso2: 'CA',
    source: 'natural-earth-admin0-10m',
    sourceFeatureId: 'CAN',
    pointMethod: 'representative_point',
  },
  {
    name: 'California',
    iso2: 'US-CA',
    lat: 37.155177,
    lon: -119.543418,
    aliases: [],
    kind: 'admin1',
    countryIso2: 'US',
    source: 'us-census-gazetteer-2025',
    sourceFeatureId: '0400000US06',
    pointMethod: 'census_internal_point',
  },
  {
    name: 'Bacău',
    iso2: 'RO-BC',
    lat: 46.407982,
    lon: 26.75224,
    aliases: ['Județul Bacău'],
    kind: 'admin1',
    countryIso2: 'RO',
    source: 'natural-earth-admin1-10m',
    sourceFeatureId: '1159309667',
    pointMethod: 'representative_point',
  },
  {
    name: "Côte d'Ivoire",
    iso2: 'CI',
    lat: 7.519516,
    lon: -5.692674,
    aliases: ['Ivory Coast'],
    kind: 'country',
    countryIso2: 'CI',
    source: 'natural-earth-admin0-10m',
    sourceFeatureId: 'CIV',
    pointMethod: 'representative_point',
  },
  {
    name: 'Guangdong',
    iso2: 'CN-GD',
    lat: 22.879048,
    lon: 112.303516,
    aliases: ['Guangtung', 'Guangdong Sheng', 'Guǎngdōng', '广东'],
    kind: 'admin1',
    countryIso2: 'CN',
    source: 'natural-earth-admin1-10m',
    sourceFeatureId: '1159310335',
    pointMethod: 'representative_point',
  },
  {
    name: 'Beijing',
    iso2: 'CN-BJ',
    lat: 40.19,
    lon: 116.41,
    aliases: [],
    kind: 'admin1',
    countryIso2: 'CN',
    source: 'natural-earth-admin1-10m',
    sourceFeatureId: '1159310317',
    pointMethod: 'representative_point',
  },
]);

const bundledEntries = entries as Array<{
  name: string;
  iso2: string;
  lat: number;
  lon: number;
  kind?: string;
  source?: string;
  pointMethod?: string;
}>;

describe('lookupGazetteer', () => {
  it('matches by canonical name', async () => {
    const result = await lookupGazetteer('United States');
    if (result === null) throw new Error('expected United States to resolve');
    const [lat, lon] = result;
    expect(lat).toBeCloseTo(37.246365, 6);
    expect(lon).toBeCloseTo(-99.698428, 6);
  });

  it('matches case-insensitively', async () => {
    expect(await lookupGazetteer('united states')).not.toBeNull();
    expect(await lookupGazetteer('CHINA')).not.toBeNull();
  });

  it('matches by ISO2 code', async () => {
    expect(await lookupGazetteer('US')).not.toBeNull();
    expect(await lookupGazetteer('cn')).not.toBeNull();
  });

  it('matches by alias', async () => {
    expect(await lookupGazetteer('USA')).not.toBeNull();
    expect(await lookupGazetteer('UK')).not.toBeNull();
    expect(await lookupGazetteer('Deutschland')).not.toBeNull();
  });

  it('returns null for unknown values', async () => {
    expect(await lookupGazetteer('Westeros')).toBeNull();
    expect(await lookupGazetteer('')).toBeNull();
  });

  it('matches China provinces (for PEDV use case)', async () => {
    expect(await lookupGazetteer('Guangdong')).not.toBeNull();
    expect(await lookupGazetteer('Beijing')).not.toBeNull();
    expect(await lookupGazetteer('Shanghai')).not.toBeNull();
  });

  it('matches every U.S. state by canonical name', async () => {
    const result = await matchGazetteer(US_STATES);
    expect(result.size).toBe(50);
    for (const state of US_STATES) {
      expect(result.get(state), state).not.toBeUndefined();
    }
    expect(result.get('Georgia')).toEqual(await lookupGazetteer('US-GA'));
  });

  it('matches U.S. states by namespaced subdivision code', async () => {
    expect(await lookupGazetteer('US-CA')).toEqual(await lookupGazetteer('California'));
    expect(await lookupGazetteer('US-NY')).toEqual(await lookupGazetteer('New York'));
    expect(await lookupGazetteer('US-TX')).toEqual(await lookupGazetteer('Texas'));
  });

  it('does not let state subdivision codes replace country ISO2 codes', async () => {
    expect(await lookupGazetteer('CA')).toEqual(await lookupGazetteer('Canada'));
    expect(await lookupGazetteer('IN')).toEqual(await lookupGazetteer('India'));
    expect(await lookupGazetteer('Georgia')).not.toEqual(await lookupGazetteer('US-GA'));
  });

  it('matches District of Columbia and Puerto Rico admin entries', async () => {
    expect(await lookupGazetteer('Washington, DC')).toEqual(
      await lookupGazetteer('District of Columbia'),
    );
    expect(await lookupGazetteer('Commonwealth of Puerto Rico')).toEqual(
      await lookupGazetteer('Puerto Rico'),
    );
  });
});

describe('matchGazetteer', () => {
  it('returns only matched entries', async () => {
    const result = await matchGazetteer(['China', 'France', 'Narnia', 'Germany']);
    expect(result.size).toBe(3);
    expect(result.has('China')).toBe(true);
    expect(result.has('France')).toBe(true);
    expect(result.has('Germany')).toBe(true);
    expect(result.has('Narnia')).toBe(false);
  });

  it('returns empty map when no values match', async () => {
    expect(
      (await matchGazetteer(['NotARealGazetteerPlaceA', 'NotARealGazetteerPlaceB'])).size,
    ).toBe(0);
  });
});

describe('bundled generated gazetteer asset', () => {
  it('includes source provenance for generated entries', () => {
    const california = bundledEntries.find((entry) => entry.iso2 === 'US-CA');
    expect(california?.source).toBe('us-census-gazetteer-2025');
    expect(california?.pointMethod).toBe('census_internal_point');

    const guangdong = bundledEntries.find((entry) => entry.iso2 === 'CN-GD');
    expect(guangdong?.source).toBe('natural-earth-admin1-10m');
    expect(guangdong?.kind).toBe('admin1');
  });

  it('preserves legacy broad region fallbacks', async () => {
    const middleEast = bundledEntries.find((entry) => entry.name === 'Middle East');
    expect(middleEast).toMatchObject({
      iso2: 'REG-MIDDLE-EAST',
      lat: 30,
      lon: 45,
      source: 'manual-region-fallbacks',
      pointMethod: 'manual_representative_point',
    });
    expect(await lookupGazetteer('MiddleEast')).toEqual([30, 45]);
    expect(await lookupGazetteer('W Europe')).toEqual([48, 4]);
  });
});

describe('lookupGazetteer — loose space/case matching', () => {
  it('matches a spaced gazetteer name when the query has no space', async () => {
    // BEAST X labels often collapse "Inner Mongolia" to "InnerMongolia".
    const spaced = await lookupGazetteer('Inner Mongolia');
    const collapsed = await lookupGazetteer('InnerMongolia');
    expect(spaced).not.toBeNull();
    expect(collapsed).toEqual(spaced);
  });

  it('matches across hyphen/underscore/case differences', async () => {
    const canonical = await lookupGazetteer('Hong Kong');
    if (canonical) {
      expect(await lookupGazetteer('hong-kong')).toEqual(canonical);
      expect(await lookupGazetteer('HONG_KONG')).toEqual(canonical);
    }
  });

  it('matches across punctuation differences', async () => {
    expect(await lookupGazetteer('Washington.DC')).toEqual(
      await lookupGazetteer('District of Columbia'),
    );
    expect(await lookupGazetteer('Inner.Mongolia')).toEqual(
      await lookupGazetteer('Inner Mongolia'),
    );
  });
});

describe('generated gazetteer format', () => {
  it('ignores provenance metadata while indexing coordinates', () => {
    expect(generatedLookup.lookupGazetteer('US-CA')).toEqual([37.155177, -119.543418]);
    expect(generatedLookup.lookupGazetteer('CA')).toEqual([61.362063, -98.30777]);
  });

  it('normalizes diacritics, punctuation, and spacing', () => {
    expect(generatedLookup.lookupGazetteer('Bacau')).toEqual([46.407982, 26.75224]);
    expect(generatedLookup.lookupGazetteer('Judetul Bacau')).toEqual([46.407982, 26.75224]);
    expect(generatedLookup.lookupGazetteer('cote divoire')).toEqual([7.519516, -5.692674]);
    expect(generatedLookup.lookupGazetteer('Guangdong-Sheng')).toEqual([22.879048, 112.303516]);
    expect(generatedLookup.lookupGazetteer('Guǎngdōng')).toEqual([22.879048, 112.303516]);
    expect(generatedLookup.lookupGazetteer('广东')).toEqual([22.879048, 112.303516]);
  });

  it('keeps single-value ambiguous names in source order', () => {
    expect(generatedLookup.lookupGazetteer('Georgia')).toEqual([42.286955, 43.636963]);
  });

  it('uses admin-country context when matching a trait value set', () => {
    const states = generatedLookup.matchGazetteer(['Georgia', 'Florida']);
    expect(states.get('Georgia')).toEqual([32.629579, -83.423511]);
    expect(states.get('Florida')).toEqual([28.398978, -82.5143]);

    const china = generatedLookup.matchGazetteer(['Guangdong', 'Beijing']);
    expect(china.get('Guangdong')).toEqual([22.879048, 112.303516]);
    expect(china.get('Beijing')).toEqual([40.19, 116.41]);
  });
});
