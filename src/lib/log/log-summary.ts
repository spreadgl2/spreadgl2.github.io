import { detectRateTraitName } from './actual-rates';
import { detectTraitNameForStates, detectTraitNames } from './bssvs';
import { detectJumpTraitName } from './markov-jumps';

/** What a BEAST log offers the analyses, judged from its column names. */
export interface LogContentSummary {
  /** Traits with BSSVS indicator columns. */
  bssvsTraits: string[];
  /** BSSVS trait matching the tree's discrete states; null for continuous trees or no match. */
  matchedBssvsTrait: string | null;
  markovJumpTrait: string | null;
  actualRatesTrait: string | null;
}

/** @param treeStates the tree's discrete states, or null for a continuous tree */
export function summarizeLogColumns(
  columnNames: string[],
  treeStates: string[] | null,
): LogContentSummary {
  return {
    bssvsTraits: detectTraitNames(columnNames),
    matchedBssvsTrait: treeStates ? detectTraitNameForStates(columnNames, treeStates) : null,
    markovJumpTrait: detectJumpTraitName(columnNames),
    actualRatesTrait: detectRateTraitName(columnNames),
  };
}

export function hasLogAnalyses(summary: LogContentSummary): boolean {
  return (
    summary.bssvsTraits.length > 0 ||
    summary.markovJumpTrait !== null ||
    summary.actualRatesTrait !== null
  );
}
