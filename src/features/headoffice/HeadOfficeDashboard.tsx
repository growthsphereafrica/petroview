/**
 * Production Head Office Dashboard & Company HQ Portal.
 * - Live enterprise financial rollup computed from production DB scoped to the OMC
 * - Custom Date Range filtering (Today, 7 Days, 30 Days, Custom from-to dates)
 * - Staff Summaries & Attendance/Sales Performance Reports for any selected period
 * - Staff User Management: Edit staff profile, Reset 4-digit PIN, and Delete staff
 * - Staff Onboarding & Approval Queue scoped to Company
 * - Export Reports to Excel (CSV) and Print-Ready PDF
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Clock3,
  DollarSign,
  Download,
  Edit2,
  Flame,
  KeyRound,
  Layers,
  Lock,
  MapPin,
  Phone,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  UserX,
  Zap,
  Tag,
  PackagePlus,
  Plus,
} from 'lucide-react'
import { rollupService, type HeadOfficeSummary, type AttendantRollup } from '../../core/services/rollupService'
import { supervisorService } from '../../core/services/supervisorService'
import { productService } from '../../core/services/productService'
import { useLiveChanges } from '../../core/services/liveSyncBus'
import { shiftStatusLabel, shiftStatusTone } from '../supervisor/util'
import { Badge, Card, StatusBar } from '../shared/ui'
import { formatDateTime, formatGHS, formatLitres } from '../../utils/currencyFormatter'
import { PRODUCTION_STATIONS, getStationName } from '../../core/domain/config'
import { loadUnifiedSession, type UnifiedSession } from '../unified/UnifiedLoginScreen'
import type { Attendant, Supervisor, Product, ProductCategory } from '../../core/domain/types'

type RangePreset = 'today' | '7days' | '30days' | 'all' | 'custom'
type HQTab = 'overview' | 'summaries' | 'approvals' | 'staff' | 'products'

const Splash: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center bg-[#090d16] gap-3">
    <span className="w-10 h-10 border-4 border-slate-800 border-t-orange-500 rounded-full animate-spin" />
    <p className="text-xs font-mono text-slate-400">Computing company rollup…</p>
  </div>
)

export const ProductionHeadOfficeDashboard: React.FC<{ session?: UnifiedSession }> = ({ session: propsSession }) => {
  const activeSession = propsSession || loadUnifiedSession()
  const companyId = activeSession?.companyId
  const companyName = activeSession?.companyName || 'PetroView'
  const companyShortCode = activeSession?.companyShortCode || 'PV'

  const [activeTab, setActiveTab] = useState<HQTab>('overview')
  const [summary, setSummary] = useState<HeadOfficeSummary | null>(null)
  const [rangePreset, setRangePreset] = useState<RangePreset>('today')
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [refreshing, setRefreshing] = useState(false)

  // Products & Fuel Pricing State (scoped to company)
  const [products, setProducts] = useState<Product[]>([])
  const [productSearch, setProductSearch] = useState('')
  const [isCreateProdOpen, setIsCreateProdOpen] = useState(false)
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

  // Staff & Approvals State (scoped to company)
  const [pendingStaff, setPendingStaff] = useState<{ attendants: Attendant[]; supervisors: Supervisor[] }>({
    attendants: [],
    supervisors: [],
  })
  const [allStaff, setAllStaff] = useState<{ attendants: Attendant[]; supervisors: Supervisor[] }>({
    attendants: [],
    supervisors: [],
  })
  const [staffSearch, setStaffSearch] = useState('')
  const [stationFilter, setStationFilter] = useState('ALL')
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // Selected Attendant Detail Drawer
  const [selectedStaffSummary, setSelectedStaffSummary] = useState<AttendantRollup | null>(null)

  // Reset PIN State
  const [resetPinTarget, setResetPinTarget] = useState<{
    id: string
    name: string
    code: string
    role: 'attendant' | 'supervisor'
  } | null>(null)
  const [newPinValue, setNewPinValue] = useState('')
  const [resetPinBusy, setResetPinBusy] = useState(false)

  // Edit Staff State
  const [editStaffTarget, setEditStaffTarget] = useState<{
    id: string
    name: string
    phone: string
    stationId: string
    role: 'attendant' | 'supervisor'
    active: boolean
  } | null>(null)
  const [editStaffBusy, setEditStaffBusy] = useState(false)

  const loadData = useMemo(
    () => async () => {
      setRefreshing(true)
      try {
        let daysArg: number | null | undefined = undefined
        let startArg: string | undefined = undefined
        let endArg: string | undefined = undefined

        if (rangePreset === 'today') daysArg = 1
        else if (rangePreset === '7days') daysArg = 7
        else if (rangePreset === '30days') daysArg = 30
        else if (rangePreset === 'all') daysArg = null
        else if (rangePreset === 'custom') {
          startArg = customStartDate
          endArg = customEndDate
        }

        const [sum, pending, all, prods] = await Promise.all([
          rollupService.summary({
            days: daysArg,
            companyId,
            startDate: startArg,
            endDate: endArg,
          }),
          supervisorService.listPendingStaff(companyId),
          supervisorService.listAllStaff(companyId),
          productService.getAllProducts(companyId),
        ])
        setSummary(sum)
        setPendingStaff(pending)
        setAllStaff(all)
        setProducts(prods)
      } finally {
        setRefreshing(false)
      }
    },
    [rangePreset, customStartDate, customEndDate, companyId],
  )

  // Create Product Handler
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
      await productService.createProduct({
        companyId,
        code: newProdCode.trim().toUpperCase(),
        name: newProdName.trim(),
        category: newProdCategory,
        unitPrice: priceNum,
        unit: newProdUnit.trim() || 'Litre',
        color: newProdColor,
        actorName: `${companyName} HQ Admin`,
      })
      setActionMessage({ text: `Created product ${newProdName} (${newProdCode.toUpperCase()}) at GHS ${priceNum.toFixed(2)}/${newProdUnit}`, type: 'success' })
      setIsCreateProdOpen(false)
      setNewProdCode('')
      setNewProdName('')
      setNewProdPrice('')
      void loadData()
      setTimeout(() => setActionMessage(null), 4000)
    } catch (err: any) {
      setProdError(err.message || 'Failed to create product.')
    } finally {
      setProdSaving(false)
    }
  }

  // Edit Product Handler
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
        actorName: `${companyName} HQ Admin`,
      })
      setActionMessage({ text: `Updated product ${editProdName} pricing to GHS ${priceNum.toFixed(2)}/${editProdUnit}`, type: 'success' })
      setEditingProduct(null)
      void loadData()
      setTimeout(() => setActionMessage(null), 4000)
    } catch (err: any) {
      setEditProdError(err.message || 'Failed to update product.')
    } finally {
      setEditProdSaving(false)
    }
  }

  // Delete Product Handler
  const handleDeleteProduct = async (id: string, name: string, code: string) => {
    if (!window.confirm(`Are you sure you want to remove product ${name} (${code}) from ${companyName}?`)) return
    try {
      await productService.deleteProduct(id, `${companyName} HQ Admin`)
      setActionMessage({ text: `Removed product ${name} (${code})`, type: 'success' })
      void loadData()
      setTimeout(() => setActionMessage(null), 4000)
    } catch (err: any) {
      alert(err.message || 'Failed to delete product.')
    }
  }

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Live replication: database changes trigger rollup & approval refresh
  useLiveChanges(
    useMemo(
      () => () => {
        void loadData()
      },
      [loadData],
    ),
  )

  const topStations = useMemo(() => {
    if (!summary) return []
    return [...summary.stations].sort((a, b) => b.salesToday - a.salesToday)
  }, [summary])

  const totalPendingCount = pendingStaff.attendants.length + pendingStaff.supervisors.length

  const handleApprove = async (id: string, role: 'attendant' | 'supervisor', name: string, code: string) => {
    setApprovingId(id)
    try {
      const approverTitle = `${companyName} HQ Admin`
      await supervisorService.approveStaff(id, role, approverTitle)
      setActionMessage({ text: `Successfully approved & activated ${name} (${code}).`, type: 'success' })
      void loadData()
      setTimeout(() => setActionMessage(null), 4000)
    } catch {
      setActionMessage({ text: `Failed to approve ${name}.`, type: 'error' })
    } finally {
      setApprovingId(null)
    }
  }

  const handleReject = async (id: string, role: 'attendant' | 'supervisor', name: string) => {
    if (!window.confirm(`Are you sure you want to reject registration for ${name}?`)) return
    setApprovingId(id)
    try {
      const approverTitle = `${companyName} HQ Admin`
      await supervisorService.rejectStaff(id, role, approverTitle, `Application rejected by ${companyName} HQ Administrator`)
      setActionMessage({ text: `Registration for ${name} has been rejected.`, type: 'success' })
      void loadData()
      setTimeout(() => setActionMessage(null), 4000)
    } catch {
      setActionMessage({ text: `Failed to reject ${name}.`, type: 'error' })
    } finally {
      setApprovingId(null)
    }
  }

  // Execute Reset PIN
  const handleExecuteResetPin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPinTarget || newPinValue.length !== 4) return
    setResetPinBusy(true)
    try {
      await supervisorService.resetStaffPin(
        resetPinTarget.id,
        resetPinTarget.role,
        newPinValue,
        `${companyName} HQ Admin`,
      )
      setActionMessage({
        text: `Successfully reset PIN for ${resetPinTarget.name} (${resetPinTarget.code}) to ${newPinValue}`,
        type: 'success',
      })
      setResetPinTarget(null)
      setNewPinValue('')
      void loadData()
      setTimeout(() => setActionMessage(null), 5000)
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
        `${companyName} HQ Admin`,
      )
      setActionMessage({ text: `Updated staff profile for ${editStaffTarget.name}`, type: 'success' })
      setEditStaffTarget(null)
      void loadData()
      setTimeout(() => setActionMessage(null), 4000)
    } finally {
      setEditStaffBusy(false)
    }
  }

  // Delete Staff
  const handleDeleteStaff = async (id: string, role: 'attendant' | 'supervisor', name: string, code: string) => {
    if (!window.confirm(`Are you sure you want to permanently remove staff member ${name} (${code}) from ${companyName}?`)) {
      return
    }
    try {
      await supervisorService.deleteStaff(id, role, `${companyName} HQ Admin`)
      setActionMessage({ text: `Removed ${role} ${name} (${code})`, type: 'success' })
      void loadData()
      setTimeout(() => setActionMessage(null), 4000)
    } catch (err: any) {
      alert(err.message || 'Failed to delete staff')
    }
  }

  // Export Staff Summaries to Excel (CSV)
  const downloadExcelCsv = () => {
    if (!summary) return
    const periodLabel =
      rangePreset === 'custom'
        ? `${customStartDate}_to_${customEndDate}`
        : rangePreset

    const header = [
      'Staff Code',
      'Staff Name',
      'Assigned Station',
      'Shifts Closed',
      'Total Litres Dispensed (L)',
      'Total Revenue Sales (GHS)',
      'Net Variance (GHS)',
      'Approved Shifts',
      'Rejected Shifts',
      'Average Shift Sales (GHS)',
      'Status',
    ]

    const rows = summary.attendants.map(a => [
      a.employeeCode,
      a.name,
      a.stationName,
      a.shiftsClosed,
      a.litres.toFixed(2),
      a.sales.toFixed(2),
      a.variance.toFixed(2),
      a.approved,
      a.rejected,
      a.avgShiftSales.toFixed(2),
      a.active ? 'ACTIVE' : a.approvalStatus,
    ])

    const stationHeader = ['', 'Station Name', 'Station Code', 'Location', 'Region', 'Total Litres (L)', 'Total Sales (GHS)', 'Variance (GHS)', 'Shifts']
    const stationRows = summary.stations.map(s => [
      '',
      s.name,
      s.code,
      s.location,
      s.region,
      s.litresToday.toFixed(2),
      s.salesToday.toFixed(2),
      s.netVariance.toFixed(2),
      s.shiftCount,
    ])

    const allCsv = [
      [`${companyName} Enterprise Sales & Staff Summary Report - Period: ${periodLabel}`],
      [`Generated at: ${formatDateTime(summary.generatedAt)}`],
      [''],
      ['STAFF PERFORMANCE SUMMARY'],
      header,
      ...rows,
      [''],
      ['STATION BRANCH SUMMARY'],
      stationHeader,
      ...stationRows,
    ]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([allCsv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${companyShortCode.toLowerCase()}-staff-report-${periodLabel}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Print PDF
  const printReport = () => window.print()

  if (!summary) return <Splash />

  // Filtered list of all staff
  const combinedStaff = [
    ...allStaff.supervisors
      .filter(s => !s.isSuperAdmin && s.employeeCode !== 'SUPER-ADMIN' && s.employeeCode !== 'PETRO-MASTER')
      .map(s => {
        const isHQ = !!s.isHeadOffice || (s.employeeCode && s.employeeCode.includes('HQ'))
        const rawName = s.fullName?.trim() || ''
        const cleanName =
          isHQ && (rawName === 'SUPER-ADMIN' || rawName.toUpperCase().includes('SUPER') || !rawName)
            ? `${companyShortCode || s.companyShortCode || ''} HQ Admin`.trim()
            : rawName
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
    const matchStation = stationFilter === 'ALL' || s.stationId === stationFilter
    const matchSearch =
      !staffSearch.trim() ||
      s.fullName.toLowerCase().includes(staffSearch.toLowerCase()) ||
      s.employeeCode.toLowerCase().includes(staffSearch.toLowerCase())
    return matchStation && matchSearch
  })

  return (
    <div className="h-full flex flex-col bg-[#080c14] overflow-y-auto print:bg-white print:text-black">
      <StatusBar online />

      {/* Enterprise Navigation Header */}
      <div className="shrink-0 flex flex-wrap items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800/80 gap-3 print:hidden sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-950/40 border border-orange-400/30 font-black text-white text-xs">
            {companyShortCode}
          </div>
          <div>
            <p className="text-sm font-extrabold text-white flex items-center gap-1.5">
              <span>{companyName} OMC HQ Admin Console</span> <Flame className="w-3.5 h-3.5 text-orange-400" />
            </p>
            <p className="text-[10px] font-mono text-slate-400">
              Tier 2 OMC HQ Admin · {summary.stationCount} Station Branches · {activeSession?.employeeCode || 'OMC HQ Admin'}
            </p>
          </div>
        </div>

        {/* Action Buttons & Tabs */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap max-w-full">
          {/* Main HQ Tabs */}
          <div className="flex items-center p-1 bg-slate-900 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shrink-0 ${
                activeTab === 'overview'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('summaries')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shrink-0 ${
                activeTab === 'summaries'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Staff Summaries</span>
            </button>

            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition relative shrink-0 ${
                activeTab === 'approvals'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Approvals</span>
              {totalPendingCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black flex items-center justify-center animate-pulse">
                  {totalPendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('staff')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shrink-0 ${
                activeTab === 'staff'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Staff Management</span>
            </button>

            <button
              onClick={() => setActiveTab('products')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shrink-0 ${
                activeTab === 'products'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Products & Pricing</span>
            </button>
          </div>

          <button
            onClick={downloadExcelCsv}
            className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-400 text-xs font-bold flex items-center gap-1.5 transition"
            title="Export Excel / CSV Report"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>

          <button
            onClick={printReport}
            className="px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition"
            title="Print PDF Report"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>

          <button
            onClick={() => void loadData()}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-orange-400 transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global Action Notification */}
      {actionMessage && (
        <div className="px-4 py-2 bg-emerald-950 border-b border-emerald-600/50 flex items-center justify-center gap-2 text-xs font-bold text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Date Range Toolbar */}
      <div className="shrink-0 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 print:hidden border-b border-slate-900 bg-slate-950/60">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> Date:
          </span>

          <button
            onClick={() => setRangePreset('today')}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
              rangePreset === 'today'
                ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Today
          </button>

          <button
            onClick={() => setRangePreset('7days')}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
              rangePreset === '7days'
                ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            7 Days
          </button>

          <button
            onClick={() => setRangePreset('30days')}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
              rangePreset === '30days'
                ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            30 Days
          </button>

          <button
            onClick={() => setRangePreset('all')}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
              rangePreset === 'all'
                ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            All Time
          </button>

          <button
            onClick={() => setRangePreset('custom')}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
              rangePreset === 'custom'
                ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Custom Range
          </button>
        </div>

        {/* Custom Range Picker */}
        {rangePreset === 'custom' && (
          <div className="flex items-center gap-2 animate-in fade-in">
            <span className="text-[10px] font-mono text-slate-400">From:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={e => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white outline-none"
            />
            <span className="text-[10px] font-mono text-slate-400">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={e => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white outline-none"
            />
          </div>
        )}

        <span className="text-[10px] font-mono text-slate-500">
          {summary.totalShifts} shift(s) computed for {companyName}
        </span>
      </div>

      {/* ----------------- TAB 1: ENTERPRISE OVERVIEW ----------------- */}
      {activeTab === 'overview' && (
        <div className="flex-1 px-4 py-4 flex flex-col gap-4 max-w-5xl w-full mx-auto">
          {/* Overall KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4 border-orange-500/20 bg-slate-900/90 shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-orange-400" />
                <p className="text-[9px] uppercase font-bold text-slate-500">Revenue in period</p>
              </div>
              <p className="text-2xl font-black text-orange-400">{formatGHS(summary.salesToday, { noPrefix: true })}</p>
              <p className="text-[10px] text-slate-500 mt-1">
                {formatLitres(summary.litresToday)} litres across {summary.shiftsToday} closing shifts
              </p>
            </Card>

            <Card className="p-4 bg-slate-900/90 shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <p className="text-[9px] uppercase font-bold text-slate-500">Net variance</p>
              </div>
              <p
                className={`text-2xl font-black ${
                  Math.abs(summary.netVariance) < 5 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatGHS(summary.netVariance, { noPrefix: true, showSign: true })}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">across closed shifts in period</p>
            </Card>

            <Card className="p-4 bg-slate-900/90 shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-emerald-400" />
                <p className="text-[9px] uppercase font-bold text-slate-500">Cars Served</p>
              </div>
              <p className="text-2xl font-black text-emerald-400">{summary.carsServedToday ?? 0}</p>
              <p className="text-[10px] text-slate-500 mt-1">
                {summary.carsServedTotal ?? 0} total transactions in period
              </p>
            </Card>

            <Card className="p-4 bg-slate-900/90 shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <p className="text-[9px] uppercase font-bold text-slate-500">Pending Approvals</p>
              </div>
              <p className={`text-2xl font-black ${totalPendingCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                {totalPendingCount}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {totalPendingCount > 0 ? (
                  <button
                    onClick={() => setActiveTab('approvals')}
                    className="text-amber-400 font-bold hover:underline"
                  >
                    Review pending queue ({totalPendingCount}) →
                  </button>
                ) : (
                  'All staff approved'
                )}
              </p>
            </Card>

            <Card className="p-4 bg-slate-900/90 shadow-md">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-cyan-400" />
                <p className="text-[9px] uppercase font-bold text-slate-500">Network Compliance</p>
              </div>
              <p className="text-2xl font-black text-cyan-400">{summary.syncCompliancePct}%</p>
              <p className="text-[10px] text-slate-500 mt-1">{summary.stationCount} Station Branches</p>
            </Card>
          </div>

          {/* Real Company Stations & Leaderboards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Real Per-station table */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-orange-400" /> {companyName} Station Branches ({summary.stations.length})
              </h4>
              <Card className="divide-y divide-slate-800/70 overflow-hidden">
                <div className="px-4 py-2 grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-[9px] uppercase font-bold text-slate-500 bg-slate-950/60">
                  <span>Station</span>
                  <span className="text-right">Cars</span>
                  <span className="text-right">Litres</span>
                  <span className="text-right">Sales</span>
                  <span className="text-right">Var</span>
                </div>
                {topStations.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">No stations registered under {companyName}.</p>
                ) : (
                  topStations.map(st => (
                    <div key={st.stationId} className="px-4 py-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center">
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold text-white truncate">{st.name}</p>
                        <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-orange-400" /> {st.region} · {st.code}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-emerald-400 font-bold text-right">{st.carsServedToday ?? 0}</span>
                      <span className="text-[11px] font-mono text-slate-300 text-right">{Math.round(st.litresToday)}L</span>
                      <span className="text-[11px] font-mono text-white font-bold text-right">
                        {formatGHS(st.salesToday, { noPrefix: true })}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-black text-right ${
                          Math.abs(st.netVariance) < 5 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatGHS(st.netVariance, { noPrefix: true, showSign: true })}
                      </span>
                    </div>
                  ))
                )}
              </Card>
            </div>

            {/* Attendant leaderboard */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-orange-400" /> Attendant Leaderboard
                </h4>
                <button
                  onClick={() => setActiveTab('summaries')}
                  className="text-[10px] text-orange-400 hover:underline font-bold"
                >
                  View All Staff Summaries →
                </button>
              </div>
              <Card className="divide-y divide-slate-800/70 overflow-hidden">
                {summary.attendants.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">No attendant activity in this period.</p>
                ) : (
                  summary.attendants.slice(0, 5).map((a, i) => (
                    <div key={a.employeeCode} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="w-5 text-center text-[10px] font-black text-orange-400">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-white truncate">{a.name}</p>
                        <p className="text-[10px] font-mono text-slate-500">
                          {a.employeeCode} · {a.stationName}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-500">{a.shiftsClosed} shifts</span>
                      <span className="text-[11px] font-mono text-white font-bold">{formatGHS(a.sales, { noPrefix: true })}</span>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: STAFF SUMMARIES FOR PERIOD ----------------- */}
      {activeTab === 'summaries' && (
        <div className="flex-1 px-4 py-4 flex flex-col gap-4 max-w-5xl w-full mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-400" />
                <span>{companyName} Staff Sales & Shift Summaries</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Detailed attendance, dispensing volume, sales revenue, and variances by date range.
              </p>
            </div>

            <button
              onClick={downloadExcelCsv}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-emerald-400 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV/Excel</span>
            </button>
          </div>

          <Card className="overflow-x-auto divide-y divide-slate-800/70">
            <div className="px-4 py-2.5 grid grid-cols-[1.5fr_1fr_0.8fr_1fr_1.2fr_1fr_0.8fr] gap-3 text-[10px] uppercase font-bold text-slate-500 bg-slate-950/70 min-w-[700px]">
              <span>Staff Member</span>
              <span>Station Branch</span>
              <span className="text-center">Shifts</span>
              <span className="text-right">Volume (L)</span>
              <span className="text-right">Sales Revenue</span>
              <span className="text-right">Variance</span>
              <span className="text-center">Status</span>
            </div>

            {summary.attendants.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-500">
                No staff activity recorded for {companyName} in this date range.
              </p>
            ) : (
              summary.attendants.map(att => (
                <div
                  key={att.employeeCode}
                  onClick={() => setSelectedStaffSummary(att)}
                  className="px-4 py-3 grid grid-cols-[1.5fr_1fr_0.8fr_1fr_1.2fr_1fr_0.8fr] gap-3 items-center text-xs min-w-[700px] hover:bg-slate-800/40 cursor-pointer transition"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{att.name}</p>
                    <p className="text-[10px] font-mono text-orange-400 font-bold">{att.employeeCode}</p>
                  </div>

                  <span className="text-[11px] text-slate-300 truncate">{att.stationName}</span>

                  <span className="font-mono text-center text-slate-200">{att.shiftsClosed}</span>

                  <span className="font-mono text-right text-slate-300">{Math.round(att.litres)} L</span>

                  <span className="font-mono font-bold text-right text-emerald-400">
                    {formatGHS(att.sales, { noPrefix: true })}
                  </span>

                  <span
                    className={`font-mono font-black text-right ${
                      Math.abs(att.variance) < 5 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatGHS(att.variance, { noPrefix: true, showSign: true })}
                  </span>

                  <div className="flex justify-center">
                    <Badge tone={att.active ? 'success' : 'warning'}>
                      {att.active ? 'Active' : 'Pending'}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      )}

      {/* ----------------- TAB 3: PENDING APPROVALS ----------------- */}
      {activeTab === 'approvals' && (
        <div className="flex-1 px-4 py-6 max-w-4xl w-full mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-orange-400" />
                <span>{companyName} Staff Approvals Queue</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Review and authorize self-registered Attendants and Station Managers under {companyName}.
              </p>
            </div>
            <span className="text-xs font-mono px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
              {totalPendingCount} Pending
            </span>
          </div>

          {totalPendingCount === 0 ? (
            <Card className="p-8 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">All Clear — No Pending Approvals</h4>
              <p className="text-xs text-slate-500 max-w-sm">
                Every registered attendant and station manager for {companyName} has been authorized.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Pending Attendants */}
              {pendingStaff.attendants.map(att => (
                <Card
                  key={att.id}
                  className="p-4 border-amber-500/30 bg-slate-900/90 shadow-lg flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{att.fullName}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono font-black text-emerald-400">{att.employeeCode}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                            Attendant
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Pending
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-orange-400" />
                      <span>{getStationName(att.stationId)}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{att.phone || 'No phone provided'}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleApprove(att.id, 'attendant', att.fullName, att.employeeCode)}
                      disabled={approvingId === att.id}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-bold transition shadow-md flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve & Activate</span>
                    </button>

                    <button
                      onClick={() => handleReject(att.id, 'attendant', att.fullName)}
                      disabled={approvingId === att.id}
                      className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-rose-400 text-xs font-bold transition"
                    >
                      Reject
                    </button>
                  </div>
                </Card>
              ))}

              {/* Pending Supervisors/Managers */}
              {pendingStaff.supervisors.map(sup => (
                <Card
                  key={sup.id}
                  className="p-4 border-amber-500/30 bg-slate-900/90 shadow-lg flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                        <UserCog className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{sup.fullName}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-mono font-black text-amber-400">{sup.employeeCode}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                            Manager
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Pending
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 space-y-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-orange-400" />
                      <span>{getStationName(sup.stationId)}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-500" />
                      <span>{sup.phone || 'No phone provided'}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleApprove(sup.id, 'supervisor', sup.fullName, sup.employeeCode)}
                      disabled={approvingId === sup.id}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-bold transition shadow-md flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approve & Activate</span>
                    </button>

                    <button
                      onClick={() => handleReject(sup.id, 'supervisor', sup.fullName)}
                      disabled={approvingId === sup.id}
                      className="px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-rose-400 text-xs font-bold transition"
                    >
                      Reject
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ----------------- TAB 4: STAFF MANAGEMENT (EDIT, RESET PIN, DELETE) ----------------- */}
      {activeTab === 'staff' && (
        <div className="flex-1 px-4 py-6 max-w-5xl w-full mx-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-400" />
                <span>{companyName} Staff Management</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Edit profiles, reset 4-digit PINs, and remove accounts for {companyName} attendants and managers.
              </p>
            </div>

            {/* Filter controls */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={staffSearch}
                  onChange={e => setStaffSearch(e.target.value)}
                  placeholder="Search name or ID…"
                  className="rounded-xl bg-slate-900 border border-slate-800 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none"
                />
              </div>

              <select
                value={stationFilter}
                onChange={e => setStationFilter(e.target.value)}
                className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs text-white focus:border-orange-500 outline-none"
              >
                <option value="ALL">All Stations</option>
                {summary.stations.map(s => (
                  <option key={s.stationId} value={s.stationId}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {combinedStaff.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-500">No staff found matching filters.</p>
            ) : (
              combinedStaff.map(staff => (
                <div key={staff.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        staff.staffType === 'hq_admin'
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
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
                              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                              : staff.staffType === 'supervisor'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {staff.staffType === 'hq_admin' ? 'HQ Admin' : staff.staffType}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="font-bold text-slate-300">{staff.employeeCode}</span>
                        <span>·</span>
                        <span>{getStationName(staff.stationId)}</span>
                        {staff.phone && staff.phone !== 'SUPER-ADMIN' && !staff.phone.toUpperCase().includes('SUPER') && (
                          <>
                            <span>·</span>
                            <span>{staff.phone}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

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
                      title="Reset Security PIN"
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
                      title="Edit Staff"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteStaff(staff.id, staff.staffType === 'hq_admin' ? 'supervisor' : staff.staffType, staff.fullName, staff.employeeCode)}
                      className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500/50 text-rose-400 hover:text-rose-300 transition"
                      title="Delete Staff"
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

      {/* ----------------- TAB 5: PRODUCTS & FUEL PRICING ----------------- */}
      {activeTab === 'products' && (
        <div className="flex-1 px-4 py-4 flex flex-col gap-4 max-w-5xl w-full mx-auto">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-400" />
                <h3 className="text-sm font-black text-white">Fuel Products & Pump Pricing</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Configure official retail prices (GHS/L) and product catalog for {companyName}.
                Prices set here automatically propagate to station managers and pump attendants.
              </p>
            </div>
            <button
              onClick={() => setIsCreateProdOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg transition shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add Fuel / Product</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Search products by code or name (e.g. PMS, Diesel, V-Power)…"
                className="w-full rounded-xl bg-slate-900 border border-slate-800 pl-9 pr-4 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-orange-500 outline-none"
              />
            </div>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {products
              .filter(p => {
                if (!productSearch) return true
                const q = productSearch.toLowerCase()
                return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
              })
              .map(prod => (
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
                    <span>{prod.companyId ? `${companyName} Rate` : 'Default Base Rate'}</span>
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
                        <Edit2 className="w-3 h-3 text-orange-400" /> Edit Price
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(prod.id, prod.name, prod.code)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                        title="Delete Product"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        </div>
      )}

      {/* MODAL: Create Product */}
      {isCreateProdOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Add Product / Fuel Grade</h3>
              </div>
              <button
                onClick={() => setIsCreateProdOpen(false)}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Product Code</label>
                  <input
                    value={newProdCode}
                    onChange={e => setNewProdCode(e.target.value.toUpperCase())}
                    placeholder="e.g. PMS, AGO, V-POWER"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white uppercase focus:border-orange-500 outline-none"
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
                    <option value="OTHER">Other Forecourt Item</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Full Product Name</label>
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
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Badge Color</label>
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
                {prodSaving ? 'Creating Product…' : `Save ${companyName} Product`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Product & Pricing */}
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
                {editingProduct.companyId ? `${companyName} Custom` : 'Default Base'}
              </p>
            </div>

            <form onSubmit={handleSaveEditProduct} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Official Product Name</label>
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
                <span className="text-[11px] font-bold text-slate-300">Active (Visible on pumps)</span>
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
                {editProdSaving ? 'Saving Changes…' : 'Update Pricing & Product'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reset Staff PIN */}
      {resetPinTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-3xl bg-slate-900 border border-amber-500/40 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-extrabold text-white">Reset Staff PIN</h3>
              </div>
              <button
                onClick={() => setResetPinTarget(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3">
              <p className="text-xs font-bold text-white">{resetPinTarget.name}</p>
              <p className="text-[10px] font-mono text-slate-400">
                Staff ID: <span className="text-orange-400 font-bold">{resetPinTarget.code}</span> · Role:{' '}
                <span className="capitalize">{resetPinTarget.role}</span>
              </p>
            </div>

            <form onSubmit={handleExecuteResetPin} className="flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Enter New 4-Digit PIN
                </label>
                <input
                  value={newPinValue}
                  onChange={e => setNewPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  type="password"
                  inputMode="numeric"
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-base font-mono tracking-widest text-center text-white focus:border-amber-500 outline-none"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={resetPinBusy || newPinValue.length !== 4}
                className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-white py-2.5 text-xs font-bold transition disabled:opacity-40"
              >
                {resetPinBusy ? 'Updating PIN…' : 'Save New Security PIN'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Staff Profile */}
      {editStaffTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">Edit Staff Details</h3>
              </div>
              <button
                onClick={() => setEditStaffTarget(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditStaff} className="flex flex-col gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Official Name</label>
                <input
                  value={editStaffTarget.name}
                  onChange={e => setEditStaffTarget({ ...editStaffTarget, name: e.target.value })}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Mobile Phone</label>
                <input
                  value={editStaffTarget.phone}
                  onChange={e => setEditStaffTarget({ ...editStaffTarget, phone: e.target.value })}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Assigned Station Branch</label>
                <select
                  value={editStaffTarget.stationId}
                  onChange={e => setEditStaffTarget({ ...editStaffTarget, stationId: e.target.value })}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white focus:border-orange-500 outline-none"
                >
                  {summary.stations.map(s => (
                    <option key={s.stationId} value={s.stationId}>
                      {s.name}
                    </option>
                  ))}
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
                {editStaffBusy ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}