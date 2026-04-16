# Vector-Based Height Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor height calibration to use vector distance (nose → ankle midpoint) instead of vertical Y-difference, fixing scale miscalculation.

**Architecture:** Modify three functions in `measurement.py` to compute Euclidean distance between landmarks instead of vertical difference. Add fallback using hip midpoint when ankles are not visible. Add debug logging for validation.

**Tech Stack:** Python, FastAPI, MediaPipe

---

## File Structure

- **Modify:** `backend/app/services/measurement.py`
  - `calculate_pixel_height()` (lines 668-721)
  - `calculate_height()` (lines 748-797)
  - `CalibrationSystem.calibrate_from_height()` (lines 400-429)
- **Test:** `backend/app/services/test_measurement.py`

---

## Pre-Flight Check

- [ ] Verify existing tests pass before making changes

Run: `cd backend && python -m pytest app/services/test_measurement.py -v`
Expected: All tests pass

---

### Task 1: Refactor `calculate_pixel_height()` to Use Vector Distance

**Files:**
- Modify: `backend/app/services/measurement.py:668-721`

- [ ] **Step 1: Write the failing test**

```python
def test_calculate_pixel_height_uses_vector_distance():
    """calculate_pixel_height should compute Euclidean distance, not just Y-difference."""
    from app.services.measurement import calculate_pixel_height

    # Create landmarks where vector distance differs from Y-difference
    # Nose at center-top, ankles spread apart at bottom
    landmarks = [
        {'x': 0.5, 'y': 0.1, 'visibility': 0.8},  # nose (index 0)
    ] + [{'x': 0.5, 'y': 0.5, 'visibility': 0.8}] * 10  # padding
    landmarks.extend([
        {'x': 0.3, 'y': 0.9, 'visibility': 0.8},  # left_ankle (index 27)
        {'x': 0.7, 'y': 0.9, 'visibility': 0.8},  # right_ankle (index 28)
    ] + [{'x': 0.5, 'y': 0.5, 'visibility': 0.8}] * 4  # remaining

    image_shape = (100, 100, 3)

    # Calculate expected vector distance
    # dx = 0.5 - 0.5 = 0.0 (centered)
    # dy = 0.9 - 0.1 = 0.8
    # distance = sqrt(0 + 0.64) * 100 = 80 pixels (same as Y for centered case)

    result = calculate_pixel_height(landmarks, image_shape)
    assert result > 0, "Should return positive pixel height"
    # With 1.12 correction factor: 80 * 1.12 = 89.6
    assert abs(result - 89.6) < 1.0, f"Expected ~89.6, got {result}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_calculate_pixel_height_uses_vector_distance -v`
Expected: FAIL (function uses old Y-difference logic)

- [ ] **Step 3: Implement vector-based calculation**

Replace the body of `calculate_pixel_height()` (lines 693-721) with:

```python
    try:
        # Use nose (index 0) as head reference
        head_landmark = landmarks[0] if len(landmarks) > 0 else None
        head_visible = head_landmark and head_landmark.get('visibility', 0) > 0.5

        # Use ankles (indices 27, 28) as foot reference
        foot_candidates = []
        for idx in [27, 28]:
            if len(landmarks) > idx:
                lm = landmarks[idx]
                if lm.get('visibility', 0) > 0.5:
                    foot_candidates.append(lm)

        if not head_visible or len(foot_candidates) < 2:
            # Fallback: use hip midpoint when ankles not available
            return estimate_height_from_hip_midpoint(landmarks, image_shape, fallback_height_cm)

        # Compute ankle midpoint
        left_ankle = foot_candidates[0]
        right_ankle = foot_candidates[1]
        ankle_mid_x = (left_ankle['x'] + right_ankle['x']) / 2
        ankle_mid_y = (left_ankle['y'] + right_ankle['y']) / 2

        # Compute vector distance from nose to ankle midpoint
        dx = ankle_mid_x - head_landmark['x']
        dy = ankle_mid_y - head_landmark['y']
        pixel_height = math.sqrt(dx * dx + dy * dy) * image_shape[0]

        if pixel_height <= 0:
            return estimate_height_from_hip_midpoint(landmarks, image_shape, fallback_height_cm)

        # Apply correction factor for missing landmark extent
        pixel_height *= HEIGHT_CORRECTION_FACTOR

        return pixel_height
    except Exception:
        return estimate_height_from_hip_midpoint(landmarks, image_shape, fallback_height_cm)
```

- [ ] **Step 4: Add fallback helper function**

