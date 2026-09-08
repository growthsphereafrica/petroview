/**
 * Shift Summary — final receipt-style breakdown after a shift is locked.
 * Shows fuel sales, collections and variance, ready for sync.
 */

import React, { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, Flame } from 'lucide-react'
import { useShift } from '../providers'
import { Badge, Card, ScreenHeader } from '../ui'
import { FUEL_META, PAYMENT_META } from '../../../core/domain/config'
import { formatGHS, formatDateTime } from '../../../utils/currencyFormatter'
import { receiptRepo } from '../../../core/infra/repositories'
import type { ReceiptRecord } from '../../../core/domain/types'

export const ShiftSummaryScreen: React.FC<{ onBack: () => void; onDone: () => void }> = ({ onBack, onDone }) => {
  const { shifts, pushSync, pendingCount } = useShift()
  const [latestShift, setLatestShift] = useState(shifts[0])
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (!latestShift) return
    let cancelled = false
    receiptRepo
      .listForShift(latestShift.id)
      .then(rows => {
        if (!cancelled) setReceipts(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [latestShift?.id])

  if (!latestShift || latestShift.status === 'OPEN') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[#090d16] px-6 text-center">
        <p className="text-sm font-bold text-white">No closed shift</p>
        <button onClick={onBack} className="mt-4 text-orange-400 text-xs font-bold">Back</button>
      </div>
    )
  }

  const sortedSales = [...latestShift.sales].sort((a, b) => b.litres - a.litres)

  const runSync = async () => {
    setSyncing(true)
    try {
      await pushSync()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16]">
      <ScreenHeader title="Shift Summary" subtitle="Locked & saved locally" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4 max-w-md w-full mx-auto">
        <div className="rounded-2xl bg-orange-500/10 border border-orange-500/30 px-4 py-4 flex items-start gap-3 shadow-md shadow-orange-950/30">
          <CheckCircle2 className="w-6 h-6 text-orange-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black text-white flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-orange-400" /> {latestShift.number}
            </p>
            <p className="text-[11px] text-orange-200/80">
              Closed {formatDateTime(latestShift.closedAt ?? latestShift.updatedAt)} · {latestShift.attendantName}
            </p>
          </div>
        </div>

        {/* Fuel sales */}
        <Card className="divide-y divide-slate-800/70 overflow-hidden">
          {sortedSales.map(sale => (
            <div key={sale.fuelCode} className="px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FUEL_META[sale.fuelCode].color }} />
                <div>
                  <p className="text-xs font-bold text-white">{sale.litres.toFixed(2)} L</p>
                  <p className="text-[10px] text-slate-500">@ GHS {sale.unitPrice.toFixed(2)}/L</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-white">{formatGHS(sale.amount)}</span>
            </div>
          ))}
          <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between">
            <span className="text-xs font-black text-slate-300">Expected from meters</span>
            <span className="text-sm font-black text-white">{formatGHS(latestShift.expectedTotal)}</span>
          </div>
        </Card>

        {/* Collections */}
        <div>
          <p className="text-[11px] font-bold uppercase text-slate-500 mb-2">Collections</p>
          <Card className="divide-y divide-slate-800/70 overflow-hidden">
            {(['CASH', 'MOMO', 'VOUCHER', 'CREDIT'] as const).map(m => {
              const amount = latestShift.payments[m]
              if (amount <= 0 && m !== 'CASH') return null
              return (
                <div key={m} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">{PAYMENT_META[m].label}</span>
                  <span className="text-xs font-mono font-bold text-white">{formatGHS(amount)}</span>
                </div>
              )
            })}
            <div className="px-4 py-3 bg-slate-800/50 flex items-center justify-between">
              <span className="text-xs font-black text-slate-300">Actual collected</span>
              <span className="text-sm font-black text-orange-400">{formatGHS(latestShift.actualTotal)}</span>
            </div>
          </Card>
        </div>

        {/* Variance + receipts */}
        <Card className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Variance</span>
            <Badge tone={latestShift.variance === 0 ? 'success' : 'warning'}>
              {formatGHS(latestShift.variance)}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Receipts attached</span>
            <Badge tone="info">{receipts.length} captured</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Sync queue</span>
            <Badge tone={pendingCount > 0 ? 'warning' : 'success'}>{pendingCount} pending</Badge>
          </div>
        </Card>

        <button
          onClick={() => void runSync()}
          disabled={syncing}
          className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white py-3.5 text-sm font-extrabold flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-orange-950/50 border border-orange-400/30"
        >
          {syncing ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <ChevronDown className="w-4 h-4" />}
          {syncing ? 'Synchronizing…' : `Push ${pendingCount} pending record(s)`}
        </button>

        <button
          onClick={onDone}
          className="w-full rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white py-3 text-sm font-bold transition"
        >
          Finish
        </button>
      </div>
    </div>
  )
}