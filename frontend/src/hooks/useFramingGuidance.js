import { useEffect, useRef, useState, useCallback } from 'react';

import { checkFraming } from '../api';

// Framing state type
// @typedef {Object} FramingState
// @property {string} status
// @property {string} message
// @property {number} fillRatio

/** @type {FramingState} */
const initialState = {
  status: 'invalid',
  message: 'Initializing camera...',
  fillRatio: 0,
};

// Throttle API calls to avoid overwhelming the backend
const API_CALL_INTERVAL_MS = 200;  // ~5 fps max

export function useFramingGuidance(videoRef) {
  const [state, setState] = useState(initialState);
  const lastApiCallRef = useRef(0);
  const inFlightRef = useRef(false);
  const rafRef = useRef(null);
  const canvasRef = useRef(null);

  const checkFramingWithBackend = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    // Throttle API calls
    const now = Date.now();
    if (now - lastApiCallRef.current < API_CALL_INTERVAL_MS) return;
    if (inFlightRef.current) return;
    lastApiCallRef.current = now;
    inFlightRef.current = true;

    try {
      const canvas = canvasRef.current || document.createElement('canvas');
      canvasRef.current = canvas;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.drawImage(video, 0, 0);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      if (!blob) return;

      const frame = new File([blob], 'frame.jpg', { type: blob.type || 'image/jpeg' });
      const data = await checkFraming(frame);
      console.log('[Framing] Backend response:', data);
      setState({
        status: data.status || 'invalid',
        message: data.message || 'Stand in full view of the camera',
        fillRatio: data.fill_ratio || 0,
      });
    } catch (err) {
      console.warn('Framing check error:', err.message);
      setState(prev => (
        prev.status === 'invalid' && prev.message !== initialState.message
          ? prev
          : {
              status: 'invalid',
              message: 'Unable to validate framing',
              fillRatio: 0,
            }
      ));
    } finally {
      inFlightRef.current = false;
    }
  }, [videoRef]);

  useEffect(() => {
    let mounted = true;

    function tick() {
      if (!mounted) return;
      checkFramingWithBackend();
      rafRef.current = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [checkFramingWithBackend]);

  return state;
}
