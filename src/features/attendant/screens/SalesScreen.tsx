/**
 * Record Sale — the attendant's primary transaction screen.
 * Select fuel → enter litres → verify amount → choose payment → record.
 * Live preview of running totals and the shift transaction list.
 * Includes quick-access bottom transactions sheet and editable transactions before shift submission.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Edit2,
  Flame,
  Layers,
  Lock,
  Minus,
  Plus,
  ReceiptText,
  Trash2,
  X,
} from 'lucide-react'
import { useAttendantSession, useShift } from '../providers'
import { Badge, Card, ScreenHeader } from '../ui'
import { FUEL_META, PAYMENT_META, PRODUCTION_PUMPS } from '../../../core/domain/config'
import { saleAmount } from '../../../core/domain/rules'
import { transactionRepo } from '../../../core/infra/repositories'
import { productService } from '../../../core/services/productService'
import { formatGHS, formatTimeOnly } from '../../../utils/currencyFormatter'
import { useTheme } from '../../../context/ThemeContext'
import type { FuelCode, PaymentMethod, Product, ShiftTransaction } from '../../../core/domain/types'

export const SalesScreen: React.FC<{ onBack: () => void; onCaptureReceipt: () => void }> = ({
  onBack,
  onCaptureReceipt,
}) => {
  const { attendant } = useAttendantSession()
  const { activeShift, recordSale, updateSale, deleteSale } = useShift()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const pump = useMemo(
    () => PRODUCTION_PUMPS.find(p => p.id === activeShift?.pumpId) ?? PRODUCTION_PUMPS[0],
    [activeShift?.pumpId],
  )

  // Dynamic products and prices loaded from OMC / ProductService
  const [activeProducts, setActiveProducts] = useState<Product[]>([])
  const [fuelCode, setFuelCode] = useState<FuelCode>(pump.fuels[0])
  const [litres, setLitres] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [saving, setSaving] = useState(false)
  const [transactions, setTransactions] = useState<ShiftTransaction[]>([])

  // Bottom transactions drawer state
  const [isTransactionsSheetOpen, setIsTransactionsSheetOpen] = useState(false)

  // Edit transaction modal state
  const [editingTx, setEditingTx] = useState<ShiftTransaction | null>(null)
  const [editLitres, setEditLitres] = useState('')
  const [editFuelCode, setEditFuelCode] = useState<FuelCode>('PMS')
  const [editMethod, setEditMethod] = useState<PaymentMethod>('CASH')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Load products for the attendant's company
  useEffect(() => {
    let cancelled = false
    productService
      .listActiveProducts(attendant?.companyId)
      .then(prods => {
        if (!cancelled && prods.length > 0) {
          setActiveProducts(prods)
          if (!prods.some(p => p.code === fuelCode)) {
            setFuelCode(prods[0].code)
          }
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [attendant?.companyId])

  // Load transactions for the active shift
  useEffect(() => {
    if (!activeShift) return
    let cancelled = false
    transactionRepo
      .listForShift(activeShift.id)
      .then(txs => {
        if (!cancelled) setTransactions(txs)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeShift?.id, activeShift?.updatedAt])

  if (!activeShift) {
    return (
      <div className={`h-full flex flex-col items-center justify-center px-6 text-center ${
        isDark ? 'bg-[#090d16]' : 'bg-slate-50'
      }`}>
        <p className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>No open shift</p>
        <p className="text-xs text-slate-500 mt-1">Start a shift before recording sales.</p>
        <button onClick={onBack} className="mt-4 text-orange-500 text-xs font-bold">
          Back to dashboard
        </button>
      </div>
    )
  }

  // Determine current unit price for selected fuelCode
  const matchedProduct = activeProducts.find(p => p.code === fuelCode)
  const unitPrice = matchedProduct?.unitPrice ?? (fuelCode === 'AGO' ? 15.2 : fuelCode === 'DPK' ? 13.9 : fuelCode === 'KERO' ? 13.5 : 14.8)

  const litresNum = Number(litres) || 0
  const amount = saleAmount(litresNum, unitPrice)

  const isShiftOpen = activeShift.status === 'OPEN'

  const record = async () => {
    if (litresNum <= 0) return
    setSaving(true)
    try {
      await recordSale({ fuelCode, litres: litresNum, method, unitPrice })
      setLitres('')
      setSaving(false)
    } catch {
      setSaving(false)
    }
  }

  const openEditModal = (tx: ShiftTransaction) => {
    if (!isShiftOpen) return
    setEditingTx(tx)
    setEditLitres(String(tx.litres))
    setEditFuelCode(tx.fuelCode)
    setEditMethod(tx.method)
    setEditError(null)
  }

  const handleSaveEdit = async () => {
    if (!editingTx || !isShiftOpen) return
    const vol = Number(editLitres)
    if (isNaN(vol) || vol <= 0) {
      setEditError('Volume must be greater than 0.')
      return
    }

    const editProd = activeProducts.find(p => p.code === editFuelCode)
    const editPrice = editProd?.unitPrice ?? (editFuelCode === 'AGO' ? 15.2 : editFuelCode === 'DPK' ? 13.9 : editFuelCode === 'KERO' ? 13.5 : 14.8)

    setEditSaving(true)
    setEditError(null)
    try {
      await updateSale(editingTx.id, {
        fuelCode: editFuelCode,
        litres: vol,
        method: editMethod,
        unitPrice: editPrice,
      })
      setEditingTx(null)
      setEditSaving(false)
    } catch (err: any) {
      setEditError(err.message || 'Failed to update transaction.')
      setEditSaving(false)
    }
  }

  const handleDeleteTx = async (txId: string) => {
    if (!isShiftOpen) return
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      await deleteSale(txId)
      if (editingTx?.id === txId) setEditingTx(null)
    }
  }

  return (
    <div className={`h-full flex flex-col relative ${isDark ? 'bg-[#090d16]' : 'bg-slate-50'}`}>
      <ScreenHeader
        title="Record Sale"
        subtitle={`${activeShift.number} · ${activeShift.pumpName}`}
        onBack={onBack}
        right={
          <button
            onClick={onCaptureReceipt}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-orange-400 hover:border-orange-500/50'
                : 'bg-white border-slate-200 text-orange-600 hover:border-orange-300'
            }`}
          >
            <ReceiptText className="w-4 h-4" /> Receipts
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 flex flex-col gap-4 max-w-md w-full mx-auto">
        {/* Running totals */}
        <Card className={`p-3.5 border-orange-500/20 shadow-md ${isDark ? 'bg-slate-900/90' : 'bg-white'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase font-bold text-slate-500 flex items-center gap-1">
                <Flame className="w-2.5 h-2.5 text-orange-500" /> Collected
              </p>
              <p className="text-lg font-black text-orange-500">{formatGHS(activeShift.actualTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase font-bold text-slate-500">This shift</p>
              <p className={`text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </Card>

        {/* Dynamic Fuel / Product Selector */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase text-slate-500">Fuel Product</p>
            <span className="text-[10px] text-slate-500 font-mono">OMC Live Pricing</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(activeProducts.length > 0
              ? activeProducts
              : pump.fuels.map(f => ({
                  code: f,
                  name: f,
                  unitPrice: f === 'AGO' ? 15.2 : 14.8,
                  color: FUEL_META[f]?.color || '#22c55e',
                }))
            ).map(p => {
              const active = p.code === fuelCode
              const color = p.color || FUEL_META[p.code as FuelCode]?.color || '#22c55e'
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => {
                    setFuelCode(p.code)
                    setLitres('')
                  }}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                    active
                      ? 'border-orange-500 bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30'
                      : isDark
                      ? 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span>{p.code}</span>
                  <span className="text-slate-500 font-mono text-[10px]">
                    @ GHS {p.unitPrice.toFixed(2)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Litres + amount */}
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-500 mb-2">Volume (Litres)</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLitres(v => String(Math.max(0, Number(v) - 1) || 0))}
              className={`w-11 h-12 rounded-xl border flex items-center justify-center transition ${
                isDark
                  ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              value={litres}
              onChange={e => setLitres(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0.00"
              className={`flex-1 h-12 rounded-xl border px-4 text-center font-mono text-xl font-bold placeholder:text-slate-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition ${
                isDark
                  ? 'bg-slate-900 border-slate-800 text-white'
                  : 'bg-white border-slate-200 text-slate-900'
              }`}
            />
            <button
              onClick={() => setLitres(v => (Number(v) + 1).toFixed(2))}
              className={`w-11 h-12 rounded-xl border flex items-center justify-center transition ${
                isDark
                  ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className={`mt-3 rounded-xl border px-4 py-3 flex items-center justify-between shadow-inner ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}>
            <span className="text-[11px] text-slate-500">Amount due</span>
            <span className="text-xl font-black text-orange-500">{litres ? formatGHS(amount) : '—'}</span>
          </div>
        </div>

        {/* Payment method */}
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-500 mb-2">Payment Method</p>
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(PAYMENT_META) as PaymentMethod[]).map(m => {
              const active = m === method
              const meta = PAYMENT_META[m]
              return (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`rounded-xl border px-2 py-2.5 text-center transition ${
                    active
                      ? 'border-orange-500 bg-orange-500/15 shadow-sm ring-1 ring-orange-500/30'
                      : isDark
                      ? 'border-slate-800 bg-slate-900'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <span
                    className="block w-2 h-2 rounded-full mx-auto mb-1.5"
                    style={{ backgroundColor: active ? meta.color : '#64748b' }}
                  />
                  <span className={`text-[10px] font-bold ${
                    active ? (isDark ? 'text-white' : 'text-slate-900') : 'text-slate-500'
                  }`}>
                    {meta.shortLabel}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <button
          onClick={() => void record()}
          disabled={litresNum <= 0 || saving}
          className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 text-sm font-black flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-orange-950/60 border border-orange-400/30"
        >
          {saving ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Check className="w-5 h-5" />
          )}
          Record {formatGHS(amount)} {method}
        </button>

        {/* Inline Recent Transactions snippet */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase text-slate-500">Recent Shift Entries</p>
            <button
              onClick={() => setIsTransactionsSheetOpen(true)}
              className="text-[11px] font-bold text-orange-500 hover:underline flex items-center gap-1"
            >
              View All ({transactions.length})
            </button>
          </div>

          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {transactions.length === 0 && (
              <p className="px-4 py-5 text-xs text-slate-500 text-center">No sales recorded yet.</p>
            )}
            {transactions.slice(0, 3).map(tx => (
              <div key={tx.id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Badge
                    tone={
                      tx.method === 'CASH'
                        ? 'warning'
                        : tx.method === 'MOMO'
                        ? 'success'
                        : tx.method === 'VOUCHER'
                        ? 'info'
                        : 'danger'
                    }
                  >
                    {PAYMENT_META[tx.method]?.shortLabel || tx.method}
                  </Badge>
                  <div>
                    <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {tx.litres.toFixed(2)}L <span className="text-slate-500">{tx.fuelCode}</span>
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {formatTimeOnly(tx.recordedAt)} · @ GHS {tx.unitPrice.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-orange-500">{formatGHS(tx.amount)}</span>
                  {isShiftOpen && (
                    <button
                      onClick={() => openEditModal(tx)}
                      className={`p-1 rounded-lg border transition ${
                        isDark ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                      title="Edit transaction before shift closing"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Quick-Access Bottom Action Bar for Attendants */}
      {/* ------------------------------------------------------------- */}
      <div className={`fixed bottom-0 left-0 right-0 z-30 border-t backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3 max-w-md mx-auto transition-colors ${
        isDark ? 'bg-slate-950/95 border-slate-800 shadow-2xl' : 'bg-white/95 border-slate-200 shadow-xl'
      }`}>
        <button
          onClick={() => setIsTransactionsSheetOpen(true)}
          className={`flex-1 py-2.5 px-4 rounded-xl border flex items-center justify-between transition ${
            isDark
              ? 'bg-slate-900 border-slate-800 hover:border-slate-700 text-white'
              : 'bg-slate-100 border-slate-200 hover:bg-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-orange-500" />
            <div className="text-left">
              <span className="text-xs font-black block leading-tight">Shift Transactions</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {transactions.length} record{transactions.length === 1 ? '' : 's'} entered
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-black text-orange-500 block">
              {formatGHS(activeShift.actualTotal)}
            </span>
            <span className="text-[9px] text-slate-500 uppercase font-bold">Tap to view</span>
          </div>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Full Shift Transactions Drawer / Bottom Modal */}
      {/* ------------------------------------------------------------- */}
      {isTransactionsSheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
          <div className={`rounded-t-3xl max-w-lg w-full mx-auto max-h-[85vh] flex flex-col border-t shadow-2xl ${
            isDark ? 'bg-[#090d16] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            {/* Sheet Header */}
            <div className="p-4 border-b border-slate-800/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center font-bold">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black">All Shift Transactions</h3>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {activeShift.number} · {transactions.length} total sales
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTransactionsSheetOpen(false)}
                className={`p-1.5 rounded-xl border transition ${
                  isDark ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Shift Summary Header Pill */}
            <div className={`mx-4 mt-3 p-3 rounded-2xl border flex items-center justify-between ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div>
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Total Shift Sales</span>
                <span className="text-base font-black text-orange-500">{formatGHS(activeShift.actualTotal)}</span>
              </div>
              <div className="text-right">
                <span className="text-[9px] uppercase font-bold text-slate-500 block">Shift Status</span>
                <span className={`text-[11px] font-bold flex items-center justify-end gap-1 ${
                  isShiftOpen ? 'text-emerald-500' : 'text-amber-500'
                }`}>
                  {isShiftOpen ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Open (Editable)
                    </>
                  ) : (
                    <>
                      <Lock className="w-3 h-3" />
                      Submitted & Locked
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Transactions List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {transactions.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No transactions recorded yet in this shift.
                </div>
              ) : (
                transactions.map((tx, idx) => (
                  <div
                    key={tx.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between transition ${
                      isDark
                        ? 'bg-slate-900/60 border-slate-800/90 hover:border-slate-700'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-mono font-bold text-slate-500 w-5">
                        #{transactions.length - idx}
                      </span>
                      <Badge
                        tone={
                          tx.method === 'CASH'
                            ? 'warning'
                            : tx.method === 'MOMO'
                            ? 'success'
                            : tx.method === 'VOUCHER'
                            ? 'info'
                            : 'danger'
                        }
                      >
                        {PAYMENT_META[tx.method]?.shortLabel || tx.method}
                      </Badge>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black">{tx.litres.toFixed(2)} Litres</span>
                          <span className="text-[11px] font-bold text-orange-500">({tx.fuelCode})</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {formatTimeOnly(tx.recordedAt)} · @ GHS {tx.unitPrice.toFixed(2)}/L
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono font-black text-orange-500">
                        {formatGHS(tx.amount)}
                      </span>

                      {/* Action buttons: Edit if shift is OPEN, otherwise Locked */}
                      {isShiftOpen ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(tx)}
                            className="p-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-500 hover:bg-orange-500 hover:text-white transition"
                            title="Edit Transaction"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTx(tx.id)}
                            className="p-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-500 hover:bg-rose-500 hover:text-white transition"
                            title="Delete Transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span
                          className="p-1.5 rounded-lg bg-slate-800 text-slate-500"
                          title="Shift is submitted. Transactions cannot be edited."
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Sheet Footer */}
            <div className={`p-4 border-t shrink-0 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'}`}>
              <button
                onClick={() => setIsTransactionsSheetOpen(false)}
                className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition shadow-md"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Edit Transaction Modal */}
      {/* ------------------------------------------------------------- */}
      {editingTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className={`rounded-2xl max-w-sm w-full border shadow-2xl p-5 ${
            isDark ? 'bg-[#0b101b] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-orange-500" />
                <h3 className="text-sm font-bold">Edit Shift Transaction</h3>
              </div>
              <button
                onClick={() => setEditingTx(null)}
                className={`p-1 rounded-lg border transition ${
                  isDark ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Product */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1.5">
                  Fuel Product
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(activeProducts.length > 0
                    ? activeProducts
                    : pump.fuels.map(f => ({
                        code: f,
                        name: f,
                        unitPrice: f === 'AGO' ? 15.2 : 14.8,
                        color: FUEL_META[f]?.color || '#22c55e',
                      }))
                  ).map(p => {
                    const active = p.code === editFuelCode
                    return (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() => setEditFuelCode(p.code)}
                        className={`p-2 rounded-xl border text-xs font-bold text-center transition ${
                          active
                            ? 'border-orange-500 bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30'
                            : isDark
                            ? 'border-slate-800 bg-slate-900 text-slate-400'
                            : 'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        <span className="block">{p.code}</span>
                        <span className="text-[9px] text-slate-500 font-mono">@ GHS {p.unitPrice.toFixed(2)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Volume (Litres) */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1.5">
                  Volume (Litres)
                </label>
                <input
                  type="text"
                  value={editLitres}
                  onChange={e => setEditLitres(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className={`w-full h-11 rounded-xl border px-3 text-center font-mono text-lg font-bold outline-none focus:border-orange-500 ${
                    isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-100 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1.5">
                  Payment Method
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.keys(PAYMENT_META) as PaymentMethod[]).map(m => {
                    const active = m === editMethod
                    const meta = PAYMENT_META[m]
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setEditMethod(m)}
                        className={`py-2 rounded-xl border text-[10px] font-bold text-center transition ${
                          active
                            ? 'border-orange-500 bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30'
                            : isDark
                            ? 'border-slate-800 bg-slate-900 text-slate-400'
                            : 'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        {meta.shortLabel}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Recomputed Amount Preview */}
              {(() => {
                const ep = activeProducts.find(p => p.code === editFuelCode)
                const price = ep?.unitPrice ?? (editFuelCode === 'AGO' ? 15.2 : 14.8)
                const recomputed = (Number(editLitres) || 0) * price
                return (
                  <div className={`p-3 rounded-xl border flex items-center justify-between ${
                    isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
                  }`}>
                    <span className="text-xs text-slate-500">Updated Amount</span>
                    <span className="text-base font-black text-orange-500">{formatGHS(recomputed)}</span>
                  </div>
                )
              })()}
            </div>

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition ${
                  isDark ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={editSaving || !Number(editLitres)}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                {editSaving ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}