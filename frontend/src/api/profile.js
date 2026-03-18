import { ENDPOINTS } from "./config";
import { apiPost } from "./client";

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
export async function getProfile(userId) {
  return apiPost(ENDPOINTS.PROFILE_GET, {
    user_id: userId,
  });
}

/**
 * Update user profile
 */
export async function updateProfile(userId, measurements, name = null) {
  return apiPost(ENDPOINTS.PROFILE_UPDATE, {
    user_id: userId,
    measurements: measurements,
    name: name,
  });
}