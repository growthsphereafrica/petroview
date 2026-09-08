import type { ShiftStatus } from '../../core/domain/types'

export function shiftStatusTone(status: ShiftStatus): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'APPROVED':
      return 'success'
    case 'REJECTED':
      return 'danger'
    case 'CLOSED':
      return 'warning'
    default:
      return 'info'
  }
}

export function shiftStatusLabel(status: ShiftStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Open'
    case 'CLOSED':
      return 'Awaiting Review'
    case 'APPROVED':
      return 'Approved'
    case 'REJECTED':
      return 'Rejected'
    default:
      return status
  }
}