import React from 'react';

const colorByStatus = {
  ideal: '#22c55e',
  near_too_far: '#eab308',
  near_too_close: '#eab308',
  too_far: '#ef4444',
  too_close: '#ef4444',
  invalid: '#6b7280',
};

export function FramingOverlay({ state }) {
  const color = colorByStatus[state.status] || colorByStatus.invalid;

  return (
    <div
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Ideal framing guide — 65% to 85% of frame, centered vertically */}
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          top: '7.5%',
          bottom: '7.5%',
          border: `2px dashed ${state.status === 'ideal' ? '#22c55e' : 'rgba(255,255,255,0.45)'}`,
          borderRadius: 16,
          transition: 'border-color 180ms',
        }}
      />

      {/* Feedback banner */}
      <div
        style={{
          alignSelf: 'center',
          margin: '16px auto',
          padding: '10px 18px',
          background: 'rgba(0,0,0,0.72)',
          color: color,
          borderRadius: 999,
          fontWeight: 600,
          fontSize: 16,
          border: `1px solid ${color}`,
          transition: 'color 180ms, border-color 180ms',
        }}
      >
        {state.message}
        {state.fillRatio > 0 && (
          <span style={{ opacity: 0.6, marginLeft: 8, fontWeight: 400, fontSize: 13 }}>
            {Math.round(state.fillRatio * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}