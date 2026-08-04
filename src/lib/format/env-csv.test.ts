import { describe, expect, it } from 'vitest';
import { parseEnvCSV } from './env-csv';

const SAMPLE_CSV = `location,temperature,rainfall
Africa,28.5,1200
Asia,22.1,900
Europe,10.3,650
`;

const SUFFIX_CSV = `location,temperature_C,humidity_pct,elevation_m
Africa,28.5,70,200
Asia,22.1,60,150
`;

describe('parseEnvCSV', () => {
  it('detects location column and numeric columns', () => {
    const result = parseEnvCSV(SAMPLE_CSV);
    expect(result.locationCol).toBe('location');
    expect(result.numericCols).toEqual(['temperature', 'rainfall']);
  });

  it('valueByLocation returns correct mapping for a column', () => {
    const result = parseEnvCSV(SAMPLE_CSV);
    const temps = result.valueByLocation('temperature');
    expect(temps.get('Africa')).toBeCloseTo(28.5);
    expect(temps.get('Asia')).toBeCloseTo(22.1);
    expect(temps.get('Europe')).toBeCloseTo(10.3);
    expect(temps.size).toBe(3);
  });

  it('valueByLocation returns correct mapping for second column', () => {
    const result = parseEnvCSV(SAMPLE_CSV);
    const rain = result.valueByLocation('rainfall');
    expect(rain.get('Africa')).toBe(1200);
    expect(rain.get('Europe')).toBe(650);
  });

  it('throws on empty CSV', () => {
    expect(() => parseEnvCSV('')).toThrow('Empty or unparseable CSV');
  });

  it('throws when no string column', () => {
    expect(() => parseEnvCSV('a,b\n1,2\n3,4\n')).toThrow('No string column');
  });

  it('throws when no numeric columns', () => {
    expect(() => parseEnvCSV('location,label\nA,x\nB,y\n')).toThrow('No numeric columns');
  });

  it('numericColumns has correct displayName and units for _C suffix', () => {
    const result = parseEnvCSV(SUFFIX_CSV);
    const tempCol = result.numericColumns.find((c) => c.key === 'temperature_C');
    expect(tempCol).toBeDefined();
    expect(tempCol?.displayName).toBe('Temperature');
    expect(tempCol?.units).toBe('°C');
  });

  it('numericColumns has correct displayName and units for _pct suffix', () => {
    const result = parseEnvCSV(SUFFIX_CSV);
    const humCol = result.numericColumns.find((c) => c.key === 'humidity_pct');
    expect(humCol).toBeDefined();
    expect(humCol?.displayName).toBe('Humidity');
    expect(humCol?.units).toBe('%');
  });

  it('numericColumns has correct displayName and units for _m suffix', () => {
    const result = parseEnvCSV(SUFFIX_CSV);
    const elevCol = result.numericColumns.find((c) => c.key === 'elevation_m');
    expect(elevCol).toBeDefined();
    expect(elevCol?.displayName).toBe('Elevation');
    expect(elevCol?.units).toBe('m');
  });

  it('numericColumns values map is correctly populated', () => {
    const result = parseEnvCSV(SUFFIX_CSV);
    const tempCol = result.numericColumns.find((c) => c.key === 'temperature_C');
    expect(tempCol?.values.get('Africa')).toBeCloseTo(28.5);
    expect(tempCol?.values.get('Asia')).toBeCloseTo(22.1);
  });

  it('column without unit suffix uses title-cased displayName and null units', () => {
    const result = parseEnvCSV(SAMPLE_CSV);
    const tempCol = result.numericColumns.find((c) => c.key === 'temperature');
    expect(tempCol?.displayName).toBe('Temperature');
    expect(tempCol?.units).toBeNull();
  });

  it('mostly-numeric columns accepted (≥80%)', () => {
    const mixedCsv = `location,value\nA,10\nB,20\nC,30\nD,40\nE,bad\n`;
    const result = parseEnvCSV(mixedCsv);
    expect(result.numericCols).toContain('value');
  });

  it('mostly-non-numeric columns rejected (<80%)', () => {
    const csv = `location,value\nA,10\nB,bad\nC,bad\nD,bad\nE,bad\n`;
    expect(() => parseEnvCSV(csv)).toThrow('No numeric columns');
  });
});
