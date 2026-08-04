import { Lasso } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useSelectionStore } from '../../store/selection';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import styles from './FilterPanel.module.css';

interface SearchResult {
  id: string;
  label: string;
  score: number;
}

function scoreMatch(label: string, query: string): number {
  const lLabel = label.toLowerCase();
  const lQuery = query.toLowerCase();
  if (lLabel === lQuery) return 2;
  if (lLabel.startsWith(lQuery)) return 1.5;
  if (lLabel.includes(lQuery)) return 1;
  return 0;
}

function search(tipLabels: { id: string; label: string }[], query: string): SearchResult[] {
  if (query.trim() === '') return [];
  const results: SearchResult[] = [];
  for (const { id, label } of tipLabels) {
    const score = scoreMatch(label, query.trim());
    if (score > 0) results.push({ id, label, score });
  }
  results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return results.slice(0, 50);
}

export function FilterPanel() {
  const layout = useTreeStore((s) => s.layout);
  const graph = useTreeStore((s) => s.graph);
  const branchTable = useTreeStore((s) => s.branchTable);
  const posteriorThreshold = useUiStore((s) => s.posteriorThreshold);
  const setPosteriorThreshold = useUiStore((s) => s.setPosteriorThreshold);
  const setSelectedScrollTarget = useSelectionStore((s) => s.setSelectedScrollTarget);
  const focusedTaxa = useSelectionStore((s) => s.focusedTaxa);
  const setFocusedTaxa = useSelectionStore((s) => s.setFocusedTaxa);
  const toggleFocusedTaxon = useSelectionStore((s) => s.toggleFocusedTaxon);
  const clearFocusedTaxa = useSelectionStore((s) => s.clearFocusedTaxa);
  const lassoMode = useUiStore((s) => s.lassoMode);
  const setLassoMode = useUiStore((s) => s.setLassoMode);

  const hasPosterior = useMemo(
    () => !!(branchTable?.posterior && branchTable.posterior.length > 0),
    [branchTable],
  );

  const [query, setQuery] = useState('');

  const tipLabels = useMemo(() => {
    if (!layout) return [];
    return layout.nodes
      .filter((n) => n.isTip)
      .map((n) => {
        const idx = graph?.origIdToIdx.get(n.id);
        const phyloNode = idx !== undefined ? graph?.nodes[idx] : undefined;
        const label = phyloNode?.name ?? n.id;
        return { id: n.id, label };
      });
  }, [layout, graph]);

  const results = useMemo(() => search(tipLabels, query), [tipLabels, query]);

  const focusedSet = useMemo(() => new Set(focusedTaxa), [focusedTaxa]);

  const labelFromId = useCallback(
    (id: string): string => {
      const idx = graph?.origIdToIdx.get(id);
      const node = idx !== undefined ? graph?.nodes[idx] : undefined;
      return node?.name ?? id;
    },
    [graph],
  );

  const handleResultClick = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey) {
        toggleFocusedTaxon(id);
      } else {
        setFocusedTaxa([id]);
      }
      setSelectedScrollTarget(id);
    },
    [setFocusedTaxa, toggleFocusedTaxon, setSelectedScrollTarget],
  );

  function handleMarqueeEnter(e: React.MouseEvent<HTMLElement>) {
    const inner = e.currentTarget.querySelector<HTMLElement>(`.${styles.scrollText ?? ''}`);
    if (!inner) return;
    const container = inner.parentElement;
    if (!container) return;
    const computed = getComputedStyle(container);
    const paddingLeft = parseFloat(computed.paddingLeft);
    const paddingRight = parseFloat(computed.paddingRight);
    const visibleWidth = container.clientWidth - paddingLeft - paddingRight;
    const overflow = inner.scrollWidth - visibleWidth;
    if (overflow > 0) {
      const scrollDistance = -(overflow + 8);
      container.style.setProperty('--scroll-distance', `${scrollDistance}px`);
      container.style.setProperty('--scroll-duration', `${Math.max(3, overflow / 25)}s`);
      if (styles.scrolling) container.classList.add(styles.scrolling);
    }
  }

  function handleMarqueeLeave(e: React.MouseEvent<HTMLElement>) {
    if (styles.scrolling) e.currentTarget.classList.remove(styles.scrolling);
  }

  return (
    <div className={styles.panel} data-testid="filter-panel">
      {hasPosterior ? (
        <div className={styles.posteriorRow} data-testid="posterior-threshold-row">
          <label className={styles.posteriorLabel} htmlFor="posterior-threshold-slider">
            Posterior threshold
          </label>
          <div className={styles.posteriorControls}>
            <input
              id="posterior-threshold-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={posteriorThreshold}
              onChange={(e) => setPosteriorThreshold(Number(e.target.value))}
              className={
                posteriorThreshold > 0
                  ? `${styles.posteriorSlider} ${styles.posteriorSliderActive}`
                  : styles.posteriorSlider
              }
              data-testid="posterior-threshold-slider"
              aria-label="Posterior threshold"
            />
            <span className={styles.posteriorValue} data-testid="posterior-threshold-value">
              {posteriorThreshold.toFixed(2)}
            </span>
          </div>
        </div>
      ) : (
        <div
          className={styles.posteriorRow}
          data-testid="posterior-threshold-row-disabled"
          title="No posterior values in this tree"
        >
          <label
            className={`${styles.posteriorLabel} ${styles.posteriorLabelDisabled}`}
            htmlFor="posterior-threshold-slider-disabled"
          >
            Posterior threshold
          </label>
          <div className={styles.posteriorControls}>
            <input
              id="posterior-threshold-slider-disabled"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={0}
              disabled
              className={styles.posteriorSlider}
              aria-label="Posterior threshold (unavailable)"
              aria-disabled="true"
            />
            <span className={`${styles.posteriorValue} ${styles.posteriorValueDisabled}`}>—</span>
          </div>
        </div>
      )}
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search taxa…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-testid="filter-search-input"
          aria-label="Search taxa"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <button
        type="button"
        className={lassoMode ? `${styles.lassoBtn} ${styles.lassoBtnActive}` : styles.lassoBtn}
        onClick={() => setLassoMode(!lassoMode)}
        data-testid="filter-lasso-btn"
        aria-pressed={lassoMode}
        title={lassoMode ? 'Cancel lasso' : 'Region lasso: click to draw a polygon on the map'}
      >
        <Lasso size={14} aria-hidden="true" />
        {lassoMode ? 'Cancel lasso' : 'Region lasso'}
      </button>

      {focusedTaxa.length > 0 && (
        <div className={styles.chipsSection} data-testid="filter-chips-section">
          <div className={styles.chipsHeader}>
            <span>Focused taxa ({focusedTaxa.length})</span>
            <button
              type="button"
              className={styles.clearAllBtn}
              onClick={() => clearFocusedTaxa()}
              data-testid="filter-clear-all"
              title="Clear focus set"
            >
              Clear all
            </button>
          </div>
          <ul className={styles.chipsList}>
            {focusedTaxa.map((id) => {
              const label = labelFromId(id);
              return (
                <li key={id} className={styles.chip}>
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: hover events are purely cosmetic (marquee animation); title= is the accessible fallback */}
                  <span
                    className={styles.chipLabel}
                    title={label}
                    onMouseEnter={handleMarqueeEnter}
                    onMouseLeave={handleMarqueeLeave}
                  >
                    <span className={styles.scrollText}>{label}</span>
                  </span>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => toggleFocusedTaxon(id)}
                    aria-label={`Remove ${label} from focus set`}
                    data-testid={`filter-chip-remove-${id}`}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {query.trim() !== '' && (
        <div
          className={styles.resultsList}
          role="listbox"
          aria-label="Search results"
          data-testid="filter-results-list"
        >
          {focusedTaxa.length > 0 && (
            <button
              type="button"
              className={styles.showAllButton}
              onClick={clearFocusedTaxa}
              data-testid="filter-show-all"
            >
              Show all
            </button>
          )}
          {results.length === 0 ? (
            <p className={styles.emptyMsg}>No matches</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                className={
                  focusedSet.has(r.id)
                    ? `${styles.resultRow} ${styles.resultRowFocused}`
                    : styles.resultRow
                }
                role="option"
                aria-selected={focusedSet.has(r.id)}
                data-testid={`filter-result-${r.id}`}
                title={r.label}
                onMouseEnter={handleMarqueeEnter}
                onMouseLeave={handleMarqueeLeave}
                onClick={(e) => handleResultClick(r.id, e.shiftKey)}
              >
                <span className={styles.scrollText}>{r.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
