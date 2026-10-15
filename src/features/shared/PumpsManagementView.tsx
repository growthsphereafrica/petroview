import React, { useEffect, useState, useMemo } from 'react'
import {
  Fuel,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Check,
  X,
  Layers,
  Sparkles,
  Tag,
} from 'lucide-react'
import { Card, Badge } from './ui'
import {
  backendGetPumps,
  backendCreatePump,
  backendUpdatePump,
  backendDeletePump,
  backendDeleteNozzle,
  type BackendPump,
} from '../../services/backendApiService'
import { registerStationPumps, deriveNozzlesForPump, type ProductionPumpConfig } from '../../core/domain/config'
import type { CompanyStation, Product } from '../../core/domain/types'

interface Props {
  companyId?: string
  companyName?: string
  stations: Array<CompanyStation | { id: string; name: string; code?: string }>
  availableProducts?: Product[]
  isSuperAdmin?: boolean
  userRole?: 'supervisor' | 'headoffice' | 'superadmin'
  userStationId?: string
}

export const PumpsManagementView: React.FC<Props> = ({
  companyId,
  companyName = 'OMC',
  stations,
  availableProducts = [],
  isSuperAdmin = false,
  userRole,
  userStationId,
}) => {
  const isStationSupervisor = userRole === 'supervisor' || Boolean(userStationId && userRole !== 'headoffice' && userRole !== 'superadmin')
  const defaultStationId = userStationId || (stations.length > 0 ? stations[0].id : '')
  const [selectedStationId, setSelectedStationId] = useState<string>(defaultStationId)
  const [pumps, setPumps] = useState<BackendPump[]>([])
  const [loading, setLoading] = useState(false)
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Add Pump Modal
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newPumpName, setNewPumpName] = useState('')
  const [newPumpFuels, setNewPumpFuels] = useState<string[]>(['PMS', 'PMS'])
  const [addSaving, setAddSaving] = useState(false)

  // Edit Pump Modal
  const [editingPump, setEditingPump] = useState<BackendPump | null>(null)
  const [editPumpName, setEditPumpName] = useState('')
  const [editPumpFuels, setEditPumpFuels] = useState<string[]>([])
  const [editPumpActive, setEditPumpActive] = useState(true)
  const [editSaving, setEditSaving] = useState(false)

  // Edit Nozzle Modal
  const [editingNozzle, setEditingNozzle] = useState<{
    pump: BackendPump
    fuelCode: string
    index: number
    nozzleIndex: number
    id?: string
    name: string
  } | null>(null)
  const [editNozzleName, setEditNozzleName] = useState('')
  const [editNozzleFuelCode, setEditNozzleFuelCode] = useState('')
  const [savingNozzle, setSavingNozzle] = useState(false)

  // Add Individual Nozzle Modal
  const [addingNozzlePump, setAddingNozzlePump] = useState<BackendPump | null>(null)
  const [newNozzleName, setNewNozzleName] = useState('')
  const [newNozzleFuelName, setNewNozzleFuelName] = useState('')
  const [savingNewNozzle, setSavingNewNozzle] = useState(false)

  // Fallback fuel codes
  const fuelOptions = useMemo(() => {
    if (availableProducts && availableProducts.length > 0) {
      const fuels = availableProducts.filter(p => p.category === 'FUEL' && p.active)
      if (fuels.length > 0) {
        return fuels.map(p => ({ code: p.code, name: p.name, color: p.color || '#F97316' }))
      }
    }
    return [
      { code: 'PMS', name: 'Super Unleaded (PMS)', color: '#22c55e' },
      { code: 'AGO', name: 'Diesel (AGO)', color: '#3b82f6' },
      { code: 'DPK', name: 'Kerosene (DPK)', color: '#eab308' },
      { code: 'KERO', name: 'Aviation / Kero', color: '#f97316' },
      { code: 'RON95', name: 'High Octane RON95', color: '#ec4899' },
      { code: 'AGO-PREM', name: 'Premium Diesel', color: '#a855f7' },
    ]
  }, [availableProducts])

  const loadPumpsForStation = async (stId: string) => {
    if (!stId) return
    setLoading(true)
    try {
      const res = await backendGetPumps(stId, companyId)
      if (res?.pumps) {
        setPumps(res.pumps)
        const mapped: ProductionPumpConfig[] = res.pumps.map(p => ({
          id: p.id,
          name: p.name,
          fuels: p.fuels as any,
          nozzles: p.nozzles as any,
        }))
        registerStationPumps(stId, mapped)
      }
    } catch (err: any) {
      console.warn('Failed to load pumps from backend:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userStationId) {
      setSelectedStationId(userStationId)
    } else if (stations.length > 0 && !selectedStationId) {
      setSelectedStationId(stations[0].id)
    }
  }, [stations, userStationId])

  useEffect(() => {
    if (selectedStationId) {
      void loadPumpsForStation(selectedStationId)
    }
  }, [selectedStationId, companyId])

  const handleOpenAdd = () => {
    setNewPumpName(`Pump ${pumps.length + 1}`)
    // Default to dual-sided petrol dispenser (Side 1 PMS, Side 2 PMS)
    setNewPumpFuels(['PMS', 'PMS'])
    setIsAddOpen(true)
  }

  const handleSaveNewPump = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPumpName.trim() || !selectedStationId) return
    setAddSaving(true)
    try {
      const res = await backendCreatePump({
        stationId: selectedStationId,
        companyId,
        name: newPumpName.trim(),
        fuels: newPumpFuels.length > 0 ? newPumpFuels : ['PMS', 'PMS'],
      })
      setPumps(prev => [...prev, res.pump])
      const mapped: ProductionPumpConfig[] = [...pumps, res.pump].map(p => ({
        id: p.id,
        name: p.name,
        fuels: p.fuels as any,
        nozzles: p.nozzles as any,
      }))
      registerStationPumps(selectedStationId, mapped)
      setIsAddOpen(false)
      setActionNotice({ text: `Created ${newPumpName.trim()} with ${newPumpFuels.length} nozzle(s) configured.`, type: 'success' })
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setActionNotice({ text: err.message || 'Failed to create pump.', type: 'error' })
    } finally {
      setAddSaving(false)
    }
  }

  const handleOpenEdit = (p: BackendPump) => {
    setEditingPump(p)
    setEditPumpName(p.name)
    setEditPumpFuels([...(p.fuels && p.fuels.length > 0 ? p.fuels : ['PMS', 'PMS'])])
    setEditPumpActive(p.active)
  }

  const handleSaveEditPump = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPump) return
    setEditSaving(true)
    try {
      const res = await backendUpdatePump(editingPump.id, {
        name: editPumpName.trim(),
        fuels: editPumpFuels.length > 0 ? editPumpFuels : ['PMS', 'PMS'],
        active: editPumpActive,
      })
      setPumps(prev => {
        const next = prev.map(p => (p.id === editingPump.id ? res.pump : p))
        registerStationPumps(selectedStationId, next.map(p => ({ id: p.id, name: p.name, fuels: p.fuels as any, nozzles: p.nozzles as any })))
        return next
      })
      setEditingPump(null)
      setActionNotice({ text: `Updated ${editPumpName} successfully!`, type: 'success' })
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setActionNotice({ text: err.message || 'Failed to update pump.', type: 'error' })
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeletePump = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${name}?`)) return
    try {
      await backendDeletePump(id)
      setPumps(prev => {
        const next = prev.filter(p => p.id !== id)
        registerStationPumps(selectedStationId, next.map(p => ({ id: p.id, name: p.name, fuels: p.fuels as any, nozzles: p.nozzles as any })))
        return next
      })
      setActionNotice({ text: `Deleted ${name}.`, type: 'success' })
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setActionNotice({ text: err.message || 'Failed to delete pump.', type: 'error' })
    }
  }

  // Nozzle Management Actions:
  // 1. Rename Nozzle Name & Assigned Fuel Product
  const handleOpenEditNozzle = (
    pump: BackendPump,
    noz: { id?: string; nozzleIndex: number; name: string; fuelCode: string },
    targetIdx: number,
  ) => {
    setEditingNozzle({
      pump,
      fuelCode: noz.fuelCode,
      index: targetIdx,
      nozzleIndex: noz.nozzleIndex,
      id: noz.id,
      name: noz.name,
    })
    setEditNozzleName(noz.name)
    setEditNozzleFuelCode(noz.fuelCode)
  }

  const handleSaveRenameNozzle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingNozzle) return
    const { pump, index, nozzleIndex, id } = editingNozzle
    const customName = editNozzleName.trim() || `Nozzle ${nozzleIndex}`
    const fuelCode = editNozzleFuelCode.trim().toUpperCase()

    setSavingNozzle(true)
    try {
      const res = await backendUpdatePump(pump.id, {
        updateNozzle: { index, nozzleIndex, id, name: customName, fuelCode } as any,
      })
      setPumps(prev => {
        const next = prev.map(p => (p.id === pump.id ? res.pump : p))
        registerStationPumps(selectedStationId, next.map(p => ({ id: p.id, name: p.name, fuels: p.fuels as any, nozzles: p.nozzles as any })))
        return next
      })
      setEditingNozzle(null)
      setActionNotice({ text: `Updated Nozzle ${nozzleIndex} on ${pump.name} to "${customName}" (${fuelCode}).`, type: 'success' })
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setActionNotice({ text: err.message || 'Failed to update nozzle.', type: 'error' })
    } finally {
      setSavingNozzle(false)
    }
  }

  // 2. Delete Nozzle from Pump
  const handleDeleteNozzle = async (pump: BackendPump, fuelCode: string, nozzleIndex: number) => {
    if (pump.fuels.length <= 1) {
      setActionNotice({ text: 'A dispenser must have at least one active nozzle.', type: 'error' })
      setTimeout(() => setActionNotice(null), 4000)
      return
    }
    const nozzles = deriveNozzlesForPump(pump as any)
    const existing = nozzles[nozzleIndex]
    const label = existing?.name || `Nozzle ${nozzleIndex + 1} (${fuelCode})`
    if (!window.confirm(`Are you sure you want to remove ${label} from ${pump.name}?`)) return
    try {
      const res = await backendDeleteNozzle(pump.id, fuelCode, nozzleIndex)
      const updatedPump: BackendPump = {
        ...pump,
        fuels: res.fuels,
        nozzles: res.nozzles,
      }
      setPumps(prev => {
        const next = prev.map(p => (p.id === pump.id ? updatedPump : p))
        registerStationPumps(selectedStationId, next.map(p => ({ id: p.id, name: p.name, fuels: p.fuels as any, nozzles: p.nozzles as any })))
        return next
      })
      setActionNotice({ text: `Removed ${label} from ${pump.name}.`, type: 'success' })
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setActionNotice({ text: err.message || 'Failed to remove nozzle.', type: 'error' })
    }
  }

  // 3. Add Individual Nozzle to Pump with Custom Name
  const handleOpenAddNozzle = (pump: BackendPump) => {
    setAddingNozzlePump(pump)
    const nextIdx = pump.fuels.length
    const defaultLabel = pump.fuels.length === 1 ? 'Side 2' : `Nozzle ${nextIdx + 1}`
    setNewNozzleName(defaultLabel)
    setNewNozzleFuelName(pump.fuels[0] || fuelOptions[0]?.code || 'PMS')
  }

  const handleSaveAddNozzle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addingNozzlePump || !newNozzleFuelName.trim()) return
    const pump = addingNozzlePump
    const fuelToAdd = newNozzleFuelName.trim().toUpperCase()
    const customName = newNozzleName.trim() || `Nozzle ${pump.fuels.length + 1}`

    setSavingNewNozzle(true)
    try {
      const res = await backendUpdatePump(pump.id, {
        addNozzle: { name: customName, fuelCode: fuelToAdd },
      })
      setPumps(prev => {
        const next = prev.map(p => (p.id === pump.id ? res.pump : p))
        registerStationPumps(selectedStationId, next.map(p => ({ id: p.id, name: p.name, fuels: p.fuels as any, nozzles: p.nozzles as any })))
        return next
      })
      setAddingNozzlePump(null)
      setActionNotice({ text: `Added ${customName} (${fuelToAdd}) to ${pump.name}.`, type: 'success' })
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setActionNotice({ text: err.message || 'Failed to add nozzle.', type: 'error' })
    } finally {
      setSavingNewNozzle(false)
    }
  }

  const currentStation = stations.find(s => s.id === selectedStationId)

  return (
    <div className="flex flex-col gap-4">
      {actionNotice && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between transition ${
            actionNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <span>{actionNotice.text}</span>
          <button onClick={() => setActionNotice(null)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Header bar: station select & actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <Fuel className="w-5 h-5 text-orange-400" />
            <h2 className="text-sm font-extrabold text-white">Forecourt Pump & Nozzle Management</h2>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Configure fuel dispensing nozzles, edit fuel names, and manage dispenser layout for {isStationSupervisor ? currentStation?.name || 'this station' : companyName}.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {stations.length > 0 && !isStationSupervisor && (
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedStationId}
                onChange={e => setSelectedStationId(e.target.value)}
                className="bg-transparent text-white font-bold outline-none cursor-pointer"
              >
                {stations.map(st => (
                  <option key={st.id} value={st.id} className="bg-slate-900 text-white">
                    {st.name} {st.code ? `(${st.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isStationSupervisor && currentStation && (
            <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-white font-bold">
              <Building2 className="w-3.5 h-3.5 text-orange-400" />
              <span>{currentStation.name}</span>
            </div>
          )}

          <button
            onClick={() => void loadPumpsForStation(selectedStationId)}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="Refresh Pumps"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-400' : ''}`} />
          </button>

          <button
            onClick={handleOpenAdd}
            disabled={!selectedStationId}
            className="px-3 py-2 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Pump</span>
          </button>
        </div>
      </div>

      {/* Pumps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {pumps.map(pump => (
          <Card key={pump.id} className="p-4 border-slate-800/80 hover:border-slate-700 transition flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                    <Fuel className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-white">{pump.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {currentStation?.name || 'Station Branch'}
                    </p>
                  </div>
                </div>

                <Badge tone={pump.active ? 'success' : 'danger'}>
                  {pump.active ? 'Active' : 'Offline'}
                </Badge>
              </div>

              {/* Nozzles list with individual edit & delete */}
              {(() => {
                const nozzles = deriveNozzlesForPump(pump as any)
                return (
                  <div className="mt-3 pt-3 border-t border-slate-800/60">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Active Nozzles ({nozzles.length})
                      </span>
                      <button
                        onClick={() => handleOpenAddNozzle(pump)}
                        className="text-[10px] font-bold text-orange-400 hover:text-orange-300 flex items-center gap-0.5"
                        title="Add a nozzle to this dispenser"
                      >
                        <Plus className="w-3 h-3" /> Add Nozzle
                      </button>
                    </div>

                    <div className="flex flex-col gap-2">
                      {nozzles.length > 0 ? (
                        nozzles.map((noz, idx) => {
                          const opt = fuelOptions.find(o => o.code === noz.fuelCode)
                          return (
                            <div
                              key={noz.id || `${noz.fuelCode}-${idx}`}
                              className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: opt?.color || '#F97316' }}
                                />
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-900 text-orange-400 border border-slate-800">
                                      {noz.name}
                                    </span>
                                    <span className="text-xs font-bold font-mono text-white">
                                      {noz.fuelCode}
                                    </span>
                                  </div>
                                  {opt?.name && opt.name !== noz.fuelCode && (
                                    <span className="text-[9px] text-slate-500 block">
                                      {opt.name}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleOpenEditNozzle(pump, noz, idx)}
                                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-orange-400 transition"
                                  title={`Edit Nozzle name and fuel for ${noz.name}`}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => void handleDeleteNozzle(pump, noz.fuelCode, idx)}
                                  className="p-1 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition"
                                  title={`Delete ${noz.name}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <span className="text-xs text-rose-400 italic">No nozzles configured on this pump</span>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Pump Actions */}
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between gap-2">
              <button
                onClick={() => handleOpenEdit(pump)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition"
              >
                <Edit2 className="w-3 h-3 text-orange-400" />
                <span>Configure Pump</span>
              </button>

              <button
                onClick={() => handleDeletePump(pump.id, pump.name)}
                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition"
                title="Delete Pump"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </Card>
        ))}

        {pumps.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center bg-slate-950/40 rounded-2xl border border-dashed border-slate-800">
            <Fuel className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-300">No pumps registered for this station yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Click "Add Pump" to provision fuel dispensers with assigned product grades.
            </p>
            <button
              onClick={handleOpenAdd}
              className="mt-3 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" /> Add First Pump
            </button>
          </div>
        )}
      </div>

      {/* MODAL: Rename/Edit Nozzle Name & Fuel */}
      {editingNozzle && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">
                  Configure Nozzle {editingNozzle.index + 1}
                </h3>
              </div>
              <button onClick={() => setEditingNozzle(null)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveRenameNozzle} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dispenser</label>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Fuel className="w-4 h-4 text-orange-400" />
                    <span>{editingNozzle.pump.name} ({currentStation?.name || selectedStationId})</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-orange-400 border border-slate-800">
                    Slot #{editingNozzle.index + 1}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Nozzle Custom Name / Forecourt Label
                </label>
                <input
                  type="text"
                  value={editNozzleName}
                  onChange={e => setEditNozzleName(e.target.value)}
                  placeholder="e.g. Side 1 (Petrol), Side 2, Lane 1 Super"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none font-bold"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Customize the name so attendants can easily distinguish nozzles (e.g. Side 1, Side 2, Super Nozzle A).
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                  Assigned Fuel Product
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {fuelOptions.map(f => {
                    const isSelected = editNozzleFuelCode.toUpperCase() === f.code
                    return (
                      <button
                        key={f.code}
                        type="button"
                        onClick={() => setEditNozzleFuelCode(f.code)}
                        className={`p-2 rounded-xl border text-left flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-orange-500/15 border-orange-500 text-white shadow-sm ring-1 ring-orange-500/30'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                          <div>
                            <span className="font-bold text-xs block text-white">{f.code}</span>
                            <span className="text-[9px] text-slate-500 block truncate max-w-[120px]">{f.name}</span>
                          </div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={savingNozzle || !editNozzleName.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {savingNozzle ? 'Saving Changes…' : `Save Nozzle "${editNozzleName}" (${editNozzleFuelCode})`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Nozzle to Pump */}
      {addingNozzlePump && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Add Nozzle to {addingNozzlePump.name}</h3>
              </div>
              <button onClick={() => setAddingNozzlePump(null)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="rounded-xl bg-orange-500/10 border border-orange-500/30 p-2.5 text-[11px] text-orange-300">
              Dispensers can have multiple nozzles of the <strong>same product</strong> (e.g. Petrol PMS on Side 1 and Side 2) or different products (e.g. Petrol & Diesel).
            </div>

            <form onSubmit={handleSaveAddNozzle} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Nozzle Custom Name / Forecourt Label
                </label>
                <input
                  type="text"
                  value={newNozzleName}
                  onChange={e => setNewNozzleName(e.target.value)}
                  placeholder="e.g. Side 2, Side 1 (Diesel), Lane 2 PMS"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                  Select Fuel Product to Dispense
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {fuelOptions.map(f => {
                    const isSelected = newNozzleFuelName.toUpperCase() === f.code
                    const existingCount = addingNozzlePump.fuels.filter(code => code === f.code).length
                    return (
                      <button
                        key={f.code}
                        type="button"
                        onClick={() => setNewNozzleFuelName(f.code)}
                        className={`p-2 rounded-xl border text-left flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-orange-500/15 border-orange-500 text-white shadow-sm ring-1 ring-orange-500/30'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                          <div>
                            <span className="font-bold text-xs text-white block">{f.code}</span>
                            <span className="text-[9px] text-slate-500 block truncate max-w-[120px]">{f.name}</span>
                          </div>
                        </div>
                        {existingCount > 0 && (
                          <span className="text-[9px] font-mono font-bold text-amber-400 shrink-0">
                            ({existingCount} on pump)
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={savingNewNozzle || !newNozzleFuelName.trim() || !newNozzleName.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {savingNewNozzle ? 'Adding Nozzle…' : `Add ${newNozzleName} (${newNozzleFuelName}) to ${addingNozzlePump.name}`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Pump */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Add Forecourt Dispenser</h3>
              </div>
              <button onClick={() => setIsAddOpen(false)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveNewPump} className="flex flex-col gap-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Station Branch</label>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-xs flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-orange-400" />
                  <span>{currentStation?.name || selectedStationId}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pump Display Name</label>
                <input
                  value={newPumpName}
                  onChange={e => setNewPumpName(e.target.value)}
                  placeholder="e.g. Pump 1, Island A - Pump 2"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  required
                />
              </div>

              {/* Quick Configuration Presets */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                  Common Dispenser Layout Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNewPumpFuels(['PMS', 'PMS'])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-orange-500 text-[11px] font-bold text-slate-300 hover:text-white transition flex items-center gap-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Dual Petrol (PMS + PMS)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPumpFuels(['PMS', 'AGO'])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-orange-500 text-[11px] font-bold text-slate-300 hover:text-white transition flex items-center gap-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Petrol + Diesel (PMS + AGO)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPumpFuels(['PMS', 'AGO', 'PMS', 'AGO'])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-orange-500 text-[11px] font-bold text-slate-300 hover:text-white transition flex items-center gap-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    <span>Dual Island (4 Nozzles)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPumpFuels(['PMS'])}
                    className="px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-[10px] font-mono text-slate-400"
                  >
                    Single PMS
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPumpFuels(['AGO'])}
                    className="px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-[10px] font-mono text-slate-400"
                  >
                    Single AGO
                  </button>
                </div>
              </div>

              {/* Configured Nozzles on this Pump */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Configured Dispenser Nozzles ({newPumpFuels.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPumpFuels(prev => [...prev, fuelOptions[0]?.code || 'PMS'])}
                    className="text-[10px] font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Nozzle
                  </button>
                </div>

                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                  {newPumpFuels.map((fuelCode, idx) => {
                    const opt = fuelOptions.find(o => o.code === fuelCode)
                    const sideLabel = newPumpFuels.length === 2
                      ? (idx === 0 ? 'Side 1' : 'Side 2')
                      : `Nozzle ${idx + 1}`
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt?.color || '#F97316' }} />
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 text-orange-400 border border-slate-800 shrink-0">
                            {sideLabel}
                          </span>
                        </div>

                        <select
                          value={fuelCode}
                          onChange={e => {
                            const updated = [...newPumpFuels]
                            updated[idx] = e.target.value
                            setNewPumpFuels(updated)
                          }}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-bold outline-none cursor-pointer"
                        >
                          {fuelOptions.map(f => (
                            <option key={f.code} value={f.code} className="bg-slate-900 text-white font-bold">
                              {f.code} — {f.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            if (newPumpFuels.length > 1) {
                              setNewPumpFuels(prev => prev.filter((_, i) => i !== idx))
                            }
                          }}
                          disabled={newPumpFuels.length <= 1}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 disabled:opacity-20 transition"
                          title="Remove this nozzle"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={addSaving || !newPumpName.trim() || newPumpFuels.length === 0}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40 shadow-md"
              >
                {addSaving ? 'Saving Pump…' : `Save & Provision Pump (${newPumpFuels.join(', ')})`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Configure Pump (Name, Nozzle List, Status) */}
      {editingPump && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Configure {editingPump.name}</h3>
              </div>
              <button onClick={() => setEditingPump(null)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveEditPump} className="flex flex-col gap-3.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pump Display Name</label>
                <input
                  value={editPumpName}
                  onChange={e => setEditPumpName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none font-bold"
                  required
                />
              </div>

              {/* Quick Preset Buttons */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditPumpFuels(['PMS', 'PMS'])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-orange-500 text-[11px] font-bold text-slate-300 hover:text-white transition flex items-center gap-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Make Dual Petrol (PMS + PMS)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPumpFuels(['PMS', 'AGO'])}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-orange-500 text-[11px] font-bold text-slate-300 hover:text-white transition flex items-center gap-1.5"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Make Petrol & Diesel (PMS + AGO)</span>
                  </button>
                </div>
              </div>

              {/* Nozzles on this dispenser */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    Configured Nozzles ({editPumpFuels.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setEditPumpFuels(prev => [...prev, fuelOptions[0]?.code || 'PMS'])}
                    className="text-[10px] font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add Nozzle
                  </button>
                </div>

                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                  {editPumpFuels.map((fuelCode, idx) => {
                    const opt = fuelOptions.find(o => o.code === fuelCode)
                    const sideLabel = editPumpFuels.length === 2
                      ? (idx === 0 ? 'Side 1' : 'Side 2')
                      : `Nozzle ${idx + 1}`
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: opt?.color || '#F97316' }} />
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 text-orange-400 border border-slate-800 shrink-0">
                            {sideLabel}
                          </span>
                        </div>

                        <select
                          value={fuelCode}
                          onChange={e => {
                            const updated = [...editPumpFuels]
                            updated[idx] = e.target.value
                            setEditPumpFuels(updated)
                          }}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-bold outline-none cursor-pointer"
                        >
                          {fuelOptions.map(f => (
                            <option key={f.code} value={f.code} className="bg-slate-900 text-white font-bold">
                              {f.code} — {f.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            if (editPumpFuels.length > 1) {
                              setEditPumpFuels(prev => prev.filter((_, i) => i !== idx))
                            }
                          }}
                          disabled={editPumpFuels.length <= 1}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 disabled:opacity-20 transition"
                          title="Remove this nozzle"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dispenser Status</label>
                <button
                  type="button"
                  onClick={() => setEditPumpActive(!editPumpActive)}
                  className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition ${
                    editPumpActive
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/40 text-rose-400'
                  }`}
                >
                  <span>{editPumpActive ? 'Dispenser is Active & In-Service' : 'Dispenser is Inactive / Under Maintenance'}</span>
                  <span className="text-[10px] uppercase font-bold">{editPumpActive ? 'Online' : 'Disabled'}</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={editSaving || !editPumpName.trim() || editPumpFuels.length === 0}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40 shadow-md"
              >
                {editSaving ? 'Updating Pump…' : 'Save Pump Configuration'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
