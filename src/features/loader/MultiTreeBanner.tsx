import { useUiStore } from '../../store/ui';
import styles from './MultiTreeBanner.module.css';

export function MultiTreeBanner() {
  const multiTreeCount = useUiStore((s) => s.multiTreeCount);
  const dismissed = useUiStore((s) => s.multiTreeNoticeDismissed);
  const dismiss = useUiStore((s) => s.dismissMultiTreeNotice);

  if (multiTreeCount <= 1 || dismissed) return null;

  const message = `This file contains ${multiTreeCount} trees. We loaded the first. Multi-tree support is coming.`;

  return (
    <div className={styles.banner} data-testid="multi-tree-banner" role="status">
      <span className={styles.message}>{message}</span>
      <button
        type="button"
        aria-label="Dismiss multi-tree notice"
        className={styles.close}
        onClick={dismiss}
        data-testid="multi-tree-banner-dismiss"
      >
        ✕
      </button>
    </div>
  );
}
