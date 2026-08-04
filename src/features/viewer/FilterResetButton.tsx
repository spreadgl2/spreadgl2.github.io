import { useSelectionStore } from '../../store/selection';
import { useUiStore } from '../../store/ui';
import styles from './FilterResetButton.module.css';

// Shown next to the "Filter" drawer title while any filter is applied; clears
// the focus set, posterior threshold, and lasso in one click.
export function FilterResetButton() {
  const posteriorThreshold = useUiStore((s) => s.posteriorThreshold);
  const setPosteriorThreshold = useUiStore((s) => s.setPosteriorThreshold);
  const lassoMode = useUiStore((s) => s.lassoMode);
  const clearLasso = useUiStore((s) => s.clearLasso);
  const focusedTaxa = useSelectionStore((s) => s.focusedTaxa);
  const clearFocusedTaxa = useSelectionStore((s) => s.clearFocusedTaxa);

  const hasActiveFilters = focusedTaxa.length > 0 || posteriorThreshold > 0 || lassoMode;
  if (!hasActiveFilters) return null;

  return (
    <button
      type="button"
      className={styles.resetBtn}
      data-testid="filter-reset-btn"
      title="Reset all filters"
      onClick={() => {
        clearFocusedTaxa();
        setPosteriorThreshold(0);
        clearLasso();
      }}
    >
      Reset
    </button>
  );
}
