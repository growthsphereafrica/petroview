/**
 * Opening/Closing meter readings screen.
 * Works for both opening (Step 2 of Start Shift) and closing (before End Shift).
 */

import React, { useEffect, useState } from 'react'
import { CheckCircle2, Gauge, Sparkles } from 'lucide-react'
import { ScreenHeader } from '../ui'
import { FUEL_META, MAX_METER_READING, PRODUCTION_PUMPS, findPumpByIdOrName, getStationPumps, registerStationPumps } from '../../../core/domain/config'
import { shiftRepo } from '../../../core/infra/repositories'
import type { FuelCode, MeterReading } from '../../../core/domain/types'

interface Props {
  pumpId: string
  stationId?: string
  mode: 'opening' | 'closing'
  onSave: (readings: MeterReading[]) => void
  onBack: () => void
}

export const MeterReadingsScreen: React.FC<Props> = ({ pumpId, stationId, mode, onSave, onBack }) => {
  const [stationPumps, setStationPumps] = useState(() => getStationPumps(stationId))
  const pump = findPumpByIdOrName(stationPumps, pumpId) ??
    findPumpByIdOrName(getStationPumps(stationId), pumpId) ??
    PRODUCTION_PUMPS.find(p => p.id === pumpId) ??
    PRODUCTION_PUMPS[0]

  useEffect(() => {
    let cancelled = false
    if (stationId) {
      import('../../../services/backendApiService').then(async ({ backendGetPumps }) => {
        try {
          const res = await backendGetPumps(stationId)
          if (!cancelled && res?.pumps && res.pumps.length > 0) {
            const mapped = res.pumps.map(p => ({
              id: p.id,
              name: p.name,
              fuels: p.fuels as any,
            }))
            registerStationPumps(stationId, mapped)
            setStationPumps(mapped)
          }
        } catch { /* offline */ }
      })
    }
    return () => { cancelled = true }
  }, [stationId])

  // Safe fuel meta lookup — custom OMC products may not be in the static FUEL_META map
  const getFuelColor = (fuel: string) => FUEL_META[fuel]?.color ?? '#F97316'
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(pump.fuels.map((_, i) => [i, ''])),
  )

  useEffect(() => {
    setValues(prev => {
      const next: Record<number, string> = {}
      pump.fuels.forEach((_, i) => {
        next[i] = prev[i] ?? ''
      })
      return next
    })
  }, [pump.id, pump.fuels.join(',')])
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [autoFilledShift, setAutoFilledShift] = useState<string | null>(null)
  const [loadingDefaults, setLoadingDefaults] = useState(mode === 'opening')

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const initial: Record<number, string> = Object.fromEntries(pump.fuels.map((_, i) => [i, '']))
      if (mode === 'opening') {
        setLoadingDefaults(true)
        try {
          const allShifts = await shiftRepo.listAll()
          // Find the most recent closed shift for this pump that has closing readings
          const prevShifts = allShifts.filter(
            s =>
              (s.pumpId === pumpId || (s.pumpName && pump.name && s.pumpName === pump.name)) &&
              s.closingReadings &&
              s.closingReadings.length > 0 &&
              (s.status === 'CLOSED' || s.status === 'APPROVED' || s.status === 'REJECTED'),
          )
          const latestClosed = prevShifts.sort((a, b) =>
            new Date(b.closedAt || b.openedAt).getTime() - new Date(a.closedAt || a.openedAt).getTime(),
          )[0]

          if (!cancelled && latestClosed && latestClosed.closingReadings?.length) {
            let filledCount = 0
            for (let i = 0; i < pump.fuels.length; i++) {
              const expectedFuel = pump.fuels[i]
              // Find matching reading by nozzleIndex or position
              const match =
                latestClosed.closingReadings.find(r => r.nozzleIndex === i + 1 && r.fuelCode === expectedFuel) ||
                (latestClosed.closingReadings[i]?.fuelCode === expectedFuel ? latestClosed.closingReadings[i] : undefined) ||
                latestClosed.closingReadings.find(r => r.fuelCode === expectedFuel)
              if (match && match.value > 0) {
                initial[i] = String(match.value)
                filledCount += 1
              }
            }
            if (filledCount > 0) {
              setAutoFilledShift(latestClosed.number || latestClosed.id)
            }
          }
        } catch {
          // fallback to blank for manual first-time entry
        } finally {
          if (!cancelled) setLoadingDefaults(false)
        }
      }
      if (!cancelled) {
        setValues(initial)
        setErrors({})
      }
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [pumpId, pump, mode])

  const parse = (v: string): number => Number(v.replace(/,/g, '')) || 0

  const validate = (): boolean => {
    const next: Record<number, string> = {}
    for (let i = 0; i < pump.fuels.length; i++) {
      const raw = values[i]
      if (!raw || raw.trim() === '') {
        next[i] = 'Required'
      } else {
        const val = parse(raw)
        if (!Number.isFinite(val) || val < 0) next[i] = 'Must be ≥ 0'
        else if (val > MAX_METER_READING) next[i] = 'Implausible value'
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = () => {
    if (!validate()) return
    const readings: MeterReading[] = pump.fuels.map((fuel, index) => {
      const sideLabel = pump.fuels.length === 2
        ? (index === 0 ? 'Side 1' : 'Side 2')
        : `Nozzle ${index + 1}`
      return {
        fuelCode: fuel,
        value: Math.round(parse(values[index]) * 100) / 100,
        nozzleIndex: index + 1,
        nozzleLabel: `${sideLabel} (${fuel})`,
      }
    })
    onSave(readings)
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16]">
      <ScreenHeader
        title={mode === 'opening' ? 'Opening Meter Readings' : 'Closing Meter Readings'}
        subtitle={`${pump.name} · Step ${mode === 'opening' ? '2' : '3'} of 3`}
        onBack={onBack}
      />
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 max-w-md w-full mx-auto">
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 flex items-center gap-3">
          <Gauge className="w-5 h-5 text-orange-400 shrink-0" />
          <p className="text-[11px] text-slate-400 leading-snug">
            {mode === 'opening'
              ? 'Opening meters are automatically carried from the previous closing stock. Verify the figures for each nozzle before starting.'
              : 'Read the figures shown on each meter at the end of your shift and enter them below. These lock in your sales calculation.'}
          </p>
        </div>

        {autoFilledShift && mode === 'opening' && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 flex items-center gap-2.5 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-[11px] text-emerald-300 font-medium">
              Opening stock auto-filled from closing readings of Shift{' '}
              <span className="font-bold text-white">{autoFilledShift}</span>.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {pump.fuels.map((fuel, index) => {
            const sideLabel = pump.fuels.length === 2
              ? (index === 0 ? 'Side 1' : 'Side 2')
              : `Nozzle ${index + 1}`
            return (
              <div
                key={`${fuel}-${index}`}
                className="flex flex-col gap-2 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2.5 py-1 rounded-lg text-center text-[10px] font-black text-white uppercase"
                      style={{ backgroundColor: getFuelColor(fuel) }}
                    >
                      {fuel}
                    </span>
                    <span className="text-xs font-bold text-white">
                      {FUEL_META[fuel]?.label || fuel}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-950 text-orange-400 border border-slate-800">
                    {sideLabel}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    value={values[index] ?? ''}
                    onChange={e => {
                      const sanitized = e.target.value.replace(/[^0-9.,]/g, '')
                      setValues(prev => ({ ...prev, [index]: sanitized }))
                      setErrors(prev => {
                        const copy = { ...prev }
                        delete copy[index]
                        return copy
                      })
                    }}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={`flex-1 rounded-xl bg-slate-950 border px-3.5 py-2.5 text-right font-mono text-sm text-white placeholder:text-slate-700 outline-none transition ${
                      errors[index] ? 'border-rose-500' : 'border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20'
                    }`}
                  />
                  <span className="text-xs font-mono font-bold text-slate-500">L</span>
                </div>
                {errors[index] && <span className="text-[10px] font-bold text-rose-400">{errors[index]}</span>}
              </div>
            )
          })}
        </div>

        <button
          onClick={submit}
          className="mt-auto sticky bottom-0 w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-3.5 text-sm font-extrabold transition active:scale-[0.98] shadow-lg shadow-orange-950/50 border border-orange-400/30"
        >
          {mode === 'opening' ? 'Save Opening Readings & Start Shift' : 'Confirm & Close Shift'}
        </button>
      </div>
    </div>
  )
}