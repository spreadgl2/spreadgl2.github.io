import { RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import styles from './SmallScreenGuard.module.css';

const DISMISSED_KEY = 'spreadgl2_small_screen_dismissed';
const PORTRAIT_DISMISSED_KEY = 'spreadgl2_portrait_dismissed';

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // ignore
  }
}

type GuardKind = 'small' | 'portrait' | null;

function detectKind(w: number, h: number): GuardKind {
  const isPortrait = typeof window !== 'undefined' && 'ontouchstart' in window && h > w;
  if (isPortrait) return 'portrait';
  if (w < 768 || h < 600) return 'small';
  return null;
}

interface Props {
  children: React.ReactNode;
}

function GuardDialog({
  kind,
  onContinue,
}: {
  kind: Exclude<GuardKind, null>;
  onContinue: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  useModalAccessibility({ dialogRef, initialFocusRef: continueRef });

  if (kind === 'portrait') {
    return (
      <div
        ref={dialogRef}
        className={styles.overlay}
        data-testid="portrait-guard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portrait-guard-title"
        tabIndex={-1}
      >
        <div className={styles.card}>
          <RotateCw size={48} className={styles.rotateIcon} aria-hidden="true" />
          <p id="portrait-guard-title" className={styles.message} data-testid="portrait-message">
            Rotate to landscape
          </p>
          <button
            ref={continueRef}
            type="button"
            className={styles.continueBtn}
            data-testid="portrait-continue"
            onClick={onContinue}
          >
            Continue anyway
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dialogRef}
      className={styles.overlay}
      data-testid="small-screen-guard"
      role="dialog"
      aria-modal="true"
      aria-labelledby="small-screen-guard-title"
      tabIndex={-1}
    >
      <div className={styles.card}>
        <p
          id="small-screen-guard-title"
          className={styles.message}
          data-testid="small-screen-message"
        >
          SpreadGL2 is designed for screens at least 768&times;600.
        </p>
        <div className={styles.actions}>
          <button
            ref={continueRef}
            type="button"
            className={styles.continueBtn}
            data-testid="small-screen-continue"
            onClick={onContinue}
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}

export function SmallScreenGuard({ children }: Props) {
  const [kind, setKind] = useState<GuardKind>(() => {
    if (typeof window === 'undefined') return null;
    return detectKind(window.innerWidth, window.innerHeight);
  });
  const [dismissed, setDismissed] = useState<GuardKind>(() => {
    if (readDismissed(DISMISSED_KEY)) return 'small';
    if (readDismissed(PORTRAIT_DISMISSED_KEY)) return 'portrait';
    return null;
  });

  useEffect(() => {
    function update() {
      setKind(detectKind(window.innerWidth, window.innerHeight));
    }
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  const effectiveDismissed =
    (kind === 'small' && dismissed === 'small') ||
    (kind === 'portrait' && dismissed === 'portrait');

  if (!kind || effectiveDismissed) return <>{children}</>;

  return (
    <GuardDialog
      kind={kind}
      onContinue={() => {
        const key = kind === 'portrait' ? PORTRAIT_DISMISSED_KEY : DISMISSED_KEY;
        writeDismissed(key);
        setDismissed(kind);
      }}
    />
  );
}
