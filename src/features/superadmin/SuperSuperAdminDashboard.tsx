/**
 * Super Super Admin Dashboard — Master Platform Owner Console.
 * - Onboard, Edit, and Delete Oil Marketing Companies (OMCs) & provision HQ credentials
 * - Manage all company tenants, station branches, and staff accounts
 * - Edit user profiles, Reset PINs, and Delete staff across all OMCs
 * - Export platform-wide network telemetry and summaries
 */

import React, { useEffect, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Copy,
  DollarSign,
  Download,
  Edit2,
  Flame,
  KeyRound,
  Layers,
  Lock,
  MapPin,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserCog,
  Users,
  UserX,
  Zap,
  Tag,
  PackagePlus,
} from 'lucide-react'
import { companyService } from '../../core/services/companyService'
import { supervisorService } from '../../core/services/supervisorService'
import { productService } from '../../core/services/productService'
import { useLiveChanges } from '../../core/services/liveSyncBus'
import { Badge, Card, StatusBar } from '../shared/ui'
import { formatDateTime, formatGHS } from '../../utils/currencyFormatter'
import { GHANA_REGIONS, getStationName } from '../../core/domain/config'
import type { Company, CompanyStation, Attendant, Supervisor, Product, ProductCategory } from '../../core/domain/types'

type SuperAdminTab = 'companies' | 'staff' | 'products' | 'telemetry'

