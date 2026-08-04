import { useEffect, useState } from 'react';

export function usePlayheadIndicatorVisibility(
  isPlaying: boolean,
  delayMs = 3000,
  resetKey?: unknown,
): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // resetKey is a signal dependency; reading it restarts the paused timer.
    void resetKey;
    if (isPlaying) {
      setVisible(true);
      return undefined;
    }

    setVisible(true);
    const timer = setTimeout(() => setVisible(false), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, isPlaying, resetKey]);

  return visible;
}
