/**
 * Production Station Expense Service.
 * Manages logging, categorization, approval, and aggregation of forecourt expenses.
 * Scoped by station and company tenant.
 */

import { expenseRepo, auditLogRepo } from '../infra/repositories'
import { liveSyncBus } from './liveSyncBus'
import { STANDARD_STATION_EXPENSE_CATEGORIES } from '../../constants/expenseCategories'
import type { StationExpense, ExpensePaymentSource } from '../domain/types'

export interface CreateExpenseInput {
  companyId: string
  companyShortCode?: string
  stationId: string
  stationName: string
  category: string
  amount: number
  paymentSource: ExpensePaymentSource
  payee?: string
  referenceNumber?: string
  notes?: string
  date?: string // YYYY-MM-DD (defaults to today)
  recordedBy: {
    id: string
    name: string
    employeeCode: string
  }
}

export interface UpdateExpenseInput {
  category?: string
  amount?: number
  paymentSource?: ExpensePaymentSource
  payee?: string
  referenceNumber?: string
  notes?: string
  date?: string
  status?: 'APPROVED' | 'PENDING' | 'REJECTED'
  actorName?: string
}

export interface ExpenseSummary {
  totalAmount: number
  count: number
  todayAmount: number
  todayCount: number
  categoryBreakdown: Record<string, { count: number; amount: number }>
  paymentSourceBreakdown: Record<string, { count: number; amount: number }>
  topCategory: { category: string; amount: number } | null
}

