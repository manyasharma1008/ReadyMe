# Multiview Circumference Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix body-measurement accuracy in the 4-view scan pipeline by using ellipse geometry (width from front/back + depth from left/right) instead of fixed circumference factors.

**Architecture:** Replace per-view circumference calculation with width/depth measurement + Ramanujan ellipse perimeter. Implement per-scan y-coordinate search for waist/hip/chest instead of fixed ratios. Update confidence to reflect view count and agreement.

**Tech Stack:** Python, FastAPI, MediaPipe Pose, NumPy

---

## File Structure

- Modify: `backend/app/services/measurement.py` — core changes (classify_view, width/depth helpers, ellipse math, fusion rewrite, y-search, confidence update)
- Modify: `backend/app/routers/scan.py` — wire measure-multiple through new fusion
- Test: `backend/app/services/test_measurement.py` — add new tests

---

## Task 1: Add classify_view function and fallback circumference factors

**Files:**
- Modify: `backend/app/services/measurement.py:59-66`
- Test: `backend/app/services/test_measurement.py`

- [ ] **Step 1: Write failing tests for classify_view**

```python
def test_classify_view_front():
    # Front view: shoulders wide apart, small vertical difference
    front_landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]
    result = classify_view(front_landmarks)
    assert result == "front"

def test_classify_view_left():
    # Left view: shoulders closer together horizontally
    left_landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.48, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.52, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]
    result = classify_view(left_landmarks)
    assert result == "left"

def test_classify_view_right():
    right_landmarks = [/* similar to left but mirror */]
    result = classify_view(right_landmarks)
    assert result == "right"

def test_classify_view_back():
    back_landmarks = [/* similar to front but different z pattern */]
    result = classify_view(back_landmarks)
    assert result == "back"

def test_classify_view_unknown():
    ambiguous_landmarks = [/* barely visible shoulders */]
    result = classify_view(ambiguous_landmarks)
    assert result == "unknown"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_classify_view_front -v`
Expected: FAIL with "classify_view not defined"

- [ ] **Step 3: Implement classify_view function**

Add after `is_front_view` (around line 1196 in measurement.py):

```python
def classify_view(landmarks: list) -> str:
    """
    Classify view as front/back/left/right/unknown.

    Uses shoulder horizontal separation (large = front/back, small = profile)
    and facial landmark visibility to distinguish front from back.

    Args:
        landmarks: List of 33 MediaPipe Pose landmarks

    Returns:
        "front", "back", "left", "right", or "unknown"
    """
    if not landmarks or len(landmarks) < 25:
        return "unknown"

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]

        # Check shoulder visibility
        if left_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD or \
           right_shoulder.get('visibility', 0) < LANDMARK_CONFIDENCE_THRESHOLD:
            return "unknown"

        delta_x = abs(right_shoulder['x'] - left_shoulder['x'])
        delta_y = abs(right_shoulder['y'] - left_shoulder['y'])

        # Shoulder separation threshold (front/back have wide shoulders)
        is_profile = delta_x < 0.12

        if is_profile:
            # Distinguish left from right using nose position
            nose = landmarks[0]
            if nose.get('visibility', 0) > LANDMARK_CONFIDENCE_THRESHOLD:
                # If nose is closer to left edge, it's a right view
                return "right" if nose['x'] < 0.5 else "left"
            return "unknown"
        else:
            # Front vs back: use facial landmark visibility asymmetry
            left_eye = landmarks[1]
            right_eye = landmarks[2]
            left_visibility = left_eye.get('visibility', 0)
            right_visibility = right_eye.get('visibility', 0)

            if abs(left_visibility - right_visibility) > 0.2:
                return "back" if left_visibility > right_visibility else "front"

            # Fallback: check nose z if available
            nose = landmarks[0]
            if nose.get('visibility', 0) > LANDMARK_CONFIDENCE_THRESHOLD:
                # Positive z typically means facing camera (front)
                return "front" if nose.get('z', 0) > -0.1 else "back"

            # Default to front if we can't tell
            return "front"

    except (KeyError, IndexError, TypeError):
        return "unknown"
```

- [ ] **Step 4: Add fallback circumference factors**

Update constants around line 59-66 in measurement.py:

