/**
 * Supervisor settings — device info, demo reset and sign out.
 */

import React from 'react'
import { Database, LogOut, RotateCcw } from 'lucide-react'
import { useSupervisorSession } from '../providers'
import { resetProductionData } from '../../../core/infra/db'
import { Card, ScreenHeader, StatusBar, TappableRow } from '../../shared/ui'

export const SupervisorSettingsScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { supervisor, signOut } = useSupervisorSession()

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <ScreenHeader title="Settings" subtitle="PetroView · Supervisor Console" onBack={onBack} />

      <div className="flex-1 px-4 py-4 max-w-md w-full mx-auto flex flex-col gap-4">
        <Card className="divide-y divide-slate-800/70 overflow-hidden">
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase font-bold text-slate-500">Signed in as</p>
            <p className="text-sm font-extrabold text-white mt-1">{supervisor?.fullName}</p>
            <p className="text-[11px] font-mono text-orange-400">{supervisor?.employeeCode}</p>
          </div>
        </Card>

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
            title="Reset demo data"
            subtitle="Clear production DB and re-seed"
            onClick={() => {
              void resetProductionData().then(() => window.location.reload())
            }}
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