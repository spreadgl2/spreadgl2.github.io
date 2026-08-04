import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  deriveTipDateRowsFromGraph,
  parseEditableTipDate,
  parseTipDateCSV,
  type TipDateFormat,
  type TipDateRow,
  type TipDateSource,
} from '../../lib/format/tip-date-table';
import { assertInputSize } from '../../lib/security/input-limits';
import { rebuildDatesFromRows } from '../../store/rebuild-dates';
import { useTreeStore } from '../../store/tree';
import styles from './LocationsPanel.module.css';

type SortCol = 'taxon' | 'substring' | 'date' | 'format' | 'source';

const COLS: { col: SortCol; label: string }[] = [
  { col: 'taxon', label: 'Taxon' },
  { col: 'substring', label: 'Raw date' },
  { col: 'date', label: 'Date' },
  { col: 'format', label: 'Format' },
  { col: 'source', label: 'Source' },
];

// Default and minimum widths (px) for the resizable Dates table columns.
const DEFAULT_COL_WIDTHS = [150, 95, 90, 95, 80];
const MIN_COL_WIDTH = 48;

const SOURCE_LABEL: Record<TipDateSource, string> = {
  annotation: 'annotation',
  parsed: 'parsed',
  'tree-height': 'tree height',
  manual: 'edited',
  csv: 'CSV',
  missing: 'missing',
};

const SOURCE_RANK: Record<TipDateSource, number> = {
  missing: 0,
  'tree-height': 1,
  parsed: 2,
  annotation: 3,
  csv: 4,
  manual: 5,
};

const FORMAT_LABEL: Record<TipDateFormat, string> = {
  'iso-pipe': 'YYYY-MM-DD',
  'day-month-year': 'DD-MM-YYYY',
  'year-pipe': 'YYYY',
  'decimal-underscore': 'YYYY.xxx',
  'decimal-year-underscore': 'YYYY.xxx',
  'year-month-slash': 'YYYY-MM',
  'year-only': 'YYYY',
  ambiguous: 'ambiguous',
  'iso-date': 'YYYY-MM-DD',
  'year-month': 'YYYY-MM',
  'decimal-year': 'YYYY.xxx',
  unknown: 'unknown',
};

function formatDecimalYear(value: number | null): string {
  if (value === null) return '';
  return String(Number(value.toFixed(3)));
}