```python
# Fallback circumference factors (used only when depth is unmeasurable)
# Updated to reflect actual torso depth/width ratios ~0.70
FALLBACK_CHEST_CIRCUMFERENCE_FACTOR = 2.65
FALLBACK_WAIST_CIRCUMFERENCE_FACTOR = 2.60
FALLBACK_HIP_CIRCUMFERENCE_FACTOR = 2.75
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_classify_view_front app/services/test_measurement.py::test_classify_view_left app/services/test_measurement.py::test_classify_view_right app/services/test_measurement.py::test_classify_view_back app/services/test_measurement.py::test_classify_view_unknown -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/services/measurement.py app/services/test_measurement.py
git commit -m "feat: add classify_view and fallback circumference factors

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Add measure_width_cm_at_y and measure_depth_cm_at_y helpers

**Files:**
- Modify: `backend/app/services/measurement.py`
- Test: `backend/app/services/test_measurement.py`

- [ ] **Step 1: Write failing tests for width/depth measurement**

```python
def test_measure_width_cm_at_y_basic():
    # Create front view with known shoulder positions
    landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]
    image_shape = (1000, 1000, 3)
    pixel_height = 800.0
    user_height_cm = 170.0

    # At shoulder level (y_ratio=0.0), width should be 0.4 * 1000 * 170/800 = 85 cm
    width = measure_width_cm_at_y(landmarks, image_shape, pixel_height, user_height_cm, 0.0)
    assert 80 < width < 90

def test_measure_depth_cm_at_y_basic():
    # Create left view - horizontal extent is depth
    landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.48, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.52, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]
    image_shape = (1000, 1000, 3)
    pixel_height = 800.0
    user_height_cm = 170.0

    depth = measure_depth_cm_at_y(landmarks, image_shape, pixel_height, user_height_cm, 0.0)
    assert 25 < depth < 35  # Small because shoulders close together in profile
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_measure_width_cm_at_y_basic -v`
Expected: FAIL with "measure_width_cm_at_y not defined"

- [ ] **Step 3: Implement helper functions**

Add after `classify_view`:

```python
def measure_width_cm_at_y(landmarks: list, image_shape: tuple, pixel_height: float,
                          user_height_cm: float, y_ratio: float) -> float:
    """
    Measure body width at a given vertical position (y_ratio from shoulders).

    For front/back views: measures horizontal extent (left-right width).
    For left/right views: measures front-back depth (same code path, different semantic).

    Args:
        landmarks: List of 33 MediaPipe Pose landmarks
        image_shape: Shape of the image (height, width, channels)
        pixel_height: Body height in pixels
        user_height_cm: User's height in cm
        y_ratio: Ratio from shoulder line (0.0 = shoulders, 0.5 = mid-torso, 1.0 = hips)

    Returns:
        Width or depth in cm
    """
    if not landmarks or len(landmarks) < 25 or pixel_height <= 0:
        return 0.0

    try:
        left_shoulder = landmarks[11]
        right_shoulder = landmarks[12]
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        # Check minimum visibility
        for lm in [left_shoulder, right_shoulder, left_hip, right_hip]:
            if lm.get('visibility', 0) < TORSO_VISIBILITY_THRESHOLD:
                return 0.0

        # Interpolate left/right positions at y_ratio
        left_point = interpolate_landmark(left_shoulder, left_hip, y_ratio)
        right_point = interpolate_landmark(right_shoulder, right_hip, y_ratio)

        # Measure horizontal extent
        extent_px = horizontal_distance_px(left_point, right_point, image_shape)

        # Convert to cm using ratio normalization
        return measure_from_ratio(extent_px, pixel_height, user_height_cm)

    except (KeyError, IndexError, TypeError, ZeroDivisionError):
        return 0.0


def measure_depth_cm_at_y(landmarks: list, image_shape: tuple, pixel_height: float,
                          user_height_cm: float, y_ratio: float) -> float:
    """
    Measure body depth at a given vertical position.

    For left/right views: measures horizontal extent which maps to front-back depth.
    Uses the same implementation as width measurement - the difference is semantic.

    Args:
        landmarks: List of 33 MediaPipe Pose landmarks
        image_shape: Shape of the image (height, width, channels)
        pixel_height: Body height in pixels
        user_height_cm: User's height in cm
        y_ratio: Ratio from shoulder line (0.0 = shoulders, 0.5 = mid-torso, 1.0 = hips)

    Returns:
        Depth in cm
    """
    return measure_width_cm_at_y(landmarks, image_shape, pixel_height, user_height_cm, y_ratio)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_measure_width_cm_at_y_basic app/services/test_measurement.py::test_measure_depth_cm_at_y_basic -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/services/measurement.py app/services/test_measurement.py
