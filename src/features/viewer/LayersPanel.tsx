import type { FeatureCollection } from 'geojson';
import { useCallback, useRef, useState } from 'react';
import { ENV_PALETTES, type EnvPaletteId } from '../../lib/env/palettes';
import { parseEnvCSV } from '../../lib/format/env-csv';
import { loadGeoTIFF } from '../../lib/geotiff/loader';
import { parseFeatureCollection } from '../../lib/security/geojson';
import { assertInputSize } from '../../lib/security/input-limits';
import { useEnvStore } from '../../store/env';
import { useRasterStore } from '../../store/raster';
import { useTreeStore } from '../../store/tree';
import { LayerToggleCard } from './LayerCard';
import styles from './LayersPanel.module.css';

const REGION_DATA_DISABLED_TITLE =
  'Load a boundary GeoJSON first so CSV values can be matched to regions.';

export function LayersPanel() {
  const addCustomOverlay = useTreeStore((s) => s.addCustomOverlay);
  const addChoroplethOverlay = useTreeStore((s) => s.addChoroplethOverlay);
  const clearCustomOverlays = useTreeStore((s) => s.clearCustomOverlays);
  const clearChoroplethOverlays = useTreeStore((s) => s.clearChoroplethOverlays);
  const customOverlays = useTreeStore((s) => s.customOverlays);
  const choroplethOverlays = useTreeStore((s) => s.choroplethOverlays);
  const setRaster = useRasterStore((s) => s.setRaster);
  const raster = useRasterStore((s) => s.raster);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const envCsvInputRef = useRef<HTMLInputElement>(null);
  const geotiffInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const envColumns = useEnvStore((s) => s.columns);
  const activeEnvKey = useEnvStore((s) => s.activeKey);
  const paletteOverride = useEnvStore((s) => s.paletteOverride);
  const setActiveKey = useEnvStore((s) => s.setActiveKey);
  const setPaletteOverride = useEnvStore((s) => s.setPaletteOverride);
  const setEnvColumns = useEnvStore((s) => s.setColumns);

  const boundaryOverlay = customOverlays[0] ?? null;
  const canAddRegionData = boundaryOverlay !== null;

  const activeColumn = envColumns.find((c) => c.key === activeEnvKey) ?? null;
  const resolvedPaletteOverride = activeEnvKey ? (paletteOverride[activeEnvKey] ?? 'auto') : 'auto';

  const handleAddOverlay = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAddEnvCsv = useCallback(() => {
    if (!canAddRegionData) return;
    envCsvInputRef.current?.click();
  }, [canAddRegionData]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        assertInputSize('geojson', file.size);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'The GeoJSON file is too large.');
        return;
      }
      setImportError(null);

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = parseFeatureCollection(ev.target?.result as string);
          addCustomOverlay({
            id: crypto.randomUUID(),
            name: file.name.replace(/\.geojson$/i, ''),
            data,
          });
        } catch (err) {
          setImportError(err instanceof Error ? err.message : 'Could not read the GeoJSON file.');
        }
      };
      reader.onerror = () => setImportError('Could not read the GeoJSON file.');
      reader.readAsText(file);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [addCustomOverlay],
  );

  const handleEnvCsvChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!boundaryOverlay) return;
      try {
        assertInputSize('csv', file.size);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'The CSV file is too large.');
        return;
      }
      setImportError(null);

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          const parsed = parseEnvCSV(text);
          const firstCol = parsed.numericCols[0];
          if (!firstCol) return;

          const valueByLocation = parsed.valueByLocation(firstCol);

          const baseGeojson: FeatureCollection = boundaryOverlay.data;

          addChoroplethOverlay({
            id: crypto.randomUUID(),
            name: file.name.replace(/\.csv$/i, ''),
            data: baseGeojson,
            valueByLocation,
            valueColumn: firstCol,
            locationCol: parsed.locationCol,
          });

          setEnvColumns(parsed.numericColumns);
        } catch (err) {
          setImportError(err instanceof Error ? err.message : 'Could not read the CSV file.');
        }
      };
      reader.onerror = () => setImportError('Could not read the CSV file.');
      reader.readAsText(file);

      if (envCsvInputRef.current) {
        envCsvInputRef.current.value = '';
      }
    },
    [addChoroplethOverlay, boundaryOverlay, setEnvColumns],
  );

  const handleVariableChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setActiveKey(e.target.value);
    },
    [setActiveKey],
  );

  const handlePaletteChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (activeEnvKey) {
        setPaletteOverride(activeEnvKey, e.target.value as EnvPaletteId | 'auto');
      }
    },
    [activeEnvKey, setPaletteOverride],
  );

  const handleAddGeotiff = useCallback(() => {
    geotiffInputRef.current?.click();
  }, []);

  const handleGeotiffChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        assertInputSize('geotiff', file.size);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'The GeoTIFF file is too large.');
        return;
      }
      setImportError(null);

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        try {
          const result = await loadGeoTIFF(buffer);
          setRaster(result);
        } catch (err) {
          setImportError(err instanceof Error ? err.message : 'Could not read the GeoTIFF file.');
        }
      };
      reader.onerror = () => setImportError('Could not read the GeoTIFF file.');
      reader.readAsArrayBuffer(file);

      if (geotiffInputRef.current) {
        geotiffInputRef.current.value = '';
      }
    },
    [setRaster],
  );

  const handleClearBoundary = useCallback(() => {
    clearCustomOverlays();
  }, [clearCustomOverlays]);

  const handleClearRegion = useCallback(() => {
    clearChoroplethOverlays();
    setEnvColumns([]);
  }, [clearChoroplethOverlays, setEnvColumns]);

  const handleClearRaster = useCallback(() => {
    setRaster(null);
  }, [setRaster]);

  const hasRegionData = choroplethOverlays.length > 0 || envColumns.length > 0;

  // The active env variable/palette selectors, shown once inside the region
  // card (or standalone if columns exist without a choropleth overlay yet).
  const envControls =
    envColumns.length > 0 ? (
      <div className={styles.envControls} data-testid="env-subcontrols">
        <label className={styles.envLabel}>
          <span className={styles.envLabelText}>Variable</span>
          <select
            className={styles.envSelect}
            value={activeEnvKey ?? ''}
            onChange={handleVariableChange}
            data-testid="env-variable-select"
          >
            {envColumns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.envLabel}>
          <span className={styles.envLabelText}>Palette</span>
          <select
            className={styles.envSelect}
            value={resolvedPaletteOverride}
            onChange={handlePaletteChange}
            data-testid="env-palette-select"
          >
            <option value="auto">Auto{activeColumn ? ` (${activeColumn.displayName})` : ''}</option>
            {ENV_PALETTES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    ) : null;

  return (
    <div className={styles.panel} data-testid="layers-panel">
      {importError && (
        <p className={styles.importError} role="alert" data-testid="layers-import-error">
          {importError}
        </p>
      )}
      {/* Boundary: loaded GeoJSON boundary overlays */}
      <div className={styles.section}>
        <div className={styles.subheadRow}>
          <span className={styles.subhead} data-testid="layers-boundary-heading">
            Boundary
          </span>
          {customOverlays.length > 0 && (
            <button
              type="button"
              className={styles.clearBtn}
              data-testid="clear-boundary-btn"
              onClick={handleClearBoundary}
            >
              Clear Data
            </button>
          )}
        </div>
        {customOverlays.map((overlay) => (
          <LayerToggleCard key={overlay.id} id={overlay.id} title={overlay.name} />
        ))}
        <div className={styles.addOverlayRow}>
          <button
            type="button"
            className={styles.addOverlayBtn}
            data-testid="add-overlay-btn"
            onClick={handleAddOverlay}
          >
            Add boundaries (GeoJSON)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".geojson,application/geo+json"
            style={{ display: 'none' }}
            data-testid="overlay-file-input"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* Region: choropleth data joined to the boundary, with its variable/palette.
          Labelled by dataset name — the Variable selector owns the active variable. */}
      <div className={styles.section}>
        <div className={styles.subheadRow}>
          <span className={styles.subhead} data-testid="layers-region-heading">
            Region
          </span>
          {hasRegionData && (
            <button
              type="button"
              className={styles.clearBtn}
              data-testid="clear-region-btn"
              onClick={handleClearRegion}
            >
              Clear Data
            </button>
          )}
        </div>
        {choroplethOverlays.map((overlay, i) => (
          <LayerToggleCard key={overlay.id} id={overlay.id} title={overlay.name || 'Region data'}>
            {i === 0 ? envControls : null}
          </LayerToggleCard>
        ))}
        {choroplethOverlays.length === 0 ? envControls : null}
        <div className={styles.addOverlayRow}>
          <button
            type="button"
            className={styles.addOverlayBtn}
            data-testid="add-env-csv-btn"
            disabled={!canAddRegionData}
            title={canAddRegionData ? undefined : REGION_DATA_DISABLED_TITLE}
            onClick={handleAddEnvCsv}
          >
            Add region data (CSV)
          </button>
          <input
            ref={envCsvInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            data-testid="env-csv-file-input"
            onChange={handleEnvCsvChange}
          />
        </div>
      </div>

      {/* Raster: loaded GeoTIFF overlay */}
      <div className={styles.section}>
        <div className={styles.subheadRow}>
          <span className={styles.subhead} data-testid="layers-raster-heading">
            Raster
          </span>
          {raster && (
            <button
              type="button"
              className={styles.clearBtn}
              data-testid="clear-raster-btn"
              onClick={handleClearRaster}
            >
              Clear Data
            </button>
          )}
        </div>
        {raster && <LayerToggleCard id="raster-overlay" title="Raster overlay" />}
        <div className={styles.addOverlayRow}>
          <button
            type="button"
            className={styles.addOverlayBtn}
            data-testid="add-geotiff-btn"
            onClick={handleAddGeotiff}
          >
            Add raster (GeoTIFF)
          </button>
          <input
            ref={geotiffInputRef}
            type="file"
            accept=".tif,.tiff,image/tiff"
            style={{ display: 'none' }}
            data-testid="geotiff-file-input"
            onChange={handleGeotiffChange}
          />
        </div>
      </div>
    </div>
  );
}
