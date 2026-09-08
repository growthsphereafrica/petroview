/**
 * Typed domain errors with machine-readable codes for production error handling.
 */

export type DomainErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_ACCOUNT_DISABLED'
  | 'AUTH_ACCOUNT_LOCKED'
  | 'AUTH_SESSION_EXPIRED'
  | 'SHIFT_NOT_OPEN'
  | 'SHIFT_ALREADY_EXISTS'
  | 'SHIFT_ALREADY_CLOSED'
  | 'SHIFT_NOT_FOUND'
  | 'READINGS_EMPTY'
  | 'READING_NEGATIVE'
  | 'READING_OUT_OF_RANGE'
  | 'CLOSING_BELOW_OPENING'
  | 'SALE_ZERO_LITRES'
  | 'SALE_AMOUNT_MISMATCH'
  | 'RECEIPT_INVALID_IMAGE'
  | 'SYNC_UPLOAD_FAILED'
  | 'SHIFT_NOT_REVIEWABLE'
  | 'ATTENDANT_CODE_EXISTS'
  | 'ATTENDANT_NOT_FOUND'
  | 'UNKNOWN'

export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly field?: string
  readonly details?: Record<string, unknown>

  constructor(code: DomainErrorCode, message: string, field?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.field = field
    this.details = details
  }

  static toDomainError(err: unknown): DomainError {
    if (err instanceof DomainError) return err
    if (err instanceof Error) {
      return new DomainError('UNKNOWN', err.message)
    }
    return new DomainError('UNKNOWN', 'An unexpected error occurred')
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError
}

/** User-friendly summary of a domain error, safe to show in toast/UI. */
export function describeError(err: unknown): string {
  if (!isDomainError(err)) {
    return err instanceof Error ? err.message : 'An unexpected error occurred'
  }
  switch (err.code) {
    case 'AUTH_INVALID_CREDENTIALS':
      return 'Invalid employee code or PIN. Please try again.'
    case 'AUTH_ACCOUNT_DISABLED':
      return 'This account has been deactivated. Contact your supervisor.'
    case 'AUTH_ACCOUNT_LOCKED':
      return `Account locked for security. Try again after ${new Date(err.details?.lockoutUntil as string).toLocaleTimeString()}.`
    case 'AUTH_SESSION_EXPIRED':
      return 'Your session has expired. Please sign in again.'
    case 'SHIFT_NOT_OPEN':
      return 'No open shift found. Start a shift first.'
    case 'SHIFT_ALREADY_EXISTS':
      return 'A shift is already open for this attendant on this pump.'
    case 'SHIFT_ALREADY_CLOSED':
      return 'This shift has already been closed.'
    case 'SHIFT_NOT_FOUND':
      return 'Shift not found.'
    case 'READINGS_EMPTY':
      return 'Meter readings are required before continuing.'
    case 'READING_NEGATIVE':
      return 'Meter readings cannot be negative.'
    case 'CLOSING_BELOW_OPENING':
      return `Closing reading for ${err.field} must not be lower than opening reading.`
    case 'SALE_ZERO_LITRES':
      return 'Enter a sale volume greater than zero.'
    case 'SALE_AMOUNT_MISMATCH':
      return 'The sale amount does not match the fuel price at pump.'
    case 'RECEIPT_INVALID_IMAGE':
      return 'The captured receipt image is invalid.'
    case 'SYNC_UPLOAD_FAILED':
      return 'Sync upload failed. The record is safe — it will retry.'
    case 'SHIFT_NOT_REVIEWABLE':
      return 'Only closed shifts can be reviewed.'
    case 'ATTENDANT_CODE_EXISTS':
      return 'An attendant with this employee code is already registered.'
    case 'ATTENDANT_NOT_FOUND':
      return 'Attendant not found.'
    default:
      return err.message || 'An unexpected error occurred'
  }
}