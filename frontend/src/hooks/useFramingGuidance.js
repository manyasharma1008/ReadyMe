import { useEffect, useRef, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Thresholds must match backend/app/services/measurement.py
const TOO_FAR = 0.55;
const IDEAL_MIN = 0.65;
const IDEAL_MAX = 0.85;
const TOO_CLOSE = 0.90;
const VIS = 0.5;

// Framing status types (JSDoc for plain JS)
// @typedef {'too_far' | 'near_too_far' | 'ideal' | 'near_too_close' | 'too_close' | 'invalid'} FramingStatus

// Framing state type
// @typedef {Object} FramingState
// @property {FramingStatus} status
// @property {string} message
// @property {number} fillRatio

/** @type {FramingState} */
const initialState = {
  status: 'invalid',
  message: 'Initializing camera...',
  fillRatio: 0,
};

function classify(fillRatio, headOk, ankleOk) {
  if (!headOk || !ankleOk) {
    return { status: 'invalid', message: 'Stand in full view of the camera', fillRatio };
  }
  if (fillRatio < TOO_FAR) return { status: 'too_far', message: 'Move closer to the camera', fillRatio };
  if (fillRatio < IDEAL_MIN) return { status: 'near_too_far', message: 'Almost there — a bit closer', fillRatio };
  if (fillRatio <= IDEAL_MAX) return { status: 'ideal', message: 'Perfect position — hold still', fillRatio };
  if (fillRatio <= TOO_CLOSE) return { status: 'near_too_close', message: 'Almost there — small step back', fillRatio };
  return { status: 'too_close', message: 'Step back slightly', fillRatio };
}

// Exponential smoothing avoids flicker on landmark jitter
function smooth(prev, next, alpha = 0.35) {
  return prev === 0 ? next : prev * (1 - alpha) + next * alpha;
}

export function useFramingGuidance(videoRef) {
  const [state, setState] = useState({
    status: 'invalid',
    message: 'Initializing camera…',
    fillRatio: 0,
  });
  const smoothedRef = useRef(0);
  const landmarkerRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        const lm = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        });
        if (!mounted) {
          lm.close();
          return;
        }
        landmarkerRef.current = lm;
        tick();
      } catch (err) {
        console.error('Failed to initialize framing landmarker:', err);
        setState({ status: 'invalid', message: 'Failed to initialize pose detection', fillRatio: 0 });
      }
    })();

    function tick() {
      const video = videoRef.current;
      const lm = landmarkerRef.current;
      if (!video || !lm || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const result = lm.detectForVideo(video, performance.now());
      const lms = result.landmarks?.[0];

      if (!lms || lms.length < 29) {
        setState({ status: 'invalid', message: 'No body detected — stand in full view', fillRatio: 0 });
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const nose = lms[0];
      const lAnkle = lms[27];
      const rAnkle = lms[28];
      const headOk = (nose?.visibility ?? 0) > VIS;
      const ankles = [lAnkle, rAnkle].filter(a => (a?.visibility ?? 0) > VIS);
      const ankleOk = ankles.length > 0;

      let fillRatio = 0;
      if (headOk && ankleOk) {
        const ankleY = ankles.reduce((s, a) => s + a.y, 0) / ankles.length;
        // Both y-values are already normalized to [0,1] by image height → subtract directly
        fillRatio = Math.max(0, ankleY - nose.y);
      }

      smoothedRef.current = smooth(smoothedRef.current, fillRatio);
      setState(classify(smoothedRef.current, headOk, ankleOk));

      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, [videoRef]);

  return state;
}