export const SuperSuperAdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SuperAdminTab>('companies')
  const [companies, setCompanies] = useState<Company[]>([])
  const [stationsMap, setStationsMap] = useState<Record<string, CompanyStation[]>>({})
  const [staffCounts, setStaffCounts] = useState<Record<string, number>>({})
  const [allStaff, setAllStaff] = useState<{ attendants: Attendant[]; supervisors: Supervisor[] }>({
    attendants: [],
    supervisors: [],
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [staffSearchQuery, setStaffSearchQuery] = useState('')
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('ALL')
  const [actionNotice, setActionNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Products & Fuel Pricing State
  const [products, setProducts] = useState<Product[]>([])
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [selectedProdCompanyFilter, setSelectedProdCompanyFilter] = useState('ALL')
  const [isCreateProdModalOpen, setIsCreateProdModalOpen] = useState(false)
  const [newProdCompanyId, setNewProdCompanyId] = useState<string>('')
  const [newProdCode, setNewProdCode] = useState('')
  const [newProdName, setNewProdName] = useState('')
  const [newProdCategory, setNewProdCategory] = useState<ProductCategory>('FUEL')
  const [newProdPrice, setNewProdPrice] = useState('')
  const [newProdUnit, setNewProdUnit] = useState('Litre')
  const [newProdColor, setNewProdColor] = useState('#22c55e')
  const [prodSaving, setProdSaving] = useState(false)
  const [prodError, setProdError] = useState<string | null>(null)

  // Edit Product Modal State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editProdName, setEditProdName] = useState('')
  const [editProdPrice, setEditProdPrice] = useState('')
  const [editProdCategory, setEditProdCategory] = useState<ProductCategory>('FUEL')
  const [editProdUnit, setEditProdUnit] = useState('Litre')
  const [editProdColor, setEditProdColor] = useState('#22c55e')
  const [editProdActive, setEditProdActive] = useState(true)
  const [editProdSaving, setEditProdSaving] = useState(false)
  const [editProdError, setEditProdError] = useState<string | null>(null)

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

  // Edit OMC Modal State
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [editCompName, setEditCompName] = useState('')
  const [editCompShortCode, setEditCompShortCode] = useState('')
  const [editCompTagline, setEditCompTagline] = useState('')
  const [editCompColor, setEditCompColor] = useState('#F97316')
  const [editCompPhone, setEditCompPhone] = useState('')
  const [editCompAdminName, setEditCompAdminName] = useState('')
  const [editCompAdminPin, setEditCompAdminPin] = useState('')
  const [savingEditComp, setSavingEditComp] = useState(false)

  // Success Created Company Modal
  const [createdCredentials, setCreatedCredentials] = useState<{
    company: Company
    adminCode: string
    adminPin: string
  } | null>(null)

  // Add / Edit Station Modal State
  const [stationModalCompany, setStationModalCompany] = useState<Company | null>(null)
  const [editingStation, setEditingStation] = useState<CompanyStation | null>(null)
  const [addStName, setAddStName] = useState('')
  const [addStCode, setAddStCode] = useState('')
  const [addStLocation, setAddStLocation] = useState('')
  const [addStRegion, setAddStRegion] = useState('Greater Accra')
  const [addStPumps, setAddStPumps] = useState(4)
  const [addStBusy, setAddStBusy] = useState(false)

  // Staff User Management Modals (Edit, Reset PIN, Delete)
  const [resetPinTarget, setResetPinTarget] = useState<{
    id: string
    name: string
    code: string
    role: 'attendant' | 'supervisor'
  } | null>(null)
  const [newPinValue, setNewPinValue] = useState('')
  const [resetPinBusy, setResetPinBusy] = useState(false)

  const [editStaffTarget, setEditStaffTarget] = useState<{
    id: string
    name: string
    phone: string
    stationId: string
    role: 'attendant' | 'supervisor'
    active: boolean
  } | null>(null)
  const [editStaffBusy, setEditStaffBusy] = useState(false)

  const loadData = async () => {
    setRefreshing(true)
    try {
      const [allCompanies, staff, allProds] = await Promise.all([
        companyService.listAllCompanies(),
        supervisorService.listAllStaff(),
        productService.getAllProducts('ALL'),
      ])
      setCompanies(allCompanies)
      setAllStaff(staff)
      setProducts(allProds)

      const stMap: Record<string, CompanyStation[]> = {}
      const staffMap: Record<string, number> = {}

      for (const comp of allCompanies) {
        const compStations = await companyService.listCompanyStations(comp.id)
        stMap[comp.id] = compStations

        const count =
          staff.attendants.filter(
            a =>
              (a.companyId === comp.id || a.companyShortCode === comp.shortCode || a.employeeCode.startsWith(comp.shortCode)) &&
              a.employeeCode !== 'SUPER-ADMIN' &&
              a.employeeCode !== 'PETRO-MASTER',
          ).length +
          staff.supervisors.filter(
            s =>
              (s.companyId === comp.id || s.companyShortCode === comp.shortCode || s.employeeCode.startsWith(comp.shortCode)) &&
              !s.isSuperAdmin &&
              s.employeeCode !== 'SUPER-ADMIN' &&
              s.employeeCode !== 'PETRO-MASTER',
          ).length
        staffMap[comp.id] = count
      }

      setStationsMap(stMap)
      setStaffCounts(staffMap)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Create Product Handler (Super Admin)
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    setProdError(null)
    const priceNum = Number(newProdPrice)
    if (isNaN(priceNum) || priceNum <= 0) {
      setProdError('Please enter a valid price greater than 0.')
      return
    }
    if (!newProdCode.trim() || !newProdName.trim()) {
      setProdError('Product code and name are required.')
      return
    }

    setProdSaving(true)
    try {
      const targetCompany = companies.find(c => c.id === newProdCompanyId)
      await productService.createProduct({
        companyId: newProdCompanyId || undefined,
        code: newProdCode.trim().toUpperCase(),
        name: newProdName.trim(),
        category: newProdCategory,
        unitPrice: priceNum,
        unit: newProdUnit.trim() || 'Litre',
        color: newProdColor,
        actorName: 'Platform Master Super Admin',
      })
      setActionNotice({
        text: `Created product ${newProdName} (${newProdCode.toUpperCase()}) for ${targetCompany ? targetCompany.name : 'Global Catalog'}`,
        type: 'success',
      })
      setIsCreateProdModalOpen(false)
      setNewProdCode('')
      setNewProdName('')
      setNewProdPrice('')
      void loadData()
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setProdError(err.message || 'Failed to create product.')
    } finally {
      setProdSaving(false)
    }
  }

  // Edit Product Handler (Super Admin)
  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProduct) return
    setEditProdError(null)
    const priceNum = Number(editProdPrice)
    if (isNaN(priceNum) || priceNum <= 0) {
      setEditProdError('Please enter a valid price greater than 0.')
      return
    }

    setEditProdSaving(true)
    try {
      await productService.updateProduct(editingProduct.id, {
        name: editProdName.trim(),
        unitPrice: priceNum,
        category: editProdCategory,
        unit: editProdUnit.trim() || 'Litre',
        color: editProdColor,
        active: editProdActive,
        actorName: 'Platform Master Super Admin',
      })
      setActionNotice({
        text: `Updated product ${editProdName} pricing to GHS ${priceNum.toFixed(2)}/${editProdUnit}`,
        type: 'success',
      })
      setEditingProduct(null)
      void loadData()
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      setEditProdError(err.message || 'Failed to update product.')
    } finally {
      setEditProdSaving(false)
    }
  }

  // Delete Product Handler (Super Admin)
  const handleDeleteProduct = async (prod: Product) => {
    if (!window.confirm(`Are you sure you want to permanently delete product "${prod.name}" (${prod.code})?`)) return
    try {
      await productService.deleteProduct(prod.id, 'Platform Master Super Admin')
      setActionNotice({ text: `Deleted product ${prod.name}`, type: 'success' })
      void loadData()
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      alert(err.message || 'Failed to delete product.')
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

  // Open Edit OMC Modal
  const handleOpenEditCompany = (comp: Company) => {
    setEditingCompany(comp)
    setEditCompName(comp.name)
    setEditCompShortCode(comp.shortCode)
    setEditCompTagline(comp.tagline || '')
    setEditCompColor(comp.primaryColor || '#F97316')
    setEditCompPhone(comp.phone || '')
    setEditCompAdminName(comp.adminName)
    setEditCompAdminPin('')
  }

  // Save Edit OMC
  const handleSaveEditCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCompany) return
    setSavingEditComp(true)
    try {
      await companyService.updateCompany(editingCompany.id, {
        name: editCompName,
        shortCode: editCompShortCode,
        tagline: editCompTagline,
        primaryColor: editCompColor,
        phone: editCompPhone,
        adminName: editCompAdminName,
        adminPin: editCompAdminPin.length === 4 ? editCompAdminPin : undefined,
      })
      setEditingCompany(null)
      setActionNotice({ text: `Successfully updated OMC: ${editCompName}`, type: 'success' })
      void loadData()
      setTimeout(() => setActionNotice(null), 4000)
    } finally {
      setSavingEditComp(false)
    }
  }

  // Delete OMC
  const handleDeleteCompany = async (comp: Company) => {
    if (!window.confirm(`Are you sure you want to permanently delete OMC "${comp.name}" (${comp.shortCode}) and all its stations and staff from the entire system?`)) {
      return
    }
    try {
      await companyService.deleteCompany(comp.id)
      setCompanies(prev => prev.filter(c => c.id !== comp.id && c.shortCode !== comp.shortCode))
      setActionNotice({ text: `Permanently deleted OMC ${comp.name} (${comp.shortCode}) globally.`, type: 'success' })
      void loadData()
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      alert(err.message || 'Failed to delete company')
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

  // Save Station Edit
  const handleSaveStationEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingStation) return
    setAddStBusy(true)
    try {
      await companyService.updateStation(editingStation.id, {
        name: addStName,
        code: addStCode,
        location: addStLocation,
        region: addStRegion,
        pumpsCount: addStPumps,
      })
      setEditingStation(null)
      setActionNotice({ text: `Station ${addStName} updated`, type: 'success' })
      void loadData()
      setTimeout(() => setActionNotice(null), 4000)
    } finally {
      setAddStBusy(false)
    }
  }

  // Delete Station
  const handleDeleteStation = async (st: CompanyStation) => {
    if (!window.confirm(`Are you sure you want to delete station "${st.name}"?`)) return
    try {
      await companyService.deleteStation(st.id)
      setActionNotice({ text: `Station ${st.name} deleted`, type: 'success' })
      void loadData()
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      alert(err.message || 'Failed to delete station')
    }
  }

  // Reset Staff PIN
  const handleExecuteResetPin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPinTarget || newPinValue.length !== 4) return
    setResetPinBusy(true)
    try {
      await supervisorService.resetStaffPin(
        resetPinTarget.id,
        resetPinTarget.role,
        newPinValue,
        'Super Admin',
      )
      setActionNotice({
        text: `Successfully reset PIN for ${resetPinTarget.name} (${resetPinTarget.code}) to ${newPinValue}`,
        type: 'success',
      })
      setResetPinTarget(null)
      setNewPinValue('')
      void loadData()
      setTimeout(() => setActionNotice(null), 5000)
    } catch (err: any) {
      alert(err.message || 'Failed to reset PIN')
    } finally {
      setResetPinBusy(false)
    }
  }

  // Save Edit Staff
  const handleSaveEditStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editStaffTarget) return
    setEditStaffBusy(true)
    try {
      await supervisorService.updateStaff(
        editStaffTarget.id,
        editStaffTarget.role,
        {
          fullName: editStaffTarget.name,
          phone: editStaffTarget.phone,
          stationId: editStaffTarget.stationId,
          active: editStaffTarget.active,
        },
        'Super Admin',
      )
      setActionNotice({ text: `Updated staff profile for ${editStaffTarget.name}`, type: 'success' })
      setEditStaffTarget(null)
      void loadData()
      setTimeout(() => setActionNotice(null), 4000)
    } finally {
      setEditStaffBusy(false)
    }
  }

  // Delete Staff
  const handleDeleteStaff = async (id: string, role: 'attendant' | 'supervisor', name: string, code: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete staff member ${name} (${code})?`)) return
    try {
      await supervisorService.deleteStaff(id, role, 'Super Admin')
      setActionNotice({ text: `Deleted ${role} ${name} (${code})`, type: 'success' })
      void loadData()
      setTimeout(() => setActionNotice(null), 4000)
    } catch (err: any) {
      alert(err.message || 'Failed to delete staff')
    }
  }

  // Export Staff Roster to CSV
  const handleExportStaffCsv = () => {
    const rows = [
      ['Employee Code', 'Full Name', 'Role', 'Company', 'Station', 'Phone', 'Status'],
      ...allStaff.supervisors
        .filter(s => !s.isSuperAdmin && s.employeeCode !== 'SUPER-ADMIN' && s.employeeCode !== 'PETRO-MASTER')
        .map(s => [
          s.employeeCode,
          s.fullName,
          'Station Manager',
          s.companyShortCode || 'PV',
          getStationName(s.stationId),
          s.phone || '',
          s.active ? 'ACTIVE' : s.approvalStatus,
        ]),
      ...allStaff.attendants
        .filter(a => a.employeeCode !== 'SUPER-ADMIN' && a.employeeCode !== 'PETRO-MASTER')
        .map(a => [
          a.employeeCode,
          a.fullName,
          'Fuel Attendant',
          a.companyShortCode || 'PV',
          getStationName(a.stationId),
          a.phone || '',
          a.active ? 'ACTIVE' : a.approvalStatus,
        ]),
    ]
    const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `petroview-global-staff-roster.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const filteredCompanies = companies.filter(
    c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.shortCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.adminCode.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const combinedStaff = [
    ...allStaff.supervisors
      .filter(s => !s.isSuperAdmin && s.employeeCode !== 'SUPER-ADMIN' && s.employeeCode !== 'PETRO-MASTER')
      .map(s => {
        const isHQ = !!s.isHeadOffice || s.employeeCode.includes('HQ')
        let cleanName = s.fullName
        if (isHQ && (cleanName.toUpperCase() === 'SUPER-ADMIN' || cleanName.toUpperCase().includes('SUPER'))) {
          cleanName = `${s.companyShortCode || ''} HQ Admin`.trim()
        }
        return {
          ...s,
          fullName: cleanName,
          staffType: (isHQ ? 'hq_admin' : 'supervisor') as 'hq_admin' | 'supervisor',
        }
      }),
    ...allStaff.attendants
      .filter(a => a.employeeCode !== 'SUPER-ADMIN' && a.employeeCode !== 'PETRO-MASTER')
      .map(a => ({ ...a, staffType: 'attendant' as const })),
  ].filter(s => {
    const matchCompany =
      selectedCompanyFilter === 'ALL' ||
      s.companyId === selectedCompanyFilter ||
      s.employeeCode.startsWith(selectedCompanyFilter)
    const matchSearch =
      !staffSearchQuery.trim() ||
      s.fullName.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
      s.employeeCode.toLowerCase().includes(staffSearchQuery.toLowerCase())
    return matchCompany && matchSearch
  })

  const totalStationsCount = Object.values(stationsMap).reduce((a, b) => a + b.length, 0)
  const totalStaffCount = Object.values(staffCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="h-full flex flex-col bg-[#080c14] overflow-y-auto print:bg-white print:text-black">
      <StatusBar online />

      {/* Top Super Admin Header */}
      <div className="shrink-0 flex flex-wrap items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800/80 gap-4 sticky top-0 z-30 shadow-lg print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 flex items-center justify-center shadow-lg shadow-orange-950/60 border border-orange-400/40">
            <Sparkles className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white">Super Admin Console (Platform Master)</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold uppercase">
                Tier 1 Super Admin
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Multi-Tenant Downstream Petroleum Management · Global OMC Registry
            </p>
          </div>
        </div>

        {/* Top Actions & Navigation Tabs */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('companies')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'companies'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>OMCs ({companies.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('staff')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'staff'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Staff Management ({totalStaffCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('products')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                activeTab === 'products'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Products & Pricing ({products.length})</span>
            </button>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-bold transition shadow-lg shadow-orange-950/50 flex items-center gap-1.5 border border-orange-400/30 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Onboard OMC</span>
          </button>

          <button
            onClick={() => void loadData()}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            title="Refresh Platform State"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Action Notification */}
      {actionNotice && (
        <div className="px-6 py-2.5 bg-emerald-950 border-b border-emerald-600/50 flex items-center justify-center gap-2 text-xs font-bold text-emerald-200 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionNotice.text}</span>
        </div>
      )}

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
              <span className="uppercase text-[10px]">Total Platform Staff</span>
            </div>
            <p className="text-3xl font-black text-white">{totalStaffCount}</p>
            <p className="text-[11px] text-slate-500 mt-1">Attendants & Station Managers</p>
          </Card>

          <Card className="p-4 bg-slate-900/90 border-cyan-500/30 shadow-md">
            <div className="flex items-center gap-2 mb-2 text-cyan-400 font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span className="uppercase text-[10px]">Platform Security</span>
            </div>
            <p className="text-3xl font-black text-emerald-400">100%</p>
            <p className="text-[11px] text-slate-500 mt-1">Role & tenant isolation active</p>
          </Card>
        </div>

        {/* ----------------- TAB 1: OIL MARKETING COMPANIES DIRECTORY ----------------- */}
        {activeTab === 'companies' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-orange-400" />
                  <span>Onboarded Oil Marketing Companies (OMCs)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Super Admin can onboard, edit details, provision credentials, and manage branches for any OMC.
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
                            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-md shrink-0"
                            style={{ backgroundColor: comp.primaryColor || '#F97316' }}
                          >
                            {comp.shortCode}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white">{comp.name}</h4>
                            <p className="text-[11px] text-slate-400">{comp.tagline}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditCompany(comp)}
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
                            title="Edit OMC Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCompany(comp)}
                            className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 transition"
                            title="Delete OMC"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                            Station Branches ({compStations.length})
                          </span>
                          <button
                            onClick={() => {
                              setStationModalCompany(comp)
                              setEditingStation(null)
                              setAddStName('')
                              setAddStCode(`${comp.shortCode}-${Date.now().toString().slice(-3)}`)
                              setAddStLocation('')
                            }}
                            className="text-[10px] text-orange-400 hover:underline font-bold flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Branch
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {compStations.length === 0 ? (
                            <span className="text-[10px] text-slate-500 italic">No station branches added yet.</span>
                          ) : (
                            compStations.map(st => (
                              <div
                                key={st.id}
                                className="group flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/60"
                              >
                                <span>{st.name} ({st.code})</span>
                                <button
                                  onClick={() => {
                                    setEditingStation(st)
                                    setAddStName(st.name)
                                    setAddStCode(st.code)
                                    setAddStLocation(st.location)
                                    setAddStRegion(st.region)
                                    setAddStPumps(st.pumpsCount)
                                  }}
                                  className="text-slate-400 hover:text-orange-400 ml-1 opacity-0 group-hover:opacity-100 transition"
                                  title="Edit Station"
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => handleDeleteStation(st)}
                                  className="text-slate-400 hover:text-rose-400 ml-0.5 opacity-0 group-hover:opacity-100 transition"
                                  title="Delete Station"
                                >
                                  ✕
                                </button>
                              </div>
                            ))
                          )}
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
                          onClick={() => {
                            setSelectedCompanyFilter(comp.id)
                            setActiveTab('staff')
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>View Staff</span>
                        </button>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* ----------------- TAB 2: GLOBAL STAFF MANAGEMENT ----------------- */}
        {activeTab === 'staff' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-orange-400" />
                  <span>Platform-Wide Staff Management</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Super Admin can edit staff profiles, reset 4-digit PINs, and delete staff across all OMCs.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedCompanyFilter}
                  onChange={e => setSelectedCompanyFilter(e.target.value)}
                  className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-white focus:border-orange-500 outline-none"
                >
                  <option value="ALL">All Companies (OMCs)</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.shortCode})
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={staffSearchQuery}
                    onChange={e => setStaffSearchQuery(e.target.value)}
                    placeholder="Search name or ID…"
                    className="rounded-xl bg-slate-900 border border-slate-800 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none"
                  />
                </div>

                <button
                  onClick={handleExportStaffCsv}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition"
                  title="Export Staff CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <Card className="divide-y divide-slate-800/70 overflow-hidden">
              {combinedStaff.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-slate-500">No staff members found matching filters.</p>
              ) : (
                combinedStaff.map(staff => (
                  <div key={staff.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                          staff.staffType === 'hq_admin'
                            ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                            : staff.staffType === 'supervisor'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {staff.staffType === 'hq_admin' ? (
                          <Building2 className="w-4 h-4" />
                        ) : staff.staffType === 'supervisor' ? (
                          <UserCog className="w-4 h-4" />
                        ) : (
                          <Zap className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-white truncate">{staff.fullName}</p>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                              staff.staffType === 'hq_admin'
                                ? 'bg-orange-500/20 text-orange-300'
                                : staff.staffType === 'supervisor'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {staff.staffType === 'hq_admin' ? 'HQ Admin' : staff.staffType}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {staff.companyShortCode || 'PV'}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                          <span className="font-bold text-slate-300">{staff.employeeCode}</span>
                          <span>·</span>
                          <span>{getStationName(staff.stationId)}</span>
                          {staff.phone && staff.phone !== 'SUPER-ADMIN' && !staff.phone.includes('SUPER') && (
                            <>
                              <span>·</span>
                              <span>{staff.phone}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons (Reset PIN, Edit, Delete) */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={staff.active ? 'success' : staff.approvalStatus === 'PENDING' ? 'warning' : 'danger'}>
                        {staff.active ? 'Active' : staff.approvalStatus}
                      </Badge>

                      <button
                        onClick={() => {
                          setResetPinTarget({
                            id: staff.id,
                            name: staff.fullName,
                            code: staff.employeeCode,
                            role: staff.staffType === 'hq_admin' ? 'supervisor' : staff.staffType,
                          })
                          setNewPinValue('')
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/60 text-amber-400 text-[11px] font-bold transition flex items-center gap-1"
                        title="Reset 4-Digit Security PIN"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Reset PIN</span>
                      </button>

                      <button
                        onClick={() =>
                          setEditStaffTarget({
                            id: staff.id,
                            name: staff.fullName,
                            phone: staff.phone || '',
                            stationId: staff.stationId,
                            role: staff.staffType === 'hq_admin' ? 'supervisor' : staff.staffType,
                            active: staff.active,
                          })
                        }
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white transition"
                        title="Edit User"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteStaff(staff.id, staff.staffType === 'hq_admin' ? 'supervisor' : staff.staffType, staff.fullName, staff.employeeCode)}
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-rose-400 hover:text-rose-300 transition"
                        title="Delete User"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        )}

        {/* ----------------- TAB 3: PRODUCTS & FUEL PRICING ----------------- */}
        {activeTab === 'products' && (
          <div className="flex flex-col gap-4">
            {/* Header Bar */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
              <div>
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-400" />
                  <h3 className="text-sm font-black text-white">Global Fuel Products & Multi-Tenant Pricing Engine</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Configure official retail prices (GHS/L) and product catalog for all OMCs or individual company tenants.
                  Prices set here propagate instantly to managers and pump attendants.
                </p>
              </div>
              <button
                onClick={() => {
                  setNewProdCompanyId(selectedProdCompanyFilter !== 'ALL' ? selectedProdCompanyFilter : '')
                  setIsCreateProdModalOpen(true)
                }}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg transition shrink-0 border border-orange-400/30"
              >
                <Plus className="w-4 h-4" />
                <span>Add Fuel / Product</span>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* OMC Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-bold shrink-0">Filter OMC:</span>
                <select
                  value={selectedProdCompanyFilter}
                  onChange={e => setSelectedProdCompanyFilter(e.target.value)}
                  className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-white outline-none focus:border-orange-500"
                >
                  <option value="ALL">All Products (Global & OMCs)</option>
                  <option value="GLOBAL">Global Platform Defaults</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.shortCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={productSearchQuery}
                  onChange={e => setProductSearchQuery(e.target.value)}
                  placeholder="Search products by code or name (e.g. PMS, AGO, V-Power, Diesel Max)…"
                  className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-9 pr-4 py-2 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none"
                />
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {products
                .filter(p => {
                  if (selectedProdCompanyFilter === 'GLOBAL') {
                    if (p.companyId) return false
                  } else if (selectedProdCompanyFilter !== 'ALL') {
                    if (p.companyId !== selectedProdCompanyFilter) return false
                  }
                  if (!productSearchQuery.trim()) return true
                  const q = productSearchQuery.toLowerCase()
                  return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
                })
                .map(prod => {
                  const comp = companies.find(c => c.id === prod.companyId)
                  return (
                    <Card
                      key={prod.id}
                      className="p-4 bg-slate-900/90 border border-slate-800 hover:border-slate-700 flex flex-col justify-between gap-3 shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full ring-2 ring-white/10 shrink-0"
                            style={{ backgroundColor: prod.color || '#22c55e' }}
                          />
                          <div>
                            <h4 className="text-xs font-bold text-white leading-tight">{prod.name}</h4>
                            <span className="text-[10px] font-mono text-slate-500 block">
                              Code: <strong className="text-orange-400 font-bold">{prod.code}</strong> · {prod.category}
                            </span>
                          </div>
                        </div>
                        <Badge tone={prod.active ? 'success' : 'default'}>
                          {prod.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Retail Unit Price</span>
                        <span className="text-base font-mono font-black text-orange-400">
                          GHS {prod.unitPrice.toFixed(2)} <span className="text-xs font-normal text-slate-500">/ {prod.unit}</span>
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px] text-slate-500">
                        <span className="truncate max-w-[150px]">
                          {comp ? (
                            <strong className="text-slate-300">{comp.name}</strong>
                          ) : (
                            'Global Base Default'
                          )}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingProduct(prod)
                              setEditProdName(prod.name)
                              setEditProdPrice(String(prod.unitPrice))
                              setEditProdCategory(prod.category)
                              setEditProdUnit(prod.unit)
                              setEditProdColor(prod.color || '#22c55e')
                              setEditProdActive(prod.active)
                              setEditProdError(null)
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold flex items-center gap-1 transition"
                          >
                            <Edit2 className="w-3 h-3 text-orange-400" /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(prod)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
            </div>
          </div>
        )}
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
                    {GHANA_REGIONS.map(reg => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
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

      {/* MODAL 2: Edit OMC Modal */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Edit OMC Profile</h3>
              </div>
              <button
                onClick={() => setEditingCompany(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditCompany} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Company Name</label>
                <input
                  value={editCompName}
                  onChange={e => setEditCompName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Short Code</label>
                  <input
                    value={editCompShortCode}
                    onChange={e => setEditCompShortCode(e.target.value.toUpperCase())}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-mono font-bold text-white focus:border-orange-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Theme Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={editCompColor}
                      onChange={e => setEditCompColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <span className="font-mono text-xs text-slate-300">{editCompColor}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Company Tagline</label>
                <input
                  value={editCompTagline}
                  onChange={e => setEditCompTagline(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">HQ Contact Phone</label>
                <input
                  value={editCompPhone}
                  onChange={e => setEditCompPhone(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">HQ Administrator Account</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] text-slate-500 mb-0.5">Admin Full Name</label>
                    <input
                      value={editCompAdminName}
                      onChange={e => setEditCompAdminName(e.target.value)}
                      className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-slate-500 mb-0.5">New Admin PIN (Optional)</label>
                    <input
                      value={editCompAdminPin}
                      onChange={e => setEditCompAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Leave blank to keep"
                      type="password"
                      inputMode="numeric"
                      className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs font-mono text-center tracking-widest text-white outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingEditComp || !editCompName.trim() || !editCompShortCode.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {savingEditComp ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Credentials Issued Confirmation */}
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

      {/* MODAL 4: Add / Edit Station */}
      {(stationModalCompany || editingStation) && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-extrabold text-white">
                  {editingStation ? 'Edit Station Branch' : 'Add Station Branch'}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {editingStation ? editingStation.name : `Adding to ${stationModalCompany?.name}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setStationModalCompany(null)
                  setEditingStation(null)
                }}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={editingStation ? handleSaveStationEdit : handleAddStation} className="flex flex-col gap-3 text-xs">
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
                    placeholder="e.g. SPX-01"
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

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Region</label>
                <select
                  value={addStRegion}
                  onChange={e => setAddStRegion(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                >
                  {GHANA_REGIONS.map(reg => (
                    <option key={reg} value={reg}>
                      {reg}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={addStBusy || !addStName.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {addStBusy ? 'Saving…' : editingStation ? 'Save Station' : 'Add Station Branch'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Reset Staff PIN */}
      {resetPinTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-3xl bg-slate-900 border border-amber-500/40 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-extrabold text-white">Reset Staff Security PIN</h3>
              </div>
              <button
                onClick={() => setResetPinTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Enter a new 4-digit security PIN for <strong className="text-white">{resetPinTarget.name}</strong> ({resetPinTarget.code}).
            </p>

            <form onSubmit={handleExecuteResetPin} className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">New 4-Digit PIN</label>
                <input
                  value={newPinValue}
                  onChange={e => setNewPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  type="password"
                  maxLength={4}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-base font-mono tracking-widest text-center text-white focus:border-amber-500 outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={resetPinBusy || newPinValue.length !== 4}
                className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-white py-2.5 text-xs font-bold transition disabled:opacity-40"
              >
                {resetPinBusy ? 'Resetting PIN…' : 'Confirm PIN Reset'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: Edit Staff */}
      {editStaffTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserCog className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Edit Staff Profile</h3>
              </div>
              <button
                onClick={() => setEditStaffTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditStaff} className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Full Name</label>
                <input
                  value={editStaffTarget.name}
                  onChange={e => setEditStaffTarget({ ...editStaffTarget, name: e.target.value })}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Phone</label>
                <input
                  value={editStaffTarget.phone || ''}
                  onChange={e => setEditStaffTarget({ ...editStaffTarget, phone: e.target.value })}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Assigned Station</label>
                <select
                  value={editStaffTarget.stationId}
                  onChange={e => setEditStaffTarget({ ...editStaffTarget, stationId: e.target.value })}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                >
                  {Object.values(stationsMap).flat().length > 0 ? (
                    Object.values(stationsMap).flat().map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.location} · {s.region})
                      </option>
                    ))
                  ) : (
                    <option value="">No stations registered yet</option>
                  )}
                </select>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] font-bold text-slate-300">Account Active</span>
                <input
                  type="checkbox"
                  checked={editStaffTarget.active}
                  onChange={e => setEditStaffTarget({ ...editStaffTarget, active: e.target.checked })}
                  className="w-4 h-4 accent-orange-500 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={editStaffBusy || !editStaffTarget.name.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {editStaffBusy ? 'Saving…' : 'Save Staff Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: Super Admin Create Product */}
      {isCreateProdModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Create Product / Set Fuel Pricing</h3>
              </div>
              <button
                onClick={() => setIsCreateProdModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {prodError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold">
                {prodError}
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Assign to OMC Tenant (Or Platform Default)
                </label>
                <select
                  value={newProdCompanyId}
                  onChange={e => setNewProdCompanyId(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                >
                  <option value="">Global Base Default (All Companies)</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.shortCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Product Code</label>
                  <input
                    value={newProdCode}
                    onChange={e => setNewProdCode(e.target.value.toUpperCase())}
                    placeholder="e.g. PMS, AGO, V-POWER"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-mono text-white uppercase focus:border-orange-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Category</label>
                  <select
                    value={newProdCategory}
                    onChange={e => setNewProdCategory(e.target.value as ProductCategory)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  >
                    <option value="FUEL">Fuel (Petrol / Diesel)</option>
                    <option value="LUBRICANT">Lubricants / Engine Oils</option>
                    <option value="LPG">LPG / Auto Gas</option>
                    <option value="OTHER">Other Item</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Product Name</label>
                <input
                  value={newProdName}
                  onChange={e => setNewProdName(e.target.value)}
                  placeholder="e.g. Super Unleaded Petrol (PMS)"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unit Price (GHS)</label>
                  <input
                    type="text"
                    value={newProdPrice}
                    onChange={e => setNewProdPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="14.80"
                    inputMode="decimal"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 font-mono text-sm font-bold text-orange-400 focus:border-orange-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unit of Measure</label>
                  <input
                    value={newProdUnit}
                    onChange={e => setNewProdUnit(e.target.value)}
                    placeholder="Litre"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Color Theme</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newProdColor}
                    onChange={e => setNewProdColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                  />
                  <span className="font-mono text-xs text-slate-400">{newProdColor}</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={prodSaving}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {prodSaving ? 'Saving…' : 'Create Product in Engine'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: Super Admin Edit Product */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Edit Product & Pricing</h3>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {editProdError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold">
                {editProdError}
              </div>
            )}

            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
              <p className="text-xs font-bold text-white">{editingProduct.name}</p>
              <p className="text-[10px] font-mono text-slate-400">
                Code: <strong className="text-orange-400 font-bold">{editingProduct.code}</strong> · Scope:{' '}
                {editingProduct.companyId
                  ? companies.find(c => c.id === editingProduct.companyId)?.name || editingProduct.companyId
                  : 'Global Platform Default'}
              </p>
            </div>

            <form onSubmit={handleSaveEditProduct} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Product Name</label>
                <input
                  value={editProdName}
                  onChange={e => setEditProdName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Retail Price (GHS)</label>
                  <input
                    type="text"
                    value={editProdPrice}
                    onChange={e => setEditProdPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 font-mono text-sm font-bold text-orange-400 focus:border-orange-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unit of Measure</label>
                  <input
                    value={editProdUnit}
                    onChange={e => setEditProdUnit(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] font-bold text-slate-300">Active (Visible across stations)</span>
                <input
                  type="checkbox"
                  checked={editProdActive}
                  onChange={e => setEditProdActive(e.target.checked)}
                  className="w-4 h-4 accent-orange-500 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={editProdSaving}
                className="w-full rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 text-white py-2.5 text-xs font-bold transition mt-2 disabled:opacity-40"
              >
                {editProdSaving ? 'Saving Changes…' : 'Update Product & Price'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
