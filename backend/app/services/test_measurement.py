import numpy as np
import pytest


def test_calculate_measurements_enhanced_no_unbound_local_error():
    """calculate_measurements_enhanced must not raise UnboundLocalError on reliable_measurements."""
    from app.services.measurement import calculate_measurements_enhanced

    # Minimal valid input that reaches the partial-success check at line 1622
    # Need 4 angles x 33 landmarks each, with shoulder/chest-level visibility
    landmarks = [[{'x': 0.5, 'y': 0.3, 'visibility': 0.8}] * 33 for _ in range(4)]
    image_shape = (100, 100, 3)

    try:
        result = calculate_measurements_enhanced(
            landmarks, image_shape,
            user_height_cm=170.0,
        )
        # Must not raise UnboundLocalError; result may be success or failure
        assert isinstance(result, dict), "Result must be a dict"
        assert 'success' in result, "Result must have 'success' key"
    except UnboundLocalError as e:
        pytest.fail(f"UnboundLocalError raised: {e}")


def test_calculate_height_derives_from_landmarks():
    """Height should change based on landmark extent, not echo user_height_cm."""
    from app.services.measurement import calculate_height

    # Two landmarks: head (y=0.05) and feet (y=0.95) in a 100px-tall image
    tall_landmarks = [
        {'y': 0.05, 'visibility': 0.8},  # nose
        {'y': 0.95, 'visibility': 0.8},  # left_ankle
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


def test_compute_confidence_penalizes_distant_subject():
    """Confidence should decrease when fill_ratio indicates subject is far from camera."""
    from app.services.measurement import compute_confidence

    # Create landmarks with high visibility (would normally give ~0.8+ confidence)
    landmarks = [{'visibility': 0.9, 'x': 0.5, 'y': 0.5}] * 33

    # Near subject: fill_ratio = 0.8 (good)
    conf_near = compute_confidence(landmarks, 'full_body', has_calibration=False, fill_ratio=0.8)
    near_avg = (conf_near['chest'] + conf_near['shoulder_width'] + conf_near['hips']) / 3

    # Far subject: fill_ratio = 0.25 (poor — barely fills 25% of image)
    conf_far = compute_confidence(landmarks, 'full_body', has_calibration=False, fill_ratio=0.25)
    far_avg = (conf_far['chest'] + conf_far['shoulder_width'] + conf_far['hips']) / 3

    # Far subject should have lower confidence than near subject
    assert far_avg < near_avg, f"Distant subject confidence ({far_avg:.3f}) should be lower than near ({near_avg:.3f})"


def test_compute_confidence_no_penalty_when_close():
    """Confidence should NOT be penalized when fill_ratio >= DISTANCE_PENALTY_THRESHOLD."""
    from app.services.measurement import compute_confidence

    landmarks = [{'visibility': 0.85, 'x': 0.5, 'y': 0.5}] * 33

    # At threshold — no penalty
    conf_ok = compute_confidence(landmarks, 'full_body', has_calibration=False, fill_ratio=0.50)
    # Well within range — no penalty
    conf_good = compute_confidence(landmarks, 'full_body', has_calibration=False, fill_ratio=0.70)

    assert conf_ok == conf_good, "Confidence should be identical at and above distance penalty threshold"


def test_shoulder_width_uses_ratio_normalization():
    """Shoulder width must not change with camera distance when pixel_height scales."""
    from app.services.measurement import calculate_shoulder_width

    # Create shoulder landmarks with known width (10% of image apart)
    landmarks = [{'visibility': 0.8, 'x': 0.5, 'y': 0.5}] * 33
    landmarks[11] = {'visibility': 0.8, 'x': 0.45, 'y': 0.3}  # left_shoulder
    landmarks[12] = {'visibility': 0.8, 'x': 0.55, 'y': 0.3}  # right_shoulder

    # Near: 100px tall image, pixel_height=80
    width_near, _ = calculate_shoulder_width(landmarks, (100, 100, 3), pixel_height=80, user_height_cm=170)
    # Far: 200px tall image, pixel_height=160 (same physical width, double pixel_height)
    width_far, _ = calculate_shoulder_width(landmarks, (200, 200, 3), pixel_height=160, user_height_cm=170)

    # Same physical width expected — distance should not matter
    assert abs(width_near - width_far) < 0.5, \
        f"Shoulder width should be distance-independent: near={width_near:.1f}, far={width_far:.1f}"


def test_hips_uses_ratio_normalization():
    """Hips measurement must not change with camera distance."""
    from app.services.measurement import calculate_hips

    landmarks = [{'visibility': 0.8, 'x': 0.5, 'y': 0.5}] * 33
    landmarks[23] = {'visibility': 0.8, 'x': 0.43, 'y': 0.7}  # left_hip
    landmarks[24] = {'visibility': 0.8, 'x': 0.57, 'y': 0.7}  # right_hip

    width_near, _ = calculate_hips(landmarks, (100, 100, 3), pixel_height=80, user_height_cm=170)
    width_far, _ = calculate_hips(landmarks, (200, 200, 3), pixel_height=160, user_height_cm=170)

    assert abs(width_near - width_far) < 0.5, \
        f"Hips should be distance-independent: near={width_near:.1f}, far={width_far:.1f}"


def test_waist_uses_ratio_normalization():
    """Waist measurement must not change with camera distance."""
    from app.services.measurement import calculate_waist

    landmarks = [{'visibility': 0.8, 'x': 0.5, 'y': 0.5}] * 33
    landmarks[11] = {'visibility': 0.8, 'x': 0.45, 'y': 0.2}
    landmarks[12] = {'visibility': 0.8, 'x': 0.55, 'y': 0.2}
    landmarks[23] = {'visibility': 0.8, 'x': 0.43, 'y': 0.7}
    landmarks[24] = {'visibility': 0.8, 'x': 0.57, 'y': 0.7}

    waist_near, _ = calculate_waist(landmarks, (100, 100, 3), pixel_height=80, user_height_cm=170)
    waist_far, _ = calculate_waist(landmarks, (200, 200, 3), pixel_height=160, user_height_cm=170)

    assert abs(waist_near - waist_far) < 0.5, \
        f"Waist should be distance-independent: near={waist_near:.1f}, far={waist_far:.1f}"


def test_hips_rejects_low_visibility_landmarks():
    """Hips should be marked invalid when hip landmarks have low visibility."""
    from app.services.measurement import calculate_hips

    # Landmarks with LOW visibility hips (0.2 — below LANDMARK_CONFIDENCE_THRESHOLD of 0.6)
    landmarks = [{'visibility': 0.8, 'x': 0.5, 'y': 0.5}] * 33
    landmarks[23] = {'visibility': 0.2, 'x': 0.43, 'y': 0.7}  # left_hip — low visibility
    landmarks[24] = {'visibility': 0.2, 'x': 0.57, 'y': 0.7}  # right_hip — low visibility
    landmarks[11] = {'visibility': 0.8, 'x': 0.45, 'y': 0.3}
    landmarks[12] = {'visibility': 0.8, 'x': 0.55, 'y': 0.3}

    hips_cm, is_valid = calculate_hips(landmarks, (100, 100, 3), pixel_height=80, user_height_cm=170)

    # With low visibility, should be marked invalid (is_valid = False)
    assert is_valid == False, f"Hips with low visibility (0.2) should be invalid, got is_valid={is_valid}"
    assert hips_cm == 0.0, f"Hips with low visibility should be 0.0, got {hips_cm}"


def test_reject_small_pixel_height():
    """Measurements must be rejected when pixel_height is too small (subject too far)."""
    import numpy as np
    from app.services.measurement import calculate_measurements_enhanced

    landmarks = [{'visibility': 0.8, 'x': 0.5, 'y': 0.5}] * 33
    # Head landmark at y=0.05, feet at y=0.20 -> pixel_height ~15 in 100px image = 0.15 fill_ratio
    landmarks[0] = {'visibility': 0.8, 'x': 0.5, 'y': 0.05}  # nose (head top)
    landmarks[11] = {'visibility': 0.8, 'x': 0.45, 'y': 0.15}
    landmarks[12] = {'visibility': 0.8, 'x': 0.55, 'y': 0.15}
    landmarks[23] = {'visibility': 0.8, 'x': 0.43, 'y': 0.18}
    landmarks[24] = {'visibility': 0.8, 'x': 0.57, 'y': 0.18}
    # Feet landmarks near y=0.20 to get ~15px pixel_height in 100px image
    landmarks[27] = {'visibility': 0.8, 'x': 0.48, 'y': 0.20}  # left_ankle
    landmarks[28] = {'visibility': 0.8, 'x': 0.52, 'y': 0.20}  # right_ankle
    landmarks[29] = {'visibility': 0.8, 'x': 0.5, 'y': 0.5}
    landmarks[30] = {'visibility': 0.8, 'x': 0.5, 'y': 0.5}
    landmarks[31] = {'visibility': 0.8, 'x': 0.5, 'y': 0.5}
    landmarks[32] = {'visibility': 0.8, 'x': 0.5, 'y': 0.5}

    landmarks_data = {'landmarks': landmarks}

    # pixel_height of 15 in a 100px image = fill_ratio of 0.15 — below MIN_PIXEL_HEIGHT_RATIO (0.30)
    result = calculate_measurements_enhanced(
        landmarks_data, (100, 100, 3),
        user_height_cm=170.0,
        calibration_factor=None
    )
    # Should fail with a warning about subject being too far
    assert result['success'] == False, "Small pixel_height should produce failure"
    assert any('too far' in w.lower() or 'fill_ratio' in w.lower() for w in result['warnings']), \
        f"Warning should mention distance issue, got: {result['warnings']}"


def test_calculate_height_no_hardcoded_reference_fraction():
    """calculate_height() must not use a hardcoded reference fraction — must derive from actual landmark extent."""
    from app.services.measurement import calculate_height

    # Create landmarks spanning different vertical portions of the image
    # Case 1: tall person — landmarks span 0.08 to 0.95 of image (87% of image)
    tall_landmarks = [{'y': 0.5, 'visibility': 0.8}] * 33
    tall_landmarks[0] = {'y': 0.08, 'visibility': 0.8}   # nose near top
    tall_landmarks[28] = {'y': 0.95, 'visibility': 0.8}   # right_ankle near bottom

    result_tall = calculate_height(tall_landmarks, (100, 100, 3), user_height_cm=170)
    # Must NOT equal 170 — actual landmark extent is different from reference

    # Case 2: short person — same user_height_cm but landmarks only span center
    short_landmarks = [{'y': 0.5, 'visibility': 0.8}] * 33
    short_landmarks[0] = {'y': 0.30, 'visibility': 0.8}   # nose in middle
    short_landmarks[28] = {'y': 0.70, 'visibility': 0.8} # ankle in middle

    result_short = calculate_height(short_landmarks, (100, 100, 3), user_height_cm=170)

    # Different landmark extents MUST produce different heights
    assert abs(result_tall - result_short) > 5, \
        f"Different landmark extents must yield different heights: tall={result_tall:.1f}, short={result_short:.1f}"


def test_calculate_pixel_height_uses_specific_extremes():
    """calculate_pixel_height() must use specific head (nose/eyes/ears) and foot (ankles) landmarks, not min/max of all head landmarks."""
    from app.services.measurement import calculate_pixel_height

    # Landmarks where nose is at top (y=0.05) and ankles at bottom (y=0.90)
    # Using nose (index 0) specifically and ankles (27, 28)
    landmarks = [{'y': 0.5, 'visibility': 0.8}] * 33
    landmarks[0] = {'y': 0.05, 'visibility': 0.8}    # nose — highest point
    landmarks[1] = {'y': 0.06, 'visibility': 0.8}    # left_eye — slightly below nose
    landmarks[2] = {'y': 0.06, 'visibility': 0.8}    # right_eye
    landmarks[27] = {'y': 0.90, 'visibility': 0.8}    # left_ankle — lowest point
    landmarks[28] = {'y': 0.91, 'visibility': 0.8}    # right_ankle

    # For a 100px tall image: (0.90 - 0.05) * 100 = 85px, with correction factor 1.12 -> ~95px
    pixel_h = calculate_pixel_height(landmarks, (100, 100, 3), fallback_height_cm=170)

    # With correction factor, expect ~95px (not 85px, not 80px)
    # The key is: uses specific landmarks AND applies correction
    assert 90 <= pixel_h <= 100, \
        f"pixel_height with correction should be ~95px for this landmark config, got {pixel_h}"


def test_calculate_pixel_height_uses_vector_distance():
    """calculate_pixel_height should compute Euclidean distance, not just Y-difference."""
    from app.services.measurement import calculate_pixel_height

    # Create landmarks where vector distance differs from Y-difference
    # Nose at left side (x=0.3), ankles spread with midpoint at right side (x=0.7)
    # This creates a diagonal vector that is LONGER than just Y-difference
    landmarks = [{'x': 0.5, 'y': 0.5, 'visibility': 0.8}] * 33
    landmarks[0] = {'x': 0.3, 'y': 0.1, 'visibility': 0.8}  # nose at left-top (index 0)
    landmarks[27] = {'x': 0.5, 'y': 0.9, 'visibility': 0.8}  # left_ankle (index 27)
    landmarks[28] = {'x': 0.9, 'y': 0.9, 'visibility': 0.8}  # right_ankle (index 28)

    image_shape = (100, 100, 3)

    # Ankle midpoint: x = (0.5 + 0.9)/2 = 0.7, y = (0.9 + 0.9)/2 = 0.9
    # Vector: dx = 0.7 - 0.3 = 0.4, dy = 0.9 - 0.1 = 0.8
    # Vector distance = sqrt(0.16 + 0.64) * 100 = sqrt(0.8) * 100 ≈ 89.44 px
    # With 1.12 correction factor: 89.44 * 1.12 ≈ 100.17 px

    # Old Y-difference only: (0.9 - 0.1) * 100 = 80 px -> with correction = 89.6 px
    # Vector calculation should give ~100 px (different from Y-only ~90 px)

    result = calculate_pixel_height(landmarks, image_shape)
    assert result > 0, "Should return positive pixel height"
    # Vector should give ~100 px (not ~90 px from Y-only)
    assert abs(result - 100.2) < 1.0, f"Expected ~100.2 (vector), got {result}. Y-difference would give ~89.6"


def test_calculate_pixel_height_non_square_image():
    """Vector height must scale dx by width and dy by height, not both by height."""
    import math
    from app.services.measurement import calculate_pixel_height

    # Create landmarks: nose at top, ankles at bottom with x offset
    landmarks = [{'x': 0.5, 'y': 0.1, 'visibility': 0.9}] * 33
    landmarks[0] = {'x': 0.5, 'y': 0.1, 'visibility': 0.9}  # nose
    landmarks[27] = {'x': 0.6, 'y': 0.9, 'visibility': 0.9}  # left_ankle
    landmarks[28] = {'x': 0.6, 'y': 0.9, 'visibility': 0.9}  # right_ankle

    # Portrait image: 600 height, 800 width
    image_shape = (600, 800, 3)

    result = calculate_pixel_height(landmarks, image_shape, fallback_height_cm=170)

    # dx = 0.1, dy = 0.8
    # Correct: sqrt((0.1*800)^2 + (0.8*600)^2) = sqrt(6400 + 230400) = sqrt(236800) = 486.6
    # Wrong: sqrt((0.1*600)^2 + (0.8*600)^2) = sqrt(3600 + 230400) = sqrt(234000) = 483.9
    # After 1.12 correction factor
    expected_correct = math.sqrt((0.1 * 800) ** 2 + (0.8 * 600) ** 2) * 1.12
    assert abs(result - expected_correct) < 1, f"Expected ~{expected_correct}, got {result}"


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


# Tests for classify_view function
def test_classify_view_front():
    """Front view: shoulders wide apart, small vertical difference."""
    from app.services.measurement import classify_view

    # Front view: shoulders wide apart (delta_x > 0.12)
    front_landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.3, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 1 else  # left_eye
        {'x': 0.7, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 2 else  # right_eye
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]
    result = classify_view(front_landmarks)
    assert result == "front", f"Expected 'front', got '{result}'"


def test_classify_view_left():
    """Left view: shoulders closer together horizontally."""
    from app.services.measurement import classify_view

    # Left view: shoulders close together (delta_x < 0.12), nose closer to right
    left_landmarks = [
        {'x': 0.6, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else  # nose on right side
        {'x': 0.48, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.52, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]
    result = classify_view(left_landmarks)
    assert result == "left", f"Expected 'left', got '{result}'"


def test_classify_view_right():
    """Right view: shoulders close together, nose closer to left."""
    from app.services.measurement import classify_view

    # Right view: shoulders close together, nose on left side
    right_landmarks = [
        {'x': 0.4, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else  # nose on left side
        {'x': 0.48, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.52, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]
    result = classify_view(right_landmarks)
    assert result == "right", f"Expected 'right', got '{result}'"


def test_classify_view_back():
    """Back view: shoulders wide apart, facial landmarks less visible or asymmetric."""
    from app.services.measurement import classify_view

    # Back view: wide shoulders, left eye more visible (camera sees person's back)
    back_landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': -0.1, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.3, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 1 else  # left_eye more visible
        {'x': 0.7, 'y': 0.25, 'z': 0.0, 'visibility': 0.6} if i == 2 else  # right_eye less visible
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]
    result = classify_view(back_landmarks)
    assert result == "back", f"Expected 'back', got '{result}'"


def test_classify_view_unknown():
    """Unknown view: barely visible shoulders."""
    from app.services.measurement import classify_view

    # Ambiguous landmarks with low visibility
    ambiguous_landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.3} if i == 0 else
        {'x': 0.45, 'y': 0.3, 'z': 0.0, 'visibility': 0.3} if i == 11 else
        {'x': 0.55, 'y': 0.3, 'z': 0.0, 'visibility': 0.3} if i == 12 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.3} if i == 23 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.3} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.3}
        for i in range(33)
    ]
    result = classify_view(ambiguous_landmarks)
    assert result == "unknown", f"Expected 'unknown', got '{result}'"


