import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from './selection';

beforeEach(() => {
  useSelectionStore.setState({ focusedTaxa: [], highlightedBranchIds: [] });
});

describe('focusedTaxa store actions', () => {
  it('setFocusedTaxa replaces the entire set', () => {
    useSelectionStore.getState().setFocusedTaxa(['A', 'B']);
    expect(useSelectionStore.getState().focusedTaxa).toEqual(['A', 'B']);
    useSelectionStore.getState().setFocusedTaxa(['C']);
    expect(useSelectionStore.getState().focusedTaxa).toEqual(['C']);
  });

  it('toggleFocusedTaxon adds an absent ID', () => {
    useSelectionStore.getState().toggleFocusedTaxon('A');
    expect(useSelectionStore.getState().focusedTaxa).toContain('A');
  });

  it('toggleFocusedTaxon removes a present ID', () => {
    useSelectionStore.setState({ focusedTaxa: ['A', 'B'] });
    useSelectionStore.getState().toggleFocusedTaxon('A');
    const taxa = useSelectionStore.getState().focusedTaxa;
    expect(taxa).not.toContain('A');
    expect(taxa).toContain('B');
  });

  it('clearFocusedTaxa empties the set', () => {
    useSelectionStore.setState({ focusedTaxa: ['A', 'B', 'C'] });
    useSelectionStore.getState().clearFocusedTaxa();
    expect(useSelectionStore.getState().focusedTaxa).toEqual([]);
  });

  it('toggleFocusedTaxon is idempotent across add then remove', () => {
    useSelectionStore.getState().toggleFocusedTaxon('X');
    useSelectionStore.getState().toggleFocusedTaxon('X');
    expect(useSelectionStore.getState().focusedTaxa).not.toContain('X');
  });

  it('sets and clears highlighted branch IDs', () => {
    useSelectionStore.getState().setHighlightedBranchIds([1, 3]);
    expect(useSelectionStore.getState().highlightedBranchIds).toEqual([1, 3]);
    useSelectionStore.getState().clearHighlightedBranchIds();
    expect(useSelectionStore.getState().highlightedBranchIds).toEqual([]);
  });

  it('clearSelection also clears highlighted branch IDs', () => {
    useSelectionStore.setState({ highlightedBranchIds: [2] });
    useSelectionStore.getState().clearSelection();
    expect(useSelectionStore.getState().highlightedBranchIds).toEqual([]);
  });
});