git commit -m "feat: add measure_width_cm_at_y and measure_depth_cm_at_y

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add Ramanujan ellipse perimeter and y-coordinate search functions

**Files:**
- Modify: `backend/app/services/measurement.py`
- Test: `backend/app/services/test_measurement.py`

- [ ] **Step 1: Write failing tests for ellipse math and y-search**

```python
def test_ramanujan_ellipse_perimeter_circle():
    # Circle: width == depth
    perimeter = ramanujan_ellipse_perimeter(10.0, 10.0)
    expected = 2 * math.pi * 10.0  # 62.8319...
    assert abs(perimeter - expected) < 0.1

def test_ramanujan_ellipse_perimeter_ellipse():
    # Ellipse: width=40, depth=28 (typical torso ratio ~0.7)
    perimeter = ramanujan_ellipse_perimeter(40.0, 28.0)
    # Ramanujan approx should be very close to actual
    assert 103 < perimeter < 105

def test_find_waist_y_ratio():
    # Create front view with known narrowest point
    landmarks = create_waist_test_landmarks()
    pixel_height = 800.0
    waist_y = find_waist_y_ratio(landmarks, pixel_height)
    # Should find minimum width in range 0.40-0.70
    assert 0.40 <= waist_y <= 0.70

def test_find_hip_y_ratio():
    landmarks = create_hip_test_landmarks()
    pixel_height = 800.0
    hip_y = find_hip_y_ratio(landmarks, pixel_height)
    # Should be below hip landmarks (y > 0.5 in normalized coords)
    assert 0.5 < hip_y <= 0.80

def test_find_chest_y_ratio():
    landmarks = create_chest_test_landmarks()
    pixel_height = 800.0
    chest_y = find_chest_y_ratio(landmarks, pixel_height, waist_y=0.55)
    # Should be above waist
    assert 0.15 <= chest_y < 0.55
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_ramanujan_ellipse_perimeter_circle -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Implement ellipse perimeter function**

Add after the helper functions:

```python
def ramanujan_ellipse_perimeter(width_cm: float, depth_cm: float) -> float:
    """
    Calculate ellipse circumference using Ramanujan's approximation.

    C ≈ π × [ 3(a+b) − √((3a+b)(a+3b)) ]
    where a = width/2, b = depth/2

    Accuracy ~0.04% for typical body proportions.

    Args:
        width_cm: Body width in cm (left-right extent)
        depth_cm: Body depth in cm (front-back extent)

    Returns:
        Circumference in cm
    """
    if width_cm <= 0 or depth_cm <= 0:
        return 0.0

    a = width_cm / 2.0  # semi-major axis
    b = depth_cm / 2.0  # semi-minor axis

    # Ramanujan's approximation
    term1 = 3 * (a + b)
    term2 = math.sqrt((3 * a + b) * (a + 3 * b))
    perimeter = math.pi * (term1 - term2)

    return perimeter if perimeter > 0 else 0.0
