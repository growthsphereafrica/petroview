import express from 'express'
import cors from 'cors'
import { bootDb, countAttendants, db } from './db'
import { ENV } from './config'
import { authRouter } from './routes/auth'
import { syncRouter } from './routes/sync'
import { shiftsRouter } from './routes/shifts'
import { attendantsRouter } from './routes/attendants'
import { auditRouter } from './routes/audit'
import { headOfficeRouter } from './routes/headoffice'
import { companiesRouter } from './routes/companies'
import { tankReadingsRouter } from './routes/tankReadings'

bootDb()

const app = express()
app.use(cors())
app.use(express.json({ limit: '15mb' }))

app.get('/api/health', (_req, res) => {
  const attendants = countAttendants()
  const supervisors = (db.prepare('SELECT COUNT(*) AS c FROM supervisors').get() as { c: number }).c
  const companies = (db.prepare('SELECT COUNT(*) AS c FROM companies').get() as { c: number }).c
  const shifts = (db.prepare('SELECT COUNT(*) AS c FROM shifts').get() as { c: number }).c
  res.json({
    status: 'ok',
    service: 'master-view-backend',
    time: new Date().toISOString(),
    attendants,
    supervisors,
    companies,
    shifts,
    db: ENV.DB_PATH,
  })
})

app.use('/api/auth', authRouter)
app.use('/api/sync', syncRouter)
app.use('/api/shifts', shiftsRouter)
app.use('/api/attendants', attendantsRouter)
app.use('/api/audit', auditRouter)
app.use('/api/headoffice', headOfficeRouter)
app.use('/api/companies', companiesRouter)
app.use('/api/tank-readings', tankReadingsRouter)

app.use((req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api]', err)
  res.status(err.status ?? 500).json({ error: 'INTERNAL', message: err.message ?? 'Internal server error.' })
})

const server = app.listen(ENV.PORT, () => {
  console.log(`Master View backend listening on http://0.0.0.0:${ENV.PORT}`)
  console.log(`  Health:       http://localhost:${ENV.PORT}/api/health`)
  console.log(`  Login:        POST http://localhost:${ENV.PORT}/api/auth/login`)
  console.log(`  Register:     POST http://localhost:${ENV.PORT}/api/auth/register`)
  console.log(`  Approvals:    GET  http://localhost:${ENV.PORT}/api/auth/pending-approvals`)
  console.log(`  Companies:    GET  http://localhost:${ENV.PORT}/api/companies`)
  console.log(`  Tank Readings:GET  http://localhost:${ENV.PORT}/api/tank-readings`)
})

process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
