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

Frontend structure:

```
frontend/
├── src/
│   ├── components/
│   │   ├── Avatar.jsx
│   │   ├── HumanModel.jsx
│   │   ├── ThumbnailGallery.jsx
│   │   ├── Navbar.jsx
│   │   └── common/
│   ├── hooks/
│   │   ├── useApi.js
│   │   ├── useMediaPipe.js      # NEW: Real-time pose detection
│   │   ├── useScanImage.js
│   │   └── useSizePrediction.js
│   ├── pages/
│   │   ├── BodyScan.jsx         # NEW: Real-time webcam + landmarks
│   │   ├── Contact.jsx
│   │   ├── Help.jsx
│   │   └── ...
│   ├── context/
│   │   └── AppContext.jsx
│   ├── api/
│   │   └── scan.js
│   └── App.jsx
├── package.json
└── vite.config.js
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
│   │   ├── fit_model.py
│   │   └── visualization.py      # NEW: Landmark visualization
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
* NumPy

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
* @mediapipe/tasks-vision (for client-side pose detection)

---

# Completed Systems ✅

## 1. Body Measurement API

* FastAPI backend with routers
* `/scan/measure`
* `/scan/measure-base64`
* `/scan/measure-multiple` (NEW: capture 4 angles)
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

## 2. Calibration System

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

## 3. Visualization Service

### Backend Service

Live landmark overlay on captured images. Draws:

* Colored dots at key body points (nose, shoulders, hips, ankles, knees, elbows, wrists)
* Body outline connecting landmarks
* Calibration info overlay (when available)

File: `app/services/visualization.py`

Functions:
- `draw_landmark_markers()` - Draw colored dots at body landmarks
- `draw_body_outline()` - Connect landmarks with lines
- `draw_calibration_info()` - Show calibration status on image
- `create_visualization()` - Full visualization pipeline

### Frontend Real-Time Detection (NEW)

Client-side pose detection using MediaPipe:

File: `frontend/src/hooks/useMediaPipe.js`

Features:
- Real-time pose landmark detection from webcam
- Returns landmarks as normalized coordinates (0-1)
- Supports continuous detection mode
- Uses WebAssembly for performance

Usage:
```javascript
const { isLoaded, startDetection, stopDetection, landmarks } = useMediaPipe()

// Start detection
startDetection(videoElement, (landmarks) => {
  // landmarks is array of {x, y, z, visibility}
})
```

---

## 4. Size Prediction Model

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

## 5. Product Size Chart Extraction

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

## 6. Supabase Database Integration

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

## 7. Body Profile CRUD API

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

## 8. Multi-Angle Body Scan (NEW)

Frontend feature for capturing 4 angles:

```
frontend/src/pages/BodyScan.jsx
```

Features:
* Step-by-step capture: Front → Left → Right → Back
* Real-time webcam feed with pose landmarks overlay
* User height input for calibration
* Countdown timer before capture
* Simultaneous backend processing of all 4 images

Steps:
1. Front facing camera
2. Turn left side
3. Turn right side
4. Turn back to camera

---

## 9. Frontend Real-Time Pose Detection (NEW)

Client-side MediaPipe integration:

File: `frontend/src/hooks/useMediaPipe.js`

Features:
- Real-time pose landmark detection during webcam preview
- Visual overlay on video feed
- Fixed mirroring issue (landmarks now stick to body correctly)

Bug Fix Applied:
- **Mirroring bug**: Landmarks moved opposite to user movement
- **Root cause**: Double mirroring (CSS + coordinate flip)
- **Fix**: Removed coordinate-level `1-x` flip, let CSS handle all visual mirroring
- **File changed**: `frontend/src/pages/BodyScan.jsx`

---

# Pending Features (Future Work)

## Virtual Try-On Pipeline

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

# Frontend Commands

Run frontend:

```
cd frontend
npm run dev
```

Build for production:

```
cd frontend
npm run build
```

---

# Development Rules for Claude Code

When modifying this repository:

1. Follow existing FastAPI router patterns
2. Always access the database via:

```
app/db/supabase.py
```

3. Never import the Supabase library directly in routers
4. All `/profile` routes must use authentication
5. Keep business logic inside `services/`

For frontend work:
- Use existing React component patterns
- Keep business logic in hooks
- Follow Tailwind CSS 4 conventions

---

# Important Notes

* TensorFlow is optional - API should work even if not installed
* MediaPipe must run in headless server environments
* CORS is enabled for browser extension access
* Frontend uses client-side MediaPipe for real-time preview, backend uses Python MediaPipe for final processing

---

# Goal

The project provides:

* body measurement extraction (frontend + backend)
* clothing size prediction
* product size chart extraction
* user measurement storage
* real-time pose landmark overlay
* multi-angle body scanning
* future virtual try-on support