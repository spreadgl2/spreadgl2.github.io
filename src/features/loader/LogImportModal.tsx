import { FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasLogAnalyses,
  type LogContentSummary,
  summarizeLogColumns,
} from '../../lib/log/log-summary';
import type { LogInspection } from '../../lib/log/log-table';
import { assertInputSize } from '../../lib/security/input-limits';
import type { LogSource } from '../../store/tree';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import styles from './ImportModal.module.css';
import logStyles from './LogImportModal.module.css';

/** The log already loaded, if any. */
export interface CurrentLog {
  fileName: string;
  columnNames: string[];
  /** Samples kept after burn-in. */
  rowCount: number;
  /** Null when the log came from a project file and cannot be re-read. */
  source: LogSource | null;
}

interface Props {
  /** The tree's discrete states, or null for a continuous tree. */
  treeStates: string[] | null;
  current: CurrentLog | null;
  inspect: (file: File) => Promise<LogInspection>;
  /** Parses and stores the log; rejects with a user-facing error. */
  load: (file: File, burnInFraction: number, sampleCount: number) => Promise<void>;
  onRemove: () => void;
  onClose: () => void;
}

type Step =
  | { kind: 'current' }
  | { kind: 'pick' }
  | { kind: 'inspecting'; file: File }
  | { kind: 'review'; file: File; inspection: LogInspection; summary: LogContentSummary };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export const DEFAULT_BURN_IN_PERCENT = 10;

/** Samples dropped as burn-in; matches parseLogText's trimming. */
export function burnInSampleCount(sampleCount: number, burnInFraction: number): number {
  return Math.floor(sampleCount * burnInFraction);
}

function formatPercent(fraction: number): string {
  return String(Number((fraction * 100).toFixed(6)));
}

/** Burn-in percentage from user input, or null unless it is in [0, 100). */
export function parseBurnInPercent(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value < 100 ? value : null;
}

function contentNotices(summary: LogContentSummary, treeStates: string[] | null): string[] {
  if (!hasLogAnalyses(summary)) {
    return ['This log has no BSSVS indicators or Markov jump counts, so it adds no analyses.'];
  }
  const notices: string[] = [];
  if (summary.bssvsTraits.length > 0 && treeStates === null) {
    notices.push('BSSVS support needs a discrete tree; this tree is continuous.');
  } else if (summary.bssvsTraits.length > 0 && summary.matchedBssvsTrait === null) {
    notices.push(
      `None of the BSSVS traits (${summary.bssvsTraits.join(', ')}) match the tree's locations.`,
    );
  }
  return notices;
}

