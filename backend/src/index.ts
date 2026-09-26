import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { countAttendants, db } from './db'
import { ENV } from './config'
import { authRouter } from './routes/auth'
import { syncRouter } from './routes/sync'
import { shiftsRouter } from './routes/shifts'
import { attendantsRouter } from './routes/attendants'
import { auditRouter } from './routes/audit'
import { headOfficeRouter } from './routes/headoffice'
import { companiesRouter } from './routes/companies'
import { tankReadingsRouter } from './routes/tankReadings'
import { expensesRouter } from './routes/expenses'
import { productsRouter } from './routes/products'
import { supervisorsRouter } from './routes/supervisors'
import { pumpsRouter } from './routes/pumps'

const app = express()
app.disable('x-powered-by')

// Required for req.ip to be the client address rather than the reverse proxy,
// which every per-IP rate limit below depends on.
app.set('trust proxy', 1)

app.use(helmet())

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ENV.CORS_ORIGINS.includes(origin)) {
      callback(null, true)
      return
    }
    callback(new Error('CORS origin is not allowed.'))
  },
}))

const rateLimitHandler = (_req: express.Request, res: express.Response) => {
  res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests. Please wait and try again.' })
}

// A blanket ceiling so a single client cannot exhaust memory or disk through
// any endpoint, including the 15mb receipt body limit below.
const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler,
})
app.use(globalLimiter)

// PINs are 4 digits, so the 10,000-entry space is searched directly. Without
// this the login route is a free brute-force oracle against every employee code.
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler,
})

app.use(express.json({ limit: '15mb' }))

app.get('/api/health', (_req, res) => {
  const attendants = countAttendants()
  const supervisors = (db.prepare('SELECT COUNT(*) AS c FROM supervisors').get() as { c: number }).c
  const companies = (db.prepare('SELECT COUNT(*) AS c FROM companies').get() as { c: number }).c
  const shifts = (db.prepare('SELECT COUNT(*) AS c FROM shifts').get() as { c: number }).c
  const expenses = (db.prepare('SELECT COUNT(*) AS c FROM station_expenses').get() as { c: number }).c
  res.json({
    status: 'ok',
    service: 'master-view-backend',
    time: new Date().toISOString(),
    attendants,
    supervisors,
    companies,
    shifts,
    expenses,
  })
})

app.use('/api/auth/login', authLimiter)
app.use('/api/auth/register', authLimiter)
app.use('/api/auth', authRouter)
app.use('/api/sync', syncRouter)
app.use('/api/shifts', shiftsRouter)
app.use('/api/attendants', attendantsRouter)
app.use('/api/supervisors', supervisorsRouter)
app.use('/api/audit', auditRouter)
app.use('/api/headoffice', headOfficeRouter)
app.use('/api/companies', companiesRouter)
app.use('/api/tank-readings', tankReadingsRouter)
app.use('/api/expenses', expensesRouter)
app.use('/api/products', productsRouter)
app.use('/api/pumps', pumpsRouter)

app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500
  if (status >= 500) {
    // Log the detail, return none of it. Raw driver messages ("NOT NULL
    // constraint failed: station_expenses.category") used to reach the client
    // and disclose schema to anyone who could trigger a failure.
    console.error('[api]', err)
    res.status(status).json({ error: 'INTERNAL', message: 'Internal server error.' })
    return
  }
  res.status(status).json({ error: err.error ?? 'BAD_REQUEST', message: typeof err.message === 'string' ? err.message : 'Request failed.' })
})

const server = app.listen(ENV.PORT, () => {
  console.log(`Master View backend listening on http://0.0.0.0:${ENV.PORT}`)
  console.log(`  Health:       http://localhost:${ENV.PORT}/api/health`)
  console.log(`  Login:        POST http://localhost:${ENV.PORT}/api/auth/login`)
})

// Node's default for unhandled rejections is to throw, which takes the process
// down. A single stray rejection in a forecourt sync must not end the shift.
process.on('unhandledRejection', reason => {
  console.error('[fatal] unhandled rejection:', reason)
})
process.on('uncaughtException', err => {
  console.error('[fatal] uncaught exception:', err)
  process.exit(1)
})

let shuttingDown = false
function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[shutdown] ${signal} received, closing server`)
  server.close(() => {
    try {
      db.close()
    } catch (err) {
      console.error('[shutdown] failed to close database cleanly', err)
    }
    process.exit(0)
  })
  // Do not let a hung keep-alive connection block the exit indefinitely.
  setTimeout(() => process.exit(0), 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
