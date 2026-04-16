# Codex Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 critical issues found by Codex adversarial review: TypeScript syntax in .js file, vector height math scaling issue, fill-ratio gate blocking torso fallback, and calculate_height echoing user input

**Architecture:** Fix each issue in isolation with TDD approach. The vector height fix requires proper per-axis scaling. The fill-ratio fix requires moving the early rejection after torso fallback logic.

**Tech Stack:** Python (FastAPI), JavaScript (React/Vite), MediaPipe

---

### Task 1: Fix TypeScript syntax in useFramingGuidance.js

**Files:**
- Modify: `frontend/src/hooks/useFramingGuidance.js:11-19`

The frontend is plain JavaScript (no TypeScript configured), but the hook uses `export type` and `export interface` which will break the build.

- [ ] **Step 1: Run vite build to verify failure**

Run: `cd frontend && npm run build 2>&1 | head -30`
Expected: FAIL with parsing error on `export type` or `export interface`

- [ ] **Step 2: Replace TypeScript syntax with JSDoc comments**

```javascript
// @typedef {Object} FramingState
// @property {string} status
// @property {string} message
// @property {number} fillRatio

/** @type {FramingState} */
const initialState = {
  status: 'invalid',
  message: 'Initializing camera...',
  fillRatio: 0,
};

/**
 * @typedef {'too_far' | 'near_too_far' | 'ideal' | 'near_too_close' | 'too_close' | 'invalid'} FramingStatus
 */
```

Replace lines 11-19 in useFramingGuidance.js with:

```javascript
// Framing status types (JSDoc for plain JS)
// @typedef {'too_far' | 'near_too_far' | 'ideal' | 'near_too_close' | 'too_close' | 'invalid'} FramingStatus

// Framing state type
// @typedef {Object} FramingState
// @property {FramingStatus} status
// @property {string} message
// @property {number} fillRatio

/** @type {FramingState} */
const initialState = {
  status: 'invalid',
  message: 'Initializing camera...',
  fillRatio: 0,
};
```

- [ ] **Step 3: Run vite build to verify it passes**

Run: `cd frontend && npm run build 2>&1 | tail -10`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useFramingGuidance.js
git commit -m "fix: replace TypeScript syntax with JSDoc in useFramingGuidance.js"
```

---

### Task 2: Fix vector height math to use correct per-axis scaling

**Files:**
- Modify: `backend/app/services/measurement.py:888-890`
- Modify: `backend/app/services/measurement.py:648-650`

The Euclidean distance calculation multiplies by `image_shape[0]` (height) for both x and y, but x should be scaled by width (`image_shape[1]`).

- [ ] **Step 1: Write failing test for non-square image scaling**

Add to `backend/app/services/test_measurement.py`:

```python
def test_calculate_pixel_height_non_square_image():
    """Vector height must scale dx by width and dy by height, not both by height."""
    from app.services.measurement import calculate_pixel_height

    # Create landmarks: nose at top, ankles at bottom
    # Non-square image: 800x600 (width x height)
    landmarks = [{'x': 0.5, 'y': 0.1, 'visibility': 0.9}] * 29
    landmarks[27] = {'x': 0.5, 'y': 0.9, 'visibility': 0.9}  # left_ankle
    landmarks[28] = {'x': 0.5, 'y': 0.9, 'visibility': 0.9}  # right_ankle

    # Portrait image: 600 height, 800 width
    image_shape = (600, 800, 3)

    result = calculate_pixel_height(landmarks, image_shape, fallback_height_cm=170)

    # dx = 0, dy = 0.8, so Euclidean distance = 0.8
    # Correct: 0.8 * 600 = 480px (only dy contributes)
    # Wrong (current): 0.8 * 600 = 480px (happens to work when x=0)
    # Now test with x offset:
    landmarks[27] = {'x': 0.6, 'y': 0.9, 'visibility': 0.9}
    landmarks[28] = {'x': 0.6, 'y': 0.9, 'visibility': 0.9}

    result_offset = calculate_pixel_height(landmarks, image_shape, fallback_height_cm=170)

    # dx = 0.1, dy = 0.8
    # Correct: sqrt((0.1*800)^2 + (0.8*600)^2) = sqrt(6400 + 230400) = sqrt(236800) = 486.6
    # Wrong: sqrt((0.1*600)^2 + (0.8*600)^2) = sqrt(3600 + 230400) = sqrt(234000) = 483.9
    # The difference is ~3px, verify the correct formula is used
    expected_correct = math.sqrt((0.1 * 800) ** 2 + (0.8 * 600) ** 2) * 1.12
    assert abs(result_offset - expected_correct) < 1, f"Expected ~{expected_correct}, got {result_offset}"
