/**
 * Supervisor settings — device info, demo reset and sign out.
 */

import React, { useState } from 'react'
import { Database, LogOut, RotateCcw, ShieldAlert } from 'lucide-react'
import { useSupervisorSession } from '../providers'
import { resetProductionData } from '../../../core/infra/db'
import { syncQueueRepo } from '../../../core/infra/repositories'
import { Card, ScreenHeader, StatusBar, TappableRow } from '../../shared/ui'

export const SupervisorSettingsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { supervisor, signOut } = useSupervisorSession()
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  const handleReset = async () => {
    setResetError(null)

    // Count what is about to be destroyed. On an offline terminal the local
    // database is the only copy of unsynced sales, so this must never be a
    // single unconfirmed tap.
    const [pending, deadLettered, shifts, transactions] = await Promise.all([
      syncQueueRepo.getCount(),
      syncQueueRepo.getDeadLettered(),
      prodDbShiftCount(),
      prodDbTransactionCount(),
    ])

    const confirmed = window.confirm(
      'This permanently erases local forecourt data from this device.\n\n' +
      `  ${shifts} shift(s)\n` +
      `  ${transactions} sale(s)\n` +
      `  ${pending} record(s) still waiting to upload\n` +
      (deadLettered.length > 0 ? `  ${deadLettered.length} stuck record(s)\n` : '') +
      '\n' +
      'The audit log is deleted too — it is not append-only on this device.\n\n' +
      (pending > 0 || deadLettered.length > 0
        ? 'WARNING: anything not yet uploaded exists ONLY here. Confirm the station is online, or export first.\n\n'
        : '') +
      'This cannot be undone. Continue?',
    )
    if (!confirmed) return

    // A second gate, because the consequence is unrecoverable data loss.
    const typed = window.prompt('Type RESET to confirm erasing local forecourt data:')
    if (typed !== 'RESET') return

    setResetting(true)
    try {
      await resetProductionData()
      window.location.reload()
    } catch (err) {
      // Previously there was no .catch() at all, so a failed reset silently
      // reloaded the page and left the operator thinking it had worked.
      setResetting(false)
      setResetError(err instanceof Error ? err.message : 'Reset failed. Local data was not cleared.')
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <ScreenHeader title="Settings" subtitle="PetroView · Supervisor Console" onBack={onBack} />

      <div className="flex-1 px-4 py-4 max-w-4xl w-full mx-auto flex flex-col gap-4">
        <Card className="divide-y divide-slate-800/70 overflow-hidden">
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase font-bold text-slate-500">Signed in as</p>
            <p className="text-sm font-extrabold text-white mt-1">{supervisor?.fullName}</p>
            <p className="text-[11px] font-mono text-orange-400">{supervisor?.employeeCode}</p>
          </div>
        </Card>

        {resetError && (
          <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3 py-2.5 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-rose-200">{resetError}</p>
          </div>
        )}

        <Card className="divide-y divide-slate-800/70 overflow-hidden">
          <TappableRow
            icon={<Database className="w-4 h-4" />}
            title="Production database"
            subtitle="PetroViewProductionDB · local-first"
            value="v2.0"
            accent="#F97316"
          />
          <TappableRow
            icon={<RotateCcw className="w-4 h-4" />}
            title={resetting ? 'Clearing…' : 'Erase local forecourt data'}
            subtitle="Destroys shifts, sales, audit log and unsynced records on this device"
            onClick={() => void handleReset()}
            accent="#f59e0b"
          />
          <TappableRow
            icon={<LogOut className="w-4 h-4" />}
            title="Sign out"
            subtitle="End this session"
            value="SUP"
            onClick={() => void signOut()}
            accent="#f43f5e"
          />
        </Card>

        <p className="text-center text-[10px] text-slate-500">
          PetroView Forecourt Operating System · Suite v2.0
        </p>
      </div>
    </div>
  )
}

async function prodDbShiftCount(): Promise<number> {
  const { prodDb } = await import('../../../core/infra/db')
  return prodDb.shifts.count()
}

async function prodDbTransactionCount(): Promise<number> {
  const { prodDb } = await import('../../../core/infra/db')
  return prodDb.transactions.count()
}
