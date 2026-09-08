/**
 * Start Shift — step 1: choose the pump the attendant will operate.
 * Opening readings are captured on the next screen.
 */

import React, { useState } from 'react'
import { Fuel, CheckCircle2 } from 'lucide-react'
import { Card, ScreenHeader } from '../ui'
import { PRODUCTION_PUMPS } from '../../../core/domain/config'
import { useAttendantSession } from '../providers'

export const StartShiftScreen: React.FC<{ onNext: (pumpId: string) => void; onBack: () => void }> = ({ onNext, onBack }) => {
  const { attendant } = useAttendantSession()
  const [selected, setSelected] = useState<string | null>(attendant?.pumpId ?? null)

  return (
    <div className="h-full flex flex-col bg-[#090d16]">
      <ScreenHeader title="Start Shift" subtitle="Step 1 of 3 — choose your pump" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 max-w-md w-full mx-auto">
        <p className="text-xs text-slate-400 leading-relaxed">
          Confirm the pump assigned to you. The opening meter readings for this pump are captured next.
        </p>

        {PRODUCTION_PUMPS.map(pump => {
          const active = selected === pump.id
          return (
            <button
              key={pump.id}
              onClick={() => setSelected(pump.id)}
              className={`rounded-2xl border transition p-4 text-left flex items-center gap-3 ${
                active
                  ? 'bg-orange-500/10 border-orange-500 ring-2 ring-orange-500/20 shadow-md shadow-orange-950/30'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  active ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md' : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Fuel className="w-5 h-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-extrabold text-white">{pump.name}</span>
                <span className="block text-[11px] text-slate-400 font-mono uppercase tracking-wide">
                  {pump.fuels.join(' · ')}
                </span>
              </span>
              {active && <CheckCircle2 className="w-5 h-5 text-orange-400" />}
            </button>
          )
        })}

        <Card className="p-3.5 mt-1 border-slate-800/80">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Assigned</p>
          <p className="text-xs text-slate-300">
            You are signed in as <span className="font-bold text-white">{attendant?.fullName}</span> ({attendant?.employeeCode})
          </p>
        </Card>

        <button
          onClick={() => selected && onNext(selected)}
          disabled={!selected}
          className="sticky bottom-0 mt-auto w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3.5 text-sm font-extrabold transition active:scale-[0.98] shadow-lg shadow-orange-950/50 border border-orange-400/30"
        >
          Continue to Opening Readings
        </button>
      </div>
    </div>
  )
}