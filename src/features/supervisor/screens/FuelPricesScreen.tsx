/**
 * Station Fuel Prices Management Screen for Station Managers & Supervisors
 * Displays and updates official unit prices per litre for all forecourt fuels.
 * Changes apply station-wide and are enforced for all attendant shifts.
 */

import React, { useEffect, useState } from 'react'
import { CheckCircle2, DollarSign, Edit3, Fuel, Info, Save, X } from 'lucide-react'
import { ScreenHeader, StatusBar, Card } from '../../shared/ui'
import { useSupervisorSession } from '../providers'
import { productService } from '../../../core/services/productService'
import { FUEL_META } from '../../../core/domain/config'
import { formatGHS } from '../../../utils/currencyFormatter'
import type { Product } from '../../../core/domain/types'

export const SupervisorFuelPricesScreen: React.FC<{
  onBack: () => void
  onToast: (msg: string, kind?: 'success' | 'error' | 'warning' | 'info') => void
}> = ({ onBack, onToast }) => {
  const { supervisor } = useSupervisorSession()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const loadProducts = async () => {
    setLoading(true)
    try {
      const list = await productService.listActiveProducts(supervisor?.companyId)
      setProducts(list)
    } catch {
      onToast('Failed to load station products.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts()
  }, [supervisor?.companyId])

  const handleStartEdit = (prod: Product) => {
    setEditingId(prod.id)
    setEditPrice(prod.unitPrice.toString())
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditPrice('')
  }

  const handleSavePrice = async (prod: Product) => {
    const val = parseFloat(editPrice)
    if (!Number.isFinite(val) || val <= 0) {
      onToast('Unit price must be a positive number.', 'error')
      return
    }

    setSaving(true)
    try {
      await productService.updateProduct(prod.id, {
        name: prod.name,
        unitPrice: Math.round(val * 100) / 100,
        category: prod.category,
        unit: prod.unit || 'Litre',
        color: prod.color,
        active: prod.active,
        actorName: `${supervisor?.fullName || 'Station Manager'} (Supervisor)`,
      })
      onToast(`Updated ${prod.name} to GHS ${val.toFixed(2)}/L.`, 'success')
      setEditingId(null)
      setEditPrice('')
      await loadProducts()
    } catch (err: any) {
      onToast(err.message || 'Failed to update fuel price.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-[#090d16] overflow-y-auto">
      <StatusBar online />
      <ScreenHeader
        title="Fuel Unit Prices"
        subtitle="Manage Station Unit Price per Litre · Enforced across Forecourt"
        onBack={onBack}
      />

      <div className="flex-1 px-4 py-4 max-w-2xl w-full mx-auto flex flex-col gap-4 pb-12">
        <div className="rounded-2xl bg-orange-500/10 border border-orange-500/30 p-3.5 flex items-start gap-3 shadow-md shadow-orange-950/20">
          <Info className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <p className="text-xs text-orange-200 leading-snug">
            Unit prices set here are strictly enforced on all attendant pump shifts. Attendants cannot alter fuel
            prices during sales or closing readings.
          </p>
        </div>

        {loading ? (
          <Card className="p-8 flex items-center justify-center gap-3">
            <span className="w-6 h-6 border-2 border-slate-700 border-t-orange-500 rounded-full animate-spin" />
            <span className="text-xs text-slate-400">Loading products and fuel prices…</span>
          </Card>
        ) : products.length === 0 ? (
          <Card className="p-6 text-center text-xs text-slate-400">
            No active fuel products found for this station.
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {products.map(prod => {
              const meta = FUEL_META[prod.code] || { color: prod.color || '#F97316', label: prod.name }
              const isEditing = editingId === prod.id

              return (
                <Card key={prod.id} className="p-4 bg-slate-900 border-slate-800 shadow-md">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-md uppercase"
                        style={{ backgroundColor: meta.color }}
                      >
                        {prod.code}
                      </span>
                      <div>
                        <h4 className="text-sm font-extrabold text-white">{prod.name}</h4>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
                          {prod.category} · {prod.unit || 'Litre'}
                        </p>
                      </div>
                    </div>

                    {!isEditing ? (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">Unit Price</span>
                          <span className="text-base font-black font-mono text-amber-400">
                            {formatGHS(prod.unitPrice)}
                            <span className="text-[10px] text-slate-400 ml-1 font-normal">/ L</span>
                          </span>
                        </div>
                        <button
                          onClick={() => handleStartEdit(prod)}
                          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          title="Edit Price"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {isEditing && (
                    <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col gap-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                          New Price per Litre (GHS)
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-bold">GHS</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editPrice}
                              onChange={e => setEditPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                              placeholder="0.00"
                              className="w-full pl-12 pr-4 py-2 rounded-xl bg-slate-950 border border-orange-500/80 font-mono text-sm font-bold text-white focus:outline-none"
                              autoFocus
                            />
                          </div>
                          <button
                            onClick={handleCancelEdit}
                            disabled={saving}
                            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => void handleSavePrice(prod)}
                            disabled={saving}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-orange-950/40"
                          >
                            {saving ? (
                              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5" />
                            )}
                            Save Price
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
