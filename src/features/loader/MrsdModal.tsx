import { useCallback, useRef, useState } from 'react';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import styles from './ImportModal.module.css';

interface Props {
  onConfirm: (mrsdIso: string | null) => void;
}

export function MrsdModal({ onConfirm }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleCancel = useCallback(() => onConfirm(null), [onConfirm]);
  useModalAccessibility({ dialogRef, initialFocusRef: inputRef, onEscape: handleCancel });

  function submit() {
    const raw = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      setError('Enter MRSD as YYYY-MM-DD');
      return;
    }
    const date = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
      setError('Enter a valid calendar date');
      return;
    }
    onConfirm(raw);
  }

  return (
    <div className={styles.backdrop} data-testid="mrsd-modal-backdrop">
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mrsd-modal-title"
        tabIndex={-1}
        data-testid="mrsd-modal"
      >
        <h2 id="mrsd-modal-title" className={styles.title}>
          Enter MRSD
        </h2>
        <p className={styles.body}>
          We could not detect the most recent sampling date. Enter the MRSD to anchor tree heights
          to calendar time.
        </p>
        <label className={styles.inputLabel}>
          <span className={styles.legend}>MRSD</span>
          <input
            ref={inputRef}
            className={styles.textInput}
            value={value}
            placeholder="YYYY-MM-DD"
            aria-label="Most recent sampling date"
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            data-testid="mrsd-input"
          />
        </label>
        {error !== null && (
          <p className={styles.errorText} data-testid="mrsd-error">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={submit}
            data-testid="mrsd-confirm"
          >
            Continue
          </button>
          <button
            type="button"
            className={styles.altBtn}
            onClick={handleCancel}
            data-testid="mrsd-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
