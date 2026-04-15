# Vector-Based Height Calibration Design

**Date:** 2026-04-15
**Status:** Approved
**Goal:** Refactor height calibration to use vector distance instead of vertical Y-difference

---

## Problem Statement

The current system calculates pixel height using only vertical Y-difference:

```python
pixel_height = (foot_y - head_y) * image_shape[0]
```

This is inaccurate due to:
- Camera tilt
- Posture variation
- Incorrect landmark alignment

**Observed issue:** Input height: 165 cm → Output behaves like: ~141 cm (scale miscalculated)

---

## Design

### Core Change: Vector Distance Calculation

Replace vertical Y-difference with Euclidean vector distance from head to ankle midpoint.

**New algorithm:**

1. **Extract head landmark** (nose, index 0)
2. **Compute ankle midpoint:**
   ```python
   ankle_mid_x = (left_ankle.x + right_ankle.x) / 2
   ankle_mid_y = (left_ankle.y + right_ankle.y) / 2
   ```
3. **Compute vector distance:**
   ```python
   dx = ankle_mid_x - nose.x
   dy = ankle_mid_y - nose.y
   pixel_height = sqrt(dx² + dy²) * image_shape[0]
   ```

### Fallback Strategy

When both ankles are not visible:
- Use hip midpoint as bottom reference instead of current torso fallback
- This maintains consistency with the vector approach

### Functions to Modify

| File | Function | Change |
|------|----------|--------|
| `measurement.py` | `calculate_pixel_height()` | Replace Y-difference with vector distance |
| `measurement.py` | `calculate_height()` | Same refactor for consistency |
| `measurement.py` | `CalibrationSystem.calibrate_from_height()` | Same refactor |

### Debug Logging

Add debug output for validation:
- `pixel_height` (before correction factor)
- `selected_landmarks` (nose + ankle indices)
- `scale_cm_per_px`

---

## Constraints

- No breaking API response format changes
- No new external dependencies
- Maintain backward compatibility
- Keep changes minimal and modular
- Existing tests should pass

---

## Success Criteria

1. Pixel height computed using vector distance (head → ankle midpoint)
2. Scaling factor: `scale = user_height_cm / pixel_height`
3. Output measurements align proportionally with user height
4. Existing tests pass
5. Debug logs confirm correct pixel_height, scale, landmarks
6. Manual validation: 165 cm input no longer produces ~141 cm deviation

---

## Verification

After implementation:
1. Run existing tests: `pytest backend/app/services/test_measurement.py`
2. Test with known input (165 cm user height)
3. Verify debug output shows:
   - `height_px` using vector calculation
   - Correct `scale_cm_per_px`
   - Selected landmark indices