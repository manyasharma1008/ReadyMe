import { API_BASE_URL, API_TIMEOUT } from "./config";

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
    if (this.status === 408) {
      return "Request timed out. Please try again.";
    }
    if (this.status >= 500) {
      return "Server error. Please try again later.";
    }
    if (this.status >= 400) {
      return this.message || "Request failed.";
    }
    return this.message || "An unexpected error occurred.";
  }
}

// Core API client with timeout handling
export async function apiClient(endpoint, options = {}) {
  // Validate API_BASE_URL is configured
  if (!API_BASE_URL) {
    console.error('API_BASE_URL is not configured. Set VITE_API_BASE_URL environment variable.')
    throw new ApiError('API not configured. Please refresh and try again.', 0);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`API Request: ${options.method || 'GET'} ${url}`);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type");

    let data = null;

    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      console.error(`API Error: ${response.status}`, data);
      throw new ApiError(
        data?.message || data || "Request failed",
        response.status,
        data
      );
    }

    return data;
  } catch (error) {
    console.error('API Request failed:', error);

    if (error.name === "AbortError") {
      throw new ApiError("Request timeout. Please try again.", 408);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    // Network error (CORS, connection refused, etc.)
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new ApiError('Cannot connect to server. Please check your connection.', 0);
    }

    throw new ApiError(error.message || "Network error", 0);
  } finally {
    clearTimeout(timeoutId);
  }
}

// GET request
export function apiGet(endpoint) {
  return apiClient(endpoint, {
    method: "GET",
  });
}

// JSON POST request
export function apiPost(endpoint, body) {
  return apiClient(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
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
