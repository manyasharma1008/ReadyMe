/**
 * ErrorMessage Component
 * Displays error messages with user-friendly text
 */

import { ApiError } from '../../api'

/**
 * ErrorMessage component
 *
 * @param {Object} props
 * @param {Error} props.error - The error object
 * @param {string} props.title - Optional title override
 * @param {Function} props.onRetry - Optional retry callback
 * @param {Function} props.onDismiss - Optional dismiss callback
 * @param {string} props.variant - 'error' | 'warning' | 'info'
 */
export default function ErrorMessage({
  error,
  title,
  onRetry,
  onDismiss,
  variant = 'error',
  className = '',
}) {
  // Get user-friendly message
  const getMessage = () => {
    if (!error) return 'An unknown error occurred'

    if (error instanceof ApiError) {
      return error.getUserFriendlyMessage()
    }

    return error.message || 'An unexpected error occurred'
  }

  // Variant styles
  const variantStyles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }

  // Icon colors
  const iconColors = {
    error: 'text-red-500',
    warning: 'text-yellow-500',
    info: 'text-blue-500',
  }

  return (
    <div
      className={`rounded-lg border p-4 ${variantStyles[variant]} ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={iconColors[variant]}>
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            {variant === 'error' ? (
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            ) : (
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            )}
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1">
          {title && (
            <h4 className="font-medium mb-1">{title}</h4>
          )}
          <p className="text-sm">{getMessage()}</p>

          {/* Actions */}
          {(onRetry || onDismiss) && (
            <div className="mt-3 flex gap-3">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-sm font-medium underline hover:no-underline focus:outline-none"
                >
                  Try again
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={onDismiss}
                  className="text-sm font-medium underline hover:no-underline focus:outline-none"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Inline error message for form fields
 */
export function FieldError({ error, className = '' }) {
  if (!error) return null

  const message = error instanceof ApiError
    ? error.getUserFriendlyMessage()
    : error.message || String(error)

  return (
    <p className={`text-sm text-red-600 mt-1 ${className}`}>
      {message}
    </p>
  )
}