import { useCallback, useEffect, useRef, useState } from 'react';

export function useAutoFadeControls(delayMs = 2000) {
  const [faded, setFaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredRef = useRef(false);

  const clearFadeTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const armFadeTimer = useCallback(() => {
    clearFadeTimer();
    timerRef.current = setTimeout(() => {
      if (!hoveredRef.current) setFaded(true);
    }, delayMs);
  }, [clearFadeTimer, delayMs]);

  const reveal = useCallback(() => {
    setFaded(false);
    if (!hoveredRef.current) armFadeTimer();
  }, [armFadeTimer]);

  const handleMouseEnter = useCallback(() => {
    hoveredRef.current = true;
    clearFadeTimer();
    setFaded(false);
  }, [clearFadeTimer]);

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = false;
    armFadeTimer();
  }, [armFadeTimer]);

  const handleFocus = useCallback(() => {
    hoveredRef.current = true;
    clearFadeTimer();
    setFaded(false);
  }, [clearFadeTimer]);

  const handleBlur = useCallback(() => {
    hoveredRef.current = false;
    armFadeTimer();
  }, [armFadeTimer]);

  useEffect(() => {
    armFadeTimer();
    return clearFadeTimer;
  }, [armFadeTimer, clearFadeTimer]);

  return {
    faded,
    autoFadeHandlers: {
      onMouseEnter: handleMouseEnter,
      onMouseMove: reveal,
      onMouseLeave: handleMouseLeave,
      onFocus: handleFocus,
      onBlur: handleBlur,
      onClick: reveal,
      onTouchStart: reveal,
    },
  };
}
