/**
 * Mobile Station Expenses Service
 * Manages logging and retrieval of forecourt operational expenses.
 * Offline-first: stored locally in AsyncStorage and synced to cloud.
 */

import { keys, sGet, sSet } from '../store/storage'
import { enqueue } from '../infra/repositories'
import type { StationExpense, SyncQueueItem } from '../domain/types'

export const STANDARD_EXPENSE_CATEGORIES = [
  'Generator Fuel & Maintenance',
  'Electricity & Utilities',
  'Water Supply & Sanitation',
  'Cleaning & Station Supplies',
  'Security & Guard Services',
  'Office Stationery & Printing',
  'POS Paper Rolls & Consumables',
  'Forecourt Repairs & Maintenance',
  'Cash Transport & Banking Fees',
  'Staff Meals & Welfare',
  'Casual Labour',
  'Safety & Fire Equipment Check',
  'Waste Disposal',
  'Petty Cash Miscellaneous',
]

export class MobileExpenseService {
  async listExpenses(stationId?: string): Promise<StationExpense[]> {
    const all = (await sGet<StationExpense[]>(keys.expenses)) ?? []
    if (!stationId) return all
    return all.filter(e => e.stationId === stationId)
  }

  async createExpense(input: {
    companyId: string
    companyShortCode?: string
    stationId: string
    stationName: string
    category: string
    amount: number
    paymentSource: 'CASH' | 'MOMO' | 'STATION_ACCOUNT' | 'OTHER'
    payee?: string
    referenceNumber?: string
    notes?: string
    date?: string
    recordedBy: {
      id: string
      name: string
      employeeCode: string
    }
  }): Promise<StationExpense> {
    const amountNum = Number(input.amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error('Expense amount must be a positive number greater than 0.')
    }
    const cat = input.category.trim()
    if (!cat) {
      throw new Error('Expense category is required.')
    }

    const now = new Date().toISOString()
    const expense: StationExpense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      companyId: input.companyId,
      companyShortCode: input.companyShortCode,
      stationId: input.stationId,
      stationName: input.stationName,
      category: cat,
      amount: Math.round(amountNum * 100) / 100,
      paymentSource: input.paymentSource,
      payee: input.payee?.trim() || undefined,
      referenceNumber: input.referenceNumber?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      date: input.date || now.slice(0, 10),
      recordedBy: input.recordedBy,
      status: 'APPROVED',
      createdAt: now,
      updatedAt: now,
    }

    const all = (await sGet<StationExpense[]>(keys.expenses)) ?? []
    all.unshift(expense)
    await sSet(keys.expenses, all)

    // Enqueue for cloud sync
    const syncItem: SyncQueueItem = {
      id: `sync-exp-${expense.id}`,
      type: 'EXPENSE' as any,
      entityType: 'EXPENSE' as any,
      refId: expense.id,
      payload: expense,
      status: 'PENDING',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    }
    await enqueue(syncItem)

    return expense
  }

  async getSummary(stationId?: string): Promise<{ total: number; today: number; count: number }> {
    const list = await this.listExpenses(stationId)
    const todayStr = new Date().toISOString().slice(0, 10)
    let total = 0
    let today = 0

    for (const e of list) {
      total += e.amount
      if (e.date === todayStr) {
        today += e.amount
      }
    }

    return {
      total: Math.round(total * 100) / 100,
      today: Math.round(today * 100) / 100,
      count: list.length,
    }
  }
}

export const mobileExpenseService = new MobileExpenseService()
