import React, { useEffect, useState } from 'react'
import { useForecourt } from '../../context/ForecourtContext'
import { loadUnifiedSession } from '../../features/unified/UnifiedLoginScreen'
import { companyService } from '../../core/services/companyService'
import { prodDb } from '../../core/infra/db'
import { Building2, Check, MapPin, X, ArrowRight, Flame } from 'lucide-react'
import type { Company, CompanyStation } from '../../core/domain/types'

interface CompanySelectorModalProps {
  isOpen: boolean
  onClose: () => void
}

export const CompanySelectorModal: React.FC<CompanySelectorModalProps> = ({ isOpen, onClose }) => {
  const session = loadUnifiedSession()
  const { activeCompany, switchCompany, activeStation, switchStation } = useForecourt()

  const [dbCompanies, setDbCompanies] = useState<Company[]>([])
  const [dbStations, setDbStations] = useState<CompanyStation[]>([])
  const [selectedCompId, setSelectedCompId] = useState(activeCompany.id)
  const [selectedStnId, setSelectedStnId] = useState(activeStation.id)

  useEffect(() => {
    if (!isOpen) return
    const loadRealCompanies = async () => {
      const companies = await companyService.listAllCompanies()
      const stations = await prodDb.companyStations.toArray()
      setDbCompanies(companies)
      setDbStations(stations)

      if (companies.length > 0 && !companies.some(c => c.id === selectedCompId)) {
        setSelectedCompId(companies[0].id)
        const compStations = stations.filter(s => s.companyId === companies[0].id)
        if (compStations.length > 0) {
          setSelectedStnId(compStations[0].id)
        }
      }
    }
    void loadRealCompanies()
  }, [isOpen])

  // STRICT SECURITY CHECK: Only Platform Master / Super Admin is authorized to switch OMC tenant contexts
  if (!isOpen || session?.role !== 'superadmin') {
    return null
  }

  const currentComp = dbCompanies.find(c => c.id === selectedCompId) || {
    id: activeCompany.id,
    name: activeCompany.name,
    shortCode: activeCompany.shortCode,
    primaryColor: activeCompany.primaryColor,
  }

  const currentStations = dbStations.filter(s => s.companyId === selectedCompId)

  const handleApply = () => {
    if (selectedCompId) switchCompany(selectedCompId)
    if (selectedStnId) switchStation(selectedStnId)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
            <div>
              <h3 className="font-bold text-white text-base">Select Oil & Gas Company</h3>
              <p className="text-[11px] text-slate-400">PetroView Multi-Tenant Enterprise Switcher (Super Admin Only)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex flex-col gap-5">
          {/* Company Cards Grid */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              1. Choose Registered Oil Marketing Company (OMC)
            </label>
            {dbCompanies.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">No companies registered in database.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {dbCompanies.map(c => {
                  const isSelected = c.id === selectedCompId
                  const compBranches = dbStations.filter(s => s.companyId === c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCompId(c.id)
                        const firstStn = compBranches[0]
                        if (firstStn) setSelectedStnId(firstStn.id)
                      }}
                      className={`p-3.5 rounded-2xl border text-left transition-all duration-150 flex flex-col justify-between gap-2 relative shadow-xs ${
                        isSelected
                          ? 'bg-slate-800/90 border-orange-500 ring-2 ring-orange-500/40 shadow-md shadow-orange-950/40'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-orange-500 text-slate-950 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                      <div>
                        <span className="text-[10px] font-mono font-black text-orange-400 block uppercase">
                          {c.shortCode}
                        </span>
                        <h4 className="font-bold text-xs text-white leading-snug">{c.name}</h4>
                      </div>
                      <span className="text-[10px] text-slate-400">{compBranches.length} Branch(es)</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Station Branch Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              2. Select Branch Station
            </label>
            {currentStations.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">No stations registered under {currentComp.name}.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {currentStations.map(stn => {
                  const isSelected = stn.id === selectedStnId
                  return (
                    <button
                      key={stn.id}
                      onClick={() => setSelectedStnId(stn.id)}
                      className={`p-3.5 rounded-2xl border text-left transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-slate-800/90 border-orange-500 ring-1 ring-orange-500'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-slate-900 text-orange-400">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div>
                          <h5 className="font-bold text-xs text-white">{stn.name}</h5>
                          <p className="text-[11px] text-slate-400">
                            {stn.location} • Code: {stn.code}
                          </p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-orange-400" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-extrabold shadow-lg shadow-orange-950/60 border border-orange-400/30 flex items-center gap-2 active:scale-98 transition"
          >
            <span>Switch Context to {currentComp.name}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
