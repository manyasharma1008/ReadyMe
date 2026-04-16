const READYME_PREVIEW_BASE_URL = "https://ready-me-liart.vercel.app";
const LAUNCHABLE_STATUSES = new Set(["ready", "no_size_chart"]);

function getStorageKey(tabId) {
  return `readyMeLastRun_${tabId}`;
}

function buildTimestamp() {
  return new Date().toLocaleString();
}

function dedupeStrings(values = []) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean)));
}

function normalizeProduct(product = {}, fallbackUrl = "") {
  const images = dedupeStrings([product.image, ...(product.images || [])]);
  return {
    url: product.url || fallbackUrl || "",
    title: product.title || "Unknown product",
    image: product.image || images[0] || "",
    images,
    price: product.price || "",
    product_id: product.product_id || null,
    brand: product.brand || null,
    category: product.category || null,
    gender: product.gender || null,
    site_name: String(product.site_name || "").replace(/^www\./i, "") || "",
  };
}

function getStatusLabel(status) {
  return {
    loading: "Loading",
    ready: "Ready",
    no_size_chart: "No Size Chart",
    not_product_page: "Not Product Page",
    backend_unreachable: "Backend Offline",
    error: "Error",
  }[status] || "Unknown";
}

function canLaunch(state) {
  return LAUNCHABLE_STATUSES.has(state?.status);
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

function formatDebugSummary(state) {
  if (!state) return "No extraction run yet.";

  const lines = [`Status: ${getStatusLabel(state.status)}`];
  if (state.product?.title) lines.push(`Product: ${state.product.title}`);
  if (state.product?.site_name) lines.push(`Site: ${state.product.site_name}`);
  if (typeof state.isProductPage === "boolean") {
    lines.push(`Product page detected: ${state.isProductPage ? "yes" : "no"}`);
  }
  if (typeof state.sizeChart?.sizes?.length === "number") {
    lines.push(`Sizes extracted: ${state.sizeChart?.sizes?.length || 0}`);
  }
  const measurementKeys = extractMeasurementKeys(state.sizeChart);
  if (measurementKeys.length) lines.push(`Measurements found: ${measurementKeys.join(", ")}`);
  if (state.backendSync) {
    lines.push(
      `Backend: ${
        typeof state.backendSync === "string"
          ? state.backendSync
          : state.backendSync.success === false
            ? state.backendSync.error || "sync failed"
            : "synced"
      }`
    );
  }
  if (state.warnings?.length) lines.push(`Warning: ${state.warnings[0]}`);
  if (state.timestamp) lines.push(`Updated: ${state.timestamp}`);

  return lines.join("\n");
}

function renderState(state) {
  const statusBadge = document.getElementById("popup-status-badge");
  const productValue = document.getElementById("popup-product-value");
  const siteValue = document.getElementById("popup-site-value");
  const categoryValue = document.getElementById("popup-category-value");
  const sizeValue = document.getElementById("popup-size-value");
  const backendValue = document.getElementById("popup-backend-value");
  const warningValue = document.getElementById("popup-warning-value");
  const debugStatus = document.getElementById("debug-status");
  const scanButton = document.getElementById("scan");
  const scanText = scanButton?.querySelector("span");

  if (statusBadge) {
    statusBadge.dataset.status = state?.status || "loading";
    statusBadge.textContent = getStatusLabel(state?.status || "loading");
  }
  if (productValue) productValue.textContent = state?.product?.title || "Waiting for page data";
  if (siteValue) siteValue.textContent = state?.product?.site_name || "—";
  if (categoryValue) categoryValue.textContent = state?.product?.category || "—";
  if (sizeValue) sizeValue.textContent = String(state?.sizeChart?.sizes?.length || 0);
  if (backendValue) {
    backendValue.textContent =
      typeof state?.backendSync === "string"
        ? state.backendSync
        : state?.backendSync?.success === false
          ? state.backendSync.error || "sync failed"
          : state?.backendSync
            ? "synced"
            : "checking";
  }
  if (warningValue) warningValue.textContent = state?.warnings?.[0] || "—";
  if (debugStatus) debugStatus.textContent = formatDebugSummary(state);

  if (scanButton) scanButton.disabled = !canLaunch(state);
  if (scanText) scanText.textContent = canLaunch(state) ? "SCAN FIT" : "UNAVAILABLE";
}

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key] || null));
  });
}

