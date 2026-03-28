import { API_BASE_URL, API_TIMEOUT, API_RETRIES } from "./config";

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }

  getUserFriendlyMessage() {
    if (this.status === 422) {
      return "Invalid request format. Please check your input.";
    }
    if (this.status === 408 || this.status === 504) {
      return "Request timed out. Server is taking too long. Please try again.";
    }
    if (this.status >= 500) {
      return "Server error. Please try again later.";
    }
    if (this.status >= 400) {
      return this.message || "Request failed.";
    }
    if (this.status === 0) {
      return "Cannot connect to server. Please check your connection.";
    }
    return this.message || "An unexpected error occurred.";
  }
}

// Core API client with timeout and retry handling
export async function apiClient(endpoint, options = {}, retryCount = 0, customTimeout = null) {
  // Validate API_BASE_URL is configured
  if (!API_BASE_URL) {
    console.error('API_BASE_URL is not configured. Set VITE_API_BASE_URL environment variable.')
    throw new ApiError('API not configured. Please refresh and try again.', 0);
  }

  const url = `${API_BASE_URL}${endpoint}`;
  console.log(`[API] ${new Date().toISOString()} - ${options.method || 'GET'} ${url}`);

  const timeout = customTimeout || API_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.warn(`[API] Request timeout after ${timeout}ms`);
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get("content-type");
    let data = null;

    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      console.error(`[API] Error ${response.status}:`, data);

      // Handle validation errors (422)
      let errorMessage = "Request failed";
      if (response.status === 422 && data?.detail) {
        // FastAPI validation error
        if (Array.isArray(data.detail)) {
          errorMessage = data.detail.map(d => d.msg || d.loc || JSON.stringify(d)).join(', ');
        } else {
          errorMessage = data.detail;
        }
        console.error('[API] Validation error details:', data.detail);
      } else {
        errorMessage = data?.message || data || "Request failed";
      }

      throw new ApiError(errorMessage, response.status, data);
    }

    console.log(`[API] Success: ${response.status}`);
    return data;

  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[API] Request failed (attempt ${retryCount + 1}):`, error.name, error.message);

    // Retry logic for network errors or timeouts
    const isRetryable = error.name === 'AbortError' ||
                        error.name === 'TypeError' ||
                        error.status >= 500;

    if (isRetryable && retryCount < API_RETRIES) {
      console.log(`[API] Retrying... (${retryCount + 1}/${API_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
      return apiClient(endpoint, options, retryCount + 1);
    }

    if (error.name === "AbortError") {
      throw new ApiError("Request timed out. Server may be cold starting. Please try again.", 408);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    // Network error (CORS, connection refused, etc.)
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new ApiError('Cannot connect to server. Please check your connection.', 0);
    }

    throw new ApiError(error.message || "Network error", 0);
  }
}

// GET request
export function apiGet(endpoint) {
  return apiClient(endpoint, {
    method: "GET",
  });
}

// JSON POST request with optional custom timeout
export function apiPost(endpoint, body, customTimeout = null) {
  // Debug: Log the payload being sent
  console.log(`[API POST] ${endpoint}`, JSON.stringify(body, null, 2));

  const timeout = customTimeout || API_TIMEOUT;

  return apiClient(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, 0, timeout);
}

// FormData POST request (for file uploads)
export function apiPostFormData(endpoint, formData) {
  return apiClient(endpoint, {
    method: "POST",
    body: formData,
  });
}

// Text POST request
export function apiPostText(endpoint, text) {
  return apiClient(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: text,
  });
}