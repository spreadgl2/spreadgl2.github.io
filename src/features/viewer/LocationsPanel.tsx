import { MapPin } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { detectLookupCSV } from '../../lib/format/lookup-csv';
import { countMissingNodeAnnotations } from '../../lib/phylo/geo-completeness';
import { assertInputSize } from '../../lib/security/input-limits';
import { rebuildFromStore } from '../../store/rebuild-branch-table';
import type { GeoSource } from '../../store/tree';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import { MissingLocationAnnotationsNotice } from '../loader/LocationAnnotationWarning';
import styles from './LocationsPanel.module.css';

type RowStatus = GeoSource | 'unmatched';
type SortCol = 'name' | 'lat' | 'lon' | 'source';

interface LocationRow {
  name: string;
  lat: number | null;
  lon: number | null;
  status: RowStatus;
}

const STATUS_LABEL: Record<RowStatus, string> = {
  unmatched: 'unmatched',
  gazetteer: 'gazetteer',
  csv: 'CSV',
  manual: 'edited',
};

// Sort rank for the source column: unmatched first (needs attention).
const STATUS_RANK: Record<RowStatus, number> = {
  unmatched: 0,
  gazetteer: 1,
  csv: 2,
  manual: 3,
};

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}

function formatCoordinate(value: number | null): string {
  return value === null ? '' : String(roundCoordinate(value));
}

function commitManualGeoEntry(name: string, lat: number, lon: number): void {
  useTreeStore.getState().updateGeoEntry(name, lat, lon);
  rebuildFromStore();
}

function commitImportedGeoEntries(entries: Map<string, [number, number]>): void {
  useTreeStore.getState().mergeGeoEntries(entries, 'csv');
  rebuildFromStore();
}

interface RowProps {
  row: LocationRow;
  onCommit: (name: string, lat: number, lon: number) => void;
  mapVisible: boolean;
  pickLocationName: string | null;
  onTogglePick: (name: string) => void;
  onHoverPick: (name: string | null) => void;
}