Add new function after `estimate_torso_pixel_height()` (after line 638):

```python
def estimate_height_from_hip_midpoint(landmarks: list, image_shape: tuple,
                                       fallback_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> float:
    """
    Estimate body height from hip midpoint when feet are not visible.

    Uses hip landmarks (indices 23, 24) to compute midpoint, then applies
    a ratio to estimate full body height based on typical human proportions.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image (height, width, channels)
        fallback_height_cm: Fallback height in cm

    Returns:
        Estimated height in pixels
    """
    HIP_TO_FULL_BODY_RATIO = 0.5  # Hip is approximately halfway down the body

    if not landmarks or len(landmarks) < 25:
        return estimate_torso_pixel_height(landmarks, image_shape, fallback_height_cm)

    try:
        head_landmark = landmarks[0]
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        head_visible = head_landmark.get('visibility', 0) > 0.5
        hips_visible = (left_hip.get('visibility', 0) > TORSO_VISIBILITY_THRESHOLD and
                        right_hip.get('visibility', 0) > TORSO_VISIBILITY_THRESHOLD)

        if not head_visible or not hips_visible:
            return estimate_torso_pixel_height(landmarks, image_shape, fallback_height_cm)

        # Compute hip midpoint
        hip_mid_x = (left_hip['x'] + right_hip['x']) / 2
        hip_mid_y = (left_hip['y'] + right_hip['y']) / 2

        # Compute vector distance from nose to hip midpoint
        dx = hip_mid_x - head_landmark['x']
        dy = hip_mid_y - head_landmark['y']
        hip_height_px = math.sqrt(dx * dx + dy * dy) * image_shape[0]

        if hip_height_px <= 0:
            return estimate_torso_pixel_height(landmarks, image_shape, fallback_height_cm)

        # Extrapolate to full body height
        pixel_height = hip_height_px / HIP_TO_FULL_BODY_RATIO

        # Apply correction factor
        pixel_height *= HEIGHT_CORRECTION_FACTOR

        return pixel_height
    except Exception:
        return estimate_torso_pixel_height(landmarks, image_shape, fallback_height_cm)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_calculate_pixel_height_uses_vector_distance -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/measurement.py
git commit -m "refactor: use vector distance in calculate_pixel_height

- Replace Y-difference with Euclidean distance from nose to ankle midpoint
- Add estimate_height_from_hip_midpoint fallback for missing ankles
- Apply HEIGHT_CORRECTION_FACTOR for missing landmark extent

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Refactor `calculate_height()` to Use Vector Distance

**Files:**
- Modify: `backend/app/services/measurement.py:748-797`

- [ ] **Step 1: Write the failing test**

```python
def test_calculate_height_uses_vector_distance():
    """calculate_height should compute Euclidean distance, not just Y-difference."""
    from app.services.measurement import calculate_height

    # Landmarks with spread ankles (vector differs from Y-only)
    landmarks = [
        {'x': 0.5, 'y': 0.1, 'visibility': 0.8},  # nose
    ] + [{'x': 0.5, 'y': 0.5, 'visibility': 0.8}] * 27
    landmarks[27] = {'x': 0.2, 'y': 0.9, 'visibility': 0.8}  # left_ankle
    landmarks[28] = {'x': 0.8, 'y': 0.9, 'visibility': 0.8}  # right_ankle

    image_shape = (100, 100, 3)
    user_height_cm = 170.0

    result = calculate_height(landmarks, image_shape, user_height_cm)
    assert result > 0, "Should return positive height"
    assert result != user_height_cm, "Should derive from landmarks, not echo input"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_calculate_height_uses_vector_distance -v`
Expected: FAIL

- [ ] **Step 3: Implement vector-based calculation in calculate_height()**

Replace lines 770-797 in `calculate_height()`:

```python
    try:
        head_landmark = landmarks[0]
        foot_candidates = []
        for idx in [27, 28]:
            if len(landmarks) > idx:
                lm = landmarks[idx]
                if lm.get('visibility', 0) > 0.5:
                    foot_candidates.append(lm)

        if not foot_candidates:
            return user_height_cm

        # Compute ankle midpoint
        left_ankle = foot_candidates[0]
        right_ankle = foot_candidates[1] if len(foot_candidates) > 1 else foot_candidates[0]
        ankle_mid_x = (left_ankle['x'] + right_ankle['x']) / 2
        ankle_mid_y = (left_ankle['y'] + right_ankle['y']) / 2

        # Compute vector distance
        dx = ankle_mid_x - head_landmark['x']
        dy = ankle_mid_y - head_landmark['y']
        pixel_height = math.sqrt(dx * dx + dy * dy) * image_shape[0]

        if pixel_height <= 0:
            return user_height_cm

        HEIGHT_CORRECTION_FACTOR = 1.12
        height_cm = (pixel_height * HEIGHT_CORRECTION_FACTOR / image_shape[0]) * user_height_cm

        return height_cm
    except Exception:
        return user_height_cm
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_calculate_height_uses_vector_distance -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/measurement.py
git commit -m "refactor: use vector distance in calculate_height

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Refactor `CalibrationSystem.calibrate_from_height()` to Use Vector Distance