export function LogImportModal({ treeStates, current, inspect, load, onRemove, onClose }: Props) {
  const [step, setStep] = useState<Step>(() => (current ? { kind: 'current' } : { kind: 'pick' }));
  const [burnInText, setBurnInText] = useState(() =>
    current?.source
      ? formatPercent(current.source.burnInFraction)
      : String(DEFAULT_BURN_IN_PERCENT),
  );
  const burnInPercent = parseBurnInPercent(burnInText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openFileRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEscape = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useModalAccessibility({ dialogRef, initialFocusRef: openFileRef, onEscape: handleEscape });

  useEffect(() => {
    if (step.kind === 'review') confirmRef.current?.focus();
    if (step.kind === 'pick') openFileRef.current?.focus();
    if (step.kind === 'current') closeRef.current?.focus();
  }, [step.kind]);

  // Any burn-in below 100% keeps at least one sample (parseLogText floors the cut).
  const burnInError =
    burnInPercent === null ? 'Enter a burn-in of at least 0% and below 100%.' : null;

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith('.log')) {
        setError('Expected a BEAST .log file.');
        return;
      }
      try {
        assertInputSize('log', file.size);
      } catch (err) {
        setError(errorMessage(err, 'The log file is too large.'));
        return;
      }
      setError(null);
      setStep({ kind: 'inspecting', file });
      inspect(file).then(
        (inspection) =>
          setStep({
            kind: 'review',
            file,
            inspection,
            summary: summarizeLogColumns(inspection.columnNames, treeStates),
          }),
        (err: unknown) => {
          setError(errorMessage(err, 'Could not read the log file.'));
          setStep({ kind: 'pick' });
        },
      );
    },
    [inspect, treeStates],
  );

  const runLoad = useCallback(
    (file: File, sampleCount: number) => {
      if (burnInPercent === null) return;
      setError(null);
      setBusy(true);
      load(file, burnInPercent / 100, sampleCount).then(onClose, (err: unknown) => {
        setError(errorMessage(err, 'Could not load the log file.'));
        setBusy(false);
      });
    },
    [burnInPercent, load, onClose],
  );

  const handleConfirm = useCallback(() => {
    if (busy || step.kind !== 'review') return;
    runLoad(step.file, step.inspection.sampleCount);
  }, [busy, runLoad, step]);

  const source = current?.source ?? null;
  const burnInChanged =
    source !== null && burnInPercent !== null && burnInPercent / 100 !== source.burnInFraction;

  const handleApplyBurnIn = useCallback(() => {
    if (busy || !source || !burnInChanged) return;
    runLoad(source.file, source.sampleCount);
  }, [burnInChanged, busy, runLoad, source]);

  const handleChooseFile = useCallback(() => {
    setError(null);
    setBurnInText(String(DEFAULT_BURN_IN_PERCENT));
    setStep({ kind: 'pick' });
  }, []);

  const handleRemove = useCallback(() => {
    onRemove();
    onClose();
  }, [onClose, onRemove]);

  return (
    <div className={styles.backdrop} data-testid="log-import-backdrop">
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-import-title"
        tabIndex={-1}
        data-testid="log-import-modal"
      >
        <h2 id="log-import-title" className={styles.title}>
          {step.kind === 'current' ? 'BEAST log' : 'Load BEAST log'}
        </h2>

        {step.kind === 'pick' && (
          <>
            <p className={styles.body}>
              {current ? (
                <>
                  Choose a BEAST <code>.log</code> file to replace {current.fileName}. The current
                  log stays loaded until the new one loads.
                </>
              ) : (
                <>
                  Add a BEAST <code>.log</code> file for BSSVS support and Markov jumps. You can
                  review its contents before loading.
                </>
              )}
            </p>
            <section
              aria-label="Drop zone for BEAST log file"
              className={[logStyles.dropZone, dragging ? logStyles.dropZoneDragging : ''].join(' ')}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
              data-testid="log-drop-target"
            >
              <span className={logStyles.dropLabel}>Drop log file here</span>
              <span className={logStyles.dropFormats}>.log</span>
            </section>
            <button
              ref={openFileRef}
              type="button"
              className={logStyles.openFileBtn}
              onClick={() => fileInputRef.current?.click()}
              data-testid="log-open-file"
            >
              <FolderOpen size={16} aria-hidden="true" />
              Open log file…
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".log"
              className={logStyles.fileInput}
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) handleFile(file);
              }}
              data-testid="log-file-input"
            />
          </>
        )}

        {step.kind === 'inspecting' && (
          <p className={logStyles.status} role="status" data-testid="log-import-inspecting">
            Reading {step.file.name}…
          </p>
        )}

        {step.kind === 'review' && (
          <LogSummary
            fileName={step.file.name}
            sampleCount={step.inspection.sampleCount}
            columnCount={step.inspection.columnNames.length}
            summary={step.summary}
            notices={contentNotices(step.summary, treeStates)}
            burnIn={{
              text: burnInText,
              percent: burnInPercent,
              error: burnInError,
              disabled: busy,
              onChange: setBurnInText,
              onSubmit: handleConfirm,
            }}
          />
        )}

        {step.kind === 'current' && current && (
          <CurrentLogSummary
            current={current}
            treeStates={treeStates}
            burnIn={{
              text: burnInText,
              percent: burnInPercent,
              error: burnInError,
              disabled: busy,
              onChange: setBurnInText,
              onSubmit: handleApplyBurnIn,
            }}
          />
        )}

        {error && (
          <p className={styles.errorText} role="alert" data-testid="log-import-error">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          {step.kind === 'current' && (
            <>
              <button
                type="button"
                className={styles.altBtn}
                onClick={handleRemove}
                disabled={busy}
                data-testid="log-import-remove"
              >
                Remove log
              </button>
              <button
                type="button"
                className={styles.altBtn}
                onClick={handleChooseFile}
                disabled={busy}
                data-testid="log-import-replace"
              >
                Replace…
              </button>
              {source && (
                <button
                  type="button"
                  className={styles.confirmBtn}
                  onClick={handleApplyBurnIn}
                  disabled={busy || !burnInChanged}
                  data-testid="log-import-apply"
                >
                  {busy ? 'Applying…' : 'Apply burn-in'}
                </button>
              )}
            </>
          )}
          {step.kind === 'review' && (
            <>
              <button
                type="button"
                className={styles.altBtn}
                onClick={handleChooseFile}
                disabled={busy}
                data-testid="log-import-choose-another"
              >
                Choose another file
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={styles.confirmBtn}
                onClick={handleConfirm}
                disabled={busy || burnInError !== null}
                data-testid="log-import-confirm"
              >
                {busy ? 'Loading…' : 'Load log'}
              </button>
            </>
          )}
          <button
            ref={closeRef}
            type="button"
            className={styles.altBtn}
            onClick={onClose}
            disabled={busy}
            data-testid="log-import-cancel"
          >
            {step.kind === 'current' ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface BurnInField {
  text: string;
  percent: number | null;
  error: string | null;
  disabled: boolean;
  onChange: (text: string) => void;
  onSubmit: () => void;
}

function CurrentLogSummary({
  current,
  treeStates,
  burnIn,
}: {
  current: CurrentLog;
  treeStates: string[] | null;
  burnIn: BurnInField;
}) {
  const summary = summarizeLogColumns(current.columnNames, treeStates);
  return (
    <LogSummary
      fileName={current.fileName}
      sampleCount={current.source?.sampleCount ?? null}
      keptCount={current.rowCount}
      columnCount={current.columnNames.length}
      summary={summary}
      notices={contentNotices(summary, treeStates)}
      burnIn={current.source ? burnIn : null}
    />
  );
}

function LogSummary({
  fileName,
  sampleCount,
  keptCount,
  columnCount,
  summary,
  notices,
  burnIn,
}: {
  fileName: string;
  /** Total samples in the file; null when only the post-burn-in count is known. */
  sampleCount: number | null;
  keptCount?: number;
  columnCount: number;
  summary: LogContentSummary;
  notices: string[];
  /** Null when burn-in can no longer be changed (log restored from a project). */
  burnIn: BurnInField | null;
}) {
  const burned =
    burnIn && burnIn.percent !== null && sampleCount !== null
      ? burnInSampleCount(sampleCount, burnIn.percent / 100)
      : null;
  const bssvs =
    summary.matchedBssvsTrait ??
    (summary.bssvsTraits.length > 0 ? summary.bssvsTraits.join(', ') : 'not found');
  return (
    <>
      <div className={styles.summaryGrid} data-testid="log-import-summary">
        <SummaryRow label="File" value={fileName} testId="log-summary-file" />
        <SummaryRow
          label="Samples"
          value={
            sampleCount !== null
              ? sampleCount.toLocaleString()
              : `${(keptCount ?? 0).toLocaleString()} after burn-in`
          }
          testId="log-summary-samples"
        />
        {burnIn ? (
          <div className={styles.summaryRow}>
            <label className={styles.summaryLabel} htmlFor="log-import-burnin">
              Burn-in
            </label>
            <span className={logStyles.burnInRow}>
              <input
                id="log-import-burnin"
                type="number"
                inputMode="decimal"
                min={0}
                max={99}
                step="any"
                className={logStyles.burnInInput}
                value={burnIn.text}
                disabled={burnIn.disabled}
                aria-invalid={burnIn.error !== null}
                aria-describedby={burnIn.error ? 'log-import-burnin-error' : undefined}
                onChange={(e) => burnIn.onChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') burnIn.onSubmit();
                }}
                data-testid="log-import-burnin"
              />
              <span className={logStyles.burnInUnit}>%</span>
              {burned !== null && sampleCount !== null && (
                <span className={logStyles.burnInFraction} data-testid="log-burnin-fraction">
                  ({burned.toLocaleString()}/{sampleCount.toLocaleString()} samples)
                </span>
              )}
            </span>
          </div>
        ) : (
          <SummaryRow
            label="Burn-in"
            value="applied before the project was saved"
            testId="log-summary-burnin"
          />
        )}
        <SummaryRow
          label="Columns"
          value={columnCount.toLocaleString()}
          testId="log-summary-columns"
        />
        <SummaryRow label="BSSVS" value={bssvs} testId="log-summary-bssvs" />
        <SummaryRow
          label="Markov jumps"
          value={summary.markovJumpTrait ?? 'not found'}
          testId="log-summary-jumps"
        />
      </div>
      {burnIn?.error && (
        <p
          id="log-import-burnin-error"
          className={styles.errorText}
          role="alert"
          data-testid="log-import-burnin-error"
        >
          {burnIn.error}
        </p>
      )}
      {notices.map((notice) => (
        <p key={notice} className={logStyles.notice} data-testid="log-import-notice">
          {notice}
        </p>
      ))}
    </>
  );
}

function SummaryRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className={styles.summaryRow}>
      <span className={styles.summaryLabel}>{label}</span>
      <span className={styles.summaryValue} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
