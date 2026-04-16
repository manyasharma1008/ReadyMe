import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_STABILITY_MS = 3000;
const DEFAULT_COUNTDOWN_MS = 1000;

export function useAutoCapture(videoRef, onCapture, options = {}) {
  const {
    enabled = true,
    stabilityMs = DEFAULT_STABILITY_MS,
    countdownMs = DEFAULT_COUNTDOWN_MS,
  } = options;

  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownNumber, setCountdownNumber] = useState(3);
  const [stabilizing, setStabilizing] = useState(false);

  const stabilityStartRef = useRef(null);
  const stabilityTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const isMountedRef = useRef(true);

  const cancel = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (stabilityTimerRef.current) {
      clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = null;
    }
    setCountdownActive(false);
    setCountdownNumber(3);
    setStabilizing(false);
    stabilityStartRef.current = null;
  }, []);

  const triggerCapture = useCallback(() => {
    if (!isMountedRef.current) return;
    cancel();
    if (onCapture) {
      onCapture();
    }
  }, [onCapture, cancel]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancel();
    };
  }, [cancel]);

  // Accept framing status from parent component
  const handleFramingChange = useCallback((status) => {
    if (!enabled) return;

    // Cancel if already capturing
    if (countdownActive) {
      // If status is no longer ideal during countdown, cancel
      if (status !== 'ideal') {
        cancel();
      }
      return;
    }

    if (status === 'ideal') {
      // Start stability timer if not already running
      if (!stabilityStartRef.current) {
        stabilityStartRef.current = Date.now();
        setStabilizing(true);
      }

      // Check if we've been stable long enough
      const elapsed = Date.now() - stabilityStartRef.current;
      if (elapsed >= stabilityMs && !countdownActive) {
        // Start countdown
        setCountdownActive(true);
        setCountdownNumber(3);

        let currentNum = 3;
        countdownTimerRef.current = setInterval(() => {
          currentNum -= 1;
          if (!isMountedRef.current) {
            clearInterval(countdownTimerRef.current);
            return;
          }
          if (currentNum <= 0) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
            triggerCapture();
          } else {
            setCountdownNumber(currentNum);
          }
        }, countdownMs);
      }
    } else {
      // Reset stability timer if status is not ideal
      if (stabilityStartRef.current) {
        stabilityStartRef.current = null;
        setStabilizing(false);
      }
    }
  }, [enabled, stabilityMs, countdownMs, countdownActive, cancel, triggerCapture]);

  return {
    countdownActive,
    countdownNumber,
    stabilizing,
    cancel,
    handleFramingChange,
  };
}