```

Run: `python -m pytest backend/app/services/test_measurement.py::test_calculate_pixel_height_non_square_image -v`
Expected: FAIL - the current code multiplies both dx and dy by height

- [ ] **Step 2: Fix calculate_pixel_height at line 888-890**

Replace lines 887-898:

```python
        # Compute ankle midpoint
        left_ankle = foot_candidates[0]
        right_ankle = foot_candidates[1]
        ankle_mid_x = (left_ankle['x'] + right_ankle['x']) / 2
        ankle_mid_y = (left_ankle['y'] + right_ankle['y']) / 2

        # Compute vector distance from nose to ankle midpoint
        # IMPORTANT: Scale dx by width, dy by height for non-square images
        dx = (ankle_mid_x - head_landmark['x']) * image_shape[1]
        dy = (ankle_mid_y - head_landmark['y']) * image_shape[0]
        pixel_height = math.sqrt(dx * dx + dy * dy)
```

- [ ] **Step 3: Fix estimate_height_from_hip_midpoint at line 648-650**

Replace lines 647-660:

```python
        # Compute hip midpoint
        hip_mid_x = (left_hip['x'] + right_hip['x']) / 2
        hip_mid_y = (left_hip['y'] + right_hip['y']) / 2

        # Compute vector distance from nose to hip midpoint
        # IMPORTANT: Scale dx by width, dy by height for non-square images
        dx = (hip_mid_x - head_landmark['x']) * image_shape[1]
        dy = (hip_mid_y - head_landmark['y']) * image_shape[0]
        hip_height_px = math.sqrt(dx * dx + dy * dy)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest backend/app/services/test_measurement.py::test_calculate_pixel_height_non_square_image -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/measurement.py backend/app/services/test_measurement.py
git commit -m "fix: scale vector height by width for x, height for y"
```

---

### Task 3: Remove early fill_ratio gate to allow torso fallback

**Files:**
- Modify: `backend/app/services/measurement.py:1617-1654`

The early return when `fill_info['valid']` is False prevents the torso fallback from running. Need to move the early return after the torso fallback logic can execute.

- [ ] **Step 1: Write failing test for torso fallback with invisible ankles**

Add to `backend/app/services/test_measurement.py`:

```python
def test_torso_fallback_when_ankles_invisible():
    """calculate_measurements_enhanced should use torso fallback when ankles not visible."""
    from app.services.measurement import calculate_measurements_enhanced

    # Create 4 angles with ankles invisible but hips visible
    landmarks = [[{'x': 0.5, 'y': 0.3, 'visibility': 0.8}] * 33 for _ in range(4)]

    # Make nose visible, ankles invisible, hips visible
    for angle_landmarks in landmarks:
        angle_landmarks[0] = {'x': 0.5, 'y': 0.2, 'visibility': 0.9}  # nose
        angle_landmarks[27] = {'x': 0.5, 'y': 0.9, 'visibility': 0.1}  # left_ankle (invisible)
        angle_landmarks[28] = {'x': 0.5, 'y': 0.9, 'visibility': 0.1}  # right_ankle (invisible)
        angle_landmarks[23] = {'x': 0.5, 'y': 0.6, 'visibility': 0.8}  # left_hip
        angle_landmarks[24] = {'x': 0.5, 'y': 0.6, 'visibility': 0.8}  # right_hip

    image_shape = (1000, 800, 3)

    result = calculate_measurements_enhanced(landmarks, image_shape, user_height_cm=170)

    # Should NOT return success=False with "Could not compute body height"
    # Should instead use torso fallback and return success=True
    assert result.get('success') is True, f"Expected success=True with torso fallback, got {result.get('success')}"
    assert 'torso' in result.get('height_estimation_mode', '').lower() or 'hip' in result.get('height_estimation_mode', '').lower(), \
        f"Expected torso/hip fallback mode, got {result.get('height_estimation_mode')}"
```

Run: `python -m pytest backend/app/services/test_measurement.py::test_torso_fallback_when_ankles_invisible -v`
Expected: FAIL - current code returns success=False before torso fallback runs

- [ ] **Step 2: Move early fill_info rejection after torso fallback**

In `calculate_measurements_enhanced`, the early return at lines 1621-1632 should be removed or restructured to allow the torso fallback path to execute. Instead of rejecting when fill_info is invalid, we should:

1. First try `calculate_pixel_height()` which already has torso fallback built in
2. Use that result to determine if we can proceed
3. Only fail when neither full-body nor torso fallback produces valid results

Replace lines 1617-1654:

```python
        # Unified fill-ratio computation (shared with framing guidance)
        fill_info = calculate_fill_ratio(landmarks, image_shape)
        pixel_height = fill_info['pixel_height']
        fill_ratio = fill_info['fill_ratio']

        # NOTE: measurement math uses pixel_height WITH the 1.12 correction.
        # Calculate corrected pixel height (which includes torso fallback)
        pixel_height_corrected = calculate_pixel_height(landmarks, image_shape, user_height_cm)

        # Check if we have valid height from either full-body or torso fallback
        if pixel_height_corrected <= 0:
            return {
                'success': False,
                'scan_type': 'invalid',
                'measurements': {},
                'confidence': empty_confidence,
                'warnings': warnings + ['Could not compute body height from head-to-foot landmarks or torso fallback.'],
                'missing_landmarks': missing_landmarks,
                'can_calibrate': False,
                'fill_ratio': fill_ratio,
                'framing': classify_framing(fill_info),
            }

        # Validate pixel_height: subject must fill at least MIN_PIXEL_HEIGHT_RATIO of the image
        if fill_ratio < MIN_PIXEL_HEIGHT_RATIO:
            return {
                'success': False,
                'scan_type': 'invalid',
                'measurements': {},
                'confidence': empty_confidence,
                'warnings': warnings + [
                    f'Subject too far from camera (fill_ratio={fill_ratio:.0%}, '
                    f'minimum={MIN_PIXEL_HEIGHT_RATIO:.0%}). Please step closer.'
                ],
                'missing_landmarks': missing_landmarks,
                'can_calibrate': False,
                'fill_ratio': fill_ratio,
                'framing': classify_framing(fill_info),
            }

        # Determine if we're using full body or torso fallback
        if not has_visible_feet:
            height_estimation_mode = 'torso_fallback'
            warnings.append('Using torso-based height estimate because feet were not fully visible.')