function storageSet(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set(value, resolve);
  });
}

async function saveDebugState(tabId, state) {
  renderState(state);
  await storageSet({ [getStorageKey(tabId)]: state });
}

async function loadDebugState(tabId, pageUrl) {
  const state = await storageGet(getStorageKey(tabId));
  if (!state || state.pageUrl !== pageUrl) return null;
  renderState(state);
  return state;
}

function queryActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs[0] || null);
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function buildLoadingState(pageUrl) {
  const fallbackUrl = pageUrl || "";
  return {
    status: "loading",
    product: normalizeProduct(
      {
        url: fallbackUrl,
        site_name: (() => {
          try {
            return new URL(fallbackUrl).hostname;
          } catch (error) {
            return "";
          }
        })(),
      },
      fallbackUrl
    ),
    sizeChart: null,
    backendSync: "checking",
    warnings: [],
    isProductPage: null,
    pageUrl: fallbackUrl,
    timestamp: buildTimestamp(),
  };
}

function buildErrorState(error, pageUrl, product = null) {
  return {
    status: "error",
    product: normalizeProduct(product || { url: pageUrl }, pageUrl),
    sizeChart: null,
    backendSync: "unavailable",
    warnings: [error.message || "Failed to read current tab"],
    isProductPage: false,
    pageUrl,
    timestamp: buildTimestamp(),
  };
}

function buildSessionState(payload, backendStatus, pageUrl) {
  const product = normalizeProduct(payload?.product, pageUrl);
  const warnings = dedupeStrings([
    ...(payload?.warnings || []),
    ...(payload?.isProductPage && !backendStatus?.ok ? [backendStatus?.error || "Backend is not reachable"] : []),
  ]);

  let status = "error";
  if (!payload?.isProductPage) {
    status = "not_product_page";
  } else if (!backendStatus?.ok) {
    status = "backend_unreachable";
  } else if (payload?.sizeChart?.sizes?.length) {
    status = "ready";
  } else {
    status = "no_size_chart";
  }

  return {
    status,
    product,
    sizeChart: payload?.sizeChart || null,
    backendSync: backendStatus?.ok ? "available" : "unavailable",
    warnings,
    isProductPage: Boolean(payload?.isProductPage),
    pageUrl,
    timestamp: buildTimestamp(),
  };
}

function buildRedirectSession(baseState, overrides = {}) {
  return {
    status: overrides.status || baseState.status,
    product: normalizeProduct(
      {
        ...baseState.product,
        ...(overrides.product || {}),
      },
      baseState.product?.url || baseState.pageUrl
    ),
    sizeChart: overrides.sizeChart !== undefined ? overrides.sizeChart : baseState.sizeChart,
    backendSync: overrides.backendSync !== undefined ? overrides.backendSync : baseState.backendSync,
    warnings: dedupeStrings([...(baseState.warnings || []), ...(overrides.warnings || [])]),
    isProductPage: true,
    pageUrl: baseState.pageUrl,
    timestamp: buildTimestamp(),
  };
}

function buildRedirectUrl(session) {
  const encoded = encodeURIComponent(JSON.stringify(session));
  return `${READYME_PREVIEW_BASE_URL}/preview?data=${encoded}`;
}

