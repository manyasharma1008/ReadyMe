# Auto-Capture Feature Design

## Overview

Automatically trigger image capture when user stands at the correct distance and maintains stable framing for 3+ seconds, eliminating the need for another person to click the capture button.

## Background

Current behavior requires user to manually click a capture button. Since users need to stand at a specific distance from the camera, they cannot click the button themselves. This feature enables hands-free capture when the user is correctly positioned.

## Architecture

### New Component: `useAutoCapture` Hook

```javascript
useAutoCapture(videoRef, onCapture, options)
```

**Parameters:**
- `videoRef` — Reference to video element for frame capture
- `onCapture` — Callback function to execute when capture triggers
- `options` — Configuration object:
  - `enabled` (boolean) — Enable/disable auto-capture (default: true)
  - `stabilityMs` (number) — Milliseconds of stable framing required (default: 3000)
  - `countdownMs` — Countdown duration per step (default: 1000)

**Returns:**
- `{ countdownActive, countdownNumber, cancel }`
  - `countdownActive` (boolean) — Whether countdown is in progress
  - `countdownNumber` (number) — Current countdown number (3, 2, 1)
  - `cancel` (function) — Cancel ongoing countdown

### Integration Points

1. **BodyScan.jsx** — Add `useAutoCapture` hook, wire to existing capture flow
2. **useFramingGuidance.js** — No changes needed, hook monitors existing state
3. **Button behavior** — Manual button remains available regardless of auto-capture state

## Data Flow

```
┌─────────────────────┐      framing.status      ┌─────────────────────┐
│ useFramingGuidance │ ──────────────────────────▶ │   useAutoCapture   │
│    (existing)      │                            │      (new hook)     │
└─────────────────────┘                           └─────────────────────┘
                                                            │
                                                            ▼
                                                  ┌─────────────────────┐
                                                  │  3s stability timer │
                                                  │  3-2-1 countdown    │
                                                  └─────────────────────┘
                                                            │
                                                            ▼
                                                  ┌─────────────────────┐
                                                  │   onCapture()      │
                                                  │ (startAutoCapture) │
                                                  └─────────────────────┘
```

### State Transitions

1. **Idle** → User enters frame, framing status changes
2. **Monitoring** → status = 'ideal', timer starts counting up
3. **Stabilizing** → 0-3s elapsed, status still 'ideal'
4. **Countdown** → 3s stable, display 3 → 2 → 1
5. **Capturing** → Countdown complete, trigger onCapture()
6. **Reset** → If status leaves 'ideal', reset timer to 0

## UI Requirements

### Countdown Overlay

- Full-screen overlay with large centered number (3, 2, 1)
- Semi-transparent background
- Positioned above video feed
- Auto-hides after capture completes

### Status Message

When stability timer active but < 3 seconds:
- "Hold still for auto-capture..."

### Manual Override

- Manual capture button always functional
- Clicking manual button cancels any pending auto-capture
- Auto-capture continues monitoring even during manual capture flow

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| User moves during countdown | Cancel countdown, reset timer |
| User moves before 3s complete | Reset stability timer to 0 |
| Multiple rapid stability checks | Timer only resets, no accumulation |
| Auto-capture during multi-scan | Works for first capture; subsequent captures follow existing turn prompts |
| Camera/pose detection fails | Cancel any pending auto-capture, show error |

## Testing Considerations

1. Unit test hook logic (stability timer, countdown)
2. Integration test with useFramingGuidance
3. Manual test: verify auto-capture triggers after 3s stable
4. Manual test: verify cancellation when user moves

## Acceptance Criteria

- [ ] Auto-capture triggers after 3 seconds of stable ideal framing
- [ ] Countdown (3, 2, 1) displays before capture
- [ ] Movement resets the stability timer
- [ ] Manual capture button remains functional
- [ ] Works for both single and multi-capture modes
- [ ] No regression to existing capture functionality