/**
 * Supervisor Station Expenses Screen.
 * Allows Station Managers to record forecourt expenses via:
 * - Dropdown selection from standard 37 seeded station expense categories
 * - Manual custom expense item typing
 * - GHS amount, payment source (Cash Drawer, MoMo, Bank/Petty Cash), payee, and reference
 * - Real-time net cash reconciliation (Sales - Expenses = Net Cash)
 * - Synchronized in real time with OMC Head Office
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  DollarSign,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Edit2,
  Calendar,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  FileText,
  Tag,
  ArrowDownRight,
  TrendingDown,
  ChevronDown,
  Layers,
  Sparkles,
  Filter,
} from 'lucide-react'
import { useSupervisorSession } from '../providers'
import { Badge, Card, ScreenHeader, StatusBar } from '../../shared/ui'
import { formatDateTime, formatGHS } from '../../../utils/currencyFormatter'
import { getStationName } from '../../../core/domain/config'
import { expenseService, type ExpenseSummary } from '../../../core/services/expenseService'
import { STANDARD_STATION_EXPENSE_CATEGORIES } from '../../../constants/expenseCategories'
import { shiftRepo } from '../../../core/infra/repositories'
import type { StationExpense, ExpensePaymentSource } from '../../../core/domain/types'

type RangeFilter = 'today' | '7days' | '30days' | 'all' | 'custom'

export const SupervisorExpensesScreen: React.FC<{
  onBack: () => void
  onToast?: (msg: string, kind?: 'success' | 'error' | 'warning' | 'info') => void
}> = ({ onBack, onToast }) => {
  const { supervisor } = useSupervisorSession()
  const stationId = supervisor?.stationId || 'STN-GV-042'
  const stationName = supervisor ? getStationName(supervisor.stationId) : 'Green Valley Station'
  const companyId = supervisor?.companyId || 'COMP-MVP'
  const companyShortCode = supervisor?.companyShortCode || 'PV'

  const [range, setRange] = useState<RangeFilter>('today')
  const [customStart, setCustomStart] = useState(new Date().toISOString().slice(0, 10))
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().slice(0, 10))
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expenses, setExpenses] = useState<StationExpense[]>([])
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [todaySales, setTodaySales] = useState(0)

  // Record Expense Modal State
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>(STANDARD_STATION_EXPENSE_CATEGORIES[0])
  const [isCustomCategory, setIsCustomCategory] = useState(false)
  const [customCategoryText, setCustomCategoryText] = useState('')
  const [amount, setAmount] = useState('')
  const [paymentSource, setPaymentSource] = useState<ExpensePaymentSource>('CASH')
  const [payee, setPayee] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Edit Expense State
  const [editingExpense, setEditingExpense] = useState<StationExpense | null>(null)

  const loadData = async () => {
    setRefreshing(true)
    try {
      let startDate: string | undefined
      let endDate: string | undefined

      const todayStr = new Date().toISOString().slice(0, 10)
      if (range === 'today') {
        startDate = todayStr
        endDate = todayStr
      } else if (range === '7days') {
        const d = new Date(Date.now() - 7 * 86400000)
        startDate = d.toISOString().slice(0, 10)
        endDate = todayStr
      } else if (range === '30days') {
        const d = new Date(Date.now() - 30 * 86400000)
        startDate = d.toISOString().slice(0, 10)
        endDate = todayStr
      } else if (range === 'custom') {
        startDate = customStart
        endDate = customEnd
      }

      const [list, sum] = await Promise.all([
        expenseService.listExpenses({
          stationId,
          startDate,
          endDate,
          category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        }),
        expenseService.getExpenseSummary({
          stationId,
          startDate,
          endDate,
        }),
      ])

      setExpenses(list)
      setSummary(sum)

      // Compute today's station sales for net reconciliation
      const shifts = await shiftRepo.listForStation(stationId)
      const todayShifts = shifts.filter(s => s.openedAt.slice(0, 10) === todayStr)
      const salesTotal = todayShifts.reduce((acc, s) => acc + (s.actualTotal || 0), 0)
      setTodaySales(salesTotal)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [stationId, range, customStart, customEnd, categoryFilter])

  // Filtered expenses based on search query
  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return expenses
    return expenses.filter(
      e =>
        e.category.toLowerCase().includes(q) ||
        (e.payee && e.payee.toLowerCase().includes(q)) ||
        (e.referenceNumber && e.referenceNumber.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)),
    )
  }, [expenses, searchQuery])

  // Handle Save (Create or Update)
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const finalCategory = isCustomCategory ? customCategoryText.trim() : selectedCategory.trim()
    if (!finalCategory) {
      setFormError('Please select or enter an expense category.')
      return
    }

    const amtNum = Number(amount)
    if (isNaN(amtNum) || amtNum <= 0) {
      setFormError('Please enter a valid amount greater than 0 GHS.')
      return
    }

    setSaving(true)
    try {
      if (editingExpense) {
        await expenseService.updateExpense(editingExpense.id, {
          category: finalCategory,
          amount: amtNum,
          paymentSource,
          payee: payee || undefined,
          referenceNumber: referenceNumber || undefined,
          notes: notes || undefined,
          date: expenseDate,
          actorName: supervisor?.fullName || 'Station Manager',
        })
        onToast?.('Expense record updated successfully', 'success')
      } else {
        await expenseService.createExpense({
          companyId,
          companyShortCode,
          stationId,
          stationName,
          category: finalCategory,
          amount: amtNum,
          paymentSource,
          payee: payee || undefined,
          referenceNumber: referenceNumber || undefined,
          notes: notes || undefined,
          date: expenseDate,
          recordedBy: {
            id: supervisor?.id || 'SUP-LOCAL',
            name: supervisor?.fullName || 'Station Manager',
            employeeCode: supervisor?.employeeCode || 'PV-ACC-001-M',
          },
        })
        onToast?.('Expense logged successfully', 'success')
      }

      setIsRecordModalOpen(false)
      setEditingExpense(null)
      resetForm()
      await loadData()
    } catch (err: any) {
      setFormError(err.message || 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense record?')) return
    try {
      await expenseService.deleteExpense(id, supervisor?.fullName || 'Station Manager')
      onToast?.('Expense record deleted', 'info')
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to delete expense')
    }
  }

  const openEditModal = (exp: StationExpense) => {
    setEditingExpense(exp)
    const isStandard = STANDARD_STATION_EXPENSE_CATEGORIES.includes(exp.category as any)
    if (isStandard) {
      setSelectedCategory(exp.category)
      setIsCustomCategory(false)
      setCustomCategoryText('')
    } else {
      setIsCustomCategory(true)
      setCustomCategoryText(exp.category)
    }
    setAmount(exp.amount.toString())
    setPaymentSource(exp.paymentSource)
    setPayee(exp.payee || '')
    setReferenceNumber(exp.referenceNumber || '')
    setNotes(exp.notes || '')
    setExpenseDate(exp.date)
    setFormError(null)
    setIsRecordModalOpen(true)
  }

  const resetForm = () => {
    setSelectedCategory(STANDARD_STATION_EXPENSE_CATEGORIES[0])
    setIsCustomCategory(false)
    setCustomCategoryText('')
    setAmount('')
    setPaymentSource('CASH')
    setPayee('')
    setReferenceNumber('')
    setNotes('')
    setExpenseDate(new Date().toISOString().slice(0, 10))
    setFormError(null)
  }

  const netTodayCash = Math.max(0, todaySales - (summary?.todayAmount || 0))

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto font-sans selection:bg-orange-500/30">
      <ScreenHeader
        title="Station Expenses"
        subtitle={`${stationName} · Manager Petty Cash & Operations`}
        onBack={onBack}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={refreshing}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
              title="Refresh expenses"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-orange-400' : ''}`} />
            </button>
            <button
              onClick={() => {
                resetForm()
                setEditingExpense(null)
                setIsRecordModalOpen(true)
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-orange-950/40 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Record Expense</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 p-4 max-w-5xl w-full mx-auto flex flex-col gap-4">
        {/* Real-time Net Cash Reconciliation Card */}
        <Card className="p-4 bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border-orange-500/30 shadow-xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3 border-b border-slate-800/80 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-orange-400">
                  Daily Net Cash Reconciliation
                </span>
              </div>
              <h3 className="text-sm font-extrabold text-white mt-0.5">
                Gross Forecourt Sales vs. Station Expenses Today
              </h3>
            </div>
            <div className="text-[11px] font-mono text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/60">
              {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="text-[10px] font-bold uppercase text-slate-500 block">Gross Sales Today</span>
              <span className="text-lg font-black text-emerald-400 block mt-0.5">
                {formatGHS(todaySales)}
              </span>
              <span className="text-[10px] text-slate-500">all pump transactions</span>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-rose-400 block">Less: Expenses Today</span>
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <span className="text-lg font-black text-rose-400 block mt-0.5">
                -{formatGHS(summary?.todayAmount || 0)}
              </span>
              <span className="text-[10px] text-rose-300/80">{summary?.todayCount || 0} expense entries</span>
            </div>

            <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/40">
              <span className="text-[10px] font-bold uppercase text-orange-400 block">Net Station Cash</span>
              <span className="text-lg font-black text-orange-400 block mt-0.5">
                {formatGHS(netTodayCash)}
              </span>
              <span className="text-[10px] text-orange-300/80">cash available for bank handover</span>
            </div>
          </div>
        </Card>

        {/* Expense Summary KPI Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3.5 bg-slate-900/80">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Selected Period Total</span>
            <span className="text-base sm:text-lg font-black text-white block mt-0.5">
              {formatGHS(summary?.totalAmount || 0)}
            </span>
            <span className="text-[10px] text-slate-500">{summary?.count || 0} total records</span>
          </Card>

          <Card className="p-3.5 bg-slate-900/80">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Today's Total</span>
            <span className="text-base sm:text-lg font-black text-rose-400 block mt-0.5">
              {formatGHS(summary?.todayAmount || 0)}
            </span>
            <span className="text-[10px] text-slate-500">{summary?.todayCount || 0} entries today</span>
          </Card>

          <Card className="p-3.5 bg-slate-900/80 col-span-2 sm:col-span-2">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">Top Spend Category</span>
            <span className="text-sm font-black text-amber-400 block mt-0.5 truncate">
              {summary?.topCategory ? summary.topCategory.category : 'None yet'}
            </span>
            <span className="text-[10px] text-slate-500">
              {summary?.topCategory ? formatGHS(summary.topCategory.amount) : 'GHS 0.00'}
            </span>
          </Card>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Period presets */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs overflow-x-auto">
            {(['today', '7days', '30days', 'all', 'custom'] as const).map(p => (
              <button
                key={p}
                onClick={() => setRange(p)}
                className={`px-3 py-1 rounded-lg font-bold transition capitalize shrink-0 ${
                  range === p
                    ? 'bg-orange-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {p === '7days' ? '7 Days' : p === '30days' ? '30 Days' : p}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search category, payee, notes…"
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
            />
          </div>
        </div>

        {/* Custom Date Range Picker when selected */}
        {range === 'custom' && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
            <span className="text-slate-400 font-bold">From:</span>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white"
            />
            <span className="text-slate-400 font-bold ml-2">To:</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white"
            />
          </div>
        )}

        {/* Expense Log Table / Card */}
        <Card className="divide-y divide-slate-800/80 overflow-hidden shadow-lg">
          <div className="px-4 py-3 bg-slate-900/90 flex items-center justify-between">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Receipt className="w-4 h-4 text-orange-400" />
              <span>Station Expense Audit Log ({filteredExpenses.length})</span>
            </h4>
            <span className="text-[11px] font-mono text-slate-400">
              Total: {formatGHS(filteredExpenses.reduce((a, b) => a + b.amount, 0))}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">
              <span className="w-5 h-5 border-2 border-slate-700 border-t-orange-500 rounded-full inline-block animate-spin mb-2" />
              <p>Loading expenses…</p>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              <p className="font-bold text-slate-400">No station expenses found for this period.</p>
              <p className="mt-1 text-[11px]">Click "Record Expense" to log daily maintenance, fuel, or petty cash.</p>
            </div>
          ) : (
            filteredExpenses.map(exp => (
              <div
                key={exp.id}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/50 transition group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold text-white">{exp.category}</span>
                    <Badge
                      tone={
                        exp.paymentSource === 'CASH'
                          ? 'warning'
                          : exp.paymentSource === 'MOMO'
                          ? 'info'
                          : 'default'
                      }
                    >
                      {exp.paymentSource === 'CASH'
                        ? 'Cash Drawer'
                        : exp.paymentSource === 'MOMO'
                        ? 'MoMo'
                        : 'Station Account'}
                    </Badge>
                    <span className="text-[10px] font-mono text-slate-500">{exp.date}</span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 flex-wrap">
                    {exp.payee && <span>Payee: <strong className="text-slate-300">{exp.payee}</strong></span>}
                    {exp.referenceNumber && <span>Ref: <strong className="text-slate-300">{exp.referenceNumber}</strong></span>}
                    <span>By: <strong className="text-slate-300">{exp.recordedBy.name}</strong></span>
                  </div>

                  {exp.notes && (
                    <p className="text-[11px] text-slate-400 mt-1 italic border-l-2 border-slate-700 pl-2">
                      "{exp.notes}"
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-base font-black text-rose-400 block">
                      -{formatGHS(exp.amount)}
                    </span>
                    <span className="text-[9px] font-mono text-emerald-400 uppercase font-bold">Approved</span>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                    <button
                      onClick={() => openEditModal(exp)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
                      title="Edit expense"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteExpense(exp.id)}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 transition"
                      title="Delete expense"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      {/* Record / Edit Expense Modal */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-extrabold text-white">
                  {editingExpense ? 'Edit Station Expense' : 'Record Station Expense'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsRecordModalOpen(false)
                  setEditingExpense(null)
                }}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-5 overflow-y-auto flex flex-col gap-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-600 text-rose-200 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Category Selector with Dropdown of 37 Items + Custom Entry Option */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    Expense Category <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCategory(!isCustomCategory)
                      if (!isCustomCategory && !customCategoryText) {
                        setCustomCategoryText(selectedCategory)
                      }
                    }}
                    className="text-[11px] text-orange-400 hover:text-orange-300 font-bold transition"
                  >
                    {isCustomCategory ? '← Select from standard list' : '+ Enter custom category'}
                  </button>
                </div>

                {!isCustomCategory ? (
                  <div className="relative">
                    <select
                      value={selectedCategory}
                      onChange={e => setSelectedCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-orange-500 font-semibold"
                    >
                      {STANDARD_STATION_EXPENSE_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={customCategoryText}
                    onChange={e => setCustomCategoryText(e.target.value)}
                    placeholder="e.g. GENERATOR OVERHAUL, COUNCIL PERMIT…"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-orange-500 uppercase font-semibold"
                    required
                  />
                )}
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {!isCustomCategory
                    ? 'Selected from 37 standard operational station expense accounts.'
                    : 'Manual custom item name entered.'}
                </span>
              </div>

              {/* Amount & Payment Source */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Amount (GHS) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      GHS
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-12 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-black focus:outline-none focus:border-orange-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Payment Source <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={paymentSource}
                    onChange={e => setPaymentSource(e.target.value as ExpensePaymentSource)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-orange-500 font-semibold"
                  >
                    <option value="CASH">Cash Drawer (Deducted from Shift Cash)</option>
                    <option value="MOMO">Station Mobile Money (MoMo)</option>
                    <option value="STATION_ACCOUNT">Station Petty Cash / Bank Account</option>
                    <option value="OTHER">Other / Credit Voucher</option>
                  </select>
                </div>
              </div>

              {/* Date & Payee */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Date</label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={e => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Payee / Beneficiary</label>
                  <input
                    type="text"
                    value={payee}
                    onChange={e => setPayee(e.target.value)}
                    placeholder="e.g. Technician, ECG Prepaid, Water Vendor"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Reference / Invoice Number */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Invoice / Receipt Ref No.</label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={e => setReferenceNumber(e.target.value)}
                  placeholder="e.g. REC-0941, INV-2026-088"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Description / Notes */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Operational Description / Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Explain why the expense was incurred and any relevant forecourt details…"
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsRecordModalOpen(false)
                    setEditingExpense(null)
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-black text-xs shadow-md shadow-orange-950/40 transition disabled:opacity-50"
                >
                  {saving ? 'Saving Expense…' : editingExpense ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
