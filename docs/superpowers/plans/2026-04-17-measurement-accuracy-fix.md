# Measurement Accuracy Recovery Plan

Goal: stop returning high-confidence but physically implausible body measurements, then rebuild circumference estimation on top of observable, testable geometry.

Current observed failure:
- Example result at `165 cm` height: `waist 56.5 cm`, `hips 47.7 cm`, `chest 71.5 cm`
- UI still labels these as `85%-100% confidence`
- Warnings already say:
  - `Using non-front torso width estimate; accuracy may be reduced`
  - `Width measurements may be unreliable: shoulder validation failed`

That means the pipeline already knows the geometry is weak, but still publishes precise-looking values. The first fix is to stop that behavior.

## Principles

1. Do not trust joint-to-joint spacing as torso contour.
2. Do not show high confidence when required preconditions failed.
3. Do not fuse bad views just because they exist.
4. Add debug/provenance before rewriting geometry.
5. Validate with real captured images, not synthetic-only tests.

## What Not To Do

The previous draft proposed hardcoded silhouette offsets from landmarks. That is not true silhouette measurement and is likely to overfit one setup. Do not implement arbitrary `+/- 10%-20%` edge padding as the main geometry fix.

## Phase 1: Stop Returning Confident Nonsense

### Task 1.1: Add Hard Confidence Caps From Validation Flags

Files:
- `backend/app/services/measurement.py`
- `backend/app/routers/scan.py`
- `frontend/src/pages/BodyScan.jsx`

Requirements:
- If shoulder validation fails, cap circumference confidence to low.
- If non-front torso width estimate is used, cap chest/waist confidence to low.
- If side-depth plausibility fails, cap fused circumference confidence to low or reject the value entirely.
- Do not allow `hips`, `waist`, or `chest` to display as high-confidence when warnings already indicate invalid geometry.

Implementation direction:
- Build a per-measurement `validation_flags` list.
- Convert flags into a confidence ceiling before final response serialization.
- Frontend must display the backend confidence directly and stop inflating it.

Success criteria:
- Measurements with warnings like `shoulder_validation_failed` or `non_front_width_estimate` never display `85%-100% confidence`.

### Task 1.2: Refuse Circumference Output When Preconditions Fail

Files:
- `backend/app/services/measurement.py`
- `backend/app/routers/scan.py`

Requirements:
- If the front/back width source is not validated, do not publish fused chest/waist/hips.
- If side views are missing or implausible, either:
  - downgrade to explicit width-only fallback with low confidence and provenance, or
  - return no circumference value.

Success criteria:
- The API stops returning obviously impossible numbers like `hips 47.7 cm` for an adult scan while still claiming success.

## Phase 2: Add Real Observability

### Task 2.1: Add Per-View Debug Output To `/measure-multiple`

Files:
- `backend/app/models/schemas.py`
- `backend/app/routers/scan.py`
- `backend/app/services/measurement.py`

Add per view:
- `image_type`
- `classified_view`
- `landmark_count`
- `pixel_height`
- `fill_ratio`
- `shoulder_visibility`
- `hip_visibility`
- `shoulder_width_px`
- `hip_width_px`
- `waist_width_cm_raw`
- `waist_depth_cm_raw`
- `accepted_for_fusion`
- `rejection_reason`

Add per measurement:
- `source`
- `views_used`
- `validation_flags`
- `fallback_level`

Suggested response fields:
- `per_view_debug`
- `fusion_debug`
- `measurement_provenance`

Success criteria:
- A single scan response explains exactly which view contributed to `waist`, which views were rejected, and why.

### Task 2.2: Expose Debug Information In Frontend Dev Mode

Files:
- `frontend/src/pages/BodyScan.jsx`

Requirements:
- Log `fusion_debug`, `per_view_debug`, and `measurement_provenance` to the console.
- Optional: add a hidden collapsible debug panel gated behind a dev flag.

Success criteria:
- Developers can diagnose a bad scan without manually editing backend logs.

## Phase 3: Add Plausibility Guards Before Fusion

### Task 3.1: Reject Implausible Side Depth

Files:
- `backend/app/services/measurement.py`
- `backend/app/routers/scan.py`

Checks to add:
- `side_depth / front_width` too small
- `side_depth / front_width` too large
- fused `waist`, `hips`, or `chest` too small relative to confirmed height
- `waist > hips` by an implausible margin

