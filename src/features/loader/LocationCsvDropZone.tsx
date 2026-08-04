import { FolderOpen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { matchGazetteer } from '../../lib/format/gazetteer';
import {
  detectLookupCSV,
  type LookupTableMetadata,
  resolveAmbiguousLookup,
} from '../../lib/format/lookup-csv';
import { assertInputSize } from '../../lib/security/input-limits';
import { MissingLocationAnnotationsNotice } from './LocationAnnotationWarning';
import styles from './LocationCsvDropZone.module.css';

interface ReviewState {
  csvText: string;
  stringCol: string;
  metadata: LookupTableMetadata;
  numericCols: string[];
  // Number of tree states found in the resolved mapping, or null when the
  // mapping is not resolved yet (ambiguous) or there are no tree states to
  // match against — in which case the summary row is hidden.
  matchedToTree: number | null;
}

function countMatchedToTree(mapping: Map<string, [number, number]>, values: string[]): number {
  const keys = new Set([...mapping.keys()].map((key) => key.trim().toLowerCase()));
  let matched = 0;
  for (const value of values) {
    if (keys.has(value.trim().toLowerCase())) matched += 1;
  }
  return matched;
}

interface Props {
  valueCount: number;
  values?: string[];
  traitName?: string;
  missingAnnotationCount?: number;
  onLookup: (mapping: Map<string, [number, number]>) => void;
  onSkip: () => void;
}

export function LocationCsvDropZone({
  valueCount,
  values = [],
  traitName = 'location',
  missingAnnotationCount = 0,
  onLookup,
  onSkip,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [latCol, setLatCol] = useState('');
  const [lonCol, setLonCol] = useState('');
  const [gazetteerMatched, setGazetteerMatched] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (values.length === 0) {
      setGazetteerMatched(0);
      return;
    }

    setGazetteerMatched(0);
    matchGazetteer(values)
      .then((mapping) => {
        if (!cancelled) setGazetteerMatched(mapping.size);
      })
      .catch(() => {
        if (!cancelled) setGazetteerMatched(0);
      });

    return () => {
      cancelled = true;
    };
  }, [values]);

  const processText = useCallback(
    (text: string) => {
      setError(null);
      try {
        const result = detectLookupCSV(text, values);
        if (result.kind === 'auto') {
          setReview({
            csvText: text,
            stringCol: result.stringCol,
            metadata: result.metadata,
            numericCols: result.numericCols,
            matchedToTree: values.length > 0 ? countMatchedToTree(result.mapping, values) : null,
          });
          setLatCol(result.latCol);
          setLonCol(result.lonCol);
        } else {
          setReview({
            csvText: text,
            stringCol: result.stringCol,
            metadata: result.metadata,
            numericCols: result.numericCols,
            matchedToTree: null,
          });
          setLatCol(result.numericCols[0] ?? '');
          setLonCol(result.numericCols[1] ?? '');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [values],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      try {
        assertInputSize('csv', file.size);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The CSV file is too large.');
        return;
      }
      file
        .text()
        .then(processText)
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : String(e));
        });
    },
    [processText],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (!file) return;
      try {
        assertInputSize('csv', file.size);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The CSV file is too large.');
        return;
      }
      file
        .text()
        .then(processText)
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : String(e));
        });
    },
    [processText],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleReviewConfirm = useCallback(() => {
    if (!review) return;
    try {
      const mapping = resolveAmbiguousLookup(review.csvText, review.stringCol, latCol, lonCol);
      onLookup(mapping);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [review, latCol, lonCol, onLookup]);

  if (review !== null) {
    const delimiterName = review.metadata.delimiter === '\t' ? 'Tab-delimited' : 'Comma-delimited';
    return (
      <div className={styles.root} data-testid="location-csv-drop-zone">
        <div className={styles.ambiguousModal} data-testid="csv-column-picker">
          <h2 className={styles.title}>Review location lookup</h2>
          <div className={styles.summaryGrid}>
            <SummaryRow label="Format" value={delimiterName} />
            <SummaryRow
              label="Column names"
              value={review.metadata.hasHeader ? 'Detected' : 'Not detected'}
            />
            <SummaryRow label="Rows" value={String(review.metadata.rowCount)} />
            <SummaryRow label="Columns" value={String(review.metadata.columns.length)} />
            <SummaryRow label="Location column" value={review.stringCol} />
            {review.matchedToTree !== null && (
              <SummaryRow
                label="Matched to tree states"
                value={`${review.matchedToTree} of ${values.length}`}
              />
            )}
          </div>
          {!review.metadata.hasHeader && (
            <p className={styles.body}>
              No column names were detected. The column matching the tree states will be used as
              locations; choose latitude and longitude columns below.
            </p>
          )}
          <p className={styles.body}>
            Choose the latitude and longitude columns before continuing.
          </p>
          <MissingLocationAnnotationsNotice count={missingAnnotationCount} traitName={traitName} />
          <label className={styles.fieldLabel}>
            Latitude
            <select
              className={styles.select}
              value={latCol}
              onChange={(e) => setLatCol(e.target.value)}
              data-testid="lat-col-select"
            >
              {review.numericCols.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.fieldLabel}>
            Longitude
            <select
              className={styles.select}
              value={lonCol}
              onChange={(e) => setLonCol(e.target.value)}
              data-testid="lon-col-select"
            >
              {review.numericCols.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={handleReviewConfirm}
            data-testid="csv-column-confirm"
          >
            Continue
          </button>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="location-csv-drop-zone">
      <div className={styles.errorCard}>
        <h2 className={styles.title}>Need a location lookup</h2>
        <p className={styles.body}>
          This tree uses discrete locations ({valueCount} distinct values). The built-in gazetteer
          located{' '}
          <strong data-testid="gazetteer-match-summary">
            {gazetteerMatched} of {valueCount}
          </strong>
          {gazetteerMatched > 0 ? ' (kept if you continue)' : ''}. Drop a CSV, TSV, or tab-delimited
          TXT file to place{' '}
          {gazetteerMatched > 0 ? `the other ${valueCount - gazetteerMatched}` : 'them'}:
        </p>
        <MissingLocationAnnotationsNotice count={missingAnnotationCount} traitName={traitName} />
        <pre className={styles.sample}>
          {'location,latitude,longitude\nGuangdong,23.13,113.27\nJiangxi,28.68,115.89'}
        </pre>
        <section
          aria-label="Drop zone for location CSV"
          className={[styles.dropZone, dragging ? styles.dropZoneDragging : ''].join(' ')}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          data-testid="csv-drop-target"
        >
          <span className={styles.dropLabel}>Drop locations file here</span>
          <span className={styles.dropFormats}>.csv .tsv .txt</span>
        </section>
        <button
          type="button"
          className={styles.openFileBtn}
          onClick={() => fileInputRef.current?.click()}
          data-testid="csv-open-file"
        >
          <FolderOpen size={16} aria-hidden="true" />
          Open locations file…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          className={styles.fileInput}
          tabIndex={-1}
          onChange={handleFileChange}
          data-testid="csv-file-input"
        />
        {error && (
          <p className={styles.error} data-testid="csv-error" role="alert">
            {error}
          </p>
        )}
        <div className={styles.skipGroup}>
          <button type="button" className={styles.skipBtn} onClick={onSkip} data-testid="csv-skip">
            {gazetteerMatched > 0
              ? 'Continue with matched locations'
              : 'Continue without coordinates'}
          </button>
          <p className={styles.skipHint}>
            {gazetteerMatched > 0
              ? `The tree loads now with those ${gazetteerMatched} placed; add the rest from the Locations panel anytime.`
              : 'The tree still loads; the map stays empty until you add coordinates from the Locations panel.'}
          </p>
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