```

- [ ] **Step 3: Run test to verify it passes**

Run: `python -m pytest backend/app/services/test_measurement.py::test_torso_fallback_when_ankles_invisible -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/measurement.py backend/app/services/test_measurement.py
git commit -m "fix: allow torso fallback when ankles invisible"
```

---

### Task 4: Fix calculate_height to not echo user input

**Files:**
- Modify: `backend/app/services/measurement.py:927-951`

Currently `calculate_height()` returns `user_height_cm` directly when landmarks are visible, which makes the height measurement meaningless. Should either derive from landmarks/calibration or return 0 when not measured.

- [ ] **Step 1: Write failing test for calculate_height behavior**

Add to `backend/app/services/test_measurement.py`:

```python
def test_calculate_height_not_echo_user_input():
    """calculate_height should not just echo user_height_cm - it should derive from landmarks or return 0."""
    from app.services.measurement import calculate_height

    # Two different user heights with same landmarks
    landmarks_full = [
        {'x': 0.5, 'y': 0.05, 'visibility': 0.9},  # nose
        {'x': 0.48, 'y': 0.95, 'visibility': 0.9},  # left_ankle
        {'x': 0.52, 'y': 0.95, 'visibility': 0.9},  # right_ankle
    ] + [{'x': 0.5, 'y': 0.5, 'visibility': 0.9}] * 27

    result_165 = calculate_height(landmarks_full, (100, 100, 3), user_height_cm=165)
    result_180 = calculate_height(landmarks_full, (100, 100, 3), user_height_cm=180)

    # The function should NOT just echo the input - it should either:
    # 1. Return 0 (not measured) when we can't derive absolute height
    # 2. Derive from landmarks (would be different from input)
    # Currently it returns the user_height_cm directly, which is wrong

    # If returning user_height_cm is the chosen behavior, it should NOT be
    # called "calculate_height" - it should be named "get_user_height"
    # For now, test that it returns 0 (not measured) rather than echoing

    assert result_165 == 0.0 or result_165 != result_180, \
        f"calculate_height must either return 0 or derive from landmarks, not echo input. Got {result_165} vs {result_180}"
```

Run: `python -m pytest backend/app/services/test_measurement.py::test_calculate_height_not_echo_user_input -v`
Expected: FAIL - current code returns user_height_cm directly

- [ ] **Step 2: Modify calculate_height to return 0 when not derived from calibration**

Replace lines 927-953:

```python
def calculate_height(landmarks: list, image_shape: tuple,
                      user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> float:
    """
    Return height derived from landmarks, or 0 if cannot be measured.

    Absolute metric height is NOT recoverable from normalized pose landmarks
    alone (no camera intrinsics, no reference object). This function returns
    0.0 to indicate height was not measured - the caller should use user_height_cm
    as the calibration reference if needed.

    Returns 0.0 for upper-body-only views so fusion drops this view's height
    contribution.
    """
    if not landmarks or len(landmarks) < 29 or user_height_cm is None or user_height_cm <= 0:
        return 0.0

    try:
        head_ok = landmarks[0].get('visibility', 0) > VISIBILITY_THRESHOLD
        ankle_ok = any(
            landmarks[idx].get('visibility', 0) > VISIBILITY_THRESHOLD
            for idx in (27, 28) if len(landmarks) > idx
        )
        if not (head_ok and ankle_ok):
            return 0.0

        # Return 0 to indicate height was not derived from image
        # Caller should use user_height_cm as calibration input if needed
        return 0.0
    except Exception:
        return 0.0
```

- [ ] **Step 3: Run test to verify it passes**

Run: `python -m pytest backend/app/services/test_measurement.py::test_calculate_height_not_echo_user_input -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/measurement.py backend/app/services/test_measurement.py
git commit -m "fix: calculate_height returns 0 instead of echoing user input"
```

---

## Summary

| Task | Issue | Fix |
|------|-------|-----|
| 1 | TypeScript in .js file | Replace with JSDoc comments |
| 2 | Vector height uses height for both axes | Scale dx by width, dy by height |
| 3 | Fill-ratio gate blocks torso fallback | Move rejection after fallback check |
| 4 | calculate_height echoes user input | Return 0 instead of echoing |

**Plan complete and saved to `docs/superpowers/plans/2026-04-16-codex-review-fixes.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**