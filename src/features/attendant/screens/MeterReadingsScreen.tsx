/**
 * Opening/Closing meter readings screen.
 * Works for both opening (Step 2 of Start Shift) and closing (before End Shift).
 */

import React, { useEffect, useState } from 'react'
import { Gauge } from 'lucide-react'
import { ScreenHeader } from '../ui'
import { FUEL_META, MAX_METER_READING, PRODUCTION_PUMPS } from '../../../core/domain/config'
import type { FuelCode, MeterReading } from '../../../core/domain/types'

interface Props {
  pumpId: string
  mode: 'opening' | 'closing'
  onSave: (readings: MeterReading[]) => void
  onBack: () => void
}

export const MeterReadingsScreen: React.FC<Props> = ({ pumpId, mode, onSave, onBack }) => {
  const pump = PRODUCTION_PUMPS.find(p => p.id === pumpId) ?? PRODUCTION_PUMPS[0]
  const [values, setValues] = useState<Record<FuelCode, string>>(() =>
    Object.fromEntries(pump.fuels.map(f => [f, ''])) as Record<FuelCode, string>,
  )
  const [errors, setErrors] = useState<Partial<Record<FuelCode, string>>>({})

  useEffect(() => {
    setValues(Object.fromEntries(pump.fuels.map(f => [f, ''])) as Record<FuelCode, string>)
    setErrors({})
  }, [pumpId, pump])

  const parse = (v: string): number => Number(v.replace(/,/g, '')) || 0

  const validate = (): boolean => {
    const next: Partial<Record<FuelCode, string>> = {}
    for (const fuel of pump.fuels) {
      const raw = values[fuel]
      if (!raw || raw.trim() === '') {
        next[fuel] = 'Required'
      } else {
        const val = parse(raw)
        if (!Number.isFinite(val) || val < 0) next[fuel] = 'Must be ≥ 0'
        else if (val > MAX_METER_READING) next[fuel] = 'Implausible value'
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = () => {
    if (!validate()) return
    const readings: MeterReading[] = pump.fuels.map(fuel => ({
      fuelCode: fuel,
      value: Math.round(parse(values[fuel]) * 100) / 100,
    }))
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
            Read the figures shown on each {mode === 'opening' ? 'meter before' : 'meter at the end of'} your shift and enter them
            below. These lock in your sales calculation.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {pump.fuels.map(fuel => (
            <div key={fuel} className="flex items-center gap-3">
              <span
                className="w-14 shrink-0 rounded-lg px-2 py-1 text-center text-[10px] font-black text-white uppercase"
                style={{ backgroundColor: FUEL_META[fuel].color }}
              >
                {fuel}
              </span>
              <div className="flex-1 max-w-[220px]">
                <input
                  value={values[fuel]}
                  onChange={e => {
                    const sanitized = e.target.value.replace(/[^0-9.,]/g, '')
                    setValues(prev => ({ ...prev, [fuel]: sanitized }))
                    setErrors(prev => ({ ...prev, [fuel]: undefined }))
                  }}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`w-full rounded-xl bg-slate-900 border px-4 py-3 text-right font-mono text-white placeholder:text-slate-700 outline-none transition ${
                    errors[fuel] ? 'border-rose-500' : 'border-slate-800 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'
                  }`}
                />
              </div>
              {errors[fuel] && <span className="text-[10px] font-bold text-rose-400 w-16">{errors[fuel]}</span>}
            </div>
          ))}
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