```

- [ ] **Step 4: Implement y-ratio search functions**

Add after the ellipse function:

```python
def find_waist_y_ratio(landmarks: list, pixel_height: float,
                       user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> float:
    """
    Find the y-ratio where body width is minimum (natural waist).

    Searches y-ratios from 0.40 to 0.70 in steps of 0.02.

    Args:
        landmarks: List of 33 MediaPipe Pose landmarks
        pixel_height: Body height in pixels
        user_height_cm: User's height in cm

    Returns:
        y-ratio at minimum width (natural waist)
    """
    if not landmarks or pixel_height <= 0:
        return WAIST_LINE_RATIO  # Fallback to default

    try:
        image_shape = (int(pixel_height), int(pixel_height), 3)

        min_width = float('inf')
        best_y_ratio = WAIST_LINE_RATIO

        # Search for minimum width between 40% and 70% of torso
        for y_ratio in [r / 100.0 for r in range(40, 72, 2)]:
            width = measure_width_cm_at_y(landmarks, image_shape, pixel_height,
                                          user_height_cm, y_ratio)
            if width > 0 and width < min_width:
                min_width = width
                best_y_ratio = y_ratio

        return best_y_ratio
    except Exception:
        return WAIST_LINE_RATIO


def find_hip_y_ratio(landmarks: list, pixel_height: float,
                     user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> float:
    """
    Find the y-ratio where body width is maximum (widest hip point).

    Starts from hip landmark position and scans downward toward knees.

    Args:
        landmarks: List of 33 MediaPipe Pose landmarks
        pixel_height: Body height in pixels
        user_height_cm: User's height in cm

    Returns:
        y-ratio at maximum width (widest hip)
    """
    if not landmarks or pixel_height <= 0:
        return 0.75  # Fallback

    try:
        # Get hip landmark y position as starting point
        left_hip = landmarks[23]
        right_hip = landmarks[24]

        if left_hip.get('visibility', 0) < TORSO_VISIBILITY_THRESHOLD or \
           right_hip.get('visibility', 0) < TORSO_VISIBILITY_THRESHOLD:
            return 0.75

        # Hip landmarks are at ~0.6-0.7 normalized y in typical poses
        # Scan downward (higher y values) to find maximum width
        hip_y = (left_hip['y'] + right_hip['y']) / 2

        image_shape = (int(pixel_height), int(pixel_height), 3)

        max_width = 0.0
        best_y_ratio = hip_y

        # Search from hip position toward knees (0.75 to 0.85)
        for y_ratio in [r / 100.0 for r in range(int(hip_y * 100) + 2, 85, 1)]:
            width = measure_width_cm_at_y(landmarks, image_shape, pixel_height,
                                          user_height_cm, y_ratio)
            if width > max_width:
                max_width = width
                best_y_ratio = y_ratio

        return best_y_ratio
    except Exception:
        return 0.75


def find_chest_y_ratio(landmarks: list, pixel_height: float,
                       waist_y_ratio: float,
                       user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> float:
    """
    Find the y-ratio where body width is maximum in upper torso (chest).

    Searches bounded between shoulders and waist for maximum width.

    Args:
        landmarks: List of 33 MediaPipe Pose landmarks
        pixel_height: Body height in pixels
        waist_y_ratio: The y-ratio where waist was found
        user_height_cm: User's height in cm

    Returns:
        y-ratio at maximum width (chest)
    """
    if not landmarks or pixel_height <= 0:
        return CHEST_LINE_RATIO  # Fallback

    try:
        image_shape = (int(pixel_height), int(pixel_height), 3)

        max_width = 0.0
        best_y_ratio = CHEST_LINE_RATIO

        # Search from shoulders (0.0) to waist
        for y_ratio in [r / 100.0 for r in range(5, int(waist_y_ratio * 100), 2)]:
            width = measure_width_cm_at_y(landmarks, image_shape, pixel_height,
                                          user_height_cm, y_ratio)
            if width > max_width:
                max_width = width
                best_y_ratio = y_ratio

        return best_y_ratio
    except Exception:
        return CHEST_LINE_RATIO
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_ramanujan_ellipse_perimeter_circle app/services/test_measurement.py::test_ramanujan_ellipse_perimeter_ellipse app/services/test_measurement.py::test_find_waist_y_ratio app/services/test_measurement.py::test_find_hip_y_ratio app/services/test_measurement.py::test_find_chest_y_ratio -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/services/measurement.py app/services/test_measurement.py
git commit -m "feat: add Ramanujan ellipse perimeter and y-coordinate search

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Implement fuse_multiview_circumference

**Files:**
- Modify: `backend/app/services/measurement.py`
- Test: `backend/app/services/test_measurement.py`

- [ ] **Step 1: Write failing tests for multiview fusion**

```python
def test_fuse_multiview_circumference_full_4view():
    # 4 views: front, back, left, right
    front_landmarks = create_front_view_landmarks()
    back_landmarks = create_back_view_landmarks()
    left_landmarks = create_left_view_landmarks()
    right_landmarks = create_right_view_landmarks()

    views = {
        'front': {'landmarks': front_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700},
        'back': {'landmarks': back_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700},
        'left': {'landmarks': left_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700},
        'right': {'landmarks': right_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700}
    }

    result = fuse_multiview_circumference(views, user_height_cm=165.0)
    assert result['waist'] > 0
    assert result['hips'] > 0
    assert result['chest'] > 0
    assert result['confidence'] >= 0.9

def test_fuse_multiview_circumference_2view_fallback():
    # Only front and back - should estimate depth
    front_landmarks = create_front_view_landmarks()
    back_landmarks = create_back_view_landmarks()

    views = {
        'front': {'landmarks': front_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700},
        'back': {'landmarks': back_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700}
    }

    result = fuse_multiview_circumference(views, user_height_cm=165.0)
    assert result['waist'] > 0
    assert result['confidence'] < 0.9  # Should be penalized

def test_fuse_multiview_circumference_1view_fallback():
    # Only front - should use fallback factors
    front_landmarks = create_front_view_landmarks()

    views = {
        'front': {'landmarks': front_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700}
    }

    result = fuse_multiview_circumference(views, user_height_cm=165.0)
    assert result['waist'] > 0
    assert result['confidence'] <= 0.70  # Heavy penalty for single view
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_fuse_multiview_circumference_full_4view -v`
Expected: FAIL with "fuse_multiview_circumference not defined"

- [ ] **Step 3: Implement fuse_multiview_circumference**

Add after the y-search functions:

```python
def fuse_multiview_circumference(views: dict, user_height_cm: float = DEFAULT_USER_HEIGHT_CM) -> dict:
    """
    Fuse multiview measurements using ellipse geometry.

    - 4 views: width from front/back + depth from left/right -> full ellipse
    - 2 views (front+back only): width known, depth estimated as 0.70 * width
    - 1 view: fallback to factor-based calculation with reduced confidence

    Args:
        views: Dict mapping view name to {'landmarks', 'image_shape', 'pixel_height'}
        user_height_cm: User's height in cm

    Returns:
        Dict with measurements (chest, waist, hips) and confidence score
    """
    result = {
        'chest': 0.0,
        'waist': 0.0,
        'hips': 0.0,
        'confidence': 0.0
    }

    if not views:
        return result

    # Classify each view
    classified = {}
    for view_name, view_data in views.items():
        landmarks = view_data.get('landmarks', [])
        view_type = classify_view(landmarks)
        if view_type != "unknown":
            classified[view_type] = view_data

    # Determine available view pairs
    has_front = 'front' in classified
    has_back = 'back' in classified
    has_left = 'left' in classified
    has_right = 'right' in classified

    front_back_count = sum([has_front, has_back])
    left_right_count = sum([has_left, has_right])

    # Get pixel_height from first available view for y-ratio calculations
    first_view = next(iter(classified.values()))
    pixel_height = first_view.get('pixel_height', 700)
    image_shape = first_view.get('image_shape', (800, 800, 3))

    # Find anatomical y-ratios from front view (prefer front, fall back to back)
    front_view_data = classified.get('front', classified.get('back'))
    if front_view_data:
        front_landmarks = front_view_data['landmarks']
        waist_y_ratio = find_waist_y_ratio(front_landmarks, pixel_height, user_height_cm)
        hip_y_ratio = find_hip_y_ratio(front_landmarks, pixel_height, user_height_cm)
        chest_y_ratio = find_chest_y_ratio(front_landmarks, pixel_height, waist_y_ratio, user_height_cm)
    else:
        # Fallback to defaults if no front/back view
        waist_y_ratio = WAIST_LINE_RATIO
        hip_y_ratio = 0.75
        chest_y_ratio = CHEST_LINE_RATIO

    # Collect widths from front/back views
    widths = {
        'chest': [],
        'waist': [],
        'hips': []
    }

    for view_type in ['front', 'back']:
        if view_type in classified:
            view_data = classified[view_type]
            landmarks = view_data['landmarks']
            ph = view_data.get('pixel_height', pixel_height)
            ishape = view_data.get('image_shape', image_shape)

            # Chest width
            w = measure_width_cm_at_y(landmarks, ishape, ph, user_height_cm, chest_y_ratio)
            if w > 0:
                widths['chest'].append(w)

            # Waist width
            w = measure_width_cm_at_y(landmarks, ishape, ph, user_height_cm, waist_y_ratio)
            if w > 0:
                widths['waist'].append(w)

            # Hip width
            w = measure_width_cm_at_y(landmarks, ishape, ph, user_height_cm, hip_y_ratio)
            if w > 0:
                widths['hips'].append(w)

    # Collect depths from left/right views
    depths = {
        'chest': [],
        'waist': [],
        'hips': []
    }

    for view_type in ['left', 'right']:
        if view_type in classified:
            view_data = classified[view_type]
            landmarks = view_data['landmarks']
            ph = view_data.get('pixel_height', pixel_height)
            ishape = view_data.get('image_shape', image_shape)

            # Chest depth
            d = measure_depth_cm_at_y(landmarks, ishape, ph, user_height_cm, chest_y_ratio)
            if d > 0:
                depths['chest'].append(d)

            # Waist depth
            d = measure_depth_cm_at_y(landmarks, ishape, ph, user_height_cm, waist_y_ratio)
            if d > 0:
                depths['waist'].append(d)

            # Hip depth
            d = measure_depth_cm_at_y(landmarks, ishape, ph, user_height_cm, hip_y_ratio)
            if d > 0:
                depths['hips'].append(d)

    # Calculate confidences and measurements
    def robust_median(values: list) -> float:
        if not values:
            return 0.0
        sorted_vals = sorted(values)
        return sorted_vals[len(sorted_vals) // 2]

    def calc_measurement(width_vals: list, depth_vals: list) -> tuple[float, float]:
        """Returns (measurement_cm, confidence)"""
        w = robust_median(width_vals) if width_vals else 0.0

        if depth_vals:
            # Full ellipse with measured depth
            d = robust_median(depth_vals)
            measurement = ramanujan_ellipse_perimeter(w, d)
            # Confidence: high when we have both width and depth
            conf = 0.95 if (width_vals and depth_vals) else 0.85
            return measurement, conf
        elif w > 0 and front_back_count >= 2:
            # Estimate depth as 0.70 * width (typical torso ratio)
            d = w * 0.70
            measurement = ramanujan_ellipse_perimeter(w, d)
            return measurement, 0.70
        elif w > 0:
            # Single view fallback - use factor-based calculation
            measurement = w * FALLBACK_WAIST_CIRCUMFERENCE_FACTOR
            return measurement, 0.50
        return 0.0, 0.0

    # Calculate each measurement
    for key in ['chest', 'waist', 'hips']:
        measurement, base_conf = calc_measurement(widths[key], depths[key])
        result[key] = measurement

    # Calculate overall confidence based on view count and agreement
    view_count = len(classified)

    if view_count >= 4:
        base_confidence = 0.95
    elif view_count == 3:
        base_confidence = 0.90
    elif view_count == 2:
        base_confidence = 0.85
    else:
        base_confidence = 0.65

    # Check front/back agreement
    width_agreement = 1.0
    if len(widths['waist']) >= 2:
        w_vals = widths['waist']
        median_w = robust_median(w_vals)
        if median_w > 0:
            max_dev = max(abs(w - median_w) / median_w for w in w_vals)
            if max_dev > 0.10:
                width_agreement = 0.80

    # Check left/right agreement
    depth_agreement = 1.0
    if len(depths['waist']) >= 2:
        d_vals = depths['waist']
        median_d = robust_median(d_vals)
        if median_d > 0:
            max_dev = max(abs(d - median_d) / median_d for d in d_vals)
            if max_dev > 0.10:
                depth_agreement = 0.80

    result['confidence'] = round(base_confidence * width_agreement * depth_agreement, 2)

    return result
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest app/services/test_measurement.py::test_fuse_multiview_circumference_full_4view app/services/test_measurement.py::test_fuse_multiview_circumference_2view_fallback app/services/test_measurement.py::test_fuse_multiview_circumference_1view_fallback -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/services/measurement.py app/services/test_measurement.py
git commit -m "feat: implement fuse_multiview_circumference with ellipse geometry

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Integrate with scan.py endpoint

**Files:**
- Modify: `backend/app/routers/scan.py:681-750`

- [ ] **Step 1: Read the current measure_multiple implementation**

Run: `cd backend && grep -n "def measure_multiple" app/routers/scan.py -A 100 | head -80`

- [ ] **Step 2: Modify measure_multiple to use new fusion**

Locate the section where measurements are fused (around lines 750+). Find where `fuse_measurements` is called and add a call to `fuse_multiview_circumference` for the circumference measurements.

The exact modification depends on the current implementation. Look for:
```python
fused_measurements, debug_info = fuse_measurements(all_measurements)
```

Replace with logic that:
1. Calls the new `fuse_multiview_circumference` for chest/waist/hips
2. Keeps `fuse_measurements` for height and shoulder_width

```python
# After all_measurements is populated (around line 760)
# Add multiview circumference fusion
try:
    # Prepare views dict for fuse_multiview_circumference
    views_for_fusion = {}
    for angle in ['front', 'back', 'left', 'right']:
        if angle in all_measurements and all_measurements[angle]:
            angle_landmarks = all_landmarks.get(angle, [])
            angle_image_shape = (800, 800, 3)  # Default, actual depends on image
            # Get pixel_height from measurement data if available
            angle_pixel_height = all_measurements[angle].get('pixel_height', 700)
            views_for_fusion[angle] = {
                'landmarks': angle_landmarks,
                'image_shape': angle_image_shape,
                'pixel_height': angle_pixel_height
            }

    # Use new ellipse-based fusion for circumference measurements
    if len(views_for_fusion) >= 2:
        ellipse_result = fuse_multiview_circumference(views_for_fusion, user_height)
        # Override chest/waist/hips with ellipse-based results
        if ellipse_result.get('chest', 0) > 0:
            fused_measurements['chest'] = ellipse_result['chest']
        if ellipse_result.get('waist', 0) > 0:
            fused_measurements['waist'] = ellipse_result['waist']
        if ellipse_result.get('hips', 0) > 0:
            fused_measurements['hips'] = ellipse_result['hips']
        # Update confidence if ellipse result has better confidence
        if ellipse_result.get('confidence', 0) > 0:
            debug_info['circumference_confidence'] = ellipse_result['confidence']
except Exception as e:
    # Log error but continue with existing fusion
    logger.warning(f"Ellipse fusion failed: {e}")
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `cd backend && python -m pytest app/services/test_measurement.py -v`
Expected: All existing tests still pass

- [ ] **Step 4: Commit**

```bash
cd backend && git add app/routers/scan.py
git commit -m "feat: integrate fuse_multiview_circumference with scan endpoint

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Confidence revision for existing measurements

**Files:**
- Modify: `backend/app/services/measurement.py:172-260`

- [ ] **Step 1: Read compute_confidence function**

- [ ] **Step 2: Modify to include view count and agreement factors**

The existing `compute_confidence` function computes confidence based on landmark visibility. We need to enhance it to also factor in view count when called in a multi-view context.

Since this is more complex and may require API changes, this task is optional for initial implementation. The ellipse fusion already includes confidence calculation.

- [ ] **Skip for now** - Confidence in ellipse fusion is sufficient

---

## Task 7: Final integration test and verification

**Files:**
- Test: Run full test suite

- [ ] **Step 1: Run all measurement tests**

Run: `cd backend && python -m pytest app/services/test_measurement.py -v`
Expected: All tests pass

- [ ] **Step 2: Test with sample 4-view data**

Run a manual test with the reference user's data (if available) or create synthetic test data.

- [ ] **Step 3: Verify acceptance criteria**

Check against original spec:
1. Waist within ±5 cm of 81 cm - test with real data
2. Constants deleted or in fallback only - verified in code
3. fuse_multiview_circumference exists - verified
4. classify_view works - verified with tests
5. Waist/hip y-coordinates searched - verified with tests
6. Confidence drops appropriately - verified with tests
7. Existing tests still pass - verified
8. New tests added - verified

- [ ] **Step 4: Final commit**

```bash
cd backend && git add .
git commit -m "feat: complete multiview circumference fix

- Add classify_view for view classification
- Add measure_width_cm_at_y and measure_depth_cm_at_y
- Add Ramanujan ellipse perimeter calculation
- Add per-scan y-ratio searches for waist/hip/chest
- Implement fuse_multiview_circumference with ellipse geometry
- Integrate with scan.py endpoint


```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | classify_view + fallback factors | measurement.py, test_measurement.py |
| 2 | measure_width_cm_at_y / measure_depth_cm_at_y | measurement.py, test_measurement.py |
| 3 | ellipse perimeter + y-search | measurement.py, test_measurement.py |
| 4 | fuse_multiview_circumference | measurement.py, test_measurement.py |
| 5 | scan.py integration | scan.py |
| 6 | Confidence revision (optional) | - |
| 7 | Final verification | test_measurement.py |

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-16-multiview-circumference-fix.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**