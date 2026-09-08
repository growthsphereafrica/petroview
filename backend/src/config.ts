export const ENV = {
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  DB_PATH: process.env.DB_PATH ?? './data/masterview.sqlite',
  TOKEN_TTL_MS: 12 * 60 * 60 * 1000,
  MAX_PIN_ATTEMPTS: 5,
  LOCKOUT_MS: 5 * 60 * 1000,
}

export const FUEL_PRICES = { PMS: 14.8, AGO: 15.2, DPK: 13.9, KERO: 13.5 }

export const STATIONS = [
  { id: 'STN-GV-042', name: 'Green Valley Main', code: 'GV-042', location: 'Accra - Tema Motorway', region: 'Greater Accra', pumps: 4, currency: 'GHS' },
  { id: 'STN-AB-015', name: 'Airport Bypass Express', code: 'AB-015', location: 'Airport Residential, Accra', region: 'Greater Accra', pumps: 2, currency: 'GHS' },
  { id: 'STN-TH-021', name: 'Takoradi Harbour Hub', code: 'TH-021', location: 'Harbour Road, Takoradi', region: 'Western Region', pumps: 2, currency: 'GHS' },
] as const