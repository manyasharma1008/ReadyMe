import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_STABILITY_MS = 3000;
const DEFAULT_COUNTDOWN_MS = 1000;
const DEFAULT_COUNTDOWN_START = 3;

export function useAutoCapture(videoRef, onCapture, options = {}) {
  const {
    enabled = true,
    stabilityMs = DEFAULT_STABILITY_MS,
    countdownMs = DEFAULT_COUNTDOWN_MS,
  } = options;

  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownNumber, setCountdownNumber] = useState(DEFAULT_COUNTDOWN_START);
  const [stabilizing, setStabilizing] = useState(false);

  const stabilityStartRef = useRef(null);
  const stabilityTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const isMountedRef = useRef(true);
  const capturedRef = useRef(false);
  const countdownActiveRef = useRef(false);

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
    setCountdownNumber(DEFAULT_COUNTDOWN_START);
    setStabilizing(false);
    stabilityStartRef.current = null;
    countdownActiveRef.current = false;
    // Do NOT reset capturedRef here - let the capture attempt complete first
  }, []);

  // Reset capture state to allow next capture (for multi-step captures like 4 angles)
  const resetCapture = useCallback(() => {
    capturedRef.current = false;
  }, []);

  const triggerCapture = useCallback(() => {
    if (!isMountedRef.current) return;
    if (capturedRef.current) return;
    capturedRef.current = true;
    cancel();
    if (onCapture) {
      onCapture();
    }
  }, [onCapture, cancel]);

  const startCountdown = useCallback(() => {
    if (!isMountedRef.current || countdownActiveRef.current || capturedRef.current) {
      return;
    }

    stabilityStartRef.current = null;
    setStabilizing(false);
    setCountdownActive(true);
    countdownActiveRef.current = true;
    setCountdownNumber(DEFAULT_COUNTDOWN_START);

    let currentNum = DEFAULT_COUNTDOWN_START;
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
  }, [countdownMs, triggerCapture]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancel();
    };
  }, [cancel]);

  // Cancel timers when enabled becomes false
  useEffect(() => {
    if (!enabled) {
      cancel();
    }
  }, [enabled, cancel]);

  // Accept framing status from parent component
  const handleFramingChange = useCallback((status) => {
    if (!enabled) return;

    // Cancel if already capturing
    if (countdownActiveRef.current) {
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
        stabilityTimerRef.current = setTimeout(() => {
          stabilityTimerRef.current = null;
          startCountdown();
        }, stabilityMs);
      }
    } else {
      // Reset stability timer if status is not ideal
      if (stabilityStartRef.current) {
        cancel();
      }
    }
  }, [enabled, stabilityMs, cancel, startCountdown]);

  return {
    countdownActive,
    countdownNumber,
    stabilizing,
    cancel,
    resetCapture,
    handleFramingChange,
  };
}
