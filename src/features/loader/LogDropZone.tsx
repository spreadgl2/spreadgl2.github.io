import { useCallback, useState } from 'react';
import { assertInputSize } from '../../lib/security/input-limits';
import styles from './LogDropZone.module.css';

interface Props {
  onFile: (file: File) => void;
  onClose: () => void;
}

export function LogDropZone({ onFile, onClose }: Props) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.log')) {
        setError('Expected a BEAST .log file.');
        return;
      }
      try {
        assertInputSize('log', file.size);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The log file is too large.');
        return;
      }
      setError(null);
      onFile(file);
      onClose();
    },
    [onFile, onClose],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.log')) {
        setError('Expected a BEAST .log file.');
        return;
      }
      try {
        assertInputSize('log', file.size);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The log file is too large.');
        return;
      }
      setError(null);
      onFile(file);
      onClose();
    },
    [onFile, onClose],
  );

  return (
    <div className={styles.overlay} data-testid="log-drop-overlay">
      <div className={styles.card}>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close"
          data-testid="log-drop-close"
          onClick={onClose}
        >
          ×
        </button>
        <h2 className={styles.title}>Load BEAST log file</h2>
        <p className={styles.body}>
          Drag a BEAST <code>.log</code> file to load BSSVS indicator columns.
        </p>
        <section
          aria-label="Drop zone for BEAST log file"
          className={[styles.dropZone, dragging ? styles.dropZoneDragging : ''].join(' ')}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          data-testid="log-drop-target"
        >
          <span className={styles.dropLabel}>Drop .log file here</span>
          <span className={styles.dropFormats}>.log</span>
        </section>
        <label className={styles.browseLabel}>
          or{' '}
          <span className={styles.browseLink}>
            browse…
            <input
              type="file"
              accept=".log"
              className={styles.fileInput}
              onChange={handleFileInput}
              data-testid="log-file-input"
            />
          </span>
        </label>
        {error && (
          <p className={styles.error} data-testid="log-drop-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
