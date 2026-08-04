import { useEffect, useRef } from 'react';
import styles from './ErrorPanel.module.css';
import type { ErrorCopy } from './error-copy';

interface Props {
  copy: ErrorCopy;
  onTryAgain: () => void;
}

export function ErrorPanel({ copy, onTryAgain }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div
      ref={panelRef}
      className={styles.root}
      role="alert"
      tabIndex={-1}
      data-testid="error-panel"
    >
      <h2 className={styles.title} data-testid="error-title">
        {copy.title}
      </h2>
      <p className={styles.body} data-testid="error-body">
        {copy.body}
      </p>
      {copy.action !== undefined && (
        <div className={styles.actionBox} data-testid="error-action">
          {copy.action}
        </div>
      )}
      <button
        type="button"
        className={styles.tryAgain}
        onClick={onTryAgain}
        data-testid="error-try-again"
      >
        Try again
      </button>
    </div>
  );
}
