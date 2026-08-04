import { AlertTriangle } from 'lucide-react';
import { useRef } from 'react';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import styles from './LocationAnnotationWarning.module.css';

interface NoticeProps {
  count: number;
  traitName: string;
}

export function MissingLocationAnnotationsNotice({ count, traitName }: NoticeProps) {
  if (count === 0) return null;
  return (
    <div className={styles.notice} role="status" data-testid="missing-location-annotations-notice">
      <AlertTriangle className={styles.icon} size={18} aria-hidden="true" />
      <div>
        <strong>
          {count} internal {count === 1 ? 'node has' : 'nodes have'} no {traitName} annotation.
        </strong>
        <p>
          Coordinates cannot resolve nodes without a location state. Branches touching them will be
          omitted from the map.
        </p>
      </div>
    </div>
  );
}

interface ModalProps extends NoticeProps {
  onContinue: () => void;
}

export function LocationAnnotationWarning({ count, traitName, onContinue }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  useModalAccessibility({ dialogRef, initialFocusRef: continueRef });

  return (
    <div className={styles.backdrop} data-testid="location-annotation-warning-backdrop">
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-annotation-warning-title"
        tabIndex={-1}
        data-testid="location-annotation-warning"
      >
        <h2 id="location-annotation-warning-title" className={styles.title}>
          Incomplete ancestral locations
        </h2>
        <MissingLocationAnnotationsNotice count={count} traitName={traitName} />
        <p className={styles.detail}>
          Add inferred ancestral state annotations to the source tree for a complete geographic
          reconstruction.
        </p>
        <button
          ref={continueRef}
          type="button"
          className={styles.continueBtn}
          onClick={onContinue}
          data-testid="location-annotation-warning-continue"
        >
          Continue with available branches
        </button>
      </div>
    </div>
  );
}
