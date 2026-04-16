import { useState, useCallback, useRef, useEffect } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

export function useMediaPipe() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [landmarks, setLandmarks] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const landmarkerRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const animationFrameRef = useRef(null);

  // Initialize the MediaPipe Pose model
  useEffect(() => {
    async function initializeModel() {
      try {
        setIsLoading(true);
        setError(null);

        // Load the vision fileset
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        // Create the PoseLandmarker
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          outputSegmentationMasks: false,
        });

        landmarkerRef.current = landmarker;
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to initialize MediaPipe:", err);
        setError(err.message || "Failed to load pose detection model");
      } finally {
        setIsLoading(false);
      }
    }

    initializeModel();

    return () => {
      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  // Detect landmarks from a video element
  const detectLandmarks = useCallback((video) => {
    if (!landmarkerRef.current || !video || !isLoaded) {
      return null;
    }

    // Ensure video is ready
    if (video.readyState < 2) {
      return null;
    }

    const currentTime = video.currentTime;

    // Skip if we've already processed this frame
    if (currentTime === lastVideoTimeRef.current) {
      return null;
    }

    lastVideoTimeRef.current = currentTime;

    try {
      const result = landmarkerRef.current.detectForVideo(video, performance.now());

      if (result.landmarks && result.landmarks.length > 0) {
        // MediaPipe returns landmarks with x, y, z (normalized 0-1) and visibility
        // Convert to our format: { x, y, visibility }
        const landmarksArray = result.landmarks[0].map((landmark) => ({
          x: landmark.x,
          y: landmark.y,
          z: landmark.z,
          visibility: landmark.visibility ?? 1,
        }));

        setLandmarks(landmarksArray);
        return landmarksArray;
      }

      setLandmarks(null);
      return null;
    } catch (err) {
      console.error("Detection error:", err);
      return null;
    }
  }, [isLoaded]);

  // Start continuous detection on a video element
  const startDetection = useCallback((video, onLandmarks) => {
    if (!video || !isLoaded) return;

    setIsDetecting(true);

    function detectFrame() {
      if (!isDetecting) return;

      const detectedLandmarks = detectLandmarks(video);

      if (detectedLandmarks && onLandmarks) {
        onLandmarks(detectedLandmarks);
      }

      // Continue the detection loop
      animationFrameRef.current = requestAnimationFrame(detectFrame);
    }

    detectFrame();
  }, [isLoaded, detectLandmarks, isDetecting]);

  // Stop continuous detection
  const stopDetection = useCallback(() => {
    setIsDetecting(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Clear landmarks
  const clearLandmarks = useCallback(() => {
    setLandmarks(null);
  }, []);

  return {
    isLoaded,
    isLoading,
    error,
    landmarks,
    isDetecting,
    detectLandmarks,
    startDetection,
    stopDetection,
    clearLandmarks,
  };
}

// Export landmark constants for external use
export const LANDMARK_INDICES = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

export const LANDMARK_COLORS = {
  0: "#ff0000", // Nose - Red
  11: "#00ff00", // Left shoulder - Green
  12: "#00ff00", // Right shoulder - Green
  23: "#ff00ff", // Left hip - Magenta
  24: "#ff00ff", // Right hip - Magenta
  27: "#ffff00", // Left ankle - Yellow
  28: "#ffff00", // Right ankle - Yellow
  25: "#00ffff", // Left knee - Cyan
  26: "#00ffff", // Right knee - Cyan
  13: "#800080", // Left elbow - Purple
  14: "#800080", // Right elbow - Purple
  15: "#008080", // Left wrist - Teal
  16: "#008080", // Right wrist - Teal
};