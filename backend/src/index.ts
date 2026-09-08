import express from 'express'
import cors from 'cors'
import { bootDb, countAttendants } from './db'
import { ENV } from './config'
import { authenticate } from './middleware'

bootDb()

const app = express()
app.use(cors())
app.use(express.json({ limit: '15mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'master-view-backend',
    time: new Date().toISOString(),
    attendants: countAttendants(),
    db: ENV.DB_PATH,
  })
})

// Load routers only after the database schema has been bootstrapped.
app.use('/api/auth', require('./routes/auth').authRouter)
app.use('/api/sync', require('./routes/sync').syncRouter)
app.use('/api/shifts', require('./routes/shifts').shiftsRouter)
app.use('/api/attendants', require('./routes/attendants').attendantsRouter)
app.use('/api/audit', require('./routes/audit').auditRouter)
app.use('/api/headoffice', require('./routes/headoffice').headOfficeRouter)

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
  console.log(`  Health:   http://localhost:${ENV.PORT}/api/health`)
  console.log(`  Login:    POST http://localhost:${ENV.PORT}/api/auth/login`)
  console.log(`  Rollup:   GET  http://localhost:${ENV.PORT}/api/headoffice/summary`)
})

process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))