async function refreshStateForTab(tab, options = {}) {
  const pageUrl = tab?.url || "";
  if (options.showLoading !== false) {
    await saveDebugState(tab.id, buildLoadingState(pageUrl));
  }

  try {
    const [payload, backendStatus] = await Promise.all([
      sendTabMessage(tab.id, { action: "EXTRACT_PRODUCT_CONTEXT" }),
      sendRuntimeMessage({ action: "BACKEND_STATUS" }).catch((error) => ({
        ok: false,
        error: error.message || "Backend is not reachable",
      })),
    ]);

    const nextState = buildSessionState(payload, backendStatus, pageUrl);
    await saveDebugState(tab.id, nextState);
    return nextState;
  } catch (error) {
    const failedState = buildErrorState(error, pageUrl);
    await saveDebugState(tab.id, failedState);
    return failedState;
  }
}

async function launchSession(tab, existingState) {
  const scanButton = document.getElementById("scan");
  const scanText = scanButton?.querySelector("span");
  const state =
    existingState && existingState.pageUrl === tab.url
      ? existingState
      : await refreshStateForTab(tab, { showLoading: true });

  if (!canLaunch(state)) {
    renderState(state);
    return;
  }

  if (scanButton) scanButton.disabled = true;
  if (scanText) scanText.textContent = "LAUNCHING";

  try {
    if (state.sizeChart?.sizes?.length) {
      const response = await sendRuntimeMessage({
        action: "INGEST_SIZE_CHART",
        payload: {
          product: state.product,
          size_chart: state.sizeChart,
        },
      });

      const redirectSession = response?.success
        ? buildRedirectSession(state, {
            sizeChart: response.result?.size_chart || state.sizeChart,
            backendSync: response.result,
            warnings: response.result?.warnings || [],
          })
        : buildRedirectSession(state, {
            backendSync: {
              success: false,
              error: response?.error || "Backend sync failed",
            },
            warnings: [response?.error || "Backend sync failed"],
          });

      await saveDebugState(tab.id, redirectSession);
      chrome.tabs.create({ url: buildRedirectUrl(redirectSession) });
      return;
    }

    const fallbackResponse = await sendRuntimeMessage({
      action: "EXTRACT_SIZE_CHART_FROM_URL",
      payload: {
        product: state.product,
      },
    });

    if (!fallbackResponse?.success) {
      const failedState = buildRedirectSession(state, {
        status: "error",
        backendSync: {
          success: false,
          error: fallbackResponse?.error || "Backend fallback failed",
        },
        warnings: [fallbackResponse?.error || "Backend fallback failed"],
      });
      await saveDebugState(tab.id, failedState);
      return;
    }

    const backendResult = fallbackResponse.result;
    const readySession = buildRedirectSession(state, {
      status: "ready",
      sizeChart: backendResult?.size_chart || null,
      backendSync: backendResult,
      warnings: backendResult?.warnings || [],
    });

    await saveDebugState(tab.id, readySession);
    chrome.tabs.create({ url: buildRedirectUrl(readySession) });
  } catch (error) {
    const failedState = buildErrorState(error, tab.url, state.product);
    await saveDebugState(tab.id, failedState);
  } finally {
    const latestState = await loadDebugState(tab.id, tab.url);
    if (scanButton) scanButton.disabled = !canLaunch(latestState);
    if (scanText) scanText.textContent = canLaunch(latestState) ? "SCAN FIT" : "UNAVAILABLE";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const scanButton = document.getElementById("scan");
  if (scanButton) scanButton.disabled = true;

  try {
    const activeTab = await queryActiveTab();
    if (!activeTab?.id) {
      renderState(buildErrorState(new Error("No active browser tab"), ""));
      return;
    }

    let currentState = await loadDebugState(activeTab.id, activeTab.url || "");
    currentState = await refreshStateForTab(activeTab, { showLoading: !currentState });

    if (scanButton) {
      scanButton.addEventListener("click", async () => {
        const latestState = await loadDebugState(activeTab.id, activeTab.url || "");
        await launchSession(activeTab, latestState || currentState);
        currentState = await loadDebugState(activeTab.id, activeTab.url || "");
      });
    }
  } catch (error) {
    renderState(buildErrorState(error, ""));
  }
});
