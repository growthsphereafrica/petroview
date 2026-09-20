export const ENV = {
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  DB_PATH: process.env.DB_PATH ?? './data/masterview.sqlite',
  TOKEN_TTL_MS: 12 * 60 * 60 * 1000,
  MAX_PIN_ATTEMPTS: 5,
  LOCKOUT_MS: 5 * 60 * 1000,
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
  pin: '7256',
  isSuperAdmin: true,
  isHeadOffice: false,
  stationId: null as string | null,
  companyId: null as string | null,
}
