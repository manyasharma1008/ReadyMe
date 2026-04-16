# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

---

# PROJECT: AI BODY MEASUREMENT SYSTEM

## OVERVIEW

Full-stack AI system for estimating human body measurements from 2D images.

Input: 4 images (front, left, right, back)
Output: body measurements (shoulders, chest, waist, hips, height)

Tech:

* Frontend: React + Vite
* Backend: FastAPI
* Pose: MediaPipe

---

## CORE PRINCIPLE (CRITICAL)

System is **DISTANCE-INDEPENDENT**

DO NOT use:

* Distance estimation
* Pixel-to-cm multipliers
* Arbitrary scaling factors

ALWAYS use:

```
measurement_cm = (px / height_px) * user_height_cm
```

Default:

```
DEFAULT_USER_HEIGHT_CM = 170
```

---

## PIPELINE

1. Input (4 angles)
2. Landmark detection (MediaPipe Pose)
3. Pixel measurements
4. Height normalization (ratio formula)
5. Visibility filtering (confidence > 0.6)
6. Angle filtering (front-view for width metrics)
7. Multi-angle fusion:

   * Median
   * ±20% outlier removal
8. Output:

   * measurements
   * visibility
   * confidence
   * debug

---

## MEASUREMENTS

* Shoulders → base reference
* Chest → (width * 2.15) (Empirical circumference conversion)
* Hips → (width * 2.2) (Empirical circumference conversion)
* Waist → interpolated between shoulders and hips, × 2.0 circumference factor (Estimated, not directly measured)
* Height → min/max Y from all visible landmarks, then ratio-normalized

Note:
All conversion constants are empirical. Do not replace with geometric models.

---

## API RESPONSE (DO NOT CHANGE)

```json
{
  "success": true,
  "measurements": {...},
  "visibility": {...},
  "debug": {
    "height_px": float,
    "user_height_cm": float,
    "valid_angles_used": int,
    "rejected_angles": []
  },
  "confidence": {...},
  "warnings": []
}
```

---

## KEY FUNCTIONS

File: `backend/app/services/measurement.py`

* calculate_pixel_height()
* calculate_height() — computes actual height from landmarks using ratio normalization
* calculate_shoulder_width()
* calculate_chest()
* calculate_waist()
* calculate_hips()
* is_front_view()
* fuse_measurements() — median + ±20% outlier removal, guarded against zero-median
* calculate_measurements_enhanced()

---

## CONSTANTS

* DEFAULT_USER_HEIGHT_CM = 170
* LANDMARK_CONFIDENCE_THRESHOLD = 0.6
* VISIBILITY_THRESHOLD = 0.5 (used for general landmark filtering)
* TORSO_VISIBILITY_THRESHOLD = 0.25 (used for hip-level landmarks)
* CHEST_CIRCUMFERENCE_FACTOR = 2.15
* HIP_CIRCUMFERENCE_FACTOR = 2.2
* WAIST_CIRCUMFERENCE_FACTOR = 2.0
* CHEST_LINE_RATIO = 0.2 (interpolation ratio from shoulders)
* WAIST_LINE_RATIO = 0.55 (interpolation ratio from shoulders)
* OUTLIER_THRESHOLD = 0.20
* TRIM_PERCENT = 0.05
* CONSISTENCY_THRESHOLD = 0.25

---

## DESIGN RULES (STRICT)

* Validate landmark visibility (>0.6) before use
* Use FRONT view for width measurements
* Skip invalid frames (do not force output)
* Prefer robustness over theoretical accuracy
* Use multi-angle fusion (avoid single-frame dependency)
* Keep functions modular
* Maintain API structure

---

## LIMITATIONS

* Waist is estimated, not directly measured
* No 3D reconstruction (depth ignored)
* Shoulder detection is critical dependency
* Loose clothing / poor pose affects accuracy

---

## FAILURE HANDLING

Failure cases:

* Missing head or feet → invalid height
* Non-front pose used for width
* Low visibility landmarks
* Arms raised → distorted height

Handling:

* Skip frame
* Use fusion
* Reduce confidence (never fabricate values)

---

## DEBUG CHECKLIST

1. height_px incorrect → height calculation issue
2. valid_angles_used low → filtering too strict
3. visibility <0.6 → unreliable
4. Compare per-angle before fusion
5. Verify front-view detection

---

## DO NOT MODIFY (CRITICAL)

* Ratio normalization formula
* API response format
* Fusion logic (median + outlier removal)
* Landmark confidence threshold (0.6)

---

## GOAL

* Consistent measurements across distances (±5%)
* Stable multi-angle results
* Robust to imperfect input
* Production-safe incremental improvements

---

## THREAD SAFETY

The `CalibrationSystem` class uses a `threading.Lock` to protect calibration state during concurrent requests. All calibration writes (`calibrate_from_height`, `calibrate_from_reference`) hold the lock for the duration of the write.

---

## RULE OF THUMB

If uncertain:

* Reject input
* Lower confidence
* Never invent data

---
