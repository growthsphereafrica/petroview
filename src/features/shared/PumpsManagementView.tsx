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
import { registerStationPumps, type ProductionPumpConfig } from '../../core/domain/config'
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
  const [newPumpFuels, setNewPumpFuels] = useState<string[]>(['PMS', 'AGO'])
  const [addSaving, setAddSaving] = useState(false)

  // Edit Pump Modal
  const [editingPump, setEditingPump] = useState<BackendPump | null>(null)
  const [editPumpName, setEditPumpName] = useState('')
  const [editPumpFuels, setEditPumpFuels] = useState<string[]>([])
  const [editPumpActive, setEditPumpActive] = useState(true)
  const [editSaving, setEditSaving] = useState(false)

  // Edit Nozzle Fuel Name Modal
  const [editingNozzle, setEditingNozzle] = useState<{ pump: BackendPump; fuelCode: string } | null>(null)
  const [editNozzleNewName, setEditNozzleNewName] = useState('')
  const [savingNozzle, setSavingNozzle] = useState(false)

  // Add Individual Nozzle Modal
  const [addingNozzlePump, setAddingNozzlePump] = useState<BackendPump | null>(null)
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
    setNewPumpFuels(fuelOptions.map(f => f.code))
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
        fuels: newPumpFuels.length > 0 ? newPumpFuels : ['PMS', 'AGO'],
      })
      setPumps(prev => [...prev, res.pump])
      const mapped: ProductionPumpConfig[] = [...pumps, res.pump].map(p => ({
        id: p.id,
        name: p.name,
        fuels: p.fuels as any,
      }))
      registerStationPumps(selectedStationId, mapped)
      setIsAddOpen(false)
      setActionNotice({ text: `Created ${newPumpName.trim()} with ${newPumpFuels.length} nozzle(s) enabled.`, type: 'success' })
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
    setEditPumpFuels(p.fuels || [])
    setEditPumpActive(p.active)
  }

  const handleSaveEditPump = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPump) return
    setEditSaving(true)
    try {
      const res = await backendUpdatePump(editingPump.id, {
        name: editPumpName.trim(),
        fuels: editPumpFuels.length > 0 ? editPumpFuels : ['PMS', 'AGO'],
        active: editPumpActive,
      })
      setPumps(prev => prev.map(p => (p.id === editingPump.id ? res.pump : p)))
      const updated = pumps.map(p => (p.id === editingPump.id ? res.pump : p))
      registerStationPumps(selectedStationId, updated.map(p => ({ id: p.id, name: p.name, fuels: p.fuels as any })))
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
      setPumps(prev => prev.filter(p => p.id !== id))
      const remaining = pumps.filter(p => p.id !== id)
      registerStationPumps(selectedStationId, remaining.map(p => ({ id: p.id, name: p.name, fuels: p.fuels as any })))
      setActionNotice({ text: `Deleted ${name}.`, type: 'success' })
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setActionNotice({ text: err.message || 'Failed to delete pump.', type: 'error' })
    }
  }

  // Nozzle Management Actions:
  // 1. Rename Nozzle Fuel
  const handleOpenEditNozzle = (pump: BackendPump, fuelCode: string) => {
    setEditingNozzle({ pump, fuelCode })
    setEditNozzleNewName(fuelCode)
  }

  const handleSaveRenameNozzle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingNozzle || !editNozzleNewName.trim()) return
    const { pump, fuelCode } = editingNozzle
    const newName = editNozzleNewName.trim().toUpperCase()
    if (newName === fuelCode) {
      setEditingNozzle(null)
      return
    }

    setSavingNozzle(true)
    try {
      const res = await backendUpdatePump(pump.id, {
        renameNozzle: { oldName: fuelCode, newName },
      })
      setPumps(prev => prev.map(p => (p.id === pump.id ? res.pump : p)))
      const updated = pumps.map(p => (p.id === pump.id ? res.pump : p))
      registerStationPumps(selectedStationId, updated.map(p => ({ id: p.id, name: p.name, fuels: p.fuels as any })))
      setEditingNozzle(null)
      setActionNotice({ text: `Renamed nozzle on ${pump.name} from "${fuelCode}" to "${newName}".`, type: 'success' })
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setActionNotice({ text: err.message || 'Failed to rename nozzle.', type: 'error' })
    } finally {
      setSavingNozzle(false)
    }
  }

  // 2. Delete Nozzle from Pump
  const handleDeleteNozzle = async (pump: BackendPump, fuelCode: string) => {
    if (!window.confirm(`Are you sure you want to remove nozzle "${fuelCode}" from ${pump.name}?`)) return
    try {
      const res = await backendDeleteNozzle(pump.id, fuelCode)
      const updatedPump: BackendPump = {
        ...pump,
        fuels: res.fuels,
      }
      setPumps(prev => prev.map(p => (p.id === pump.id ? updatedPump : p)))
      const updated = pumps.map(p => (p.id === pump.id ? updatedPump : p))
      registerStationPumps(selectedStationId, updated.map(p => ({ id: p.id, name: p.name, fuels: p.fuels as any })))
      setActionNotice({ text: `Removed nozzle "${fuelCode}" from ${pump.name}.`, type: 'success' })
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setActionNotice({ text: err.message || 'Failed to remove nozzle.', type: 'error' })
    }
  }

  // 3. Add Individual Nozzle to Pump
  const handleOpenAddNozzle = (pump: BackendPump) => {
    setAddingNozzlePump(pump)
    // Suggest first available fuel code not already on this pump
    const unused = fuelOptions.find(f => !pump.fuels.includes(f.code))
    setNewNozzleFuelName(unused ? unused.code : 'RON95')
  }

  const handleSaveAddNozzle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addingNozzlePump || !newNozzleFuelName.trim()) return
    const pump = addingNozzlePump
    const fuelToAdd = newNozzleFuelName.trim().toUpperCase()

    setSavingNewNozzle(true)
    try {
      const res = await backendUpdatePump(pump.id, {
        addNozzle: fuelToAdd,
      })
      setPumps(prev => prev.map(p => (p.id === pump.id ? res.pump : p)))
      const updated = pumps.map(p => (p.id === pump.id ? res.pump : p))
      registerStationPumps(selectedStationId, updated.map(p => ({ id: p.id, name: p.name, fuels: p.fuels as any })))
      setAddingNozzlePump(null)
      setActionNotice({ text: `Added nozzle "${fuelToAdd}" to ${pump.name}.`, type: 'success' })
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
              <div className="mt-3 pt-3 border-t border-slate-800/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400">
                    Active Nozzles ({pump.fuels?.length || 0})
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
                  {pump.fuels && pump.fuels.length > 0 ? (
                    pump.fuels.map(f => {
                      const opt = fuelOptions.find(o => o.code === f)
                      return (
                        <div
                          key={f}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: opt?.color || '#F97316' }}
                            />
                            <div>
                              <span className="text-xs font-bold font-mono text-white block">
                                {f}
                              </span>
                              {opt?.name && opt.name !== f && (
                                <span className="text-[9px] text-slate-500 block">
                                  {opt.name}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditNozzle(pump, f)}
                              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-orange-400 transition"
                              title={`Rename fuel on nozzle ${f}`}
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => void handleDeleteNozzle(pump, f)}
                              className="p-1 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition"
                              title={`Delete nozzle ${f}`}
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

      {/* MODAL: Rename/Edit Nozzle Fuel */}
      {editingNozzle && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Edit Fuel on Nozzle</h3>
              </div>
              <button onClick={() => setEditingNozzle(null)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveRenameNozzle} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Dispenser</label>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-bold text-xs flex items-center gap-2">
                  <Fuel className="w-4 h-4 text-orange-400" />
                  <span>{editingNozzle.pump.name} ({currentStation?.name || selectedStationId})</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Current Fuel Code / Name</label>
                <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300 font-mono font-bold text-xs">
                  {editingNozzle.fuelCode}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  New Fuel Name / Product Code
                </label>
                <input
                  value={editNozzleNewName}
                  onChange={e => setEditNozzleNewName(e.target.value)}
                  placeholder="e.g. Super XP, V-Power, PMS, RON95"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none uppercase font-bold"
                  required
                />
              </div>

              {/* Quick Preset Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                  Or select standard grade
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {fuelOptions.map(f => (
                    <button
                      key={f.code}
                      type="button"
                      onClick={() => setEditNozzleNewName(f.code)}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-mono font-bold transition ${
                        editNozzleNewName.toUpperCase() === f.code
                          ? 'bg-orange-500 text-slate-950 border-orange-500'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {f.code}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={savingNozzle || !editNozzleNewName.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {savingNozzle ? 'Renaming Fuel…' : 'Save Fuel Name on Nozzle'}
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

            <form onSubmit={handleSaveAddNozzle} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Fuel Grade / Name</label>
                <input
                  value={newNozzleFuelName}
                  onChange={e => setNewNozzleFuelName(e.target.value)}
                  placeholder="e.g. PMS, AGO, V-Power, RON95"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none uppercase font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                  Available Fuel Products
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto">
                  {fuelOptions.map(f => {
                    const alreadyOnPump = addingNozzlePump.fuels.includes(f.code)
                    const isSelected = newNozzleFuelName.toUpperCase() === f.code
                    return (
                      <button
                        key={f.code}
                        type="button"
                        onClick={() => setNewNozzleFuelName(f.code)}
                        className={`p-2 rounded-xl border text-left flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-orange-500/10 border-orange-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
                          <span className="font-bold text-xs">{f.code}</span>
                        </div>
                        {alreadyOnPump && (
                          <span className="text-[9px] text-slate-500">(Active)</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={savingNewNozzle || !newNozzleFuelName.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {savingNewNozzle ? 'Adding Nozzle…' : 'Add Nozzle to Dispenser'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Pump */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Add New Forecourt Pump</h3>
              </div>
              <button onClick={() => setIsAddOpen(false)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveNewPump} className="flex flex-col gap-3 text-xs">
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

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                  Select Active Nozzles & Fuel Types for this Pump
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                  {fuelOptions.map(f => {
                    const active = newPumpFuels.includes(f.code)
                    return (
                      <button
                        type="button"
                        key={f.code}
                        onClick={() => {
                          if (active) {
                            setNewPumpFuels(prev => prev.filter(c => c !== f.code))
                          } else {
                            setNewPumpFuels(prev => [...prev, f.code])
                          }
                        }}
                        className={`p-2 rounded-xl border text-left flex items-center gap-2 transition ${
                          active
                            ? 'bg-orange-500/10 border-orange-500/60 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] ${active ? 'bg-orange-500 text-slate-950 font-bold' : 'border border-slate-700'}`}>
                          {active && <Check className="w-3 h-3" />}
                        </div>
                        <span className="font-bold text-xs">{f.code}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={addSaving || !newPumpName.trim() || newPumpFuels.length === 0}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {addSaving ? 'Saving Pump…' : 'Save & Provision Pump'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Configure Pump (Name, Bulk fuels, Status) */}
      {editingPump && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Configure Pump</h3>
              </div>
              <button onClick={() => setEditingPump(null)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveEditPump} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pump Display Name</label>
                <input
                  value={editPumpName}
                  onChange={e => setEditPumpName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                  Assigned Fuel Nozzles
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                  {fuelOptions.map(f => {
                    const active = editPumpFuels.includes(f.code)
                    return (
                      <button
                        type="button"
                        key={f.code}
                        onClick={() => {
                          if (active) {
                            setEditPumpFuels(prev => prev.filter(c => c !== f.code))
                          } else {
                            setEditPumpFuels(prev => [...prev, f.code])
                          }
                        }}
                        className={`p-2 rounded-xl border text-left flex items-center gap-2 transition ${
                          active
                            ? 'bg-orange-500/10 border-orange-500/60 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] ${active ? 'bg-orange-500 text-slate-950 font-bold' : 'border border-slate-700'}`}>
                          {active && <Check className="w-3 h-3" />}
                        </div>
                        <span className="font-bold text-xs">{f.code}</span>
                      </button>
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
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
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