function LocationTableRow({
  row,
  onCommit,
  mapVisible,
  pickLocationName,
  onTogglePick,
  onHoverPick,
}: RowProps) {
  const [lat, setLat] = useState(formatCoordinate(row.lat));
  const [lon, setLon] = useState(formatCoordinate(row.lon));
  const [coordinateError, setCoordinateError] = useState<string | null>(null);
  const coordinateErrorId = useId();

  useEffect(() => {
    setLat(formatCoordinate(row.lat));
    setLon(formatCoordinate(row.lon));
    setCoordinateError(null);
  }, [row.lat, row.lon]);

  const commit = useCallback(() => {
    const latText = lat.trim();
    const lonText = lon.trim();
    const hasLat = latText !== '';
    const hasLon = lonText !== '';
    if (!hasLat || !hasLon) {
      setCoordinateError('Enter both latitude and longitude.');
      return;
    }

    const latNum = Number(latText);
    const lonNum = Number(lonText);
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      setCoordinateError('Latitude must be between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lonNum) || lonNum < -180 || lonNum > 180) {
      setCoordinateError('Longitude must be between -180 and 180.');
      return;
    }
    setCoordinateError(null);
    const roundedLat = roundCoordinate(latNum);
    const roundedLon = roundCoordinate(lonNum);
    setLat(formatCoordinate(roundedLat));
    setLon(formatCoordinate(roundedLon));
    if (roundedLat !== row.lat || roundedLon !== row.lon) {
      onCommit(row.name, roundedLat, roundedLon);
    }
  }, [lat, lon, row, onCommit]);

  return (
    <tr
      className={row.status === 'unmatched' ? styles.rowUnmatched : undefined}
      data-testid={`location-row-${row.name}`}
    >
      <td className={styles.pickCell}>
        <button
          type="button"
          className={[
            styles.pickBtn,
            pickLocationName === row.name ? styles.pickBtnActive : '',
          ].join(' ')}
          data-testid={`location-pick-${row.name}`}
          aria-label={`Pick coordinates on map for ${row.name}`}
          aria-pressed={pickLocationName === row.name}
          title={mapVisible ? 'Pick on map' : 'Show the map to use this'}
          disabled={!mapVisible}
          onClick={() => onTogglePick(row.name)}
          onMouseEnter={() => onHoverPick(row.name)}
          onMouseLeave={() => onHoverPick(null)}
          onFocus={() => onHoverPick(row.name)}
          onBlur={() => onHoverPick(null)}
        >
          <MapPin size={13} aria-hidden="true" />
        </button>
      </td>
      <td className={styles.nameCell} title={row.name}>
        <span className={styles.nameText}>{row.name}</span>
        {coordinateError && (
          <span id={coordinateErrorId} className={styles.coordinateError} role="alert">
            {coordinateError}
          </span>
        )}
      </td>
      <td>
        <input
          className={styles.coordInput}
          type="number"
          step="0.01"
          min="-90"
          max="90"
          aria-label={`Latitude for ${row.name}`}
          aria-invalid={coordinateError ? 'true' : undefined}
          aria-describedby={coordinateError ? coordinateErrorId : undefined}
          value={lat}
          onChange={(e) => {
            setLat(e.target.value);
            setCoordinateError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setLat(formatCoordinate(row.lat));
              setLon(formatCoordinate(row.lon));
              setCoordinateError(null);
            }
          }}
        />
      </td>
      <td>
        <input
          className={styles.coordInput}
          type="number"
          step="0.01"
          min="-180"
          max="180"
          aria-label={`Longitude for ${row.name}`}
          aria-invalid={coordinateError ? 'true' : undefined}
          aria-describedby={coordinateError ? coordinateErrorId : undefined}
          value={lon}
          onChange={(e) => {
            setLon(e.target.value);
            setCoordinateError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setLat(formatCoordinate(row.lat));
              setLon(formatCoordinate(row.lon));
              setCoordinateError(null);
            }
          }}
        />
      </td>
      <td>
        <span className={[styles.statusTag, styles[`status_${row.status}`]].join(' ')}>
          {STATUS_LABEL[row.status]}
        </span>
      </td>
    </tr>
  );
}