def test_classify_view_empty_landmarks():
    """Empty or None landmarks should return unknown."""
    from app.services.measurement import classify_view

    assert classify_view([]) == "unknown"
    assert classify_view(None) == "unknown"


# Tests for measure_width_cm_at_y and measure_depth_cm_at_y
def test_measure_width_cm_at_y_basic():
    """Test basic width measurement at shoulder level."""
    from app.services.measurement import measure_width_cm_at_y

    # Front view: shoulders at x=0.3 and x=0.7 (delta_x = 0.4)
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
    assert 80 < width < 90, f"Expected ~85 cm, got {width}"


def test_measure_depth_cm_at_y_basic():
    """Test depth measurement at shoulder level for profile view."""
    from app.services.measurement import measure_depth_cm_at_y

    # Left view: shoulders close together (small delta_x), this is depth
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

    # At shoulder level (y_ratio=0.0), horizontal extent is small (0.04 * 1000 * 170/800 = 8.5 cm)
    # This represents depth in a profile view
    depth = measure_depth_cm_at_y(landmarks, image_shape, pixel_height, user_height_cm, 0.0)
    assert 5 < depth < 15, f"Expected ~8.5 cm, got {depth}"


# Tests for Ramanujan ellipse perimeter
def test_ramanujan_ellipse_perimeter_circle():
    """Circle: width == depth should give circumference of 2*pi*r."""
    import math
    from app.services.measurement import ramanujan_ellipse_perimeter

    # Circle: width == depth = 20 (diameter = 20, radius = 10)
    perimeter = ramanujan_ellipse_perimeter(20.0, 20.0)
    expected = 2 * math.pi * 10.0  # 62.8319...
    assert abs(perimeter - expected) < 0.1, f"Expected ~{expected}, got {perimeter}"


