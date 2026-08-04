import { describe, expect, it } from 'vitest';
import { buildTipDateRowFromInput, tipDateFormatLabel } from './tip-date-table';

describe('tipDateFormatLabel', () => {
  it('maps formats to human-readable date masks', () => {
    expect(tipDateFormatLabel('iso-pipe')).toBe('YYYY-MM-DD');
    expect(tipDateFormatLabel('iso-date')).toBe('YYYY-MM-DD');
    expect(tipDateFormatLabel('day-month-year')).toBe('DD-MM-YYYY');
    expect(tipDateFormatLabel('year-pipe')).toBe('YYYY');
    expect(tipDateFormatLabel('year-month-slash')).toBe('YYYY-MM');
    expect(tipDateFormatLabel('decimal-year')).toBe('decimal year');
    expect(tipDateFormatLabel('unknown')).toBe('unknown');
  });
});

describe('buildTipDateRowFromInput', () => {
  it('treats a matching label-derived date annotation as parsed provenance', () => {
    const row = buildTipDateRowFromInput({
      nodeId: 'tip-a',
      label: 'Alpha|2010-05-12',
      annotatedDate: '2010-05-12',
    });

    expect(row).toMatchObject({
      parsedSubstring: '2010-05-12',
      format: 'iso-pipe',
      source: 'parsed',
    });
  });

  it('uses annotation provenance when no label date is available', () => {
    const row = buildTipDateRowFromInput({
      nodeId: 'tip-a',
      label: 'Alpha',
      annotatedDate: '2010.5',
    });

    expect(row).toMatchObject({
      parsedSubstring: '2010.5',
      format: 'decimal-year',
      source: 'annotation',
    });
  });

  it('uses annotation provenance when an explicit annotation differs from the label date', () => {
    const row = buildTipDateRowFromInput({
      nodeId: 'tip-a',
      label: 'Alpha|2010-05-12',
      annotatedDate: '2011.25',
    });

    expect(row).toMatchObject({
      parsedSubstring: '2011.25',
      format: 'decimal-year',
      source: 'annotation',
    });
  });
});
