# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

---

# Project Overview

**ReadyMe** is a browser extension that helps users find the correct clothing size by scanning their body and matching measurements to brand size charts.

The project is built during a hackathon and has **three workstreams**:

* **Dev1** → Frontend + Browser Extension UI
* **Dev2** → Backend + AI + Database
* **Dev3** → Integration + State Management + Testing

Claude Code should focus primarily on **Dev2 backend tasks**.

---

# Repository Structure

```
ReadyMe/
├── CLAUDE.md
├── frontend/          # React + Vite extension UI
├── backend/           # FastAPI server
└── extension/         # Plasmo browser extension
```

Backend structure:

```
backend/
├── app/
│   ├── main.py
│   ├── routers/
│   │   ├── scan.py
│   │   ├── size.py
│   │   ├── product.py
│   │   └── profile.py
│   ├── services/
│   │   ├── mediapipe_extractor.py
│   │   ├── preprocessing.py
│   │   ├── measurement.py
│   │   ├── chart_matcher.py
│   │   └── fit_model.py
│   ├── models/
│   │   ├── schemas.py
│   │   └── weights/
│   ├── db/
│   │   └── supabase.py
│   └── auth/
│       └── jwt_middleware.py
│
├── requirements.txt
└── runtime.txt
```

---

# Technology Stack

### Backend

* FastAPI
* Python 3.10
* MediaPipe
* OpenCV
* TensorFlow / Keras (optional)

### Database

* Supabase
* PostgreSQL
* Supabase Auth
* JWT authentication

### Frontend

* React 19
* Vite 7
* Tailwind CSS 4
* Plasmo browser extension framework

---

# Dev2 Progress Status

## Completed Systems ✅

### Body Measurement API

* FastAPI backend with routers
* `/scan/measure`
* `/scan/measure-base64`
* MediaPipe body landmark extraction
* OpenCV preprocessing
* Measurement calculations

Extracted metrics:

* height
* chest
* waist
* hips
* shoulder_width

Files:

```
app/services/
mediapipe_extractor.py
preprocessing.py
measurement.py
```

---

### Calibration System

The system supports two calibration methods for accurate body measurements:

1. **Height-based calibration** (`/scan/calibrate`, `/scan/measure-calibrated`)
   - User provides their known height in cm
   - System calculates calibration factor (pixels/cm) from MediaPipe landmarks
   - Most accurate method

2. **Reference object calibration** (`/scan/calibrate/reference`)
   - Uses known objects in frame (credit card, A4 paper, smartphone)
   - Less accurate but doesn't require user height

Key files:

```
app/services/measurement.py      # CalibrationSystem class
app/services/visualization.py    # Landmark visualization
app/routers/scan.py             # Calibration endpoints
```

Calibration endpoints:

```
POST /scan/calibrate                    # Calibrate with user height
POST /scan/calibrate/reference           # Calibrate with reference object
GET  /scan/calibrate/status              # Get calibration status
POST /scan/calibrate/reset               # Reset calibration
POST /scan/measure-calibrated            # Measure with calibration applied
POST /scan/visualize                     # Generate landmark visualization
```

---

### Visualization Service

Live landmark overlay during body scanning. Draws:

* Colored dots at key body points (nose, shoulders, hips, ankles, knees, elbows, wrists)
* Body outline connecting landmarks
* Calibration info overlay (when available)

File: `app/services/visualization.py`

Functions:
- `draw_landmark_markers()` - Draw colored dots at body landmarks
- `draw_body_outline()` - Connect landmarks with lines
- `draw_calibration_info()` - Show calibration status on image
- `create_visualization()` - Full visualization pipeline

---

### Size Prediction Model

Implemented in:

```
app/services/chart_matcher.py
app/services/fit_model.py
```

Features:

* Brand-agnostic size charts
* Size prediction with confidence score
* TensorFlow/Keras fit learning model

Endpoints:

```
/size/predict
/size/validate
/size/feedback
/size/model/train
/size/model/stats
```

---

### Product Size Chart Extraction

Implemented in:

```
app/routers/product.py
```

Features:

* Extract size charts from product pages
* Supported platforms:

  * Amazon
  * Myntra
  * Flipkart

Endpoints:

```
POST /product/extract
GET /product/supported-platforms
```

---

### Supabase Database Integration

Supabase is used as the main database.

Connection file:

```
app/db/supabase.py
```

Tables:

```
users
body_profiles
scan_history
```

Environment variables:

```
SUPABASE_URL
SUPABASE_KEY
JWT_SECRET
```

---

### Body Profile CRUD API

Implemented in:

```
app/routers/profile.py
app/auth/jwt_middleware.py
```

Features:

* Save body measurements to database
* Get authenticated user's profile (JWT required)
* Update measurements for authenticated user

Endpoints:

```
POST /profile/save
GET /profile/get
PUT /profile/update
```

Authentication: JWT token validation via `get_current_user` dependency

---

### Bug Fixes Applied

1. **Pydantic v2 Type Annotations** (app/routers/scan.py)
   - Changed `float = None` to `float | None = None` for Optional fields
   - Fixed in `CalibrationStatusResponse` and `VisualizationResponse`

2. **Supabase Lazy Loading** (app/db/supabase.py)
   - Client now created on-demand, not at import time
   - Prevents startup failures when Supabase is unavailable

3. **Live Landmark Display** (frontend/src/pages/BodyScan.jsx)
   - Visualizes body landmarks in real-time during camera scan
   - Shows colored markers on body points (nose, shoulders, hips, etc.)
   - Overlay rendered on video feed for immediate feedback

---

# Pending Features (Claude Code should implement)

## Virtual Try-On Pipeline (Future)

To be implemented later.

Tasks:

* Integrate open-source VTON model (example: IDM-VTON)
* Generate avatar from body measurements
* Endpoint:

```
POST /tryon/generate
```

---

# Backend Commands

Run backend:

```
cd backend
python -m uvicorn app.main:app --reload
```

API docs:

```
http://localhost:8000/docs
```

---

# Development Rules for Claude Code

When modifying this repository:

1. Only modify **backend code for Dev2 tasks**
2. Follow existing FastAPI router patterns
3. Always access the database via:

```
app/db/supabase.py
```

4. Never import the Supabase library directly in routers
5. All `/profile` routes must use authentication
6. Keep business logic inside `services/`

---

# Important Notes

* TensorFlow is optional
* API should work even if TensorFlow is not installed
* MediaPipe must run in headless server environments
* CORS is enabled for browser extension access

---

# Goal

The backend should provide:

* body measurement extraction
* clothing size prediction
* product size chart extraction
* user measurement storage
* future virtual try-on support
