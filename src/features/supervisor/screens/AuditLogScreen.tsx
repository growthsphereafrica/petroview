/**
 * Audit log — immutable record of all supervisor & system actions.
 */

import React from 'react'
import { History } from 'lucide-react'
import { useSupervisorData } from '../providers'
import { Card, ScreenHeader, StatusBar } from '../../shared/ui'
import { formatDateTime } from '../../../utils/currencyFormatter'
import type { AuditAction } from '../../../core/domain/types'

const ACTION_LABELS: Record<AuditAction, string> = {
  REVIEW_APPROVED: 'Shift Approved',
  REJECTED: 'Shift Rejected',
  PIN_RESET: 'PIN Reset',
  ATTENDANT_REGISTERED: 'Attendant Registered',
  ATTENDANT_DEACTIVATED: 'Attendant Deactivated',
  SHIFT_OPENED: 'Shift Opened',
  SHIFT_CLOSED: 'Shift Closed',
}

const ACTION_TONE: Record<AuditAction, string> = {
  REVIEW_APPROVED: 'text-emerald-400',
  REJECTED: 'text-rose-400',
  PIN_RESET: 'text-amber-400',
  ATTENDANT_REGISTERED: 'text-blue-400',
  ATTENDANT_DEACTIVATED: 'text-rose-400',
  SHIFT_OPENED: 'text-emerald-400',
  SHIFT_CLOSED: 'text-emerald-400',
}

export const SupervisorAuditLogScreen: React.FC<{
  onBack: () => void
}> = ({ onBack }) => {
  const { auditLog } = useSupervisorData()

  return (
    <div className="h-full flex flex-col bg-slate-950 overflow-y-auto">
      <StatusBar online />
      <ScreenHeader title="Audit Trail" subtitle={`${auditLog.length} recorded actions`} onBack={onBack} />

      <div className="flex-1 px-4 py-4 max-w-md w-full mx-auto">
        {auditLog.length === 0 ? (
          <Card className="p-6 text-center">
            <History className="w-6 h-6 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-400">No audit records yet</p>
            <p className="text-[11px] text-slate-600 mt-1">Reviews, PIN resets, and registrations will appear here.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {auditLog.map(entry => (
              <div key={entry.id} className="px-4 py-3 flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <span className={`block text-[10px] font-black uppercase ${ACTION_TONE[entry.action]}`}>
                    {ACTION_LABELS[entry.action]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-white truncate">{entry.targetDescription}</p>
                  <p className="text-[10px] text-slate-500">
                    {entry.actorName} · {entry.actorRole} · {formatDateTime(entry.timestamp)}
                  </p>
                  {entry.notes && (
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">{entry.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}