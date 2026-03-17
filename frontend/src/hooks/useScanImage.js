import { useState, useCallback } from "react";
import { scanImage, isValidImageFile } from "../api";
import { ApiError } from "../api";

export function useScanImage() {
  const [measurements, setMeasurements] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const scan = useCallback(async (source) => {
    setLoading(true);
    setError(null);
    setMeasurements(null);

    try {
      if (source instanceof File && !isValidImageFile(source)) {
        throw new ApiError("Invalid image format. Use JPEG, PNG, or WebP.", 400);
      }

      // Strip data URL prefix if present - pass clean base64 to scanImage
      let processedSource = source;
      if (typeof source === "string" && source.includes(",")) {
        processedSource = source.split(",")[1];
      }

      const response = await scanImage(processedSource);

      if (!response) {
        throw new ApiError("Empty response from server", 500);
      }

      if (response.success === false) {
        throw new ApiError(response.message || "Scan failed", response.status || 500);
      }

      if (response.measurements) {
        setMeasurements(response.measurements);
        return response.measurements;
      }

      throw new ApiError("No measurements returned", 500);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(err.message || "Scan failed", 0);
      setError(apiError);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearMeasurements = useCallback(() => {
    setMeasurements(null);
    setError(null);
  }, []);

  return {
    measurements,
    loading,
    error,
    scan,
    clearError,
    clearMeasurements,
    isScanning: loading,
    hasMeasurements: measurements !== null,
    hasError: error !== null,
  };
}