export class ExpenseService {
  /**
   * Seeds realistic historical and today's expenses if none exist
   */
  async seedInitialExpenses(): Promise<void> {
    const existing = await expenseRepo.listAll()
    if (existing.length > 0) return

    const todayStr = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const twoDaysAgo = new Date(Date.now() - 172800000).toISOString().slice(0, 10)

    const samples: Omit<StationExpense, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        companyId: 'COMP-MVP',
        companyShortCode: 'PV',
        stationId: 'STN-GV-042',
        stationName: 'Green Valley Station',
        category: 'DISEL FOR GENSET',
        amount: 450.0,
        paymentSource: 'CASH',
        payee: 'Forecourt Generator Tank',
        referenceNumber: 'GEN-2026-01',
        notes: '30L fuel for power outage from 10am to 1pm',
        date: todayStr,
        recordedBy: { id: 'SUP-001', name: 'Kwame Mensah', employeeCode: 'PV-ACC-001-M' },
        status: 'APPROVED',
      },
      {
        companyId: 'COMP-MVP',
        companyShortCode: 'PV',
        stationId: 'STN-GV-042',
        stationName: 'Green Valley Station',
        category: 'CLEANING & SANITATION',
        amount: 120.0,
        paymentSource: 'CASH',
        payee: 'CleanWorld Services',
        referenceNumber: 'INV-8831',
        notes: 'Detergents, floor wash, and forecourt pressure cleaning supplies',
        date: todayStr,
        recordedBy: { id: 'SUP-001', name: 'Kwame Mensah', employeeCode: 'PV-ACC-001-M' },
        status: 'APPROVED',
      },
      {
        companyId: 'COMP-MVP',
        companyShortCode: 'PV',
        stationId: 'STN-GV-042',
        stationName: 'Green Valley Station',
        category: 'PUMP REPAIRS& MAINTENANCE',
        amount: 850.0,
        paymentSource: 'STATION_ACCOUNT',
        payee: 'PetroTech Engineering',
        referenceNumber: 'SRV-4412',
        notes: 'Replaced nozzle seal and calibrated flow meter on Pump 2',
        date: yesterday,
        recordedBy: { id: 'SUP-001', name: 'Kwame Mensah', employeeCode: 'PV-ACC-001-M' },
        status: 'APPROVED',
      },
      {
        companyId: 'COMP-MVP',
        companyShortCode: 'PV',
        stationId: 'STN-GV-042',
        stationName: 'Green Valley Station',
        category: 'ECG',
        amount: 1200.0,
        paymentSource: 'MOMO',
        payee: 'Electricity Company of Ghana',
        referenceNumber: 'MOMO-ECG-9921',
        notes: 'Monthly commercial utility bill prepayment',
        date: twoDaysAgo,
        recordedBy: { id: 'SUP-001', name: 'Kwame Mensah', employeeCode: 'PV-ACC-001-M' },
        status: 'APPROVED',
      },
      {
        companyId: 'COMP-MVP',
        companyShortCode: 'PV',
        stationId: 'STN-GV-042',
        stationName: 'Green Valley Station',
        category: 'WATER',
        amount: 180.0,
        paymentSource: 'CASH',
        payee: 'Ghana Water Company Ltd',
        referenceNumber: 'GWCL-3019',
        notes: 'Water tanker refill for customer bay & restrooms',
        date: twoDaysAgo,
        recordedBy: { id: 'SUP-001', name: 'Kwame Mensah', employeeCode: 'PV-ACC-001-M' },
        status: 'APPROVED',
      },
      {
        companyId: 'COMP-GOIL',
        companyShortCode: 'GOIL',
        stationId: 'STN-GOIL-01',
        stationName: 'GOIL Airport City',
        category: 'STATIONARY',
        amount: 95.0,
        paymentSource: 'CASH',
        payee: 'Apex Stationary',
        referenceNumber: 'REC-102',
        notes: 'Thermal receipt rolls for POS terminals and A4 logbooks',
        date: todayStr,
        recordedBy: { id: 'SUP-GOIL', name: 'Yaw Addo', employeeCode: 'GOIL-ACC-001-M' },
        status: 'APPROVED',
      },
    ]

    const now = new Date().toISOString()
    for (const s of samples) {
      await expenseRepo.add({
        ...s,
        id: `exp-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  /**
   * Record a new station expense
   */
  async createExpense(input: CreateExpenseInput): Promise<StationExpense> {
    const amountNum = Number(input.amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error('Expense amount must be a positive number greater than 0.')
    }
    const cat = input.category.trim()
    if (!cat) {
      throw new Error('Expense category or description is required.')
    }

    const now = new Date().toISOString()
    const dateStr = input.date?.trim() || now.slice(0, 10)

    const expense: StationExpense = {
      id: `exp-${crypto.randomUUID()}`,
      companyId: input.companyId,
      companyShortCode: input.companyShortCode,
      stationId: input.stationId,
      stationName: input.stationName,
      category: cat.toUpperCase(),
      amount: Math.round(amountNum * 100) / 100,
      paymentSource: input.paymentSource || 'CASH',
      payee: input.payee?.trim() || undefined,
      referenceNumber: input.referenceNumber?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      date: dateStr,
      recordedBy: input.recordedBy,
      status: 'APPROVED',
      createdAt: now,
      updatedAt: now,
    }

    await expenseRepo.add(expense)

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'EXPENSE_RECORDED',
      actorId: input.recordedBy.id,
      actorName: input.recordedBy.name,
      actorRole: 'SUPERVISOR',
      targetId: expense.id,
      targetDescription: `Logged expense: ${expense.category} - GHS ${expense.amount.toFixed(2)} (${expense.paymentSource}) at ${expense.stationName}`,
      notes: expense.notes || null,
      timestamp: now,
      meta: {
        stationId: expense.stationId,
        companyId: expense.companyId,
        category: expense.category,
        amount: expense.amount,
        paymentSource: expense.paymentSource,
      },
    })

    liveSyncBus.publish({ table: 'EXPENSES' as any, reason: 'INSERT', key: expense.id })
    return expense
  }

  /**
   * Update an existing station expense
   */
  async updateExpense(id: string, updates: UpdateExpenseInput): Promise<StationExpense> {
    const existing = await expenseRepo.get(id)
    if (!existing) throw new Error(`Expense record not found with id: ${id}`)

    const now = new Date().toISOString()
    const updated: StationExpense = {
      ...existing,
      category: updates.category ? updates.category.trim().toUpperCase() : existing.category,
      amount:
        updates.amount !== undefined
          ? Math.round(Number(updates.amount) * 100) / 100
          : existing.amount,
      paymentSource: updates.paymentSource || existing.paymentSource,
      payee: updates.payee !== undefined ? updates.payee.trim() : existing.payee,
      referenceNumber: updates.referenceNumber !== undefined ? updates.referenceNumber.trim() : existing.referenceNumber,
      notes: updates.notes !== undefined ? updates.notes.trim() : existing.notes,
      date: updates.date || existing.date,
      status: updates.status || existing.status,
      updatedAt: now,
    }

    if (updated.amount <= 0 || isNaN(updated.amount)) {
      throw new Error('Expense amount must be a positive number greater than 0.')
    }

    await expenseRepo.update(updated)

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'EXPENSE_UPDATED',
      actorId: existing.recordedBy.id,
      actorName: updates.actorName || existing.recordedBy.name,
      actorRole: 'SUPERVISOR',
      targetId: updated.id,
      targetDescription: `Updated expense: ${updated.category} - GHS ${updated.amount.toFixed(2)} at ${updated.stationName}`,
      notes: updated.notes || null,
      timestamp: now,
    })

    liveSyncBus.publish({ table: 'EXPENSES' as any, reason: 'UPDATE', key: updated.id })
    return updated
  }

  /**
   * Delete an expense
   */
  async deleteExpense(id: string, actorName = 'Supervisor'): Promise<void> {
    const existing = await expenseRepo.get(id)
    if (!existing) return

    await expenseRepo.delete(id)

    await auditLogRepo.add({
      id: `audit-${crypto.randomUUID()}`,
      action: 'EXPENSE_DELETED',
      actorId: existing.recordedBy.id,
      actorName,
      actorRole: 'SUPERVISOR',
      targetId: id,
      targetDescription: `Deleted expense: ${existing.category} - GHS ${existing.amount.toFixed(2)} at ${existing.stationName}`,
      notes: null,
      timestamp: new Date().toISOString(),
    })

    liveSyncBus.publish({ table: 'EXPENSES' as any, reason: 'DELETE', key: id })
  }

  /**
   * List expenses matching optional filters (companyId, stationId, date range, category)
   */
  async listExpenses(filter?: {
    companyId?: string
    stationId?: string
    startDate?: string
    endDate?: string
    category?: string
  }): Promise<StationExpense[]> {
    await this.seedInitialExpenses()
    let rows: StationExpense[] = []

    if (filter?.stationId && filter.stationId !== 'ALL') {
      rows = await expenseRepo.listForStation(filter.stationId)
    } else if (filter?.companyId && filter.companyId !== 'ALL') {
      rows = await expenseRepo.listForCompany(filter.companyId)
    } else {
      rows = await expenseRepo.listAll()
    }

    // Date range filtering (by expense date YYYY-MM-DD)
    if (filter?.startDate) {
      rows = rows.filter(r => r.date >= filter.startDate!)
    }
    if (filter?.endDate) {
      rows = rows.filter(r => r.date <= filter.endDate!)
    }
    if (filter?.category && filter.category !== 'ALL') {
      const match = filter.category.trim().toUpperCase()
      rows = rows.filter(r => r.category === match)
    }

    return rows.sort((a, b) => b.date.localeCompare(a.date) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  /**
   * Get calculated summary of expenses for reports and KPI cards
   */
  async getExpenseSummary(filter?: {
    companyId?: string
    stationId?: string
    startDate?: string
    endDate?: string
  }): Promise<ExpenseSummary> {
    const list = await this.listExpenses(filter)
    const todayStr = new Date().toISOString().slice(0, 10)

    let totalAmount = 0
    let todayAmount = 0
    let todayCount = 0
    const categoryBreakdown: Record<string, { count: number; amount: number }> = {}
    const paymentSourceBreakdown: Record<string, { count: number; amount: number }> = {}

    for (const exp of list) {
      totalAmount += exp.amount
      if (exp.date === todayStr) {
        todayAmount += exp.amount
        todayCount += 1
      }

      if (!categoryBreakdown[exp.category]) {
        categoryBreakdown[exp.category] = { count: 0, amount: 0 }
      }
      categoryBreakdown[exp.category].count += 1
      categoryBreakdown[exp.category].amount += exp.amount

      const src = exp.paymentSource || 'CASH'
      if (!paymentSourceBreakdown[src]) {
        paymentSourceBreakdown[src] = { count: 0, amount: 0 }
      }
      paymentSourceBreakdown[src].count += 1
      paymentSourceBreakdown[src].amount += exp.amount
    }

    let topCategory: { category: string; amount: number } | null = null
    for (const [cat, data] of Object.entries(categoryBreakdown)) {
      if (!topCategory || data.amount > topCategory.amount) {
        topCategory = { category: cat, amount: data.amount }
      }
    }

    return {
      totalAmount: Math.round(totalAmount * 100) / 100,
      count: list.length,
      todayAmount: Math.round(todayAmount * 100) / 100,
      todayCount,
      categoryBreakdown,
      paymentSourceBreakdown,
      topCategory,
    }
  }
}

export const expenseService = new ExpenseService()
