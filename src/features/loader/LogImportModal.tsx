import { FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasLogAnalyses,
  type LogContentSummary,
  summarizeLogColumns,
} from '../../lib/log/log-summary';
import type { LogInspection } from '../../lib/log/log-table';
import { assertInputSize } from '../../lib/security/input-limits';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import styles from './ImportModal.module.css';
import logStyles from './LogImportModal.module.css';

interface Props {
  /** The tree's discrete states, or null for a continuous tree. */
  treeStates: string[] | null;
  inspect: (file: File) => Promise<LogInspection>;
  /** Parses and stores the log; rejects with a user-facing error. */
  load: (file: File, burnInFraction: number) => Promise<void>;
  onClose: () => void;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'inspecting'; file: File }
  | { kind: 'review'; file: File; inspection: LogInspection; summary: LogContentSummary }
  | { kind: 'loading'; file: File; inspection: LogInspection; summary: LogContentSummary };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export const DEFAULT_BURN_IN_PERCENT = 10;

/** Samples dropped as burn-in; matches parseLogText's trimming. */
export function burnInSampleCount(sampleCount: number, burnInFraction: number): number {
  return Math.floor(sampleCount * burnInFraction);
}

/** Burn-in percentage from user input, or null unless it is in [0, 100). */
export function parseBurnInPercent(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 && value < 100 ? value : null;
}

function contentNotices(summary: LogContentSummary, treeStates: string[] | null): string[] {
  if (!hasLogAnalyses(summary)) {
    return [
      'This log has no BSSVS indicators, Markov jump counts or actual rates, so it adds no analyses.',
    ];
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

export function LogImportModal({ treeStates, inspect, load, onClose }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [burnInText, setBurnInText] = useState(String(DEFAULT_BURN_IN_PERCENT));
  const burnInPercent = parseBurnInPercent(burnInText);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openFileRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loading = step.kind === 'loading';

  const handleEscape = useCallback(() => {
    if (!loading) onClose();
  }, [loading, onClose]);
  useModalAccessibility({ dialogRef, initialFocusRef: openFileRef, onEscape: handleEscape });

  useEffect(() => {
    if (step.kind === 'review') confirmRef.current?.focus();
    if (step.kind === 'pick') openFileRef.current?.focus();
  }, [step.kind]);

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

  const handleConfirm = useCallback(() => {
    if (step.kind !== 'review' || burnInPercent === null) return;
    setError(null);
    setStep({ ...step, kind: 'loading' });
    load(step.file, burnInPercent / 100).then(onClose, (err: unknown) => {
      setError(errorMessage(err, 'Could not load the log file.'));
      setStep({ ...step, kind: 'review' });
    });
  }, [burnInPercent, load, onClose, step]);

  // Any burn-in below 100% keeps at least one sample (parseLogText floors the cut).
  const reviewBurnInError =
    burnInPercent === null ? 'Enter a burn-in of at least 0% and below 100%.' : null;

  const handleChooseAnother = useCallback(() => {
    setError(null);
    setStep({ kind: 'pick' });
  }, []);

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
          Load BEAST log
        </h2>

        {step.kind === 'pick' && (
          <>
            <p className={styles.body}>
              Add a BEAST <code>.log</code> file for BSSVS support, Markov jumps and actual
              migration rates. You can review its contents before loading.
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

        {(step.kind === 'review' || step.kind === 'loading') && (
          <LogReview
            fileName={step.file.name}
            inspection={step.inspection}
            summary={step.summary}
            burnInText={burnInText}
            burnInPercent={burnInPercent}
            burnInError={reviewBurnInError}
            disabled={loading}
            onBurnInChange={setBurnInText}
            onSubmit={handleConfirm}
            notices={contentNotices(step.summary, treeStates)}
          />
        )}

        {error && (
          <p className={styles.errorText} role="alert" data-testid="log-import-error">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          {(step.kind === 'review' || step.kind === 'loading') && (
            <>
              <button
                type="button"
                className={styles.altBtn}
                onClick={handleChooseAnother}
                disabled={loading}
                data-testid="log-import-choose-another"
              >
                Choose another file
              </button>
              <button
                ref={confirmRef}
                type="button"
                className={styles.confirmBtn}
                onClick={handleConfirm}
                disabled={loading || reviewBurnInError !== null}
                data-testid="log-import-confirm"
              >
                {loading ? 'Loading…' : 'Load log'}
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.altBtn}
            onClick={onClose}
            disabled={loading}
            data-testid="log-import-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function LogReview({
  fileName,
  inspection,
  summary,
  burnInText,
  burnInPercent,
  burnInError,
  disabled,
  onBurnInChange,
  onSubmit,
  notices,
}: {
  fileName: string;
  inspection: LogInspection;
  summary: LogContentSummary;
  burnInText: string;
  burnInPercent: number | null;
  burnInError: string | null;
  disabled: boolean;
  onBurnInChange: (text: string) => void;
  onSubmit: () => void;
  notices: string[];
}) {
  const burned =
    burnInPercent === null ? null : burnInSampleCount(inspection.sampleCount, burnInPercent / 100);
  const bssvs =
    summary.matchedBssvsTrait ??
    (summary.bssvsTraits.length > 0 ? summary.bssvsTraits.join(', ') : 'not found');
  return (
    <>
      <div className={styles.summaryGrid} data-testid="log-import-summary">
        <SummaryRow label="File" value={fileName} testId="log-summary-file" />
        <SummaryRow
          label="Samples"
          value={inspection.sampleCount.toLocaleString()}
          testId="log-summary-samples"
        />
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
              value={burnInText}
              disabled={disabled}
              aria-invalid={burnInError !== null}
              aria-describedby={burnInError ? 'log-import-burnin-error' : undefined}
              onChange={(e) => onBurnInChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit();
              }}
              data-testid="log-import-burnin"
            />
            <span className={logStyles.burnInUnit}>%</span>
            {burned !== null && (
              <span className={logStyles.burnInFraction} data-testid="log-burnin-fraction">
                ({burned.toLocaleString()}/{inspection.sampleCount.toLocaleString()} samples)
              </span>
            )}
          </span>
        </div>
        <SummaryRow
          label="Columns"
          value={inspection.columnNames.length.toLocaleString()}
          testId="log-summary-columns"
        />
        <SummaryRow label="BSSVS" value={bssvs} testId="log-summary-bssvs" />
        <SummaryRow
          label="Markov jumps"
          value={summary.markovJumpTrait ?? 'not found'}
          testId="log-summary-jumps"
        />
        <SummaryRow
          label="Actual rates"
          value={summary.actualRatesTrait ?? 'not found'}
          testId="log-summary-rates"
        />
      </div>
      {burnInError && (
        <p
          id="log-import-burnin-error"
          className={styles.errorText}
          role="alert"
          data-testid="log-import-burnin-error"
        >
          {burnInError}
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