function sortRows(rows: TipDateRow[], sort: { col: SortCol; dir: 'asc' | 'desc' } | null) {
  const out = [...rows];
  if (sort === null) {
    out.sort(
      (a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || a.taxon.localeCompare(b.taxon),
    );
    return out;
  }

  const factor = sort.dir === 'asc' ? 1 : -1;
  out.sort((a, b) => {
    let cmp = 0;
    if (sort.col === 'taxon') {
      cmp = a.taxon.localeCompare(b.taxon);
    } else if (sort.col === 'substring') {
      cmp = a.parsedSubstring.localeCompare(b.parsedSubstring);
    } else if (sort.col === 'format') {
      cmp = FORMAT_LABEL[a.format].localeCompare(FORMAT_LABEL[b.format]);
    } else if (sort.col === 'source') {
      cmp = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
    } else {
      const av = a.decimalYear;
      const bv = b.decimalYear;
      if (av === null && bv === null) cmp = 0;
      else if (av === null) return 1;
      else if (bv === null) return -1;
      else cmp = av - bv;
    }
    return cmp !== 0 ? cmp * factor : a.taxon.localeCompare(b.taxon);
  });
  return out;
}

function commitRows(rows: TipDateRow[]) {
  rebuildDatesFromRows(rows);
}

interface DateRowProps {
  row: TipDateRow;
  validDateCount: number;
  onCommit: (
    nodeId: string,
    parsedSubstring: string,
    decimalYear: number | null,
    format: TipDateFormat,
  ) => void;
}

function DateTableRow({ row, validDateCount, onCommit }: DateRowProps) {
  const [dateText, setDateText] = useState(formatDecimalYear(row.decimalYear));
  const sourceClass = styles[`status_${row.source.replace('-', '_')}`];

  useEffect(() => {
    setDateText(formatDecimalYear(row.decimalYear));
  }, [row.decimalYear]);

  const commit = useCallback(() => {
    const raw = dateText.trim();
    const currentText = formatDecimalYear(row.decimalYear);
    if (raw === currentText) return;

    if (raw === '') {
      if (row.decimalYear === null) return;
      if (validDateCount <= 1) {
        setDateText(currentText);
        return;
      }
      onCommit(row.nodeId, '', null, 'unknown');
      return;
    }

    const parsed = parseEditableTipDate(raw);
    if (!parsed) {
      setDateText(currentText);
      return;
    }

    const nextText = formatDecimalYear(parsed.decimalYear);
    setDateText(nextText);
    if (nextText !== currentText) {
      onCommit(row.nodeId, parsed.raw, parsed.decimalYear, parsed.format);
    }
  }, [dateText, onCommit, row, validDateCount]);

  return (
    <tr
      className={row.decimalYear === null ? styles.rowUnmatched : undefined}
      data-testid={`date-row-${row.nodeId}`}
    >
      <td className={styles.nameCell} title={row.taxon}>
        {row.taxon}
      </td>
      <td className={styles.substringCell} title={row.parsedSubstring}>
        {row.parsedSubstring || '—'}
      </td>
      <td>
        <input
          className={styles.dateInput}
          aria-label={`Date for ${row.taxon}`}
          value={dateText}
          onChange={(e) => setDateText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </td>
      <td className={styles.formatCell}>{FORMAT_LABEL[row.format]}</td>
      <td>
        <span className={[styles.statusTag, sourceClass].join(' ')}>
          {SOURCE_LABEL[row.source]}
        </span>
      </td>
    </tr>
  );
}

export function DatesPanel() {
  const tipDateRows = useTreeStore((s) => s.tipDateRows);
  const graph = useTreeStore((s) => s.graph);
  const layout = useTreeStore((s) => s.layout);
  const setTipDateRows = useTreeStore((s) => s.setTipDateRows);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' } | null>(null);
  const [colWidths, setColWidths] = useState<number[]>(DEFAULT_COL_WIDTHS);

  const derivedRows = useMemo(() => {
    if (tipDateRows.length > 0 || !graph || !layout) return [];
    return deriveTipDateRowsFromGraph(graph, layout);
  }, [graph, layout, tipDateRows.length]);
  const activeRows = tipDateRows.length > 0 ? tipDateRows : derivedRows;
  const rows = useMemo(() => sortRows(activeRows, sort), [activeRows, sort]);
  const validDateCount = activeRows.filter((row) => row.decimalYear !== null).length;
  const missingCount = activeRows.length - validDateCount;

  useEffect(() => {
    if (tipDateRows.length === 0 && derivedRows.length > 0) setTipDateRows(derivedRows);
  }, [derivedRows, setTipDateRows, tipDateRows.length]);

  const handleHeaderClick = useCallback((col: SortCol) => {
    setSort((cur) => {
      if (cur?.col === col) return { col, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
      return { col, dir: 'asc' };
    });
  }, []);

  const sortIndicator = useCallback(
    (col: SortCol) => (sort?.col === col ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''),
    [sort],
  );

  const handleCommit = useCallback(
    (
      nodeId: string,
      parsedSubstring: string,
      decimalYear: number | null,
      format: TipDateFormat,
    ) => {
      const next = activeRows.map((row) =>
        row.nodeId === nodeId
          ? {
              ...row,
              parsedSubstring,
              decimalYear,
              format,
              source: 'manual' as const,
            }
          : row,
      );
      commitRows(next);
    },
    [activeRows],
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        assertInputSize('csv', file.size);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'The CSV file is too large.');
        return;
      }

      file
        .text()
        .then((text) => {
          const imported = parseTipDateCSV(text);
          let matched = 0;
          const next = activeRows.map((row) => {
            const parsed = imported.get(row.taxon) ?? imported.get(row.nodeId);
            if (!parsed) return row;
            matched += 1;
            return {
              ...row,
              parsedSubstring: parsed.raw,
              decimalYear: parsed.decimalYear,
              format: parsed.format,
              source: 'csv' as const,
            };
          });

          if (matched === 0) {
            setImportError('No CSV rows matched current taxon names');
            return;
          }

          setImportError(null);
          commitRows(next);
        })
        .catch((err: unknown) => {
          setImportError(err instanceof Error ? err.message : String(err));
        });
    },
    [activeRows],
  );

  // Drag a header's right edge to resize just that column. Widening the Taxon
  // column reveals more of long tip names; the table scrolls horizontally if the
  // total exceeds the panel width.
  const startColResize = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = colWidths[index] ?? DEFAULT_COL_WIDTHS[index] ?? 90;
      const onMove = (mv: globalThis.MouseEvent) => {
        const next = Math.max(MIN_COL_WIDTH, startWidth + (mv.clientX - startX));
        setColWidths((prev) => prev.map((w, i) => (i === index ? next : w)));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [colWidths],
  );

  const headerCell = (col: SortCol, label: string, index: number) => (
    <th className={styles.colHeader}>
      <button
        type="button"
        className={styles.sortHeader}
        data-testid={`dates-sort-${col}`}
        onClick={() => handleHeaderClick(col)}
      >
        {label}
        {sortIndicator(col)}
      </button>
      <button
        type="button"
        className={styles.colResizeHandle}
        data-testid={`dates-col-resize-${col}`}
        aria-label={`Resize ${label} column`}
        onMouseDown={(e) => startColResize(index, e)}
      />
    </th>
  );

  const totalColWidth = colWidths.reduce((sum, w) => sum + w, 0);

  if (activeRows.length === 0) {
    return (
      <div className={styles.panel} data-testid="dates-panel">
        <p className={styles.emptyNote}>No tip-date metadata is available for this tree.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel} data-testid="dates-panel">
      <div className={styles.summary}>
        {activeRows.length} tips
        {missingCount > 0 && (
          <span className={styles.unmatchedCount} data-testid="dates-missing-count">
            {' · '}
            {missingCount} missing
          </span>
        )}
      </div>
      <p className={styles.unmatchedHelp} data-testid="dates-help">
        Edit dates directly, or import a CSV with taxon/name and date columns.
      </p>
      <div className={styles.importRow}>
        <button
          type="button"
          className={styles.importBtn}
          data-testid="dates-import-btn"
          onClick={handleImportClick}
        >
          Import CSV…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          data-testid="dates-csv-input"
          onChange={handleFileChange}
        />
      </div>
      {importError && (
        <p className={styles.importError} data-testid="dates-import-error">
          {importError}
        </p>
      )}

      <div className={styles.tableScroll}>
        <table className={styles.table} style={{ width: totalColWidth, minWidth: '100%' }}>
          <colgroup>
            {COLS.map((c, i) => (
              <col key={c.col} style={{ width: `${colWidths[i]}px` }} />
            ))}
          </colgroup>
          <thead>
            <tr>{COLS.map((c, i) => headerCell(c.col, c.label, i))}</tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <DateTableRow
                key={row.nodeId}
                row={row}
                validDateCount={validDateCount}
                onCommit={handleCommit}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
