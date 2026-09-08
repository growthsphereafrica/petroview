/**
 * Formats an amount in Ghanaian Cedis (GHS).
 * Examples:
 * 5620.5 -> "GHS 5,620.50"
 * -60.5 -> "GHS (60.50)"
 */
export function formatGHS(amount: number, options?: { showSign?: boolean; noPrefix?: boolean }): string {
  const num = Number(amount) || 0
  const isNegative = num < 0
  const absVal = Math.abs(num)
  const formattedNumber = absVal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  if (options?.noPrefix) {
    return isNegative ? `(${formattedNumber})` : formattedNumber
  }

  if (isNegative) {
    return `GHS (${formattedNumber})`
  }
  return `GHS ${formattedNumber}`
}

export function formatLitres(litres: number): string {
  const num = Number(litres) || 0
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatDateTime(isoStringOrTimestamp: string | number | Date): string {
  if (!isoStringOrTimestamp) return '—'
  const date = new Date(isoStringOrTimestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTimeOnly(isoStringOrTimestamp: string | number | Date): string {
  if (!isoStringOrTimestamp) return '—'
  const date = new Date(isoStringOrTimestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