export function LocationsPanel() {
  const graph = useTreeStore((s) => s.graph);
  const traitInfo = useTreeStore((s) => s.traitInfo);
  const discreteGeoLookup = useTreeStore((s) => s.discreteGeoLookup);
  const discreteGeoSource = useTreeStore((s) => s.discreteGeoSource);
  const mapVisible = useUiStore((s) => s.visibleViews.map);
  const pickLocationName = useUiStore((s) => s.pickLocationName);
  const setPickLocationName = useUiStore((s) => s.setPickLocationName);
  const setHoveredLocationName = useUiStore((s) => s.setHoveredLocationName);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' } | null>(null);

  const rows = useMemo<LocationRow[]>(() => {
    if (traitInfo?.kind !== 'discrete') return [];
    const out: LocationRow[] = traitInfo.values.map((name) => {
      const coord = discreteGeoLookup?.get(name);
      const status: RowStatus = coord ? (discreteGeoSource?.get(name) ?? 'gazetteer') : 'unmatched';
      return { name, lat: coord ? coord[0] : null, lon: coord ? coord[1] : null, status };
    });

    if (sort === null) {
      // Default: unmatched first (need attention), then alphabetical.
      out.sort((a, b) => {
        if (a.status === 'unmatched' && b.status !== 'unmatched') return -1;
        if (b.status === 'unmatched' && a.status !== 'unmatched') return 1;
        return a.name.localeCompare(b.name);
      });
      return out;
    }

    const factor = sort.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      let cmp = 0;
      if (sort.col === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sort.col === 'source') {
        cmp = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      } else {
        // lat / lon — nulls (unmatched) always sort last regardless of dir.
        const av = a[sort.col];
        const bv = b[sort.col];
        if (av === null && bv === null) cmp = 0;
        else if (av === null) return 1;
        else if (bv === null) return -1;
        else cmp = av - bv;
      }
      return cmp !== 0 ? cmp * factor : a.name.localeCompare(b.name);
    });
    return out;
  }, [traitInfo, discreteGeoLookup, discreteGeoSource, sort]);

  const unmatchedCount = rows.filter((r) => r.status === 'unmatched').length;
  const missingAnnotationCount = useMemo(
    () =>
      graph && traitInfo?.kind === 'discrete'
        ? countMissingNodeAnnotations(graph, traitInfo.key).internal
        : 0,
    [graph, traitInfo],
  );

  useEffect(() => () => setHoveredLocationName(null), [setHoveredLocationName]);

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

  const handleCommit = useCallback((name: string, lat: number, lon: number) => {
    commitManualGeoEntry(name, lat, lon);
  }, []);

  const handleTogglePick = useCallback(
    (name: string) => {
      setPickLocationName(pickLocationName === name ? null : name);
    },
    [pickLocationName, setPickLocationName],
  );

  const handleHoverPick = useCallback(
    (name: string | null) => {
      setHoveredLocationName(name);
    },
    [setHoveredLocationName],
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (fileInputRef.current) fileInputRef.current.value = '';
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
          const expectedValues = traitInfo?.kind === 'discrete' ? traitInfo.values : undefined;
          const result = detectLookupCSV(text, expectedValues);
          if (result.kind !== 'auto') {
            setImportError(
              'Could not auto-detect coordinate columns. Use a CSV with location, latitude, longitude columns.',
            );
            return;
          }
          setImportError(null);
          commitImportedGeoEntries(result.mapping);
        })
        .catch((err: unknown) => {
          setImportError(err instanceof Error ? err.message : String(err));
        });
    },
    [traitInfo],
  );

  if (traitInfo?.kind !== 'discrete') {
    return (
      <div className={styles.panel} data-testid="locations-panel">
        <p className={styles.emptyNote}>
          Location coordinates apply to discrete-trait trees. This tree has no discrete location
          trait.
        </p>
      </div>
    );
  }

  const headerCell = (col: SortCol, label: string) => (
    <th>
      <button
        type="button"
        className={styles.sortHeader}
        data-testid={`locations-sort-${col}`}
        onClick={() => handleHeaderClick(col)}
      >
        {label}
        {sortIndicator(col)}
      </button>
    </th>
  );

  return (
    <div className={styles.panel} data-testid="locations-panel">
      <div className={styles.summary}>
        {rows.length} locations
        {unmatchedCount > 0 && (
          <span className={styles.unmatchedCount} data-testid="locations-unmatched-count">
            {' · '}
            {unmatchedCount} unmatched
          </span>
        )}
      </div>
      <MissingLocationAnnotationsNotice count={missingAnnotationCount} traitName={traitInfo.key} />
      {unmatchedCount > 0 && (
        <p className={styles.unmatchedHelp} data-testid="locations-unmatched-help">
          Load a CSV with coordinates, enter latitude and longitude manually, or click a pin icon
          and then click the map.
        </p>
      )}

      <div className={styles.importRow}>
        <button
          type="button"
          className={styles.importBtn}
          data-testid="locations-import-btn"
          onClick={handleImportClick}
        >
          Import CSV…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          data-testid="locations-csv-input"
          onChange={handleFileChange}
        />
      </div>
      {importError && (
        <p className={styles.importError} data-testid="locations-import-error">
          {importError}
        </p>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.pickHeader} aria-label="Pick on map" />
            {headerCell('name', 'Location')}
            {headerCell('lat', 'Lat')}
            {headerCell('lon', 'Lon')}
            {headerCell('source', 'Source')}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <LocationTableRow
              key={row.name}
              row={row}
              onCommit={handleCommit}
              mapVisible={mapVisible}
              pickLocationName={pickLocationName}
              onTogglePick={handleTogglePick}
              onHoverPick={handleHoverPick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
