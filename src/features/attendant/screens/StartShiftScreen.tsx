import React, { useEffect, useMemo, useState } from 'react'
import { Fuel, CheckCircle2, RefreshCw, Droplets, Check } from 'lucide-react'
import { Card, ScreenHeader } from '../ui'
import {
  PRODUCTION_PUMPS,
  getStationPumps,
  registerStationPumps,
  deriveNozzlesForPump,
  FUEL_META,
  type ProductionPumpConfig,
} from '../../../core/domain/config'
import { useAttendantSession } from '../providers'
import { backendGetPumps } from '../../../services/backendApiService'

export const StartShiftScreen: React.FC<{
  onNext: (pumpId: string, nozzleIndices: number[]) => void
  onBack: () => void
}> = ({ onNext, onBack }) => {
  const { attendant } = useAttendantSession()
  const [pumps, setPumps] = useState<ProductionPumpConfig[]>(() => getStationPumps(attendant?.stationId))
  const [selected, setSelected] = useState<string | null>(attendant?.pumpId ?? null)
  const [loadingPumps, setLoadingPumps] = useState(false)

  useEffect(() => {
    let cancelled = false
    const loadPumps = async () => {
      setLoadingPumps(true)
      try {
        const res = await backendGetPumps(attendant?.stationId, attendant?.companyId)
        if (!cancelled && res?.pumps && res.pumps.length > 0) {
          const mapped: ProductionPumpConfig[] = res.pumps.map(p => ({
            id: p.id,
            name: p.name,
            fuels: p.fuels as any,
            nozzles: (p as any).nozzles,
          }))
          if (attendant?.stationId) {
            registerStationPumps(attendant.stationId, mapped)
          }
          setPumps(mapped)
          if (!selected && mapped.length > 0) {
            setSelected(attendant?.pumpId || mapped[0].id)
          }
        }
      } catch {
        // fallback to local station pumps
        if (!cancelled) {
          const fallback = getStationPumps(attendant?.stationId)
          setPumps(fallback)
        }
      } finally {
        if (!cancelled) setLoadingPumps(false)
      }
    }
    void loadPumps()
    return () => { cancelled = true }
  }, [attendant?.stationId, attendant?.companyId])

  const selectedPump = useMemo(() => {
    return pumps.find(p => p.id === selected) || pumps[0]
  }, [pumps, selected])

  const availableNozzles = useMemo(() => {
    if (!selectedPump) return []
    return deriveNozzlesForPump(selectedPump)
  }, [selectedPump])

  const [selectedNozzleIndices, setSelectedNozzleIndices] = useState<number[]>([])

  // Reset selected nozzles when selected pump changes
  useEffect(() => {
    if (availableNozzles.length > 0) {
      setSelectedNozzleIndices(availableNozzles.map(n => n.nozzleIndex))
    }
  }, [selected, availableNozzles])

  const toggleNozzle = (nozzleIndex: number) => {
    setSelectedNozzleIndices(prev => {
      if (prev.includes(nozzleIndex)) {
        if (prev.length === 1) return prev // keep at least 1 nozzle selected
        return prev.filter(x => x !== nozzleIndex)
      }
      return [...prev, nozzleIndex].sort((a, b) => a - b)
    })
  }

  const selectAllNozzles = () => {
    setSelectedNozzleIndices(availableNozzles.map(n => n.nozzleIndex))
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16]">
      <ScreenHeader title="Start Shift" subtitle="Step 1 of 3 — Choose pump & nozzle" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 max-w-md w-full mx-auto">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400 leading-relaxed">
            Select your assigned dispenser pump and operating nozzle(s) before opening shift.
          </p>
          {loadingPumps && <RefreshCw className="w-3.5 h-3.5 text-orange-400 animate-spin shrink-0 ml-2" />}
        </div>

        {/* 1. Pump Selection */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">1. Select Dispenser Pump</p>
          <div className="flex flex-col gap-2">
            {pumps.map(pump => {
              const active = selected === pump.id
              return (
                <button
                  key={pump.id}
                  onClick={() => setSelected(pump.id)}
                  className={`rounded-2xl border transition p-3.5 text-left flex items-center gap-3 ${
                    active
                      ? 'bg-orange-500/10 border-orange-500 ring-2 ring-orange-500/20 shadow-md shadow-orange-950/30'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
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
          </div>
        </div>

        {/* 2. Nozzle Selection */}
        {selectedPump && availableNozzles.length > 0 && (
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col gap-3 shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5" /> 2. Select Assigned Nozzle(s)
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Operating with a partner? Tap to select only your side.
                </p>
              </div>
              {availableNozzles.length > 1 && (
                <button
                  type="button"
                  onClick={selectAllNozzles}
                  className="text-[10px] font-bold text-orange-400 hover:text-orange-300 px-2 py-1 rounded bg-slate-800 border border-slate-700/80 transition shrink-0"
                >
                  Select All
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {availableNozzles.map(noz => {
                const isChecked = selectedNozzleIndices.includes(noz.nozzleIndex)
                const fuelColor = FUEL_META[noz.fuelCode]?.color || '#F97316'
                return (
                  <button
                    key={noz.id || noz.nozzleIndex}
                    type="button"
                    onClick={() => toggleNozzle(noz.nozzleIndex)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition text-left ${
                      isChecked
                        ? 'bg-orange-500/10 border-orange-500 ring-1 ring-orange-500/30'
                        : 'bg-slate-950 border-slate-800/80 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black transition ${
                          isChecked ? 'bg-orange-500 text-white shadow-sm' : 'border border-slate-700 bg-slate-800 text-slate-400'
                        }`}
                      >
                        {isChecked ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : noz.nozzleIndex}
                      </div>
                      <div>
                        <span className="text-xs font-extrabold text-white block">
                          {noz.name}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Nozzle #{noz.nozzleIndex}
                        </span>
                      </div>
                    </div>

                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-black text-white uppercase shadow-sm"
                      style={{ backgroundColor: fuelColor }}
                    >
                      {noz.fuelCode}
                    </span>
                  </button>
                )
              })}
            </div>

            {selectedNozzleIndices.length === 0 && (
              <p className="text-[11px] font-bold text-rose-400">Please select at least one nozzle.</p>
            )}
          </div>
        )}

        <Card className="p-3.5 border-slate-800/80">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Signed In Attendant</p>
          <p className="text-xs text-slate-300">
            <span className="font-bold text-white">{attendant?.fullName}</span> ({attendant?.employeeCode})
          </p>
        </Card>

        <button
          onClick={() => selected && selectedNozzleIndices.length > 0 && onNext(selected, selectedNozzleIndices)}
          disabled={!selected || selectedNozzleIndices.length === 0}
          className="sticky bottom-0 mt-auto w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3.5 text-sm font-extrabold transition active:scale-[0.98] shadow-lg shadow-orange-950/50 border border-orange-400/30"
        >
          {selectedNozzleIndices.length > 0
            ? `Continue to Opening Readings (${selectedNozzleIndices.length} Nozzle${selectedNozzleIndices.length > 1 ? 's' : ''})`
            : 'Select a Nozzle to Continue'}
        </button>
      </div>
    </div>
  )
}