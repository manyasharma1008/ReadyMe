import { ENDPOINTS } from "./config";
import { apiGet, apiPost, apiPut } from "./client";

/**
 * Save user body profile with measurements
 */
export async function saveProfile(userId, measurements, name = null) {
  return apiPost(ENDPOINTS.PROFILE_SAVE, {
    user_id: userId,
    measurements: measurements,
    name: name,
  });
}

/**
 * Get user profile
 */
export async function getProfile() {
  return apiGet(ENDPOINTS.PROFILE_GET);
}

/**
 * Update user profile
 */
export async function updateProfile(measurements, name = null) {
  const params = name ? `?${new URLSearchParams({ name }).toString()}` : "";
  return apiPut(`${ENDPOINTS.PROFILE_UPDATE}${params}`, measurements);
}
