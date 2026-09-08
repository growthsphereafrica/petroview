/**
 * Record Sale — the attendant's primary transaction screen.
 * Select fuel → enter litres → verify amount → choose payment → record.
 * Live preview of running totals and the shift transaction list.
 */

import React, { useMemo, useState } from 'react'
import { Check, Flame, Minus, Plus, ReceiptText } from 'lucide-react'
import { useShift } from '../providers'
import { Badge, Card, ScreenHeader } from '../ui'
import { FUEL_META, PAYMENT_META, PRODUCTION_PUMPS, PRODUCTION_STATION } from '../../../core/domain/config'
import { saleAmount } from '../../../core/domain/rules'
import { transactionRepo } from '../../../core/infra/repositories'
import { formatGHS, formatTimeOnly } from '../../../utils/currencyFormatter'
import type { FuelCode, PaymentMethod, ShiftTransaction } from '../../../core/domain/types'

export const SalesScreen: React.FC<{ onBack: () => void; onCaptureReceipt: () => void }> = ({ onBack, onCaptureReceipt }) => {
  const { activeShift, recordSale } = useShift()

  const pump = useMemo(
    () => PRODUCTION_PUMPS.find(p => p.id === activeShift?.pumpId) ?? PRODUCTION_PUMPS[0],
    [activeShift?.pumpId],
  )

  const [fuelCode, setFuelCode] = useState<FuelCode>(pump.fuels[0])
  const [litres, setLitres] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [saving, setSaving] = useState(false)
  const [transactions, setTransactions] = useState<ShiftTransaction[]>([])

  React.useEffect(() => {
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
      <div className="h-full flex flex-col items-center justify-center bg-[#090d16] px-6 text-center">
        <p className="text-sm font-bold text-white">No open shift</p>
        <p className="text-xs text-slate-500 mt-1">Start a shift before recording sales.</p>
        <button onClick={onBack} className="mt-4 text-orange-400 text-xs font-bold">Back to dashboard</button>
      </div>
    )
  }

  const litresNum = Number(litres) || 0
  const unitPrice = PRODUCTION_STATION.fuelPrices[fuelCode]
  const amount = saleAmount(litresNum, unitPrice)

  const record = async () => {
    if (litresNum <= 0) return
    setSaving(true)
    try {
      await recordSale({ fuelCode, litres: litresNum, method })
      setLitres('')
      setSaving(false)
    } catch {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16]">
      <ScreenHeader
        title="Record Sale"
        subtitle={`${activeShift.number} · ${activeShift.pumpName}`}
        onBack={onBack}
        right={
          <button
            onClick={onCaptureReceipt}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-orange-400 text-xs font-bold hover:border-orange-500/50 transition"
          >
            <ReceiptText className="w-4 h-4" /> Receipts
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 max-w-md w-full mx-auto">
        {/* Running totals */}
        <Card className="p-3.5 border-orange-500/20 bg-slate-900/90 shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase font-bold text-slate-500 flex items-center gap-1">
                <Flame className="w-2.5 h-2.5 text-orange-400" /> Collected
              </p>
              <p className="text-lg font-black text-orange-400">{formatGHS(activeShift.actualTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase font-bold text-slate-500">This shift</p>
              <p className="text-lg font-black text-white">{transactions.length} transaction{transactions.length === 1 ? '' : 's'}</p>
            </div>
          </div>
        </Card>

        {/* Fuel selector */}
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-500 mb-2">Fuel Type</p>
          <div className="flex flex-wrap gap-2">
            {pump.fuels.map(fuel => {
              const active = fuel === fuelCode
              const meta = FUEL_META[fuel]
              return (
                <button
                  key={fuel}
                  onClick={() => {
                    setFuelCode(fuel)
                    setLitres('')
                  }}
                  className={`px-4 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                    active ? 'border-orange-500 bg-orange-500/15 text-white shadow-sm ring-1 ring-orange-500/30' : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                  {fuel}
                  <span className="text-slate-400 font-mono text-[10px]">@ {unitPrice.toFixed(2)}</span>
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
              className="w-11 h-12 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center"
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              value={litres}
              onChange={e => setLitres(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0.00"
              className="flex-1 h-12 rounded-xl bg-slate-900 border border-slate-800 px-4 text-center font-mono text-xl font-bold text-white placeholder:text-slate-700 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition"
            />
            <button
              onClick={() => setLitres(v => (Number(v) + 1).toFixed(2))}
              className="w-11 h-12 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 rounded-xl bg-slate-900 border border-slate-800 px-4 py-3 flex items-center justify-between shadow-inner">
            <span className="text-[11px] text-slate-400">Amount due</span>
            <span className="text-xl font-black text-orange-400">{litres ? formatGHS(amount) : '—'}</span>
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
                    active ? 'border-orange-500 bg-orange-500/15 shadow-sm ring-1 ring-orange-500/30' : 'border-slate-800 bg-slate-900'
                  }`}
                >
                  <span className="block w-2 h-2 rounded-full mx-auto mb-1.5" style={{ backgroundColor: active ? meta.color : '#334155' }} />
                  <span className={`text-[10px] font-bold ${active ? 'text-white' : 'text-slate-400'}`}>{meta.shortLabel}</span>
                </button>
              )
            })}
          </div>
        </div>

        <button
          onClick={() => void record()}
          disabled={litresNum <= 0 || saving}
          className="sticky bottom-0 w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 text-sm font-black flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-orange-950/60 border border-orange-400/30"
        >
          {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-5 h-5" />}
          Record {formatGHS(amount)} {method}
        </button>

        {/* Transaction history */}
        <div className="mt-2">
          <p className="text-[11px] font-bold uppercase text-slate-500 mb-2">This shift ({transactions.length})</p>
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {transactions.length === 0 && <p className="px-4 py-5 text-xs text-slate-500 text-center">No sales recorded yet.</p>}
            {transactions.map(tx => (
              <div key={tx.id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Badge tone={tx.method === 'CASH' ? 'warning' : tx.method === 'MOMO' ? 'success' : tx.method === 'VOUCHER' ? 'info' : 'danger'}>
                    {PAYMENT_META[tx.method].shortLabel}
                  </Badge>
                  <div>
                    <p className="text-xs font-bold text-white">
                      {tx.litres.toFixed(2)}L <span className="text-slate-500">{tx.fuelCode}</span>
                    </p>
                    <p className="text-[10px] text-slate-500">{formatTimeOnly(tx.recordedAt)} · @ GHS {tx.unitPrice.toFixed(2)}</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-orange-400">{formatGHS(tx.amount)}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}