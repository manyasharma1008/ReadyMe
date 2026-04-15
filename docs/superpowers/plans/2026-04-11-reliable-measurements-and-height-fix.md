# Fix `reliable_measurements` UnboundLocalError and `calculate_height()` Echo Bug

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs in `measurement.py`: (1) `reliable_measurements` is used before it's defined, crashing all requests; (2) `calculate_height()` always returns `user_height_cm` instead of computing from landmarks.

**Architecture:** Two independent one-file fixes. Each follows TDD: write failing test, verify failure, implement minimal fix, verify pass, commit.

**Tech Stack:** Python, pytest, FastAPI backend

---

## File Structure

- **Modify:** `backend/app/services/measurement.py`
  - Part 1: Initialize `reliable_measurements` before line 1622 (the partial-success branch)
  - Part 2: Fix `calculate_height()` to use landmark-based ratio normalization correctly

---

## Task 1: Fix `calculate_height()` — landmark echo bug

**Files:**
- Modify: `backend/app/services/measurement.py:729-751`
- Test: `backend/app/services/test_measurement.py` (new or existing)

---

- [ ] **Step 1: Write the failing test for `calculate_height()`**

Create or append to `backend/app/services/test_measurement.py`:

```python
def test_calculate_height_derives_from_landmarks():
    """Height should change based on landmark extent, not echo user_height_cm."""
    from app.services.measurement import calculate_height

    # Two landmarks: head (y=0.1) and feet (y=0.9) in a 100px-tall image
    tall_landmarks = [
        {'y': 0.1, 'visibility': 0.8},  # nose
        {'y': 0.9, 'visibility': 0.8},  # left_ankle
    ] + [{'y': 0.5, 'visibility': 0.8}] * 27  # pad to 29

    # Same user height, but landmarks span 80% of image (taller person proxy)
    result_tall = calculate_height(tall_landmarks, (100, 100, 3), user_height_cm=170)
    assert result_tall != 170, f"Height must derive from landmarks, got {result_tall}"

    # Short landmarks: head (y=0.3) and hips (y=0.6) — smaller span
    short_landmarks = [
        {'y': 0.3, 'visibility': 0.8},
        {'y': 0.6, 'visibility': 0.8},
    ] + [{'y': 0.5, 'visibility': 0.8}] * 27

    result_short = calculate_height(short_landmarks, (100, 100, 3), user_height_cm=170)
    assert result_short != 170, f"Height must derive from landmarks, got {result_short}"

    # They must differ since landmark extents differ
    assert result_tall != result_short, "Different landmark extents must yield different heights"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_calculate_height_derives_from_landmarks -v`
Expected: FAIL — both assertions show `== 170`

- [ ] **Step 3: Implement the fix in `calculate_height()`**

Replace lines 729–751 with:

```python
def calculate_height(landmarks: list, image_shape: tuple,
                      user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> float:
    """
    Estimate height from pose landmarks using ratio normalization.

    Args:
        landmarks: List of body landmarks
        image_shape: Shape of the original image
        user_height_cm: User's actual height in cm for ratio normalization

    Returns:
        Estimated height in cm
    """
    if not landmarks or len(landmarks) < 29:
        return user_height_cm

    try:
        # Collect all landmarks with visibility > 0.5
        visible_landmarks = [
            lm for lm in landmarks if lm.get('visibility', 0) > 0.5
        ]

        if len(visible_landmarks) < 2:
            return user_height_cm

        min_y = min(lm['y'] for lm in visible_landmarks)
        max_y = max(lm['y'] for lm in visible_landmarks)
        pixel_height = (max_y - min_y) * image_shape[0]

        if pixel_height <= 0:
            return user_height_cm

        # Known reference: for a full-height standing pose, shoulder-to-ankle
        # landmarks are a reliable proxy for total height fraction.
        # We use the ratio of detected height to a reference full-height fraction
        # (e.g. shoulders at ~15% from top, ankles at ~95% = 80% of image height
        # for a full-body scan). This gives us pixel_height / reference_height.
        reference_height_fraction = 0.80  # expected span from shoulders to feet

        # Apply ratio normalization:
        # measurement_cm = (pixel_distance / reference_distance) * reference_cm
        height_cm = measure_from_ratio(pixel_height, image_shape[0] * reference_height_fraction, user_height_cm)
        return height_cm
    except Exception:
        return user_height_cm
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_calculate_height_derives_from_landmarks -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/services/measurement.py app/services/test_measurement.py
git commit -m "fix: calculate_height() derives from landmark extent, not echo input

Before: measure_from_ratio(pixel_height, pixel_height, user_height_cm) always
returned user_height_cm since ratio=1. Now uses a reference fraction of
image height to normalize landmark-derived pixel height against user_height_cm.
Added test to verify landmark-derived heights differ from input echo."
```

