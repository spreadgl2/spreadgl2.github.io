import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type AxisOrder,
  type AxisRange,
  type AxisSummary,
  detectAxisOrder,
  isValidAxisOrder,
  latitudeIndex,
} from '../../lib/format/geojson-axis';
import styles from '../loader/ImportModal.module.css';
import { useModalAccessibility } from '../modal/useModalAccessibility';

type Axis = 'longitude' | 'latitude';

interface Props {
  fileName: string;
  summary: AxisSummary;
  /** Order to pre-select; detected from the data when omitted. */
  initialOrder?: AxisOrder | undefined;
  confirmLabel?: string;
  onConfirm: (order: AxisOrder) => void;
  onCancel: () => void;
}

function axisAt(order: AxisOrder, index: 0 | 1): Axis {
  return latitudeIndex(order) === index ? 'latitude' : 'longitude';
}

function orderFor(index: 0 | 1, axis: Axis): AxisOrder {
  const latIndex = axis === 'latitude' ? index : 1 - index;
  return latIndex === 0 ? 'lat-lon' : 'lon-lat';
}

function formatRange(range: AxisRange | undefined): string {
  if (!range) return '—';
  return `${range[0].toFixed(4)} to ${range[1].toFixed(4)}`;
}

function formatPosition(position: number[]): string {
  return `[${position.map((value) => value.toFixed(4)).join(', ')}]`;
}

export function GeoJsonAxisModal({
  fileName,
  summary,
  initialOrder,
  confirmLabel = 'Add boundaries',
  onConfirm,
  onCancel,
}: Props) {
  const [order, setOrder] = useState<AxisOrder>(() => initialOrder ?? detectAxisOrder(summary));
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstSelectRef = useRef<HTMLSelectElement>(null);
  useModalAccessibility({ dialogRef, initialFocusRef: firstSelectRef, onEscape: onCancel });

  const valid = isValidAxisOrder(summary, order);
  const latRange = summary.ranges?.[latitudeIndex(order)];

  const handleAxisChange = useCallback((index: 0 | 1, axis: Axis) => {
    setOrder(orderFor(index, axis));
  }, []);

  // Portal to body: the Layers drawer is transformed, which would otherwise
  // confine this fixed-position backdrop to the drawer.
  return createPortal(
    <div className={styles.backdrop} data-testid="geojson-axis-modal-backdrop">
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="geojson-axis-modal-title"
        tabIndex={-1}
        data-testid="geojson-axis-modal"
      >
        <h2 id="geojson-axis-modal-title" className={styles.title}>
          Coordinate order
        </h2>
        <p className={styles.body}>
          Choose which number in each position of <strong>{fileName}</strong> is longitude and which
          is latitude. GeoJSON normally lists longitude first.
        </p>
        <ul className={styles.sampleList} aria-label="Sample positions">
          {summary.samples.map((position, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static preview list
            <li key={i} className={styles.sampleItem}>
              <span className={styles.labelText}>{formatPosition(position)}</span>
            </li>
          ))}
        </ul>
        <div className={styles.summaryGrid}>
          {([0, 1] as const).map((index) => (
            <AxisRow
              key={index}
              index={index}
              axis={axisAt(order, index)}
              range={summary.ranges?.[index]}
              selectRef={index === 0 ? firstSelectRef : undefined}
              onChange={handleAxisChange}
            />
          ))}
        </div>
        {!valid && (
          <p className={styles.errorText} role="alert" data-testid="geojson-axis-error">
            Latitude values must lie between -90 and 90 and longitude values between -180 and 180
            (latitude would range {formatRange(latRange)}).
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.confirmBtn}
            disabled={!valid}
            onClick={() => onConfirm(order)}
            data-testid="geojson-axis-confirm"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            className={styles.altBtn}
            onClick={onCancel}
            data-testid="geojson-axis-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface AxisRowProps {
  index: 0 | 1;
  axis: Axis;
  range: AxisRange | undefined;
  selectRef: React.Ref<HTMLSelectElement> | undefined;
  onChange: (index: 0 | 1, axis: Axis) => void;
}

function AxisRow({ index, axis, range, selectRef, onChange }: AxisRowProps) {
  const id = `geojson-axis-position-${index + 1}`;
  return (
    <>
      <div className={styles.summaryRow}>
        <label className={styles.summaryLabel} htmlFor={id}>
          Position {index + 1}
        </label>
        <select
          ref={selectRef}
          id={id}
          className={styles.selectInput}
          value={axis}
          onChange={(e) => onChange(index, e.target.value as Axis)}
          data-testid={id}
        >
          <option value="longitude">Longitude</option>
          <option value="latitude">Latitude</option>
        </select>
      </div>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Range</span>
        <span className={styles.summaryValue} data-testid={`${id}-range`}>
          {formatRange(range)}
        </span>
      </div>
    </>
  );
}