def test_ramanujan_ellipse_perimeter_ellipse():
    """Test ellipse with typical torso ratio ~0.7."""
    import math
    from app.services.measurement import ramanujan_ellipse_perimeter

    # Ellipse: width=40, depth=28 (typical torso ratio ~0.7)
    # Ramanujan's approx: C = pi * (3(a+b) - sqrt((3a+b)(a+3b)))
    # a=20, b=14 => term1=102, term2=67.77, perimeter=107.65
    perimeter = ramanujan_ellipse_perimeter(40.0, 28.0)
    assert 105 < perimeter < 110, f"Expected ~107 cm, got {perimeter}"


def test_ramanujan_ellipse_perimeter_invalid():
    """Invalid inputs should return 0."""
    from app.services.measurement import ramanujan_ellipse_perimeter

    assert ramanujan_ellipse_perimeter(0, 10) == 0.0
    assert ramanujan_ellipse_perimeter(10, 0) == 0.0
    assert ramanujan_ellipse_perimeter(-5, 10) == 0.0


# Tests for y-ratio search functions
def test_find_waist_y_ratio():
    """Test finding waist y-ratio with minimum width search."""
    from app.services.measurement import find_waist_y_ratio

    # Create test landmarks with known structure
    # Shoulders at y=0.3, hips at y=0.8, waist should be found in 0.40-0.70 range
    landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]
    pixel_height = 800.0

    waist_y = find_waist_y_ratio(landmarks, pixel_height)
    # Should find minimum width in range 0.40-0.70
    assert 0.40 <= waist_y <= 0.70, f"Expected waist_y in [0.40, 0.70], got {waist_y}"


