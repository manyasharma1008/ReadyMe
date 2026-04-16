# ReadyMe Extension (page-extension)

This folder contains a lightweight browser extension used to extract size charts from product pages and optionally sync them with the ReadyMe backend.

Quick start (Windows):

1. Start backend on port 8000 (project root):

   - Create a Python env and install dependencies:

     python -m venv .venv
     .venv\Scripts\activate
     pip install -r backend\requirements.txt

   - Run the FastAPI server:

     cd backend
     uvicorn app.main:app --reload --port 8000

2. Load the extension in Chrome/Edge:

   - Open `chrome://extensions/` and enable **Developer mode**.
   - Click **Load unpacked** and select this folder: `page-extension`.
   - The extension will appear as "ReadyMe" with a popup.

3. Test extraction:

   - Open any product page (e.g., an e‑commerce product detail page).
   - Click the extension icon and press **Scan**.
   - The popup shows extraction/debug info and will try to sync with backend.

Notes:

- The extension's background worker probes `http://127.0.0.1:8000` and `http://localhost:8000` (see `background.js`).
- If the backend is not available, the extension will attempt to use the backend URL extraction fallback.
- Content extraction logic lives in `sizeChartExtractor.js` and `content.js`.

Troubleshooting:

- If the popup shows "backend unreachable", verify the backend is running and reachable from the browser.
- Check the extension background logs: right‑click the extension entry -> **Inspect service worker**.
- Check page console for messages from `ReadyMeExtractor`.

Want CI or packaging scripts? Tell me whether you want a ZIP packager, npm scripts, or GitHub Actions for building and signing the extension.
