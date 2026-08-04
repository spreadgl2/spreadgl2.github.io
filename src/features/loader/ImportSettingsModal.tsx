import { type RefObject, useMemo, useRef, useState } from 'react';
import { decimalYearToISO } from '../../lib/format/decimal-year';
import { tipDateFormatLabel } from '../../lib/format/tip-date-table';
import type { WireParseResult } from '../../workers/wire';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import styles from './ImportModal.module.css';

export interface ImportSettingsSelection {
  analysisKind?: 'continuous' | 'discrete';
  traitKey?: string;
  coordinateKeys?: string;
  hpdKeys?: string | null;
  manualMrsdIso?: string;
}

// Parse an MRSD override typed as either a decimal year (2017.31) or an ISO date
// (YYYY-MM-DD). Returns the ISO string, null when empty, or 'invalid'.
function parseMrsdOverride(input: string): string | null | 'invalid' {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const num = Number(trimmed);
  if (Number.isFinite(num) && num > 0) return decimalYearToISO(num);
  return 'invalid';
}

interface Props {
  wire: WireParseResult;
  onCancel: () => void;
  onConfirm: (selection: ImportSettingsSelection) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

function formatTrait(wire: WireParseResult): string {
  const traitInfo = wire.traitInfo;
  if (traitInfo.kind === 'continuous') return 'Continuous phylogeography';
  if (traitInfo.kind === 'discrete') return 'Discrete trait phylogeography';
  if (traitInfo.kind === 'discrete-ambiguous') return 'Discrete trait phylogeography';
  return 'Unrecognized';
}

function detectedAnalysisKind(wire: WireParseResult): 'continuous' | 'discrete' | '' {
  if (wire.traitInfo.kind === 'continuous') return 'continuous';
  if (wire.traitInfo.kind === 'discrete' || wire.traitInfo.kind === 'discrete-ambiguous') {
    return 'discrete';
  }
  return '';
}

function coordinateKeyOptions(wire: WireParseResult): Array<{ value: string; label: string }> {
  const keys = new Set<string>();
  const internalIds = new Set(
    wire.layout.nodes.filter((node) => !node.isTip).map((node) => node.id),
  );
  for (const node of wire.graph.nodes) {
    if (!internalIds.has(node.origId)) continue;
    for (const [key, value] of Object.entries(node.annotations)) {
      if (!key.includes('%') && typeof value === 'number' && Number.isFinite(value)) keys.add(key);
    }
  }
  if (wire.traitInfo.kind === 'continuous') {
    keys.add(wire.traitInfo.keyFamily.lat);
    keys.add(wire.traitInfo.keyFamily.lon);
  }
  return [...keys].sort().map((key) => ({ value: key, label: key }));
}

function hpdOptions(wire: WireParseResult): Array<{ value: string; label: string }> {
  const keys = new Set<string>();
  const internalIds = new Set(
    wire.layout.nodes.filter((node) => !node.isTip).map((node) => node.id),
  );
  for (const node of wire.graph.nodes) {
    if (!internalIds.has(node.origId)) continue;
    for (const [key, value] of Object.entries(node.annotations)) {
      if (key.includes('HPD') && Array.isArray(value)) keys.add(key);
    }
  }
  return [...keys]
    .filter((key) => {
      if (key.endsWith('_HPD')) {
        if (key.endsWith('1_95%_HPD')) return keys.has(key.replace(/1_95%_HPD$/, '2_95%_HPD'));
      }
      const multimodal = key.match(/^(.*1)_80%HPD_(\d+)$/);
      if (!multimodal) return false;
      const latBase = multimodal[1];
      const index = multimodal[2];
      return latBase !== undefined && index !== undefined
        ? keys.has(`${latBase.slice(0, -1)}2_80%HPD_${index}`)
        : false;
    })
    .sort()
    .map((lat) => {
      const lon = lat.endsWith('_HPD')
        ? lat.replace(/1_95%_HPD$/, '2_95%_HPD')
        : lat.replace(/1(_80%HPD_\d+)$/, '2$1');
      return { value: `${lat}|${lon}`, label: `${lat}, ${lon}` };
    });
}

function traitOptions(wire: WireParseResult): Array<{ value: string; label: string }> {
  const keys = [...wire.allDiscreteKeys];
  if (wire.traitInfo.kind === 'discrete' && !keys.includes(wire.traitInfo.key)) {
    keys.unshift(wire.traitInfo.key);
  }
  if (wire.traitInfo.kind === 'discrete-ambiguous') {
    for (const candidate of wire.traitInfo.candidates) {
      if (!keys.includes(candidate.key)) keys.push(candidate.key);
    }
  }
  return keys.map((key) => ({ value: key, label: key }));
}

function preferredDiscreteKey(keys: string[]): string {
  const preferred = ['location', 'state', 'region'];
  for (const key of preferred) {
    const match = keys.find((candidate) => candidate.toLowerCase() === key);
    if (match !== undefined) return match;
  }
  return keys[0] ?? '';
}

function defaultTraitSelection(wire: WireParseResult): string {
  if (wire.traitInfo.kind === 'discrete') return wire.traitInfo.key;
  if (wire.traitInfo.kind === 'discrete-ambiguous') {
    return preferredDiscreteKey(wire.traitInfo.candidates.map((candidate) => candidate.key));
  }
  return preferredDiscreteKey(traitOptions(wire).map((option) => option.value));
}

function defaultLatitudeSelection(wire: WireParseResult): string {
  if (wire.traitInfo.kind === 'continuous') {
    return wire.traitInfo.keyFamily.lat;
  }
  return coordinateKeyOptions(wire)[0]?.value ?? '';
}

function defaultLongitudeSelection(wire: WireParseResult): string {
  if (wire.traitInfo.kind === 'continuous') {
    return wire.traitInfo.keyFamily.lon;
  }
  return coordinateKeyOptions(wire)[1]?.value ?? coordinateKeyOptions(wire)[0]?.value ?? '';
}

function defaultHpdSelection(wire: WireParseResult): string {
  const options = hpdOptions(wire);
  if (wire.traitInfo.kind === 'continuous') {
    const defaultLat = `${wire.traitInfo.keyFamily.lat}_95%_HPD`;
    const defaultLon = `${wire.traitInfo.keyFamily.lon}_95%_HPD`;
    const defaultValue = `${defaultLat}|${defaultLon}`;
    if (options.some((option) => option.value === defaultValue)) return defaultValue;
  }
  return options[0]?.value ?? '';
}

function analysisOptions(
  coordinateOptions: Array<{ value: string; label: string }>,
  traitSelectOptions: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  if (coordinateOptions.length >= 2) options.push({ value: 'continuous', label: 'Continuous' });
  if (traitSelectOptions.length > 0) options.push({ value: 'discrete', label: 'Discrete' });
  return options;
}

function selectedImportSettings({
  analysisSelection,
  traitSelection,
  latitudeSelection,
  longitudeSelection,
  hpdSelection,
  defaultAnalysisSelection,
  defaultLatitudeSelection,
  defaultLongitudeSelection,
  defaultHpdSelection,
}: {
  analysisSelection: string;
  traitSelection: string;
  latitudeSelection: string;
  longitudeSelection: string;
  hpdSelection: string;
  defaultAnalysisSelection: string;
  defaultLatitudeSelection: string;
  defaultLongitudeSelection: string;
  defaultHpdSelection: string;
}): ImportSettingsSelection {
  if (analysisSelection === 'continuous') {
    return {
      ...(analysisSelection !== defaultAnalysisSelection ? { analysisKind: 'continuous' } : {}),
      ...(latitudeSelection !== defaultLatitudeSelection ||
      longitudeSelection !== defaultLongitudeSelection
        ? { coordinateKeys: `${latitudeSelection}|${longitudeSelection}` }
        : {}),
      ...(hpdSelection !== defaultHpdSelection
        ? { hpdKeys: hpdSelection === '' ? null : hpdSelection }
        : {}),
    };
  }
  if (analysisSelection === 'discrete') {
    return {
      ...(analysisSelection !== defaultAnalysisSelection ? { analysisKind: 'discrete' } : {}),
      ...(traitSelection !== '' ? { traitKey: traitSelection } : {}),
    };
  }
  return {};
}

function discreteLocationCount(wire: WireParseResult, traitKey: string): number {
  if (traitKey === '') return 0;
  const tipIds = new Set(wire.layout.nodes.filter((node) => node.isTip).map((node) => node.id));
  const values = new Set<string>();
  for (const node of wire.graph.nodes) {
    if (!tipIds.has(node.origId)) continue;
    const value = node.annotations[traitKey];
    if (typeof value === 'string') values.add(value);
  }
  if (values.size > 0) return values.size;
  if (wire.traitInfo.kind === 'discrete' && wire.traitInfo.key === traitKey) {
    return wire.traitInfo.values.length;
  }
  if (wire.traitInfo.kind === 'discrete-ambiguous') {
    return (
      wire.traitInfo.candidates.find((candidate) => candidate.key === traitKey)?.values.length ?? 0
    );
  }
  return 0;
}

function internalAnnotationCount(wire: WireParseResult): number {
  const internalIds = new Set(
    wire.layout.nodes.filter((node) => !node.isTip).map((node) => node.id),
  );
  const keys = new Set<string>();
  for (const node of wire.graph.nodes) {
    if (!internalIds.has(node.origId)) continue;
    for (const key of Object.keys(node.annotations)) {
      if (key !== '_node_label') keys.add(key);
    }
  }
  return keys.size;
}

export function ImportSettingsModal({ wire, onCancel, onConfirm, returnFocusRef }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalAccessibility({ dialogRef, onEscape: onCancel, returnFocusRef });
  const tips = wire.layout.nodes.filter((node) => node.isTip).length;
  const internalNodes = wire.layout.nodes.length - tips;
  const internalAnnotations = internalAnnotationCount(wire);
  const mrsdInfo = wire.mrsdInfo;
  const mrsdDecimal = mrsdInfo?.decimalYear ?? wire.dateRange[1];
  const mrsd = mrsdInfo?.substring
    ? `${mrsdInfo.substring} (${mrsdDecimal.toFixed(3)})`
    : mrsdDecimal.toFixed(3);
  const mrsdTaxon = mrsdInfo?.manual ? 'manual entry' : (mrsdInfo?.taxon ?? '—');
  const mrsdFormat = mrsdInfo?.format ? tipDateFormatLabel(mrsdInfo.format) : '—';
  const rootDate = decimalYearToISO(wire.dateRange[0]);
  const dateSource = wire.tipDateRows?.some((row) => row.source === 'tree-height')
    ? 'Tree heights anchored by MRSD'
    : 'Tip date annotations';
  const coordinateOptions = useMemo(() => coordinateKeyOptions(wire), [wire]);
  const hpdSelectOptions = useMemo(() => hpdOptions(wire), [wire]);
  const traitSelectOptions = useMemo(() => traitOptions(wire), [wire]);
  const analysisSelectOptions = useMemo(
    () => analysisOptions(coordinateOptions, traitSelectOptions),
    [coordinateOptions, traitSelectOptions],
  );
  const defaultAnalysis = detectedAnalysisKind(wire) || analysisSelectOptions[0]?.value || '';
  const defaultTrait = defaultTraitSelection(wire);
  const defaultLatitude = defaultLatitudeSelection(wire);
  const defaultLongitude = defaultLongitudeSelection(wire);
  const defaultHpd = defaultHpdSelection(wire);
  const [analysisSelection, setAnalysisSelection] = useState(defaultAnalysis);
  const [traitSelection, setTraitSelection] = useState(defaultTrait);
  const [latitudeSelection, setLatitudeSelection] = useState(defaultLatitude);
  const [longitudeSelection, setLongitudeSelection] = useState(defaultLongitude);
  const [hpdSelection, setHpdSelection] = useState(defaultHpd);
  const [mrsdOverride, setMrsdOverride] = useState('');
  const [mrsdError, setMrsdError] = useState<string | null>(null);

  return (
    <div className={styles.backdrop} data-testid="import-settings-modal-backdrop">
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-settings-title"
        tabIndex={-1}
        data-testid="import-settings-modal"
      >
        <h2 id="import-settings-title" className={styles.title}>
          Import Settings
        </h2>
        <div className={styles.summaryGrid}>
          <SummaryRow label="Tips" value={String(tips)} />
          <SummaryRow label="Internal nodes" value={String(internalNodes)} />
          <SummaryRow label="Internal annotations" value={`${internalAnnotations}`} />
          <SummaryRow label="MRSD" value={mrsd} />
          <SummaryRow label="MRSD taxon" value={mrsdTaxon} />
          <SummaryRow label="MRSD format" value={mrsdFormat} />
          <div className={styles.summaryRow}>
            <label className={styles.summaryLabel} htmlFor="import-mrsd-override">
              Override MRSD
            </label>
            <span className={styles.summaryValue}>
              <input
                id="import-mrsd-override"
                data-testid="import-mrsd-override"
                type="text"
                className={styles.mrsdInput}
                placeholder="decimal year or YYYY-MM-DD"
                value={mrsdOverride}
                onChange={(event) => {
                  setMrsdOverride(event.target.value);
                  setMrsdError(null);
                }}
              />
              {mrsdError ? (
                <span className={styles.mrsdError} role="alert">
                  {mrsdError}
                </span>
              ) : null}
            </span>
          </div>
          <SummaryRow label="Root date" value={`${rootDate} (${wire.dateRange[0].toFixed(3)})`} />
          <SummaryRow label="Node dates" value={dateSource} />
          <SummarySelect
            id="import-analysis-select"
            testId="import-analysis-select"
            label="Analysis"
            value={analysisSelection}
            options={analysisSelectOptions}
            allowNone={false}
            onChange={setAnalysisSelection}
          />
          {analysisSelection === 'continuous' ? (
            <>
              <SummarySelect
                id="import-latitude-select"
                testId="import-latitude-select"
                label="Latitude"
                value={latitudeSelection}
                options={coordinateOptions}
                onChange={setLatitudeSelection}
              />
              <SummarySelect
                id="import-longitude-select"
                testId="import-longitude-select"
                label="Longitude"
                value={longitudeSelection}
                options={coordinateOptions}
                onChange={setLongitudeSelection}
              />
              <SummarySelect
                id="import-hpd-select"
                testId="import-hpd-select"
                label="HPD polygons"
                value={hpdSelection}
                options={hpdSelectOptions}
                onChange={setHpdSelection}
              />
            </>
          ) : analysisSelection === 'discrete' ? (
            <>
              <SummarySelect
                id="import-geo-select"
                testId="import-geo-select"
                label="Location trait"
                value={traitSelection}
                options={traitSelectOptions}
                onChange={setTraitSelection}
              />
              <SummaryRow
                label="Detected locations"
                value={String(discreteLocationCount(wire, traitSelection))}
              />
            </>
          ) : (
            <SummaryRow label="Geo annotations" value={formatTrait(wire)} />
          )}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={() => {
              const override = parseMrsdOverride(mrsdOverride);
              if (override === 'invalid') {
                setMrsdError('Enter a decimal year (e.g. 2017.31) or YYYY-MM-DD');
                return;
              }
              onConfirm({
                ...selectedImportSettings({
                  analysisSelection,
                  traitSelection,
                  latitudeSelection,
                  longitudeSelection,
                  hpdSelection,
                  defaultAnalysisSelection: defaultAnalysis,
                  defaultLatitudeSelection: defaultLatitude,
                  defaultLongitudeSelection: defaultLongitude,
                  defaultHpdSelection: defaultHpd,
                }),
                ...(override ? { manualMrsdIso: override } : {}),
              });
            }}
            data-testid="import-settings-confirm"
          >
            Continue
          </button>
          <button
            type="button"
            className={styles.altBtn}
            onClick={onCancel}
            data-testid="import-settings-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={styles.summaryValue}>{value}</span>
    </div>
  );
}

function SummarySelect({
  id,
  testId,
  label,
  value,
  options,
  allowNone = true,
  onChange,
}: {
  id: string;
  testId: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  allowNone?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.summaryRow}>
      <label className={styles.summaryLabel} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={styles.selectInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      >
        {allowNone && <option value="">None</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
