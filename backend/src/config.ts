const isProduction = process.env.NODE_ENV === 'production'
const configuredCorsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

export const ENV = {
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  DB_PATH: process.env.DB_PATH ?? './data/masterview.sqlite',
  TOKEN_TTL_MS: 12 * 60 * 60 * 1000,
  MAX_PIN_ATTEMPTS: 5,
  LOCKOUT_MS: 5 * 60 * 1000,
  PIN_KDF_ITERATIONS: Number.isFinite(Number(process.env.PIN_KDF_ITERATIONS))
    ? Math.max(10_000, Number(process.env.PIN_KDF_ITERATIONS))
    : 310_000,
  PRICE_TOLERANCE_GHS: Number.isFinite(Number(process.env.PRICE_TOLERANCE_GHS))
    ? Math.abs(Number(process.env.PRICE_TOLERANCE_GHS))
    : 0.01,
  IS_PRODUCTION: isProduction,
  IS_TEST: process.env.NODE_ENV === 'test',
  SEED_DEMO_DATA: process.env.SEED_DEMO_DATA === 'true' || (!isProduction && process.env.SEED_DEMO_DATA !== 'false'),
  ENABLE_DESTRUCTIVE_OPERATIONS: process.env.ENABLE_DESTRUCTIVE_OPERATIONS === 'true',
  // Account removal is deliberately a separate switch from the database wipe.
  // Removing a staff account is a routine administrative action that a tenant
  // operator needs; wiping the whole ledger is not, and should not be armed in
  // production just because account deletion is wanted. Both are super-admin
  // only and both re-check the Super Admin PIN, but they stay independently
  // controllable.
  ENABLE_ACCOUNT_REMOVAL: process.env.ENABLE_ACCOUNT_REMOVAL === 'true',
  // Supported origins across production, staging, local development, and mobile
  CORS_ORIGINS: configuredCorsOrigins.length > 0
    ? configuredCorsOrigins
    : [
        'https://petroview.growthspheregh.com',
        'https://petroviewapi.growthspheregh.com',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:4173',
        'http://localhost:8080',
        'http://localhost:8081',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:4173',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:8081',
      ],
}

export const FUEL_PRICES: Record<string, number> = {
  PMS: 14.8,
  AGO: 15.2,
  RON95: 15.9,
  'AGO-PREM': 15.8,
  DPK: 13.9,
  KERO: 13.5,
  LPG: 16.5,
  PREMIX: 11.2,
}

export const SUPER_ADMIN = {
  id: 'sup-super-admin',
  employeeCode: 'SUPER-ADMIN',
  fullName: 'PetroView Platform Master Admin',
  // No fallback. A shipped default here is a published platform-admin
  // credential, and this account can reach every tenant.
  pin: process.env.SUPER_ADMIN_PIN?.trim() ?? '',
  isSuperAdmin: true,
  isHeadOffice: false,
  stationId: null as string | null,
  companyId: null as string | null,
}
