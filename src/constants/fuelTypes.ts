export interface NozzleConfig {
  id: string
  nozzleNumber: number
  fuelCode: 'PMS' | 'AGO' | 'DPK' | 'KERO'
  fuelName: string
  color: string
  unitPrice: number // GHS per Litre
  currentMeter: number
}

export interface PumpConfig {
  id: string
  name: string
  nozzles: NozzleConfig[]
}

export interface StationConfig {
  id: string
  name: string
  code: string
  location: string
  supervisorName: string
  supervisorId: string
  pumps: PumpConfig[]
}

export const FUEL_PRICES: Record<string, { name: string; price: number; color: string; bg: string }> = {
  PMS: { name: 'Super Petrol (PMS)', price: 14.80, color: '#16a34a', bg: 'bg-emerald-500' },
  AGO: { name: 'Diesel (AGO)', price: 15.20, color: '#2563eb', bg: 'bg-blue-600' },
  DPK: { name: 'Dual Purpose Kerosene (DPK)', price: 13.90, color: '#ea580c', bg: 'bg-orange-500' },
  KERO: { name: 'Kerosene (KERO)', price: 13.50, color: '#9333ea', bg: 'bg-purple-600' },
}

export const DEFAULT_STATION: StationConfig = {
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
    },
    {
      id: 'pump-3',
      name: 'Pump 3',
      nozzles: [
        { id: 'p3-n1', nozzleNumber: 1, fuelCode: 'PMS', fuelName: 'PMS (Petrol)', color: '#16a34a', unitPrice: 14.80, currentMeter: 145000.00 },
        { id: 'p3-n2', nozzleNumber: 2, fuelCode: 'AGO', fuelName: 'AGO (Diesel)', color: '#2563eb', unitPrice: 15.20, currentMeter: 112300.00 },
      ]
    },
    {
      id: 'pump-4',
      name: 'Pump 4',
      nozzles: [
        { id: 'p4-n1', nozzleNumber: 1, fuelCode: 'PMS', fuelName: 'PMS (Petrol)', color: '#16a34a', unitPrice: 14.80, currentMeter: 76500.00 },
        { id: 'p4-n2', nozzleNumber: 2, fuelCode: 'AGO', fuelName: 'AGO (Diesel)', color: '#2563eb', unitPrice: 15.20, currentMeter: 54300.00 },
      ]
    }
  ]
}

export const ATTENDANTS_LIST = [
  { id: 'ATT1234', name: 'John Attendant', pin: '1234', status: 'Active', pumpAssigned: 'Pump 1', avatar: 'JA' },
  { id: 'ATT1235', name: 'Mary Attendant', pin: '1234', status: 'Active', pumpAssigned: 'Pump 2', avatar: 'MA' },
  { id: 'ATT1236', name: 'Peter Attendant', pin: '1234', status: 'Active', pumpAssigned: 'Pump 3', avatar: 'PA' },
  { id: 'ATT1237', name: 'James Attendant', pin: '1234', status: 'Active', pumpAssigned: 'Pump 4', avatar: 'JA' },
]
