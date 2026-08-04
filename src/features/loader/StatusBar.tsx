import { useTreeStore } from '../../store/tree';
import type { ParseStage } from '../../workers/parser-pipeline';
import styles from './StatusBar.module.css';

const STAGE_ORDER: ParseStage[] = ['read', 'layout', 'calibrate', 'geo', 'table'];

const STAGE_LABEL: Record<ParseStage, string> = {
  read: 'Reading tree…',
  calibrate: 'Calibrating dates…',
  geo: 'Reading geographic keys…',
  table: 'Building branch table…',
  layout: 'Computing tree layout…',
};

interface StatusBarProps {
  stage?: ParseStage | null;
  progress?: number;
}

export function StatusBar({ stage, progress }: StatusBarProps = {}) {
  const storedStage = useTreeStore((s) => s.parseStage);
  const storedProgress = useTreeStore((s) => s.parseProgress);
  const parseStage = stage === undefined ? storedStage : stage;
  const parseProgress = progress === undefined ? storedProgress : progress;

  const currentIdx = parseStage !== null ? STAGE_ORDER.indexOf(parseStage) : -1;

  return (
    <div className={styles.root} data-testid="status-bar" role="status" aria-live="polite">
      {STAGE_ORDER.map((stage, idx) => {
        const isDone = idx < currentIdx || (idx === currentIdx && parseProgress === 100);
        const isActive = idx === currentIdx && parseProgress < 100;
        const percent = isDone ? 100 : isActive ? parseProgress : 0;

        return (
          <div key={stage} className={styles.row} data-testid={`stage-row-${stage}`}>
            <span
              className={[styles.label, isDone || isActive ? styles.labelActive : ''].join(' ')}
            >
              {STAGE_LABEL[stage]}
            </span>
            {(isDone || isActive) && (
              <div className={styles.track} aria-hidden="true">
                <div
                  className={styles.fill}
                  style={{ width: `${percent}%` }}
                  data-testid={`stage-fill-${stage}`}
                />
              </div>
            )}
            {(isDone || isActive) && (
              <span className={styles.percent} data-testid={`stage-percent-${stage}`}>
                {percent}%
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