---

## Task 2: Fix `reliable_measurements` — initialize before use at line 1622

**Files:**
- Modify: `backend/app/services/measurement.py:1614-1630`
- Test: `backend/app/services/test_measurement.py`

---

- [ ] **Step 1: Write the failing test for `reliable_measurements` initialization**

Append to `backend/app/services/test_measurement.py`:

```python
def test_calculate_measurements_enhanced_no_unbound_local_error():
    """calculate_measurements_enhanced must not raise UnboundLocalError on reliable_measurements."""
    import pytest
    from app.services.measurement import calculate_measurements_enhanced

    # Minimal valid input that reaches the partial-success check at line 1622
    landmarks = [[{'x': 0.5, 'y': 0.3, 'visibility': 0.8}] * 33 for _ in range(4)]
    images = [np.zeros((100, 100, 3), dtype=np.uint8) for _ in range(4)]
    image_shapes = [(100, 100, 3)] * 4

    try:
        result = calculate_measurements_enhanced(
            landmarks, images, image_shapes,
            user_height_cm=170.0,
            use_calibration=False
        )
        # Must not raise UnboundLocalError; result may be success or failure
        assert isinstance(result, dict), "Result must be a dict"
        assert 'success' in result, "Result must have 'success' key"
    except UnboundLocalError as e:
        pytest.fail(f"UnboundLocalError raised: {e}")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_calculate_measurements_enhanced_no_unbound_local_error -v`
Expected: FAIL — `UnboundLocalError: cannot access local variable 'reliable_measurements' where it is not associated with a value`

- [ ] **Step 3: Implement the fix — insert `reliable_measurements` initialization before line 1622**

In `measurement.py`, after line 1612 (`measurements, excluded_measurements = apply_measurement_confidence_filter(...)`), insert:

```python
    # Build reliable_measurements list from confidence-filtered results
    reliable_measurements = [
        key for key in measurements
        if measurements.get(key, 0) > 0 and confidence.get(key, 0) >= MEASUREMENT_CONFIDENCE_THRESHOLD
    ]
```

Remove or comment out the duplicate initialization lines if any exist at 1627.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_calculate_measurements_enhanced_no_unbound_local_error -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend
git add app/services/measurement.py
git commit -m "fix: initialize reliable_measurements before use in partial-success branch

Before: reliable_measurements was checked at line 1622 but never assigned,
causing UnboundLocalError on every request. Now it's built from the
confidence-filtered measurements dict before the partial-success check."
```

---

## Self-Review

1. **Spec coverage:** Both bugs are covered — `calculate_height()` echo bug (Task 1) and `reliable_measurements` unbound error (Task 2).
2. **Placeholder scan:** No TODOs, no "TBD", no vague descriptions — every step has actual code and actual expected output.
3. **Type consistency:** Both tasks use `measurements.py` as the modify target; function names `calculate_height()` and `calculate_measurements_enhanced()` match existing codebase signatures.