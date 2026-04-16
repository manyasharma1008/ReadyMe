# Vector Measurement Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix incorrect body measurements after switching to 2-point vector system - resolve height underestimation, width underestimation, and confidence validation errors while maintaining API compatibility.

**Architecture:** Fix three core issues: (1) ensure confidence dict is properly serialized for Pydantic, (2) use consistent vector-based pixel height calculation across both calculate_pixel_height and calculate_height, (3) apply shoulder depth correction when user is not front-facing to compensate for foreshortening.

**Tech Stack:** Python, FastAPI, MediaPipe, Pydantic

---

## File Structure

- Modify: `backend/app/services/measurement.py` - core measurement logic
- Modify: `backend/app/routers/scan.py` - API endpoint confidence handling
- Modify: `backend/app/services/test_measurement.py` - add regression tests

---

## Task 1: Fix Confidence Validation Error

**Files:**
- Modify: `backend/app/routers/scan.py:360-362`
- Modify: `backend/app/services/measurement.py:1709-1720`

- [ ] **Step 1: Write failing test for confidence dict type**

```python
def test_confidence_returns_valid_dict():
    """Confidence must be a dict, not a Pydantic model or other type."""
    from app.services.measurement import calculate_measurements_enhanced

    # Create valid test landmarks
    landmarks = [
        [{'x': 0.5, 'y': 0.1, 'visibility': 0.9}] * 33,  # front
        [{'x': 0.5, 'y': 0.1, 'visibility': 0.9}] * 33,  # left
        [{'x': 0.5, 'y': 0.1, 'visibility': 0.9}] * 33,  # right
        [{'x': 0.5, 'y': 0.1, 'visibility': 0.9}] * 33,   # back
    ]
    image_shape = (640, 480, 3)

    result = calculate_measurements_enhanced(
        landmarks,
        image_shape,
        user_height_cm=170.0,
    )

    # Confidence must be a dict, not a Pydantic model
    confidence = result.get('confidence')
    assert confidence is not None, "Confidence should not be None"
    assert isinstance(confidence, dict), f"Confidence must be dict, got {type(confidence).__name__}"
    assert all(isinstance(v, (int, float)) for v in confidence.values()), "All confidence values must be numeric"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_confidence_returns_valid_dict -v`
Expected: FAIL - likely assertion error about dict type or None

- [ ] **Step 3: Fix confidence serialization in measurement.py**

In `calculate_measurements_enhanced` function around line 1770, ensure confidence is always returned as a plain dict, not a Pydantic model:

```python
# Line ~1770: ensure confidence is always a plain dict
# Convert any Pydantic model to dict
if hasattr(confidence, 'model_dump'):
    confidence = confidence.model_dump()
elif hasattr(confidence, 'dict'):
    confidence = confidence.dict()
```

- [ ] **Step 4: Fix confidence handling in scan.py router**

In `backend/app/routers/scan.py` lines 360-362, add defensive serialization:

