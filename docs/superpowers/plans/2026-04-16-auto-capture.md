# Auto-Capture Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically trigger image capture when user stands at correct distance and maintains stable framing for 3+ seconds, eliminating need for another person to click the capture button.

**Architecture:** New `useAutoCapture` hook monitors framing stability, triggers countdown, and calls capture callback. Integrated into existing BodyScan.jsx alongside manual capture button.

**Tech Stack:** React (hooks), JavaScript, existing framing guidance system

---

## File Structure

- Create: `frontend/src/hooks/useAutoCapture.js` — New hook for stability monitoring and countdown
- Modify: `frontend/src/pages/BodyScan.jsx` — Integrate auto-capture, add countdown overlay
- Modify: `frontend/src/hooks/useFramingGuidance.js` — Export framing status for external use

---

## Task 1: Create useAutoCapture hook

**Files:**
- Create: `frontend/src/hooks/useAutoCapture.js`
- Test: Manual verification in browser

- [ ] **Step 1: Create the useAutoCapture hook file**

```javascript
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
```

- [ ] **Step 2: Verify the hook file is created correctly**

Run: `ls -la frontend/src/hooks/useAutoCapture.js`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useAutoCapture.js
git commit -m "feat: add useAutoCapture hook for stability-based auto capture

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Integrate useAutoCapture into BodyScan.jsx

**Files:**
- Modify: `frontend/src/pages/BodyScan.jsx:1-30` (imports)
- Modify: `frontend/src/pages/BodyScan.jsx:250-260` (hook initialization)
- Modify: `frontend/src/pages/BodyScan.jsx:1040-1060` (countdown overlay and button)

- [ ] **Step 1: Add import for useAutoCapture**

Add after existing hook imports:

```javascript
import { useAutoCapture } from '../hooks/useAutoCapture';
```

- [ ] **Step 2: Initialize useAutoCapture hook**

Add after the framing line (around line 255):

```javascript
  // Auto-capture hook
  const {
    countdownActive,
    countdownNumber,
    stabilizing,
    cancel: cancelAutoCapture,
    handleFramingChange,
  } = useAutoCapture(videoRef, handleCapture, {
    enabled: true,
    stabilityMs: 3000,
    countdownMs: 1000,
  });

  // Pass framing changes to auto-capture
  useEffect(() => {
    handleFramingChange(framing.status);
  }, [framing.status, handleFramingChange]);

  // Cancel auto-capture when user manually triggers capture
  const handleManualCapture = () => {
    cancelAutoCapture();
    handleCapture();
  };
```

- [ ] **Step 3: Add countdown overlay UI**

Find where to add the overlay (after FramingOverlay, around line 915):

```jsx
        {/* Auto-capture countdown overlay */}
        {countdownActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50">
            <span className="text-9xl font-bold text-white animate-pulse">
              {countdownNumber}
            </span>
          </div>
        )}

        {/* Auto-capture stabilizing message */}
        {stabilizing && !countdownActive && (
          <div className="absolute bottom-24 left-0 right-0 text-center z-40">
            <p className="text-white text-sm bg-black/50 px-4 py-2 rounded-full inline-block">
              Hold still for auto-capture...
            </p>
          </div>
        )}
```

- [ ] **Step 4: Update capture button to use handleManualCapture**

Change onClick and disabled logic (around lines 1044-1052):

```jsx
        onClick={handleManualCapture}
        disabled={loading || countingDown || isCapturing || framing.status !== 'ideal'}

        {/* button text */}
        {loading ? "Processing..." : isCapturing ? "Scanning..." : framing.status === 'ideal' ? (stabilizing && !countdownActive ? "Hold for auto..." : "Start Scan") : "Waiting for good framing..."}
```

- [ ] **Step 5: Verify the code compiles**

Run: `cd frontend && npm run build 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/BodyScan.jsx frontend/src/hooks/useAutoCapture.js
git commit -m "feat: integrate auto-capture into BodyScan

- Add useAutoCapture hook initialization
- Add countdown overlay UI
- Add stabilizing message
- Wire manual button to cancel auto-capture

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Test and verify functionality

**Files:**
- Manual test: Browser-based verification

- [ ] **Step 1: Start the dev server**

Run: `cd frontend && npm run dev`

- [ ] **Step 2: Test auto-capture flow**

Manual verification steps:
1. Open the app in browser
2. Position yourself in frame
3. Wait for "ideal" status
4. Hold still for 3 seconds
5. Verify countdown (3, 2, 1) appears
6. Verify capture triggers automatically
7. Move and verify timer resets

- [ ] **Step 3: Test manual override**

1. Click manual capture button
2. Verify button triggers capture
3. Verify countdown cancels if in progress

- [ ] **Step 4: Test multi-capture mode**

1. Wait for ideal framing
2. Let auto-capture trigger first capture
3. Verify subsequent captures follow existing turn prompts

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "test: verify auto-capture functionality

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create useAutoCapture hook | useAutoCapture.js |
| 2 | Integrate into BodyScan | BodyScan.jsx |
| 3 | Test and verify | Browser testing |

---

## Acceptance Criteria Verification

- [ ] Auto-capture triggers after 3 seconds of stable ideal framing
- [ ] Countdown (3, 2, 1) displays before capture
- [ ] Movement resets the stability timer
- [ ] Manual capture button remains functional
- [ ] Works for both single and multi-capture modes
- [ ] No regression to existing capture functionality