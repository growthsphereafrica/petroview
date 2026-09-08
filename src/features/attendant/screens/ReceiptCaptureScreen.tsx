/**
 * Receipt capture — lists receipts attached to the active shift and
 * launches the camera to photograph new paper receipts.
 */

import React, { useEffect, useState } from 'react'
import { Camera, Image as ImageIcon, Plus } from 'lucide-react'
import { useShift } from '../providers'
import { Badge, Card, ScreenHeader } from '../ui'
import { CameraModal } from '../../../components/common/CameraModal'
import { receiptRepo } from '../../../core/infra/repositories'
import { formatDateTime } from '../../../utils/currencyFormatter'
import type { ReceiptRecord } from '../../../core/domain/types'

export const ReceiptCaptureScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { activeShift } = useShift()
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [isCameraOpen, setIsCameraOpen] = useState(false)

  const reload = async (shiftId: string) => {
    const rows = await receiptRepo.listForShift(shiftId)
    setReceipts(rows)
  }

  useEffect(() => {
    if (activeShift) void reload(activeShift.id)
  }, [activeShift?.id])

  const handleCapture = async (dataUrl: string) => {
    if (!activeShift) return
    await receiptRepo.add({
      id: `rcpt-${crypto.randomUUID()}`,
      shiftId: activeShift.id,
      image: dataUrl,
      capturedAt: new Date().toISOString(),
      syncStatus: 'PENDING',
    })
    await reload(activeShift.id)
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      <ScreenHeader title="Receipts" subtitle="Attach paper receipt evidence" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 max-w-md w-full mx-auto">
        <button
          onClick={() => setIsCameraOpen(true)}
          className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white py-4 text-sm font-bold flex items-center justify-center gap-2 transition active:scale-[0.98]"
        >
          <Camera className="w-5 h-5" /> Capture New Receipt
        </button>

        <Card className="divide-y divide-slate-800/70 overflow-hidden">
          {receipts.length === 0 && (
            <div className="px-4 py-8 flex flex-col items-center text-center">
              <ImageIcon className="w-8 h-8 text-slate-700 mb-2" />
              <p className="text-xs text-slate-500">No receipts captured for this shift yet.</p>
            </div>
          )}
          {receipts.map(r => (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3">
              <img src={r.image} alt="Receipt" className="w-12 h-16 rounded-lg object-cover border border-slate-700" />
              <div className="flex-1">
                <p className="text-xs font-bold text-white">Receipt</p>
                <p className="text-[10px] text-slate-500">{formatDateTime(r.capturedAt)}</p>
              </div>
              <Badge tone={r.syncStatus === 'SYNCED' ? 'success' : 'warning'}>
                {r.syncStatus === 'SYNCED' ? 'Synced' : 'Pending'}
              </Badge>
            </div>
          ))}
        </Card>

        <button
          onClick={onBack}
          className="w-full rounded-xl bg-slate-800 hover:bg-slate-700 text-white py-3 text-sm font-bold flex items-center justify-center gap-2 transition"
        >
          <Plus className="w-4 h-4" /> Back to Sales
        </button>
      </div>

      <CameraModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={dataUrl => void handleCapture(dataUrl)}
        shiftNumber={activeShift?.number}
        attendantName={activeShift?.attendantName}
        stationName={activeShift?.stationName}
      />
    </div>
  )
}