Rules:
- Plausibility runs before ellipse fusion can override existing measurements.
- Failing views are dropped from fusion, not averaged in.
- If too few valid views remain, downgrade to fallback or no value.

Success criteria:
- A poisoned side profile cannot drag the fused waist to impossible values.

### Task 3.2: Add Provenance-Aware Fallbacks

Files:
- `backend/app/services/measurement.py`
- `backend/app/routers/scan.py`

Fallback policy:
- `ellipse_fusion`
- `width_only_fallback`
- `single_view_estimate`
- `rejected`

Rules:
- Fallback level must be visible in the API response.
- Confidence must track fallback severity.

Success criteria:
- The consumer can distinguish between a proper multi-view estimate and a weak fallback.

## Phase 4: Rebuild Geometry On Actual Image Evidence

### Task 4.1: Keep Landmarks Only For Anatomical Height Selection

Files:
- `backend/app/services/measurement.py`

Use pose landmarks for:
- chest line selection
- waist line selection
- hip line selection
- scan validity

Do not use them as the final torso boundary for width/depth.

### Task 4.2: Build Contour-Based Torso Width Measurement

Files:
- `backend/app/services/measurement.py`
- possibly a new helper file like `backend/app/services/silhouette.py`

Approach:
- Use the original image plus pose-guided scanlines.
- At chest/waist/hip height, detect left/right body edges from image evidence.
- Use foreground segmentation, contour extraction, or strong body/background transitions.
- Compare contour-derived width against landmark-derived width for debugging.

Success criteria:
- Front/back width is measured from torso outline, not shoulder/hip joint spacing.

### Task 4.3: Build Contour-Based Side Thickness Measurement

Files:
- `backend/app/services/measurement.py`
- possibly `backend/app/services/silhouette.py`

Approach:
- For left/right views, measure visible torso thickness from contour width at anatomical scanlines.
- Reject side views where the contour is unstable or heavily occluded.

Success criteria:
- Side-depth no longer collapses just because left/right joints overlap in profile.

## Phase 5: Use Real Calibration Data

### Task 5.1: Create A Real-Image Calibration Dataset

Files:
- `backend/data/calibration_samples.json`
- `backend/scripts/collect_calibration.py`

Each sample should include:
- original `front`, `back`, `left`, `right` images
- actual `height`
- actual `waist`
- actual `hips`
- actual `chest`
- optional notes about clothing, stance, lighting

Start with your known bad cases, including the `91.9 cm waist` example.

Success criteria:
- We can evaluate mean absolute error on real captured images instead of guessing from screenshots.

### Task 5.2: Add A Validation Script

Files:
- `backend/scripts/validate_calibration.py`

Outputs:
- per-sample predicted vs actual
- absolute error per measurement
- summary MAE and worst cases
- view rejection reasons

Success criteria:
- Every geometry change can be evaluated against the same real dataset.

## Phase 6: Add Regression Tests For Actual Failure Modes

### Task 6.1: Confidence Contract Tests

Add tests that assert:
- if `shoulder_validation_failed`, circumference confidence is capped low
- if `non_front_width_estimate`, circumference confidence cannot be high
- if a measurement is fallback-derived, confidence reflects that fallback

### Task 6.2: Fusion Poisoning Tests

Add tests that assert:
- implausibly thin side depth is rejected
- invalid side views do not override sane front/back widths
- fusion drops bad views instead of averaging them in

### Task 6.3: Real-Image Regression Fixtures

Use a small set of saved real captures with known tape measurements.

At minimum, test:
- adult scan should not produce impossible hips or waist
- warning-producing scans should not display high confidence
- degraded geometry should reduce confidence or reject output

## Recommended Execution Order

1. Add response debug/provenance fields.
2. Stop confidence inflation and add hard confidence caps.
3. Reject bad fused geometry before override.
4. Add calibration dataset tooling.
5. Add real-image validation script.
6. Only then start contour-based width/depth work.
7. Lock behavior with regression tests.

## Definition Of Done

The fix is complete only when all of the following are true:
- The API explains where each circumference value came from.
- Bad geometry cannot produce high-confidence outputs.
- Implausible side views are rejected before fusion.
- Waist and hips are no longer measured from joint spacing alone.
- Real captured calibration samples show materially lower error than the current pipeline.

## Immediate Next Step

Implement Phase 1 and Phase 2 first. Do not touch silhouette/contour geometry until the system can clearly explain why a given measurement was accepted or rejected.