def test_find_waist_y_ratio_fallback():
    """Test fallback when landmarks are invalid."""
    from app.services.measurement import find_waist_y_ratio, WAIST_LINE_RATIO

    # Empty landmarks should return default
    result = find_waist_y_ratio([], 800.0)
    assert result == WAIST_LINE_RATIO


def test_find_hip_y_ratio():
    """Test finding hip y-ratio with maximum width search."""
    from app.services.measurement import find_hip_y_ratio

    landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.45, 'y': 0.65, 'z': 0.0, 'visibility': 0.9} if i == 23 else  # hip at y=0.65
        {'x': 0.55, 'y': 0.65, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]
    pixel_height = 800.0

    hip_y = find_hip_y_ratio(landmarks, pixel_height)
    # Should be near or below hip landmarks
    assert 0.60 < hip_y <= 0.80, f"Expected hip_y in (0.60, 0.80], got {hip_y}"


def test_find_chest_y_ratio():
    """Chest search should stay in the bust window instead of collapsing to the shoulder band."""
    from app.services import measurement

    landmarks = [{'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9} for _ in range(33)]
    pixel_height = 800.0
    waist_y = 0.55

    bust_widths = {
        0.28: 32.0,
        0.30: 35.0,
        0.32: 38.0,
        0.34: 41.0,
        0.36: 45.0,
        0.38: 47.0,
        0.40: 44.0,
        0.42: 40.0,
        0.44: 37.0,
        0.46: 34.0,
        0.48: 31.0,
        0.50: 29.0,
    }

    def fake_measure_width_cm_at_y(_landmarks, _image_shape, _pixel_height, _user_height_cm, y_ratio):
        return bust_widths.get(round(y_ratio, 2), 0.0)

    original = measurement.measure_width_cm_at_y
    measurement.measure_width_cm_at_y = fake_measure_width_cm_at_y
    try:
        chest_y = measurement.find_chest_y_ratio(landmarks, pixel_height, waist_y)
    finally:
        measurement.measure_width_cm_at_y = original

    assert 0.36 <= chest_y <= 0.40, f"Expected chest_y in bust window, got {chest_y}"


def _make_multiview_landmarks():
    landmarks = [{'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9} for _ in range(33)]
    landmarks[0] = {'x': 0.5, 'y': 0.2, 'z': 0.0, 'visibility': 0.9}
    landmarks[11] = {'x': 0.35, 'y': 0.3, 'z': 0.0, 'visibility': 0.9}
    landmarks[12] = {'x': 0.65, 'y': 0.3, 'z': 0.0, 'visibility': 0.9}
    landmarks[23] = {'x': 0.4, 'y': 0.6, 'z': 0.0, 'visibility': 0.9}
    landmarks[24] = {'x': 0.6, 'y': 0.6, 'z': 0.0, 'visibility': 0.9}
    return landmarks


# Tests for fuse_multiview_circumference
def test_fuse_multiview_circumference_full_4view():
    """Test fusion with all 4 views."""
    from app.services.measurement import fuse_multiview_circumference, classify_view

    # Create 4 views
    front_landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.3, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 1 else
        {'x': 0.7, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 2 else
        {'x': 0.4, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 23 else  # narrower at waist
        {'x': 0.6, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    back_landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': -0.1, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.3, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 1 else
        {'x': 0.7, 'y': 0.25, 'z': 0.0, 'visibility': 0.6} if i == 2 else
        {'x': 0.4, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.6, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    left_landmarks = [
        {'x': 0.6, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else  # nose on right
        {'x': 0.48, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.52, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.5, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    right_landmarks = [
        {'x': 0.4, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else  # nose on left
        {'x': 0.48, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.52, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.5, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.5, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    views = {
        'front': {'landmarks': front_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700},
        'back': {'landmarks': back_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700},
        'left': {'landmarks': left_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700},
        'right': {'landmarks': right_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700}
    }

    result = fuse_multiview_circumference(views, user_height_cm=165.0)
    assert result['waist'] > 0, f"Expected waist > 0, got {result['waist']}"
    assert result['hips'] > 0, f"Expected hips > 0, got {result['hips']}"
    assert result['chest'] > 0, f"Expected chest > 0, got {result['chest']}"
    assert result['confidence'] >= 0.9, f"Expected confidence >= 0.9, got {result['confidence']}"


def test_fuse_multiview_circumference_2view_fallback():
    """Test fusion with only front and back views."""
    from app.services.measurement import fuse_multiview_circumference

    front_landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.3, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 1 else
        {'x': 0.7, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 2 else
        {'x': 0.4, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.6, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    back_landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': -0.1, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.3, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 1 else
        {'x': 0.7, 'y': 0.25, 'z': 0.0, 'visibility': 0.6} if i == 2 else
        {'x': 0.4, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.6, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    views = {
        'front': {'landmarks': front_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700},
        'back': {'landmarks': back_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700}
    }

    result = fuse_multiview_circumference(views, user_height_cm=165.0)
    assert result['waist'] > 0, f"Expected waist > 0, got {result['waist']}"
    # With only 2 views, confidence should be penalized
    assert result['confidence'] < 0.9, f"Expected confidence < 0.9 for 2 views, got {result['confidence']}"


def test_fuse_multiview_circumference_1view_fallback():
    """Test fusion with only front view - should use fallback factors."""
    from app.services.measurement import fuse_multiview_circumference

    front_landmarks = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.3, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 1 else
        {'x': 0.7, 'y': 0.25, 'z': 0.0, 'visibility': 0.9} if i == 2 else
        {'x': 0.4, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.6, 'y': 0.6, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    views = {
        'front': {'landmarks': front_landmarks, 'image_shape': (800, 800, 3), 'pixel_height': 700}
    }

    result = fuse_multiview_circumference(views, user_height_cm=165.0)
    assert result['waist'] > 0, f"Expected waist > 0, got {result['waist']}"
    # Heavy penalty for single view
    assert result['confidence'] <= 0.70, f"Expected confidence <= 0.70 for single view, got {result['confidence']}"


def test_fuse_multiview_circumference_empty():
    """Test fusion with empty views dict."""
    from app.services.measurement import fuse_multiview_circumference

    result = fuse_multiview_circumference({}, user_height_cm=165.0)
    assert result['waist'] == 0.0
    assert result['hips'] == 0.0
    assert result['chest'] == 0.0
    assert result['confidence'] == 0.0


def test_fuse_multiview_circumference_uses_raw_landmark_widths(monkeypatch):
    """Front/back landmark widths should not be inflated by silhouette padding."""
    from app.services import measurement

    raw_width_cm = 40.0
    expected = measurement.ramanujan_ellipse_perimeter(
        raw_width_cm,
        raw_width_cm * measurement.DEPTH_WIDTH_FALLBACK_RATIO,
    )

    monkeypatch.setattr(measurement, 'find_waist_y_ratio', lambda *args, **kwargs: 0.55)
    monkeypatch.setattr(measurement, 'find_hip_y_ratio', lambda *args, **kwargs: 0.75)
    monkeypatch.setattr(measurement, 'find_chest_y_ratio', lambda *args, **kwargs: 0.38)
    monkeypatch.setattr(measurement, 'measure_width_cm_at_y', lambda *args, **kwargs: raw_width_cm)
    monkeypatch.setattr(measurement, 'measure_depth_cm_at_y', lambda *args, **kwargs: 0.0)

    views = {
        'front': {
            'landmarks': _make_multiview_landmarks(),
            'image_shape': (800, 800, 3),
            'pixel_height': 700,
            'declared_view_type': 'front',
        },
        'back': {
            'landmarks': _make_multiview_landmarks(),
            'image_shape': (800, 800, 3),
            'pixel_height': 700,
            'declared_view_type': 'back',
        },
    }

    result = measurement.fuse_multiview_circumference(views, user_height_cm=165.0)
    assert result['chest'] == pytest.approx(expected, rel=1e-6)


def test_fuse_multiview_circumference_uses_shared_depth_fallback_ratio(monkeypatch):
    """Missing depth and rejected depth should use the same fallback ratio."""
    from app.services import measurement

    raw_width_cm = 40.0
    expected = measurement.ramanujan_ellipse_perimeter(
        raw_width_cm,
        raw_width_cm * measurement.DEPTH_WIDTH_FALLBACK_RATIO,
    )

    monkeypatch.setattr(measurement, 'find_waist_y_ratio', lambda *args, **kwargs: 0.55)
    monkeypatch.setattr(measurement, 'find_hip_y_ratio', lambda *args, **kwargs: 0.75)
    monkeypatch.setattr(measurement, 'find_chest_y_ratio', lambda *args, **kwargs: 0.38)
    monkeypatch.setattr(measurement, 'measure_width_cm_at_y', lambda *args, **kwargs: raw_width_cm)

    front_back_views = {
        'front': {
            'landmarks': _make_multiview_landmarks(),
            'image_shape': (800, 800, 3),
            'pixel_height': 700,
            'declared_view_type': 'front',
        },
        'back': {
            'landmarks': _make_multiview_landmarks(),
            'image_shape': (800, 800, 3),
            'pixel_height': 700,
            'declared_view_type': 'back',
        },
    }

    monkeypatch.setattr(measurement, 'measure_depth_cm_at_y', lambda *args, **kwargs: 0.0)
    result_without_side = measurement.fuse_multiview_circumference(front_back_views, user_height_cm=165.0)

    side_views = dict(front_back_views)
    side_views['left'] = {
        'landmarks': _make_multiview_landmarks(),
        'image_shape': (800, 800, 3),
        'pixel_height': 700,
        'declared_view_type': 'left',
    }

    monkeypatch.setattr(measurement, 'measure_depth_cm_at_y', lambda *args, **kwargs: 5.0)
    result_with_bad_side = measurement.fuse_multiview_circumference(side_views, user_height_cm=165.0)

    assert result_without_side['chest'] == pytest.approx(expected, rel=1e-6)
    assert result_with_bad_side['chest'] == pytest.approx(expected, rel=1e-6)


def test_fuse_multiview_circumference_single_view_uses_part_specific_factors(monkeypatch):
    """Single-view fallback should use the chest, waist, and hip-specific factors."""
    from app.services import measurement

    raw_width_cm = 40.0

    monkeypatch.setattr(measurement, 'find_waist_y_ratio', lambda *args, **kwargs: 0.55)
    monkeypatch.setattr(measurement, 'find_hip_y_ratio', lambda *args, **kwargs: 0.75)
    monkeypatch.setattr(measurement, 'find_chest_y_ratio', lambda *args, **kwargs: 0.38)
    monkeypatch.setattr(measurement, 'measure_width_cm_at_y', lambda *args, **kwargs: raw_width_cm)
    monkeypatch.setattr(measurement, 'measure_depth_cm_at_y', lambda *args, **kwargs: 0.0)

    views = {
        'front': {
            'landmarks': _make_multiview_landmarks(),
            'image_shape': (800, 800, 3),
            'pixel_height': 700,
            'declared_view_type': 'front',
        },
    }

    result = measurement.fuse_multiview_circumference(views, user_height_cm=165.0)

    assert result['chest'] == pytest.approx(raw_width_cm * measurement.FALLBACK_CHEST_CIRCUMFERENCE_FACTOR)
    assert result['waist'] == pytest.approx(raw_width_cm * measurement.FALLBACK_WAIST_CIRCUMFERENCE_FACTOR)
    assert result['hips'] == pytest.approx(raw_width_cm * measurement.FALLBACK_HIP_CIRCUMFERENCE_FACTOR)


def test_calculate_chest_uses_ellipse_conversion(monkeypatch):
    """Chest calculation should use width-to-ellipse conversion instead of a flat factor."""
    from app.services import measurement

    monkeypatch.setattr(
        measurement,
        'get_body_width_points',
        lambda *args, **kwargs: ({'x': 0.3, 'y': 0.4}, {'x': 0.7, 'y': 0.4}),
    )
    monkeypatch.setattr(measurement, 'horizontal_distance_px', lambda *args, **kwargs: 40.0)
    monkeypatch.setattr(measurement, 'measure_from_ratio', lambda *args, **kwargs: 32.0)

    chest_cm, is_valid = measurement.calculate_chest(
        _make_multiview_landmarks(),
        (800, 800, 3),
        pixel_height=700,
        user_height_cm=165.0,
    )

    expected = measurement.ramanujan_ellipse_perimeter(
        32.0,
        32.0 * measurement.DEPTH_WIDTH_FALLBACK_RATIO,
    )
    assert is_valid is True
    assert chest_cm == pytest.approx(expected, rel=1e-6)


def test_calculate_chest_calibrated_uses_ellipse_conversion(monkeypatch):
    """Calibrated chest calculation should use the same ellipse conversion."""
    from app.services import measurement

    monkeypatch.setattr(
        measurement,
        'get_body_width_points',
        lambda *args, **kwargs: ({'x': 0.3, 'y': 0.4}, {'x': 0.7, 'y': 0.4}),
    )
    monkeypatch.setattr(measurement, 'horizontal_distance_px', lambda *args, **kwargs: 44.0)

    chest_cm = measurement.calculate_chest_calibrated(
        _make_multiview_landmarks(),
        (800, 800, 3),
        calibration_factor=1.1,
    )

    expected_width_cm = 44.0 / 1.1
    expected = measurement.ramanujan_ellipse_perimeter(
        expected_width_cm,
        expected_width_cm * measurement.DEPTH_WIDTH_FALLBACK_RATIO,
    )
    assert chest_cm == pytest.approx(expected, rel=1e-6)


def test_confidence_reflects_fused_value_quality():
    """Test that confidence reflects actual measurement quality from fusion.

    When measurements from different views agree closely, confidence should be high.
    When views disagree significantly, confidence should be lower.
    """
    from app.services.measurement import fuse_multiview_circumference

    # Create front/back views with good alignment (similar widths)
    # Front view: shoulders at x=0.3, 0.7 (wide)
    front_landmarks_good = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else  # left_shoulder
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else  # right_shoulder
        {'x': 0.32, 'y': 0.55, 'z': 0.0, 'visibility': 0.9} if i == 23 else  # left_hip (waist level)
        {'x': 0.68, 'y': 0.55, 'z': 0.0, 'visibility': 0.9} if i == 24 else  # right_hip
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    back_landmarks_good = [
        {'x': 0.5, 'y': 0.3, 'z': -0.1, 'visibility': 0.9} if i == 0 else
        {'x': 0.3, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else
        {'x': 0.7, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else
        {'x': 0.32, 'y': 0.55, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.68, 'y': 0.55, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    views_good = {
        'front': {'landmarks': front_landmarks_good, 'image_shape': (800, 800, 3), 'pixel_height': 700},
        'back': {'landmarks': back_landmarks_good, 'image_shape': (800, 800, 3), 'pixel_height': 700},
    }

    result_good = fuse_multiview_circumference(views_good, user_height_cm=170.0)

    # With good alignment, confidence should be high (>= 0.8)
    assert result_good['confidence'] >= 0.8, f"Expected confidence >= 0.8 for good alignment, got {result_good['confidence']}"

    # Now test with poor alignment (views have very different measurements)
    # Front view: narrow shoulders
    front_landmarks_poor = [
        {'x': 0.5, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 0 else
        {'x': 0.42, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else  # left_shoulder (narrower)
        {'x': 0.58, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else  # right_shoulder
        {'x': 0.43, 'y': 0.55, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.57, 'y': 0.55, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    # Back view: wide shoulders (opposite)
    back_landmarks_poor = [
        {'x': 0.5, 'y': 0.3, 'z': -0.1, 'visibility': 0.9} if i == 0 else
        {'x': 0.2, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 11 else  # left_shoulder (wider)
        {'x': 0.8, 'y': 0.3, 'z': 0.0, 'visibility': 0.9} if i == 12 else  # right_shoulder
        {'x': 0.25, 'y': 0.55, 'z': 0.0, 'visibility': 0.9} if i == 23 else
        {'x': 0.75, 'y': 0.55, 'z': 0.0, 'visibility': 0.9} if i == 24 else
        {'x': 0.5, 'y': 0.8, 'z': 0.0, 'visibility': 0.9} if i == 25 else
        {'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.9}
        for i in range(33)
    ]

    views_poor = {
        'front': {'landmarks': front_landmarks_poor, 'image_shape': (800, 800, 3), 'pixel_height': 700},
        'back': {'landmarks': back_landmarks_poor, 'image_shape': (800, 800, 3), 'pixel_height': 700},
    }

    result_poor = fuse_multiview_circumference(views_poor, user_height_cm=170.0)

    # With poor alignment (disagreement between views), confidence should be lower
    # This tests that confidence reflects actual measurement quality
    assert result_poor['confidence'] < result_good['confidence'], \
        f"Poor alignment should have lower confidence than good alignment: good={result_good['confidence']}, poor={result_poor['confidence']}"
