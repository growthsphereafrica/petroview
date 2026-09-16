import { Router } from 'express'
import { db } from '../db'

export const expensesRouter = Router()

interface ExpenseRow {
  id: string
  companyId: string
  companyShortCode: string | null
  stationId: string
  stationName: string
  category: string
  amount: number
  paymentSource: string
  payee: string | null
  referenceNumber: string | null
  notes: string | null
  date: string
  recordedBy: string
  status: string
  createdAt: string
  updatedAt: string
}

// GET /api/expenses
expensesRouter.get('/', (req, res) => {
  try {
    const { companyId, stationId, startDate, endDate, category } = req.query

    let query = 'SELECT * FROM station_expenses WHERE 1=1'
    const params: (string | number)[] = []

    if (typeof companyId === 'string' && companyId !== 'ALL') {
      query += ' AND companyId = ?'
      params.push(companyId)
    }

    if (typeof stationId === 'string' && stationId !== 'ALL') {
      query += ' AND stationId = ?'
      params.push(stationId)
    }

    if (typeof startDate === 'string') {
      query += ' AND date >= ?'
      params.push(startDate)
    }

    if (typeof endDate === 'string') {
      query += ' AND date <= ?'
      params.push(endDate)
    }

    if (typeof category === 'string' && category !== 'ALL') {
      query += ' AND category = ?'
      params.push(category.trim().toUpperCase())
    }

    query += ' ORDER BY date DESC, createdAt DESC'

    const rows = db.prepare(query).all(...params) as ExpenseRow[]

    const formatted = rows.map(r => ({
      id: r.id,
      companyId: r.companyId,
      companyShortCode: r.companyShortCode,
      stationId: r.stationId,
      stationName: r.stationName,
      category: r.category,
      amount: r.amount,
      paymentSource: r.paymentSource,
      payee: r.payee,
      referenceNumber: r.referenceNumber,
      notes: r.notes,
      date: r.date,
      recordedBy: (() => {
        try {
          return JSON.parse(r.recordedBy)
        } catch {
          return { id: 'UNKNOWN', name: r.recordedBy, employeeCode: '' }
        }
      })(),
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))

    const totalAmount = rows.reduce((acc, r) => acc + r.amount, 0)

    res.json({
      count: formatted.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      expenses: formatted,
    })
  } catch (err: any) {
    res.status(500).json({ error: 'DB_ERROR', message: err.message })
  }
})

// POST /api/expenses
expensesRouter.post('/', (req, res) => {
  try {
    const {
      companyId,
      companyShortCode,
      stationId,
      stationName,
      category,
      amount,
      paymentSource,
      payee,
      referenceNumber,
      notes,
      date,
      recordedBy,
    } = req.body

    const amountNum = Number(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' })
    }

    if (!companyId || !stationId || !category) {
      return res.status(400).json({ error: 'MISSING_FIELDS', message: 'companyId, stationId, and category are required' })
    }

    const id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()
    const dateStr = date || now.slice(0, 10)

    const recordedByStr = typeof recordedBy === 'object' ? JSON.stringify(recordedBy) : String(recordedBy || 'Manager')

    db.prepare(`
      INSERT INTO station_expenses (
        id, companyId, companyShortCode, stationId, stationName,
        category, amount, paymentSource, payee, referenceNumber,
        notes, date, recordedBy, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      companyId,
      companyShortCode || null,
      stationId,
      stationName || 'Station',
      category.trim().toUpperCase(),
      Math.round(amountNum * 100) / 100,
      paymentSource || 'CASH',
      payee ? String(payee).trim() : null,
      referenceNumber ? String(referenceNumber).trim() : null,
      notes ? String(notes).trim() : null,
      dateStr,
      recordedByStr,
      'APPROVED',
      now,
      now,
    )

    res.status(201).json({
      success: true,
      id,
      message: 'Expense recorded successfully',
    })
  } catch (err: any) {
    res.status(500).json({ error: 'DB_ERROR', message: err.message })
  }
})

// DELETE /api/expenses/:id
expensesRouter.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const result = db.prepare('DELETE FROM station_expenses WHERE id = ?').run(id)
    if (result.changes === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Expense not found' })
    }
    res.json({ success: true, message: 'Expense deleted' })
  } catch (err: any) {
    res.status(500).json({ error: 'DB_ERROR', message: err.message })
  }
})
