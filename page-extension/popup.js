const READYME_PREVIEW_BASE_URL = "https://ready-me-liart.vercel.app";

function getStorageKey(tabId) {
  return `readyMeLastRun_${tabId}`;
}
// wejbf
function formatDebugSummary(state) {
  if (!state) return "No extraction run yet.";

  const lines = [];
  lines.push(`Status: ${state.status || "unknown"}`);

  if (state.productTitle) lines.push(`Product: ${state.productTitle}`);
  if (state.siteName) lines.push(`Site: ${state.siteName}`);
  if (typeof state.isProductPage === "boolean") {
    lines.push(`Product page detected: ${state.isProductPage ? "yes" : "no"}`);
  }
  if (typeof state.sizeCount === "number") {
    lines.push(`Sizes extracted: ${state.sizeCount}`);
  }
  if (state.measurementKeys?.length) {
    lines.push(`Measurements found: ${state.measurementKeys.join(", ")}`);
  }
  if (state.backendSync) lines.push(`Backend sync: ${state.backendSync}`);
  if (typeof state.normalizedSizeCount === "number") {
    lines.push(`Normalized sizes: ${state.normalizedSizeCount}`);
  }
  if (state.warning) lines.push(`Warning: ${state.warning}`);
  if (state.timestamp) lines.push(`Updated: ${state.timestamp}`);

  return lines.join("\n");
}

function renderDebugState(state) {
  const debugStatus = document.getElementById("debug-status");
  if (!debugStatus) return;
  debugStatus.textContent = formatDebugSummary(state);
}

function saveDebugState(tabId, state) {
  renderDebugState(state);
  const key = getStorageKey(tabId);
  chrome.storage.local.set({ [key]: state });
}

function loadDebugState(tabId) {
  const key = getStorageKey(tabId);
  chrome.storage.local.get(key, (result) => {
    renderDebugState(result[key] || null);
  });
}

function buildTimestamp() {
  return new Date().toLocaleString();
}

function extractMeasurementKeys(sizeChart) {
  const keys = new Set();
  for (const row of sizeChart?.sizes || []) {
    for (const key of Object.keys(row.measurements || {})) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

function buildRedirectUrl(payload, backendSync = null, resolvedSizeChart = null, resolvedWarnings = null) {
  const encoded = encodeURIComponent(
      JSON.stringify({
        product: payload.product,
        sizeChart: resolvedSizeChart ?? payload.sizeChart,
        extractionWarnings: resolvedWarnings ?? payload.warnings ?? [],
        backendSync,
      })
  );

  return `${READYME_PREVIEW_BASE_URL}/?data=${encoded}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("scan");

  // ✅ Load correct state per tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId) loadDebugState(tabId);
  });

  if (!btn) return;

  btn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) return;

      const tabId = activeTab.id;

      // ✅ Step 1: show loading
      saveDebugState(tabId, {
        status: "reading page",
        backendSync: "not started",
        timestamp: buildTimestamp(),
      });

      // ✅ Step 2: check backend
      chrome.runtime.sendMessage({ action: "BACKEND_STATUS" }, (status) => {
        if (chrome.runtime.lastError) return;

        if (!status?.ok) {
          saveDebugState(tabId, {
            status: "backend unreachable",
            backendSync: "not started",
            warning: status?.error || "Backend is not reachable",
            timestamp: buildTimestamp(),
          });
        }
      });

      // ✅ Step 3: extract page
      chrome.tabs.sendMessage(
        tabId,
        { action: "EXTRACT_PRODUCT_CONTEXT" },
        (payload) => {
          if (chrome.runtime.lastError || !payload) {
            const detail =
              chrome.runtime.lastError?.message ||
              "No payload received from content script";

            saveDebugState(tabId, {
              status: "failed",
              backendSync: "not started",
              warning: `Could not read this page: ${detail}`,
              timestamp: buildTimestamp(),
            });
            return;
          }

          const extractedState = {
            status: payload.sizeChart
              ? "size chart extracted"
              : "product read, no size chart found",
            productTitle: payload.product?.title || "Unknown product",
            siteName: payload.product?.site_name || "",
            isProductPage: Boolean(payload.isProductPage),
            sizeCount: payload.sizeChart?.sizes?.length || 0,
            measurementKeys: extractMeasurementKeys(payload.sizeChart),
            backendSync: payload.sizeChart ? "pending" : "skipped",
            warning: (payload.warnings || []).join(" | "),
            timestamp: buildTimestamp(),
          };

          saveDebugState(tabId, extractedState);

          if (!payload.isProductPage) return;

          const finishRedirect = (
            backendSync = null,
            resolvedSizeChart = payload.sizeChart,
            resolvedWarnings = payload.warnings || []
          ) => {
            chrome.tabs.create({
              url: buildRedirectUrl(payload, backendSync, resolvedSizeChart, resolvedWarnings),
            });
          };

          const syncWithBackend = (sizeChartPayload) => {
            chrome.runtime.sendMessage(
              {
                action: "INGEST_SIZE_CHART",
                payload: {
                  product: payload.product,
                  size_chart: sizeChartPayload,
                },
              },
              (response) => {
                if (chrome.runtime.lastError || !response?.success) {
                  saveDebugState(tabId, {
                    ...extractedState,
                    status: "backend sync failed",
                    backendSync: response?.error || "Backend sync failed",
                    timestamp: buildTimestamp(),
                  });

                  finishRedirect({
                    success: false,
                    error: response?.error || "Backend sync failed",
                  });
                  return;
                }

                saveDebugState(tabId, {
                  ...extractedState,
                  status: "backend sync complete",
                  backendSync: "success",
                  normalizedSizeCount:
                    response.result?.size_chart?.sizes?.length || 0,
                  timestamp: buildTimestamp(),
                });

                finishRedirect(response.result, payload.sizeChart, payload.warnings || []);
              }
            );
          };

          if (!payload.sizeChart) {
            saveDebugState(tabId, {
              ...extractedState,
              status: "backend fallback extraction",
              backendSync: "searching",
              timestamp: buildTimestamp(),
            });

            chrome.runtime.sendMessage(
              {
                action: "EXTRACT_SIZE_CHART_FROM_URL",
                payload: {
                  product: payload.product,
                },
              },
              (response) => {
                if (chrome.runtime.lastError || !response?.success) {
                  saveDebugState(tabId, {
                    ...extractedState,
                    status: "backend fallback failed",
                    backendSync: response?.error || "Backend fallback failed",
                    timestamp: buildTimestamp(),
                  });
                  return;
                }

                const backendResult = response.result;
                const backendChart = backendResult?.size_chart;

                saveDebugState(tabId, {
                  status: "backend sync complete",
                  productTitle: payload.product?.title || "Unknown product",
                  siteName: payload.product?.site_name || "",
                  isProductPage: true,
                  sizeCount: backendChart?.sizes?.length || 0,
                  measurementKeys: extractMeasurementKeys(backendChart),
                  backendSync: "success",
                  normalizedSizeCount: backendChart?.sizes?.length || 0,
                  warning: (backendResult?.warnings || []).join(" | "),
                  timestamp: buildTimestamp(),
                });

                finishRedirect(backendResult, backendChart, backendResult?.warnings || []);
              }
            );

            return;
          }

          syncWithBackend(payload.sizeChart);
        }
      );
    });
  });
});
