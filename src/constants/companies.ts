import type { StationConfig, PumpConfig } from './fuelTypes'

export interface CompanyConfig {
  id: string
  name: string
  shortCode: string
  tagline: string
  logoText: string
  primaryColor: string
  primaryDark: string
  accentColor: string
  currency: string
  fuelPrices: {
    PMS: number
    AGO: number
    DPK: number
    KERO: number
  }
  stations: StationConfig[]
}

export const COMPANIES_DIRECTORY: CompanyConfig[] = [
  {
    id: 'COMP-MVP',
    name: 'PetroView Petroleum',
    shortCode: 'PV',
    tagline: 'Local-First. Sync When Possible. Never Lose Data.',
    logoText: 'PETROVIEW',
    primaryColor: '#F97316',
    primaryDark: '#C2410C',
    accentColor: '#F59E0B',
    currency: 'GHS',
    fuelPrices: { PMS: 14.80, AGO: 15.20, DPK: 13.90, KERO: 13.50 },
    stations: [
      {
        id: 'STN-001',
        name: 'Green Valley Station',
        code: 'GV-042',
        location: 'Accra - Tema Motorway Corridor',
        supervisorName: 'Kwame Mensah',
        supervisorId: 'SUP001',
        pumps: [
          {
            id: 'pump-1',
            name: 'Pump 1',
            nozzles: [
              { id: 'p1-n1', nozzleNumber: 1, fuelCode: 'PMS', fuelName: 'PMS (Petrol)', color: '#16a34a', unitPrice: 14.80, currentMeter: 125340.50 },
              { id: 'p1-n2', nozzleNumber: 2, fuelCode: 'AGO', fuelName: 'AGO (Diesel)', color: '#2563eb', unitPrice: 15.20, currentMeter: 87340.20 },
              { id: 'p1-n3', nozzleNumber: 3, fuelCode: 'DPK', fuelName: 'DPK', color: '#ea580c', unitPrice: 13.90, currentMeter: 45320.10 },
              { id: 'p1-n4', nozzleNumber: 4, fuelCode: 'KERO', fuelName: 'KERO', color: '#9333ea', unitPrice: 13.50, currentMeter: 23010.00 },
            ]
          },
          {
            id: 'pump-2',
            name: 'Pump 2',
            nozzles: [
              { id: 'p2-n1', nozzleNumber: 1, fuelCode: 'PMS', fuelName: 'PMS (Petrol)', color: '#16a34a', unitPrice: 14.80, currentMeter: 98210.00 },
              { id: 'p2-n2', nozzleNumber: 2, fuelCode: 'AGO', fuelName: 'AGO (Diesel)', color: '#2563eb', unitPrice: 15.20, currentMeter: 64100.50 },
            ]
          }
        ]
      },
      {
        id: 'STN-002',
        name: 'Airport Bypass Express',
        code: 'AB-015',
        location: 'Airport Residential, Accra',
        supervisorName: 'Ebenezer Osei',
        supervisorId: 'SUP002',
        pumps: [
          {
            id: 'pump-1',
            name: 'Pump 1',
            nozzles: [
              { id: 'ab-p1-n1', nozzleNumber: 1, fuelCode: 'PMS', fuelName: 'PMS (Petrol)', color: '#16a34a', unitPrice: 14.80, currentMeter: 210500.00 },
              { id: 'ab-p1-n2', nozzleNumber: 2, fuelCode: 'AGO', fuelName: 'AGO (Diesel)', color: '#2563eb', unitPrice: 15.20, currentMeter: 184200.00 },
            ]
          }
        ]
      },
      {
        id: 'STN-003',
        name: 'Kumasi Central Highway',
        code: 'KC-088',
        location: 'Ahodwo, Kumasi',
        supervisorName: 'Kofi Boateng',
        supervisorId: 'SUP003',
        pumps: [
          {
            id: 'pump-1',
            name: 'Pump 1',
            nozzles: [
              { id: 'kc-p1-n1', nozzleNumber: 1, fuelCode: 'PMS', fuelName: 'PMS (Petrol)', color: '#16a34a', unitPrice: 14.80, currentMeter: 145000.00 },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'COMP-GOIL',
    name: 'GOIL Ghana PLC',
    shortCode: 'GOIL',
    tagline: 'Good Energy. Ghana’s Pride.',
    logoText: 'GOIL GHANA',
    primaryColor: '#FF8200',
    primaryDark: '#D46A00',
    accentColor: '#009639',
    currency: 'GHS',
    fuelPrices: { PMS: 14.90, AGO: 15.35, DPK: 14.00, KERO: 13.60 },
    stations: [
      {
        id: 'GOIL-001',
        name: 'Accra Ridge Flagship',
        code: 'GOIL-RDG',
        location: 'Ridge Roundabout, Accra',
        supervisorName: 'Daniel Larbi',
        supervisorId: 'SUP-G01',
        pumps: [
          {
            id: 'pump-1',
            name: 'Pump 1',
            nozzles: [
              { id: 'g1-n1', nozzleNumber: 1, fuelCode: 'PMS', fuelName: 'Super XP PMS', color: '#16a34a', unitPrice: 14.90, currentMeter: 340100.00 },
              { id: 'g1-n2', nozzleNumber: 2, fuelCode: 'AGO', fuelName: 'Diesel XP', color: '#2563eb', unitPrice: 15.35, currentMeter: 290400.00 },
            ]
          }
        ]
      },
      {
        id: 'GOIL-002',
        name: 'Tema Port Industrial Hub',
        code: 'GOIL-TP',
        location: 'Harbour Road, Tema',
        supervisorName: 'Grace Ansah',
        supervisorId: 'SUP-G02',
        pumps: [
          {
            id: 'pump-1',
            name: 'Pump 1',
            nozzles: [
              { id: 'gt-n1', nozzleNumber: 1, fuelCode: 'AGO', fuelName: 'Diesel XP', color: '#2563eb', unitPrice: 15.35, currentMeter: 480200.00 },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'COMP-STAR',
    name: 'Star Oil Company',
    shortCode: 'STAR',
    tagline: 'Fueled for the Journey.',
    logoText: 'STAR OIL',
    primaryColor: '#0B2545',
    primaryDark: '#07162C',
    accentColor: '#EE9B00',
    currency: 'GHS',
    fuelPrices: { PMS: 14.65, AGO: 15.10, DPK: 13.80, KERO: 13.40 },
    stations: [
      {
        id: 'STAR-001',
        name: 'Spintex Coastal Station',
        code: 'STAR-SPX',
        location: 'Spintex Road, Batsonaa',
        supervisorName: 'Samuel Quaye',
        supervisorId: 'SUP-S01',
        pumps: [
          {
            id: 'pump-1',
            name: 'Pump 1',
            nozzles: [
              { id: 'st-n1', nozzleNumber: 1, fuelCode: 'PMS', fuelName: 'PMS Petrol', color: '#16a34a', unitPrice: 14.65, currentMeter: 189000.00 },
              { id: 'st-n2', nozzleNumber: 2, fuelCode: 'AGO', fuelName: 'AGO Diesel', color: '#2563eb', unitPrice: 15.10, currentMeter: 152000.00 },
            ]
          }
        ]
      },
      {
        id: 'STAR-002',
        name: 'Takoradi Harbour Branch',
        code: 'STAR-TKD',
        location: 'Commercial Street, Takoradi',
        supervisorName: 'Francis Arthur',
        supervisorId: 'SUP-S02',
        pumps: [
          {
            id: 'pump-1',
            name: 'Pump 1',
            nozzles: [
              { id: 'stk-n1', nozzleNumber: 1, fuelCode: 'PMS', fuelName: 'PMS Petrol', color: '#16a34a', unitPrice: 14.65, currentMeter: 120400.00 },
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'COMP-TOTAL',
    name: 'TotalEnergies Ghana',
    shortCode: 'TOTAL',
    tagline: 'Committed to Better Energy.',
    logoText: 'TOTALENERGIES',
    primaryColor: '#E20613',
    primaryDark: '#B8000B',
    accentColor: '#002B49',
    currency: 'GHS',
    fuelPrices: { PMS: 15.00, AGO: 15.45, DPK: 14.10, KERO: 13.70 },
    stations: [
      {
        id: 'TOTAL-001',
        name: 'Ring Road Central Express',
        code: 'TOT-RRC',
        location: 'Ring Road Central, Accra',
        supervisorName: 'Patrick Addo',
        supervisorId: 'SUP-T01',
        pumps: [
          {
            id: 'pump-1',
            name: 'Pump 1',
            nozzles: [
              { id: 'tot-n1', nozzleNumber: 1, fuelCode: 'PMS', fuelName: 'Excellium Super', color: '#16a34a', unitPrice: 15.00, currentMeter: 410000.00 },
              { id: 'tot-n2', nozzleNumber: 2, fuelCode: 'AGO', fuelName: 'Excellium Diesel', color: '#2563eb', unitPrice: 15.45, currentMeter: 380000.00 },
            ]
          }
        ]
      }
    ]
  }
]