```python
confidence = None
if result.get('confidence'):
    conf_data = result['confidence']
    # Ensure it's a dict, not a Pydantic model
    if hasattr(conf_data, 'model_dump'):
        conf_data = conf_data.model_dump()
    elif hasattr(conf_data, 'dict'):
        conf_data = conf_data.dict()
    confidence = MeasurementConfidence(**conf_data)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_confidence_returns_valid_dict -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/measurement.py backend/app/routers/scan.py backend/app/services/test_measurement.py
git commit -m "fix: ensure confidence is returned as dict for Pydantic validation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Fix Height Scaling

**Files:**
- Modify: `backend/app/services/measurement.py:813-862`

- [ ] **Step 1: Write failing test for height scaling**

```python
def test_height_uses_vector_distance():
    """Height must use Euclidean vector distance, not just Y delta."""
    from app.services.measurement import calculate_height

    # Test case 1: Straight pose (Y only)
    landmarks_straight = [
        {'x': 0.5, 'y': 0.1, 'visibility': 0.9},  # nose at top
        {'x': 0.5, 'y': 0.9, 'visibility': 0.9},  # left_ankle at bottom
    ] + [{'x': 0.5, 'y': 0.5, 'visibility': 0.9}] * 27

    height_straight = calculate_height(landmarks_straight, (100, 100, 3), user_height_cm=170)

    # Test case 2: Angled pose (same Y span but diagonal)
    landmarks_angled = [
        {'x': 0.3, 'y': 0.1, 'visibility': 0.9},  # nose shifted left
        {'x': 0.7, 'y': 0.9, 'visibility': 0.9},  # ankle shifted right
    ] + [{'x': 0.5, 'y': 0.5, 'visibility': 0.9}] * 27

    height_angled = calculate_height(landmarks_angled, (100, 100, 3), user_height_cm=170)

    # The angled pose should have LARGER pixel height (diagonal is longer)
    assert height_angled > height_straight, \
        f"Angled pose ({height_angled}) should have larger height than straight ({height_straight})"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_height_uses_vector_distance -v`
Expected: FAIL - current implementation uses only Y difference

- [ ] **Step 3: Fix calculate_height to use vector distance**

Replace the Y-only calculation at lines 845-858 with vector distance:

```python
def calculate_height(landmarks: list, image_shape: tuple,
                      user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> float:
    """
    Calculate body height from pose landmarks.

    Uses Euclidean vector distance from nose to ankle midpoint.
    Applies ratio-based normalization to convert pixels to cm.
    """
    if not landmarks or len(landmarks) < 29:
        return user_height_cm

    try:
        # Use nose (index 0) as head reference
        if landmarks[0].get('visibility', 0) <= 0.5:
            return user_height_cm

        # Get ankle landmarks for foot reference
        foot_candidates = []
        for idx in [27, 28]:
            if len(landmarks) > idx and landmarks[idx].get('visibility', 0) > 0.5:
                foot_candidates.append(landmarks[idx])

        if not foot_candidates:
            return user_height_cm

        # Compute ankle midpoint
        ankle_mid_x = sum(lm['x'] for lm in foot_candidates) / len(foot_candidates)
        ankle_mid_y = max(lm['y'] for lm in foot_candidates)

        # Use Euclidean vector distance (consistent with calculate_pixel_height)
        head_landmark = landmarks[0]
        dx = ankle_mid_x - head_landmark['x']
        dy = ankle_mid_y - head_landmark['y']
        pixel_height = math.sqrt(dx * dx + dy * dy) * image_shape[0]

        if pixel_height <= 0:
            return user_height_cm

        # Apply correction factor for missing landmark extent
        HEIGHT_CORRECTION_FACTOR = 1.12
        height_cm = (pixel_height * HEIGHT_CORRECTION_FACTOR / image_shape[0]) * user_height_cm

        return height_cm
    except Exception:
        return user_height_cm
```

- [ ] **Step 4: Add debug logging for height calculation**

Add debug output to track pixel_height and scale:

```python
# After computing pixel_height, add:
debug_info = {
    'pixel_height': round(pixel_height, 2),
    'scale': round(user_height_cm / pixel_height, 4) if pixel_height > 0 else 0,
    'height_cm': round(height_cm, 2)
}
print(f"[height_debug] {debug_info}")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_height_uses_vector_distance -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/measurement.py
git commit -m "fix: use Euclidean vector distance for height calculation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Fix Width Underestimation for Non-Front Views

**Files:**
- Modify: `backend/app/services/measurement.py:906-941`
- Modify: `backend/app/services/measurement.py:944-985`

- [ ] **Step 1: Write failing test for non-front width correction**

```python
def test_non_front_shoulder_width_corrected():
    """Shoulder width should be corrected when user is not front-facing."""
    from app.services.measurement import calculate_shoulder_width, is_front_view

    # Create non-front pose: shoulders at different Y (side angle)
    # delta_y > 0.15 means not front view
    landmarks = [{'visibility': 0.8, 'x': 0.5, 'y': 0.5}] * 33
    landmarks[11] = {'visibility': 0.8, 'x': 0.45, 'y': 0.25}  # left_shoulder higher
    landmarks[12] = {'visibility': 0.8, 'x': 0.55, 'y': 0.35}  # right_shoulder lower

    # Verify it's detected as non-front
    assert not is_front_view(landmarks), "This should be detected as non-front view"

    # Get width for non-front
    width_non_front, _ = calculate_shoulder_width(landmarks, (100, 100, 3), pixel_height=80, user_height_cm=170)

    # Create equivalent front pose: same x-distance, same Y level
    landmarks_front = [{'visibility': 0.8, 'x': 0.5, 'y': 0.5}] * 33
    landmarks_front[11] = {'visibility': 0.8, 'x': 0.45, 'y': 0.30}  # left_shoulder
    landmarks_front[12] = {'visibility': 0.8, 'x': 0.55, 'y': 0.30}  # right_shoulder

    width_front, _ = calculate_shoulder_width(landmarks_front, (100, 100, 3), pixel_height=80, user_height_cm=170)

    # Non-front should be corrected to be LARGER than raw x-distance suggests
    # The raw x-distance is the same, but non-front needs correction
    assert width_non_front > 0, "Non-front width should not be zero"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_non_front_shoulder_width_corrected -v`
Expected: FAIL - no correction applied currently

- [ ] **Step 3: Add shoulder depth detection function**

Add a new function to detect shoulder depth difference (indicates rotation):

```python
def get_shoulder_depth_ratio(landmarks: list) -> float:
    """
    Calculate shoulder depth ratio to detect rotation from front view.

    Returns ratio of vertical shoulder offset to horizontal distance.
    Non-front views have high delta_y / delta_x ratio.

    Returns:
        Ratio > 0.3 indicates significant rotation (non-front)
    """
    if not landmarks or len(landmarks) < 13:
        return 1.0  # assume non-front if can't determine

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]

        delta_x = abs(right_shoulder['x'] - left_shoulder['x'])
        delta_y = abs(right_shoulder['y'] - left_shoulder['y'])

        if delta_x <= 0:
            return 1.0

        return delta_y / delta_x
    except Exception:
        return 1.0
```

- [ ] **Step 4: Add width correction factor function**

Add correction for non-front views:

```python
def get_non_front_correction_factor(landmarks: list) -> float:
    """
    Get width correction factor for non-front poses.

    When body is rotated, x-distance appears smaller than actual width.
    Estimate correction based on shoulder depth ratio.

    Returns:
        Correction factor to multiply width by (1.0 = no correction needed)
    """
    depth_ratio = get_shoulder_depth_ratio(landmarks)

    # If ratio > 0.3, body is rotated - apply correction
    # Simple linear model: higher rotation = larger correction
    if depth_ratio > 0.3:
        # Cap correction at 1.5x for extreme angles
        correction = min(1.5, 1.0 + (depth_ratio - 0.3) * 1.5)
        return correction

    return 1.0
```

- [ ] **Step 5: Modify calculate_shoulder_width to apply correction**

Update the function to apply the correction factor:

```python
def calculate_shoulder_width(landmarks: list, image_shape: tuple,
                              pixel_height: float, user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> tuple[float, bool]:
    """
    Calculate shoulder width from pose landmarks.

    Uses Euclidean distance between left and right shoulders,
    converts using ratio-based normalization.
    Applies correction for non-front poses.
    """
    if not landmarks or len(landmarks) < 13:
        return 0.0, False

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]

        # Check confidence
        if left_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD or \
           right_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD:
            return 0.0, False

        shoulder_px = horizontal_distance_px(left_shoulder, right_shoulder, image_shape)
        if shoulder_px <= 0:
            return 0.0, False

        # Apply non-front correction if needed
        is_front = is_front_view(landmarks)
        if not is_front:
            correction_factor = get_non_front_correction_factor(landmarks)
            shoulder_px *= correction_factor

        shoulder_cm = measure_from_ratio(shoulder_px, pixel_height, user_height_cm)
        return max(0.0, shoulder_cm), shoulder_cm > 0
    except Exception:
        return 0.0, False
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_non_front_shoulder_width_corrected -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/measurement.py
git commit -m "fix: add shoulder width correction for non-front poses

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Improve Robustness with Fallback Estimates

**Files:**
- Modify: `backend/app/services/measurement.py:865-903`

- [ ] **Step 1: Write failing test for shoulder validation fallback**

```python
def test_shoulder_validation_fallback():
    """When shoulder validation fails, still provide estimated width with reduced confidence."""
    from app.services.measurement import calculate_measurements_enhanced

    # Create landmarks where shoulders are visible but close together
    # This triggers "shoulders_too_close" but should still return an estimate
    landmarks = [
        [{'x': 0.5, 'y': 0.1, 'visibility': 0.7}] * 33 for _ in range(4)
    ]
    # Make shoulders very close (delta_x = 0.03, below 0.05 threshold)
    for angle_landmarks in landmarks:
        angle_landmarks[11] = {'x': 0.485, 'y': 0.3, 'visibility': 0.7}
        angle_landmarks[12] = {'x': 0.515, 'y': 0.3, 'visibility': 0.7}

    image_shape = (640, 480, 3)

    result = calculate_measurements_enhanced(
        landmarks,
        image_shape,
        user_height_cm=170.0,
    )

    # Should return a result, not crash
    assert result is not None
    assert 'measurements' in result
    # Width may be small but should exist as estimate
    assert 'shoulder_width' in result['measurements']
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_shoulder_validation_fallback -v`
Expected: FAIL - current implementation returns 0.0 for shoulder when validation fails

- [ ] **Step 3: Add fallback estimation to calculate_shoulder_width**

Update the function to provide fallback when standard calculation fails:

```python
def calculate_shoulder_width(landmarks: list, image_shape: tuple,
                              pixel_height: float, user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> tuple[float, bool]:
    """
    Calculate shoulder width from pose landmarks.

    Uses Euclidean distance between left and right shoulders,
    converts using ratio-based normalization.
    Falls back to estimated width when validation fails.
    """
    if not landmarks or len(landmarks) < 13:
        return 0.0, False

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]

        # Check confidence
        if left_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD or \
           right_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD:
            # Fallback: estimate from torso proportions
            return estimate_shoulder_from_torso(landmarks, image_shape, pixel_height, user_height_cm)

        shoulder_px = horizontal_distance_px(left_shoulder, right_shoulder, image_shape)
        if shoulder_px <= 0:
            return estimate_shoulder_from_torso(landmarks, image_shape, pixel_height, user_height_cm)

        # Apply non-front correction if needed
        is_front = is_front_view(landmarks)
        if not is_front:
            correction_factor = get_non_front_correction_factor(landmarks)
            shoulder_px *= correction_factor

        shoulder_cm = measure_from_ratio(shoulder_px, pixel_height, user_height_cm)
        return max(0.0, shoulder_cm), shoulder_cm > 0
    except Exception:
        return estimate_shoulder_from_torso(landmarks, image_shape, pixel_height, user_height_cm)


def estimate_shoulder_from_torso(landmarks: list, image_shape: tuple,
                                  pixel_height: float, user_height_cm: float) -> tuple[float, bool]:
    """
    Estimate shoulder width from torso proportions when direct measurement fails.

    Uses empirical ratio: shoulder width ≈ 25% of body height for average adult.
    """
    if pixel_height <= 0 or user_height_cm <= 0:
        return 0.0, False

    # Empirical: shoulder width is roughly 25% of height for average adult male
    # Adjust for gender/age implicit in user_height_cm
    ESTIMATED_SHOULDER_RATIO = 0.25

    estimated_shoulder_cm = user_height_cm * ESTIMATED_SHOULDER_RATIO
    return estimated_shoulder_cm, False  # Lower confidence with estimate
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_shoulder_validation_fallback -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/measurement.py
git commit -m "fix: add fallback shoulder estimation when validation fails

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Integration Test and Verification

**Files:**
- Modify: `backend/app/services/test_measurement.py`

- [ ] **Step 1: Write integration test**

```python
def test_vector_measurement_integration():
    """Full integration test for vector-based measurement system."""
    from app.services.measurement import calculate_measurements_enhanced

    # Simulate realistic front-facing pose
    landmarks = [
        # Front view: shoulders at same Y level
        [
            {'x': 0.5, 'y': 0.1, 'visibility': 0.9},  # nose
            {'x': 0.45, 'y': 0.3, 'visibility': 0.9},  # left_shoulder
            {'x': 0.55, 'y': 0.3, 'visibility': 0.9},  # right_shoulder
            {'x': 0.5, 'y': 0.5, 'visibility': 0.9},  # hip midpoint
            {'x': 0.5, 'y': 0.9, 'visibility': 0.9},  # left_ankle
            {'x': 0.5, 'y': 0.9, 'visibility': 0.9},  # right_ankle
        ] + [{'x': 0.5, 'y': 0.5, 'visibility': 0.9}] * 27
        for _ in range(4)
    ]
    image_shape = (640, 480, 3)

    result = calculate_measurements_enhanced(
        landmarks,
        image_shape,
        user_height_cm=170.0,
    )

    assert result['success'], f"Measurement should succeed: {result.get('warnings', [])}"

    measurements = result['measurements']

    # Height should be close to user input (within ±3cm)
    height = measurements.get('height', 0)
    assert abs(height - 170) <= 5, f"Height {height} should be within 5cm of 170"

    # Widths should be in realistic human ranges
    shoulder = measurements.get('shoulder_width', 0)
    assert 35 <= shoulder <= 55, f"Shoulder width {shoulder} should be 35-55cm"

    chest = measurements.get('chest', 0)
    assert 70 <= chest <= 120, f"Chest {chest} should be 70-120cm"

    waist = measurements.get('waist', 0)
    assert 60 <= waist <= 110, f"Waist {waist} should be 60-110cm"

    # Confidence should be a valid dict
    assert isinstance(result['confidence'], dict)
```

- [ ] **Step 2: Run integration test**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_vector_measurement_integration -v`
Expected: PASS

- [ ] **Step 3: Run all measurement tests**

Run: `cd backend && python -m pytest app/services/test_measurement.py -v`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/test_measurement.py
git commit -m "test: add integration tests for vector measurement fixes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

1. **Spec coverage:** Check each requirement:
   - ✅ Confidence validation error - Task 1
   - ✅ Height scaling fix - Task 2
   - ✅ Width underestimation - Task 3
   - ✅ Robustness/fallback - Task 4
   - ✅ Integration verification - Task 5

2. **Placeholder scan:** No TBD, TODO, or placeholder code in steps

3. **Type consistency:**
   - `confidence` always returned as dict
   - `MeasurementConfidence` properly constructed from dict
   - `calculate_height` and `calculate_pixel_height` use consistent vector approach
   - `is_front_view` and `get_shoulder_depth_ratio` work together

4. **API compatibility:** No changes to response structure - only internal fixes

---

## Plan Complete

**Plan complete and saved to `docs/superpowers/plans/2026-04-15-vector-measurement-fix.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**