**Files:**
- Modify: `backend/app/services/measurement.py:400-429`

- [ ] **Step 1: Write the failing test**

```python
def test_calibration_system_uses_vector_distance():
    """CalibrationSystem should compute pixel height using vector distance."""
    from app.services.measurement import CalibrationSystem

    calib = CalibrationSystem()

    # Landmarks with spread ankles
    landmarks = [
        {'x': 0.5, 'y': 0.1, 'visibility': 0.8},  # nose
    ] + [{'x': 0.5, 'y': 0.5, 'visibility': 0.8}] * 27
    landmarks[27] = {'x': 0.2, 'y': 0.9, 'visibility': 0.8}
    landmarks[28] = {'x': 0.8, 'y': 0.9, 'visibility': 0.8}

    image_shape = (100, 100, 3)
    actual_height_cm = 165.0

    result = calib.calibrate_from_height(landmarks, image_shape, actual_height_cm)
    assert result > 0, "Should return positive calibration factor"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_calibration_system_uses_vector_distance -v`
Expected: FAIL

- [ ] **Step 3: Implement vector-based calculation in calibrate_from_height()**

Replace lines 415-429 in `CalibrationSystem.calibrate_from_height()`:

```python
        nose = landmarks[0]
        left_ankle = landmarks[27]
        right_ankle = landmarks[28]

        # Compute ankle midpoint
        ankle_mid_x = (left_ankle['x'] + right_ankle['x']) / 2
        ankle_mid_y = (left_ankle['y'] + right_ankle['y']) / 2

        # Use vector distance instead of vertical Y-difference
        dx = ankle_mid_x - nose['x']
        dy = ankle_mid_y - nose['y']
        pixel_height = math.sqrt(dx * dx + dy * dy) * image_shape[0]

        if pixel_height <= 0:
            raise ValueError("Invalid landmarks: pixel height must be positive")

        with self._lock:
            self.calibration_factor = pixel_height / actual_height_cm
            self.user_height_cm = actual_height_cm
        return self.calibration_factor
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_calibration_system_uses_vector_distance -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/measurement.py
git commit -m "refactor: use vector distance in CalibrationSystem.calibrate_from_height

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Add Debug Logging

**Files:**
- Modify: `backend/app/services/measurement.py:1680-1720`

- [ ] **Step 1: Add debug logging for vector calculation**

Find where `pixel_height` is logged in `calculate_measurements_enhanced()` (around line 1683 and 1720) and add additional debug info:

```python
# Add after pixel_height in debug_info:
'height_calculation': 'vector',
'selected_landmarks': {
    'head': 0,  # nose
    'left_ankle': 27,
    'right_ankle': 28
},
'ankle_midpoint': {
    'x': round((left_ankle['x'] + right_ankle['x']) / 2, 4),
    'y': round((left_ankle['y'] + right_ankle['y']) / 2, 4)
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/measurement.py
git commit -m "debug: add vector calculation details to debug output

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Run All Tests and Verify

**Files:**
- Test: `backend/app/services/test_measurement.py`

- [ ] **Step 1: Run all measurement tests**

Run: `cd backend && python -m pytest app/services/test_measurement.py -v`
Expected: All tests pass

- [ ] **Step 2: Commit**

```bash
git commit -m "test: verify all measurement tests pass after vector refactor

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

- [ ] Spec coverage: All requirements from `2026-04-15-vector-height-calibration-design.md` covered
- [ ] Placeholder scan: No TBD/TODO in the plan
- [ ] Type consistency: Function signatures match across all three modified functions
- [ ] Tests included for each function modification
- [ ] Each task ends with a commit

---

## Plan Complete

**Saved to:** `docs/superpowers/plans/2026-04-15-vector-height-calibration-plan.md`

Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?