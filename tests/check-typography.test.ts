import { describe, expect, it } from 'vitest';
import { lineViolations } from '../scripts/check-typography';

describe('typography guardrail — lineViolations', () => {
  it('accepts the font tokens and inherit', () => {
    expect(lineViolations('  font-family: var(--font-sans);')).toEqual([]);
    expect(lineViolations('  font-family: var(--font-mono);')).toEqual([]);
    expect(lineViolations('  font-family: inherit;')).toEqual([]);
  });

  it('rejects raw system-ui / ui-monospace font-family', () => {
    expect(lineViolations('  font-family: system-ui, sans-serif;')).toHaveLength(1);
    expect(lineViolations('  font-family: ui-monospace, monospace;')).toHaveLength(1);
    expect(lineViolations('  font-family: "JetBrains Mono", monospace;')).toHaveLength(1);
  });

  it('rejects any raw px font-size (must use a token)', () => {
    expect(lineViolations('  font-size: 8px;')).toHaveLength(1);
    expect(lineViolations('  font-size: 13px;')).toHaveLength(1);
    expect(lineViolations('  font-size: 18px;')).toHaveLength(1);
  });

  it('accepts --text-* size tokens and inherit', () => {
    expect(lineViolations('  font-size: var(--text-micro);')).toEqual([]);
    expect(lineViolations('  font-size: var(--text-md);')).toEqual([]);
    expect(lineViolations('  font-size: var(--text-2xl);')).toEqual([]);
    expect(lineViolations('  font-size: inherit;')).toEqual([]);
  });

  it('flags both rules on one line', () => {
    expect(lineViolations('.x { font-family: system-ui, sans-serif; font-size: 8px; }')).toHaveLength(
      2,
    );
  });
});
