import { create } from 'zustand';

export interface SelectionStore {
  hoveredId: string | null;
  selectedIds: string[];
  compareSelection: string[];
  hoveredBranchId: number | null;
  selectedBranchIds: number[];
  highlightedBranchIds: number[];
  selectedScrollTarget: string | null;
  focusedTaxa: string[];
  setHoveredId: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelectedId: (id: string) => void;
  setCompareSelection: (ids: string[]) => void;
  setHoveredBranchId: (branchId: number | null) => void;
  setSelectedBranchIds: (branchIds: number[]) => void;
  toggleSelectedBranchId: (branchId: number) => void;
  setHighlightedBranchIds: (branchIds: number[]) => void;
  clearHighlightedBranchIds: () => void;
  setSelectedScrollTarget: (id: string | null) => void;
  clearSelection: () => void;
  setFocusedTaxa: (ids: string[]) => void;
  toggleFocusedTaxon: (id: string) => void;
  clearFocusedTaxa: () => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  hoveredId: null,
  selectedIds: [],
  compareSelection: [],
  hoveredBranchId: null,
  selectedBranchIds: [],
  highlightedBranchIds: [],
  selectedScrollTarget: null,
  focusedTaxa: [],
  setHoveredId: (hoveredId) => set({ hoveredId }),
  setSelectedIds: (selectedIds) => set({ selectedIds }),
  toggleSelectedId: (id) =>
    set((state) => {
      const exists = state.selectedIds.includes(id);
      return {
        selectedIds: exists
          ? state.selectedIds.filter((x) => x !== id)
          : [...state.selectedIds, id],
      };
    }),
  setCompareSelection: (compareSelection) => set({ compareSelection }),
  setHoveredBranchId: (hoveredBranchId) => set({ hoveredBranchId }),
  setSelectedBranchIds: (selectedBranchIds) => set({ selectedBranchIds }),
  toggleSelectedBranchId: (branchId) =>
    set((state) => {
      const exists = state.selectedBranchIds.includes(branchId);
      return {
        selectedBranchIds: exists
          ? state.selectedBranchIds.filter((x) => x !== branchId)
          : [...state.selectedBranchIds, branchId],
      };
    }),
  setHighlightedBranchIds: (highlightedBranchIds) => set({ highlightedBranchIds }),
  clearHighlightedBranchIds: () => set({ highlightedBranchIds: [] }),
  setSelectedScrollTarget: (selectedScrollTarget) => set({ selectedScrollTarget }),
  clearSelection: () =>
    set({
      hoveredId: null,
      selectedIds: [],
      compareSelection: [],
      hoveredBranchId: null,
      selectedBranchIds: [],
      highlightedBranchIds: [],
      selectedScrollTarget: null,
    }),
  setFocusedTaxa: (focusedTaxa) => set({ focusedTaxa }),
  toggleFocusedTaxon: (id) =>
    set((state) => {
      const exists = state.focusedTaxa.includes(id);
      return {
        focusedTaxa: exists
          ? state.focusedTaxa.filter((x) => x !== id)
          : [...state.focusedTaxa, id],
      };
    }),
  clearFocusedTaxa: () => set({ focusedTaxa: [] }),
}));
