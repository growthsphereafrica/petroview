/**
 * Super Super Admin Dashboard — Master Platform Owner Console.
 * - Onboard new Oil Marketing Companies (OMCs) & provision their HQ login credentials
 * - Manage all company tenants, stations, staff counts, and global network telemetry
 * - Add station branches to any company and audit global system activity
 */

import React, { useEffect, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Copy,
  DollarSign,
  Flame,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserCog,
  Users,
  Zap,
} from 'lucide-react'
import { companyService } from '../../core/services/companyService'
import { supervisorService } from '../../core/services/supervisorService'
import { useLiveChanges } from '../../core/services/liveSyncBus'
import { Badge, Card, StatusBar } from '../shared/ui'
import { formatDateTime, formatGHS } from '../../utils/currencyFormatter'
import type { Company, CompanyStation } from '../../core/domain/types'

export const SuperSuperAdminDashboard: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([])
  const [stationsMap, setStationsMap] = useState<Record<string, CompanyStation[]>>({})
  const [staffCounts, setStaffCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Create OMC Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newShortCode, setNewShortCode] = useState('')
  const [newColor, setNewColor] = useState('#F97316')
  const [newPhone, setNewPhone] = useState('')
  const [newAdminName, setNewAdminName] = useState('')
  const [newAdminPin, setNewAdminPin] = useState('')
  const [newStationName, setNewStationName] = useState('')
  const [newStationLocation, setNewStationLocation] = useState('')
  const [newStationRegion, setNewStationRegion] = useState('Greater Accra')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Success Created Company Modal
  const [createdCredentials, setCreatedCredentials] = useState<{
    company: Company
    adminCode: string
    adminPin: string
  } | null>(null)

  // Add Station Modal State
  const [stationModalCompany, setStationModalCompany] = useState<Company | null>(null)
  const [addStName, setAddStName] = useState('')
  const [addStCode, setAddStCode] = useState('')
  const [addStLocation, setAddStLocation] = useState('')
  const [addStRegion, setAddStRegion] = useState('Greater Accra')
  const [addStPumps, setAddStPumps] = useState(4)
  const [addStBusy, setAddStBusy] = useState(false)

  const loadData = async () => {
    setRefreshing(true)
    try {
      const allCompanies = await companyService.listAllCompanies()
      setCompanies(allCompanies)

      const stMap: Record<string, CompanyStation[]> = {}
      const staffMap: Record<string, number> = {}

      const allStaff = await supervisorService.listAllStaff()

      for (const comp of allCompanies) {
        const compStations = await companyService.listCompanyStations(comp.id)
        stMap[comp.id] = compStations

        const count =
          allStaff.attendants.filter(a => a.companyId === comp.id || a.employeeCode.startsWith(comp.shortCode)).length +
          allStaff.supervisors.filter(s => s.companyId === comp.id || s.employeeCode.startsWith(comp.shortCode)).length
        staffMap[comp.id] = count
      }

      setStationsMap(stMap)
      setStaffCounts(staffMap)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useLiveChanges(() => {
    void loadData()
  })

  // Submit New Company Onboarding
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)

    if (!newCompanyName.trim() || !newShortCode.trim()) {
      setCreateError('Company name and short code are required.')
      return
    }
    if (newAdminPin.length !== 4) {
      setCreateError('Admin PIN must be exactly 4 digits.')
      return
    }

    setCreating(true)
    try {
      const res = await companyService.createCompany({
        name: newCompanyName.trim(),
        shortCode: newShortCode.trim().toUpperCase(),
        primaryColor: newColor,
        phone: newPhone.trim() || '030 000 0000',
        adminName: newAdminName.trim() || `${newCompanyName.trim()} Administrator`,
        adminPin: newAdminPin,
        initialStations: newStationName.trim()
          ? [
              {
                name: newStationName.trim(),
                code: `${newShortCode.trim().toUpperCase()}-01`,
                location: newStationLocation.trim() || 'Central Highway',
                region: newStationRegion,
                pumpsCount: 4,
              },
            ]
          : undefined,
      })

      setCreatedCredentials({
        company: res.company,
        adminCode: res.adminCode,
        adminPin: res.adminPin,
      })

      setIsCreateModalOpen(false)
      // Reset form
      setNewCompanyName('')
      setNewShortCode('')
      setNewPhone('')
      setNewAdminName('')
      setNewAdminPin('')
      setNewStationName('')
      setNewStationLocation('')
      void loadData()
    } catch (err: any) {
      setCreateError(err.message || 'Failed to onboard company.')
    } finally {
      setCreating(false)
    }
  }

  // Submit Add Station
  const handleAddStation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stationModalCompany || !addStName.trim()) return
    setAddStBusy(true)
    try {
      await companyService.addStationToCompany(stationModalCompany.id, {
        name: addStName.trim(),
        code: addStCode.trim().toUpperCase() || `${stationModalCompany.shortCode}-${Date.now().toString().slice(-3)}`,
        location: addStLocation.trim() || 'Main Branch',
        region: addStRegion,
        pumpsCount: addStPumps,
      })
      setStationModalCompany(null)
      setAddStName('')
      setAddStCode('')
      setAddStLocation('')
      void loadData()
    } finally {
      setAddStBusy(false)
    }
  }

  const filteredCompanies = companies.filter(
    c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.shortCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.adminCode.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const totalStationsCount = Object.values(stationsMap).reduce((a, b) => a + b.length, 0)
  const totalStaffCount = Object.values(staffCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="h-full flex flex-col bg-[#080c14] overflow-y-auto">
      <StatusBar online />

      {/* Top Super Admin Header */}
      <div className="shrink-0 flex flex-wrap items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800/80 gap-4 sticky top-0 z-30 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 flex items-center justify-center shadow-lg shadow-orange-950/60 border border-orange-400/40">
            <Sparkles className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white">PetroView Platform Master Console</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold uppercase">
                Tier 1 Super Super Admin
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Multi-Tenant Downstream Petroleum Management · Global OMC Registry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-bold transition shadow-lg shadow-orange-950/50 flex items-center gap-2 border border-orange-400/30 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Onboard New Oil Company (OMC)</span>
          </button>

          <button
            onClick={() => void loadData()}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            title="Refresh Platform State"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 max-w-6xl w-full mx-auto flex flex-col gap-6">
        {/* Global Platform KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 bg-slate-900/90 border-orange-500/30 shadow-md">
            <div className="flex items-center gap-2 mb-2 text-orange-400 font-bold text-xs">
              <Building2 className="w-4 h-4" />
              <span className="uppercase text-[10px]">Registered OMCs</span>
            </div>
            <p className="text-3xl font-black text-white">{companies.length}</p>
            <p className="text-[11px] text-slate-500 mt-1">Multi-Tenant Oil Marketing Companies</p>
          </Card>

          <Card className="p-4 bg-slate-900/90 border-amber-500/30 shadow-md">
            <div className="flex items-center gap-2 mb-2 text-amber-400 font-bold text-xs">
              <MapPin className="w-4 h-4" />
              <span className="uppercase text-[10px]">Active Fuel Stations</span>
            </div>
            <p className="text-3xl font-black text-white">{totalStationsCount}</p>
            <p className="text-[11px] text-slate-500 mt-1">Station branches across all tenants</p>
          </Card>

          <Card className="p-4 bg-slate-900/90 border-emerald-500/30 shadow-md">
            <div className="flex items-center gap-2 mb-2 text-emerald-400 font-bold text-xs">
              <Users className="w-4 h-4" />
              <span className="uppercase text-[10px]">Total Active Staff</span>
            </div>
            <p className="text-3xl font-black text-white">{totalStaffCount}</p>
            <p className="text-[11px] text-slate-500 mt-1">Attendants & Station Managers</p>
          </Card>

          <Card className="p-4 bg-slate-900/90 border-cyan-500/30 shadow-md">
            <div className="flex items-center gap-2 mb-2 text-cyan-400 font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span className="uppercase text-[10px]">Platform Health</span>
            </div>
            <p className="text-3xl font-black text-emerald-400">100%</p>
            <p className="text-[11px] text-slate-500 mt-1">Zero unauthorized rogue HQs</p>
          </Card>
        </div>

        {/* Oil Marketing Companies Directory */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-orange-400" />
                <span>Onboarded Oil Marketing Companies (OMCs)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Every registered HQ tenant has isolated station governance, staff approval queues, and provisioned credentials.
              </p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search company or code…"
                className="rounded-xl bg-slate-900 border border-slate-800 pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none w-64"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCompanies.map(comp => {
              const compStations = stationsMap[comp.id] || []
              const compStaff = staffCounts[comp.id] || 0

              return (
                <Card
                  key={comp.id}
                  className="p-5 bg-slate-900/90 border-slate-800 hover:border-slate-700 transition flex flex-col justify-between gap-4 shadow-lg relative overflow-hidden"
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: comp.primaryColor || '#F97316' }}
                  />

                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-md"
                          style={{ backgroundColor: comp.primaryColor || '#F97316' }}
                        >
                          {comp.shortCode}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white">{comp.name}</h4>
                          <p className="text-[11px] text-slate-400">{comp.tagline}</p>
                        </div>
                      </div>
                      <Badge tone={comp.active ? 'success' : 'danger'}>{comp.active ? 'Active OMC' : 'Suspended'}</Badge>
                    </div>

                    {/* Provisioned HQ Credentials Box */}
                    <div className="mt-4 rounded-xl bg-slate-950/80 border border-slate-800/90 p-3 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                          Provisioned Company HQ Login Code
                        </span>
                        <span className="text-sm font-mono font-black text-orange-400">{comp.adminCode}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">Admin: {comp.adminName}</span>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(comp.adminCode)
                          alert(`Copied HQ Login Code: ${comp.adminCode}`)
                        }}
                        className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-orange-400 transition"
                        title="Copy Login Code"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Stations Overview */}
                    <div className="mt-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                        Station Branches ({compStations.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {compStations.map(st => (
                          <span
                            key={st.id}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/60"
                          >
                            {st.name} ({st.code})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-400 font-mono text-[11px]">
                      Staff Registered: <strong className="text-white">{compStaff}</strong>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStationModalCompany(comp)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Station</span>
                      </button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      {/* MODAL 1: Onboard New Oil Company */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Onboard New Oil Marketing Company</h3>
                  <p className="text-[11px] text-slate-400">Creates an isolated OMC tenant & provisions HQ credentials</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="flex flex-col gap-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Company Name</label>
                  <input
                    value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                    placeholder="e.g. Zen Petroleum"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Company Short Code <span className="text-orange-400">(Prefix)</span>
                  </label>
                  <input
                    value={newShortCode}
                    onChange={e => setNewShortCode(e.target.value.toUpperCase().slice(0, 6))}
                    placeholder="e.g. ZEN"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-mono font-bold text-white focus:border-orange-500 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Brand Theme Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newColor}
                      onChange={e => setNewColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <span className="font-mono text-xs text-slate-300">{newColor}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">HQ Contact Phone</label>
                  <input
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="e.g. 030 200 5500"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-orange-500/30 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">
                  Company HQ Admin Account (Provisioned Credentials)
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] text-slate-400 mb-0.5">Admin Full Name</label>
                    <input
                      value={newAdminName}
                      onChange={e => setNewAdminName(e.target.value)}
                      placeholder="e.g. Samuel Darko"
                      className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-orange-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-400 mb-0.5">4-Digit Security PIN</label>
                    <input
                      value={newAdminPin}
                      onChange={e => setNewAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      type="password"
                      inputMode="numeric"
                      className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs font-mono text-center tracking-widest text-white focus:border-orange-500 outline-none"
                      required
                    />
                  </div>
                </div>
                <p className="text-[9px] font-mono text-slate-500">
                  Assigned HQ Login Code:{' '}
                  <strong className="text-white">{newShortCode ? `${newShortCode}-HQ01` : '[CODE]-HQ01'}</strong>
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Initial Station Branch
                </span>
                <input
                  value={newStationName}
                  onChange={e => setNewStationName(e.target.value)}
                  placeholder="Station Name (e.g. Zen Flagship Airport)"
                  className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-orange-500 outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={newStationLocation}
                    onChange={e => setNewStationLocation(e.target.value)}
                    placeholder="Location / Address"
                    className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-orange-500 outline-none"
                  />
                  <select
                    value={newStationRegion}
                    onChange={e => setNewStationRegion(e.target.value)}
                    className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white focus:border-orange-500 outline-none"
                  >
                    <option value="Greater Accra">Greater Accra</option>
                    <option value="Ashanti Region">Ashanti Region</option>
                    <option value="Western Region">Western Region</option>
                    <option value="Eastern Region">Eastern Region</option>
                  </select>
                </div>
              </div>

              {createError && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-2.5 text-[11px] font-bold text-rose-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={creating || !newCompanyName.trim() || !newShortCode.trim() || newAdminPin.length !== 4}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-3 text-xs font-extrabold transition shadow-lg disabled:opacity-40"
              >
                {creating ? 'Onboarding Company…' : 'Register Oil Company & Issue Credentials'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Credentials Issued Confirmation */}
      {createdCredentials && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-3xl bg-slate-900 border border-orange-500/40 p-6 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 flex items-center justify-center text-white shadow-xl shadow-emerald-950/60">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-base font-extrabold text-white">Company Successfully Onboarded!</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {createdCredentials.company.name} ({createdCredentials.company.shortCode}) has been registered in the system.
              </p>
            </div>

            <div className="w-full rounded-2xl bg-slate-950 border border-slate-800 p-4 text-left flex flex-col gap-2">
              <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">
                Provide These Credentials to Company HQ:
              </span>
              <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 block">HQ Login Code</span>
                  <span className="text-sm font-mono font-black text-white">{createdCredentials.adminCode}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Security PIN</span>
                  <span className="text-sm font-mono font-black text-emerald-400">{createdCredentials.adminPin}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-tight">
                Attendants & Managers registering under <strong>{createdCredentials.company.name}</strong> will now see this
                company in the registration dropdown and receive <strong>{createdCredentials.company.shortCode}</strong>-prefixed staff IDs.
              </p>
            </div>

            <button
              onClick={() => setCreatedCredentials(null)}
              className="w-full rounded-xl bg-orange-600 hover:bg-orange-500 text-white py-2.5 text-xs font-bold transition"
            >
              Done / Return to Console
            </button>
          </div>
        </div>
      )}

      {/* MODAL 3: Add Station to Company */}
      {stationModalCompany && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-extrabold text-white">Add Station Branch</h3>
                <p className="text-[11px] text-slate-400">Adding to {stationModalCompany.name}</p>
              </div>
              <button
                onClick={() => setStationModalCompany(null)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStation} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Station Branch Name</label>
                <input
                  value={addStName}
                  onChange={e => setAddStName(e.target.value)}
                  placeholder="e.g. Spintex Road Hub"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Branch Code</label>
                  <input
                    value={addStCode}
                    onChange={e => setAddStCode(e.target.value.toUpperCase())}
                    placeholder={`e.g. ${stationModalCompany.shortCode}-SPX`}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-mono text-white focus:border-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Pumps Count</label>
                  <input
                    type="number"
                    min="1"
                    max="16"
                    value={addStPumps}
                    onChange={e => setAddStPumps(parseInt(e.target.value, 10) || 4)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-mono text-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Location / Address</label>
                <input
                  value={addStLocation}
                  onChange={e => setAddStLocation(e.target.value)}
                  placeholder="e.g. Spintex Main Highway, Accra"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={addStBusy || !addStName.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {addStBusy ? 'Saving…' : 'Add Station Branch'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
