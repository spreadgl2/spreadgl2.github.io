import { useEffect, useMemo, useState } from 'react';
import {
  bssvsStateList,
  computeBssvsBayesFactors,
  detectTraitNameForStates,
  detectTraitNames,
  inferBssvsSymmetryMode,
} from '../../lib/log/bssvs';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { BfLegend } from './BfLegend';
import styles from './DtaPanel.module.css';

type SortKey = 'bf' | 'freq' | 'from' | 'to' | 'prior' | 'evidence';
type SortDir = 'asc' | 'desc';

export function DtaPanel() {
  const logTable = useTreeStore((s) => s.logTable);
  const traitInfo = useTreeStore((s) => s.traitInfo);
  const discreteGeoLookup = useTreeStore((s) => s.discreteGeoLookup);
  const dtaMapOverlay = useUiStore((s) => s.dtaMapOverlay);
  const setDtaMapOverlay = useUiStore((s) => s.setDtaMapOverlay);
  const symmetryMode = useUiStore((s) => s.symmetryMode);
  const setSymmetryMode = useUiStore((s) => s.setSymmetryMode);
  const bfThreshold = useUiStore((s) => s.bssvsBfThreshold);
  const setBfThreshold = useUiStore((s) => s.setBssvsBfThreshold);

  const [sortKey, setSortKey] = useState<SortKey>('bf');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedTrait, setSelectedTrait] = useState<string | null>(null);
  // Local text mirror of the numeric BF threshold so the field can be cleared
  // (a controlled numeric value of 0 would always render a stuck "0").
  const [thresholdText, setThresholdText] = useState(() =>
    bfThreshold === 0 ? '' : String(bfThreshold),
  );

  const treeStates = useMemo(
    () => (traitInfo?.kind === 'discrete' ? [...traitInfo.values].sort() : null),
    [traitInfo],
  );

  // The tree's mappable location trait: the BSSVS trait whose routes match the
  // tree's discrete states (so it has coordinates via discreteGeoLookup).
  const locationTrait = useMemo(
    () =>
      logTable && treeStates ? detectTraitNameForStates(logTable.columnNames, treeStates) : null,
    [logTable, treeStates],
  );

  // Every BSSVS trait present in the log, with the location trait listed first.
  const traitOptions = useMemo(() => {
    if (!logTable) return [];
    const names = detectTraitNames(logTable.columnNames);
    return locationTrait && names.includes(locationTrait)
      ? [locationTrait, ...names.filter((n) => n !== locationTrait)]
      : names;
  }, [logTable, locationTrait]);

  const activeTrait =
    selectedTrait && traitOptions.includes(selectedTrait)
      ? selectedTrait
      : (traitOptions[0] ?? null);

  const activeStates = useMemo(() => {
    if (!logTable || !activeTrait) return null;
    if (activeTrait === locationTrait && treeStates) return treeStates;
    return bssvsStateList(logTable.columnNames, activeTrait, treeStates ?? undefined);
  }, [logTable, activeTrait, locationTrait, treeStates]);

  // A trait is mappable only when it is the tree's location trait with coordinates.
  // Other traits (e.g. host) get the table but no map overlay.
  const hasCoords = activeTrait !== null && activeTrait === locationTrait && !!discreteGeoLookup;

  const inferredSymmetryMode =
    logTable && activeStates && activeStates.length >= 2
      ? inferBssvsSymmetryMode(logTable.columnNames, activeStates)
      : null;

  // Clear jumps/rates overlays (retained in the store for future use), and force
  // the overlay off whenever the active trait can't be drawn on the map.
  useEffect(() => {
    if (dtaMapOverlay === 'jumps' || dtaMapOverlay === 'rates') setDtaMapOverlay('none');
    else if (!hasCoords && dtaMapOverlay !== 'none') setDtaMapOverlay('none');
  }, [dtaMapOverlay, hasCoords, setDtaMapOverlay]);

  useEffect(() => {
    if (inferredSymmetryMode) setSymmetryMode(inferredSymmetryMode);
  }, [inferredSymmetryMode, setSymmetryMode]);

  // Prefer the auto-detected model; fall back to the stored mode only when the
  // indicator count can't be matched to K(K-1)/2 or K(K-1).
  const effectiveMode = inferredSymmetryMode ?? symmetryMode;

  const bfRows = useMemo(() => {
    if (!logTable || !activeStates || activeStates.length < 2) return [];
    return computeBssvsBayesFactors(logTable, activeStates, effectiveMode);
  }, [logTable, activeStates, effectiveMode]);

  const sortedBfRows = useMemo(() => {
    const copy = [...bfRows];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'bf':
          cmp =
            Number.isFinite(a.bayesFactor) && Number.isFinite(b.bayesFactor)
              ? a.bayesFactor - b.bayesFactor
              : Number.isFinite(a.bayesFactor)
                ? -1
                : Number.isFinite(b.bayesFactor)
                  ? 1
                  : 0;
          break;
        case 'freq':
          cmp = a.posteriorFrequency - b.posteriorFrequency;
          break;
        case 'prior':
          cmp = a.priorProbability - b.priorProbability;
          break;
        case 'evidence':
          // Evidence labels track the Bayes factor, so reuse its ordering.
          cmp =
            Number.isFinite(a.bayesFactor) && Number.isFinite(b.bayesFactor)
              ? a.bayesFactor - b.bayesFactor
              : Number.isFinite(a.bayesFactor)
                ? -1
                : Number.isFinite(b.bayesFactor)
                  ? 1
                  : 0;
          break;
        case 'from':
          cmp = a.from.localeCompare(b.from);
          break;
        case 'to':
          cmp = a.to.localeCompare(b.to);
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return copy;
  }, [bfRows, sortKey, sortDir]);

  // Filter to routes at or above the BF cutoff (∞ always passes).
  const visibleRows = useMemo(
    () => sortedBfRows.filter((row) => row.bayesFactor >= bfThreshold),
    [sortedBfRows, bfThreshold],
  );

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  }

  if (!logTable) {
    return (
      <div className={styles.panel} data-testid="dta-panel">
        <p className={styles.empty}>No .log file loaded. Drop a BEAST .log file to get started.</p>
      </div>
    );
  }

  const nExpected =
    effectiveMode === 'symmetric'
      ? activeStates
        ? (activeStates.length * (activeStates.length - 1)) / 2
        : 0
      : activeStates
        ? activeStates.length * (activeStates.length - 1)
        : 0;

  return (
    <div className={styles.panel} data-testid="dta-panel">
      <div>
        {traitOptions.length === 0 ? (
          <p className={styles.empty}>
            No BSSVS indicator columns found. Expected columns named{' '}
            <code>{'<trait>.indicators.<idx>'}</code>.
          </p>
        ) : !activeStates || activeStates.length < 2 ? (
          <p className={styles.empty}>
            Could not determine the states for this trait. Named indicator columns (
            <code>{'<trait>.indicators.<from>.<to>'}</code>) or a discrete tree are required.
          </p>
        ) : (
          <>
            <div className={styles.metaRow}>
              <div className={styles.section}>
                <div className={styles.label}>Trait</div>
                <select
                  className={styles.select}
                  value={activeTrait ?? ''}
                  onChange={(e) => setSelectedTrait(e.target.value)}
                  data-testid="dta-trait-select"
                >
                  {traitOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.section}>
                <div className={styles.label}>Model</div>
                <div className={styles.value} data-testid="dta-model-kind">
                  {effectiveMode === 'symmetric' ? 'Symmetric' : 'Asymmetric'}
                  {inferredSymmetryMode === null && ' (assumed)'}
                </div>
                <div className={styles.hint}>
                  {inferredSymmetryMode !== null
                    ? `Detected from ${activeStates.length} states · ${nExpected} routes · ${bfRows.length} indicators`
                    : `Could not match ${bfRows.length} indicators to ${activeStates.length} states; assuming symmetric`}
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.label}>BF ≥</div>
                <input
                  type="number"
                  className={styles.thresholdInput}
                  min={0}
                  step="any"
                  placeholder="0"
                  value={thresholdText}
                  onChange={(e) => {
                    const text = e.target.value;
                    setThresholdText(text);
                    const n = Number(text);
                    setBfThreshold(text !== '' && Number.isFinite(n) && n >= 0 ? n : 0);
                  }}
                  data-testid="dta-bf-threshold"
                />
                <div className={styles.hint}>
                  {visibleRows.length} / {bfRows.length} routes
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.label}>Map overlay</div>
                <div className={styles.overlayRow}>
                  <div className={styles.radioRow}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="dtaMapOverlay"
                        value="none"
                        checked={dtaMapOverlay === 'none'}
                        disabled={!hasCoords}
                        onChange={() => setDtaMapOverlay('none')}
                        data-testid="dta-overlay-none"
                      />
                      <span>None</span>
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="dtaMapOverlay"
                        value="bf"
                        checked={dtaMapOverlay === 'bf'}
                        disabled={!hasCoords}
                        onChange={() => setDtaMapOverlay('bf')}
                        data-testid="dta-overlay-bf"
                      />
                      <span>BF arrows</span>
                    </label>
                  </div>
                  {dtaMapOverlay === 'bf' && hasCoords && <BfLegend />}
                </div>
                {!hasCoords && <div className={styles.hint}>No coordinates for this trait</div>}
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table} data-testid="dta-table">
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        className={styles.thBtn}
                        onClick={() => handleSort('from')}
                      >
                        From{sortIndicator('from')}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={styles.thBtn}
                        onClick={() => handleSort('to')}
                      >
                        To{sortIndicator('to')}
                      </button>
                    </th>
                    <th title="Prior inclusion probability (Lemey et al. 2009)">
                      <button
                        type="button"
                        className={styles.thBtn}
                        onClick={() => handleSort('prior')}
                      >
                        Prior prob.{sortIndicator('prior')}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={styles.thBtn}
                        onClick={() => handleSort('freq')}
                      >
                        Posterior prob.{sortIndicator('freq')}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className={styles.thBtn}
                        onClick={() => handleSort('bf')}
                      >
                        Bayes Factor{sortIndicator('bf')}
                      </button>
                    </th>
                    <th className={styles.thEvidence}>
                      <button
                        type="button"
                        className={styles.thBtn}
                        onClick={() => handleSort('evidence')}
                      >
                        Evidence{sortIndicator('evidence')}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      key={`${row.from}-${row.to}-${row.indicatorIdx}`}
                      className={styles[`evidence-${row.evidenceLabel.replace(' ', '-')}`]}
                    >
                      <td className={styles.stateCell}>{row.from}</td>
                      <td className={styles.stateCell}>{row.to}</td>
                      <td className={styles.numCell}>{row.priorProbability.toFixed(3)}</td>
                      <td className={styles.numCell}>{row.posteriorFrequency.toFixed(3)}</td>
                      <td className={styles.numCell}>
                        {Number.isFinite(row.bayesFactor) ? row.bayesFactor.toFixed(1) : '∞'}
                      </td>
                      <td>
                        <span
                          className={[
                            styles.evidenceChip,
                            styles[`chip-${row.evidenceLabel.replace(' ', '-')}`],
                          ].join(' ')}
                        >
                          {row.evidenceLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {visibleRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className={styles.emptyRow}>
                        {bfRows.length === 0
                          ? 'No routes matched. Check the trait or state count.'
                          : `No routes with BF ≥ ${bfThreshold}.`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.footnote}>
              Kass &amp; Raftery (1995): BF &lt; 1 = no support; 1–3 = weak; 3–20 = positive; 20–150
              = strong; &gt;150 = very strong. Prior: Lemey et al. 2009.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
