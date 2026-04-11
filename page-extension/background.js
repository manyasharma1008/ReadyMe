const BACKEND_CANDIDATES = [
  "http://127.0.0.1:8000",
  "http://localhost:8000",
];

let cachedBackendBaseUrl = null;

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function resolveBackendBaseUrl() {
  if (cachedBackendBaseUrl) return cachedBackendBaseUrl;

  for (const baseUrl of BACKEND_CANDIDATES) {
    const candidate = normalizeBaseUrl(baseUrl);
    try {
      const { response } = await fetchJson(`${candidate}/health`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        cachedBackendBaseUrl = candidate;
        console.log("[ReadyMe] Using backend:", cachedBackendBaseUrl);
        return cachedBackendBaseUrl;
      }
    } catch (error) {
      // ignore and try next
    }
  }

  throw new TypeError(
    `Backend is not reachable. Tried: ${BACKEND_CANDIDATES.join(", ")}. Start backend on port 8000.`
  );
}

async function postJson(path, payload) {
  const baseUrl = await resolveBackendBaseUrl();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const url = `${baseUrl}${path}`;
  console.log("[ReadyMe] POST", url);

  try {
    const { response, data } = await fetchJson(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(data.detail || data.message || `Request failed with status ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getBackendStatus() {
  try {
    const baseUrl = await resolveBackendBaseUrl();
    return { ok: true, baseUrl };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "BACKEND_STATUS") {
    getBackendStatus().then((status) => sendResponse(status));
    return true;
  }

  if (request.action !== "INGEST_SIZE_CHART") {
    return false;
  }

  console.log("[ReadyMe] Sending size chart to backend:", request.payload);

  postJson("/product/ingest-chart", request.payload)
    .then((result) => {
      console.log("[ReadyMe] Backend accepted size chart:", result);
      sendResponse({ success: true, result });
    })
    .catch((error) => {
      console.error("[ReadyMe] Backend sync failed:", error);
      sendResponse({ success: false, error: error.message || "Unknown backend error" });
    });

  return true;
});

