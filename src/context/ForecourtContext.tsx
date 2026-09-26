import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { db, type ShiftRecord, type TransactionRecord, type ReceiptRecord, type SyncQueueItem } from '../db/database'
import { DEFAULT_STATION, ATTENDANTS_LIST, FUEL_PRICES, type StationConfig } from '../constants/fuelTypes'
import { COMPANIES_DIRECTORY, type CompanyConfig } from '../constants/companies'
import { localSyncBus, type PeerMessage } from '../services/localSyncService'
import { useNetworkSimulator } from './NetworkSimulatorContext'
import { uploadShiftToCloud } from '../services/cloudApiService'
import { createShiftQRPackage, decodeShiftQRPackage } from '../services/qrService'
import confetti from 'canvas-confetti'

interface AttendantUser {
  id: string
  name: string
  companyId: string
  stationId: string
  stationName: string
  isOfflineMode: boolean
}

interface SupervisorUser {
  id: string
  name: string
  companyId: string
  stationId: string
  stationName: string
}

interface ForecourtContextType {
  activeCompany: CompanyConfig
  switchCompany: (companyId: string) => void
  activeStation: StationConfig
  switchStation: (stationId: string) => void
  station: StationConfig
  attendants: typeof ATTENDANTS_LIST
  shifts: ShiftRecord[]
  allCompanyShifts: ShiftRecord[]
  activeShift: ShiftRecord | null
  currentAttendant: AttendantUser | null
  currentSupervisor: SupervisorUser | null
  isSyncing: boolean
  syncStats: {
    totalLocal: number
    pendingCount: number
    syncedCount: number
    lastSyncTime: string
  }
  notification: { message: string; type: 'success' | 'error' | 'info' | 'warning' } | null
  setNotification: (notif: { message: string; type: 'success' | 'error' | 'info' | 'warning' } | null) => void

  // Attendant Actions
  loginAttendant: (id: string, pin: string, offlineOnly?: boolean) => boolean
  logoutAttendant: () => void
  startNewShift: (params: { pumpId: string; nozzleAssignment: string; openingMeters: Record<string, number> }) => Promise<ShiftRecord>
  saveOpeningReadings: (shiftId: string, readings: Record<string, number>) => Promise<void>
  addTransaction: (tx: Omit<TransactionRecord, 'id' | 'syncStatus' | 'timestamp'>) => Promise<void>
  saveReceipt: (shiftId: string, imageUrl: string, notes?: string) => Promise<void>
  saveClosingReadings: (shiftId: string, closingMeters: Record<string, number>) => Promise<void>
  endCurrentShift: (shiftId: string, notes?: string) => Promise<ShiftRecord>

  // Supervisor Actions
  loginSupervisor: (id: string, pin: string) => boolean
  logoutSupervisor: () => void
  reviewShift: (shiftId: string, status: 'approved' | 'rejected', notes?: string) => Promise<void>
  importShiftViaQR: (qrEnvelopeString: string) => Promise<{ success: boolean; message: string; shift?: ShiftRecord }>
  addNewAttendant: (attendant: { name: string; id: string; pin: string; pumpAssigned: string }) => void

  // Sync Operations
  syncAllPending: (forcedChannel?: 'wifi' | 'cloud') => Promise<number>
  syncSingleShift: (shiftId: string, channel: 'wifi' | 'cloud' | 'qr') => Promise<boolean>
  clearAndResetData: () => Promise<void>
}

const ForecourtContext = createContext<ForecourtContextType | undefined>(undefined)

export const ForecourtProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { networkMode, isOnline, isLocalWifi, isOffline, addPacketLog } = useNetworkSimulator()

  const [activeCompany, setActiveCompany] = useState<CompanyConfig>(COMPANIES_DIRECTORY[0])
  const [activeStation, setActiveStation] = useState<StationConfig>(COMPANIES_DIRECTORY[0].stations[0])
  const [attendants] = useState<typeof ATTENDANTS_LIST>([])
  const [allCompanyShifts, setAllCompanyShifts] = useState<ShiftRecord[]>([])
  const [shifts, setShifts] = useState<ShiftRecord[]>([])
  const [activeShift, setActiveShift] = useState<ShiftRecord | null>(null)

  const [currentAttendant, setCurrentAttendant] = useState<AttendantUser | null>(null)
  const [currentSupervisor, setCurrentSupervisor] = useState<SupervisorUser | null>(null)

  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [lastSyncTime, setLastSyncTime] = useState<string>('')
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setNotification({ message, type })
    setTimeout(() => {
      setNotification(prev => prev?.message === message ? null : prev)
    }, 4500)
  }, [])

  // Switch Company
  const switchCompany = useCallback((companyId: string) => {
    const found = COMPANIES_DIRECTORY.find(c => c.id === companyId)
    if (found) {
      setActiveCompany(found)
      const firstStn = found.stations[0] || DEFAULT_STATION
      setActiveStation(firstStn)
      showToast(`Switched active tenant to ${found.name}`, 'info')
    }
  }, [showToast])

  // Switch Station
  const switchStation = useCallback((stationId: string) => {
    const found = activeCompany.stations.find(s => s.id === stationId)
    if (found) {
      setActiveStation(found)
      showToast(`Switched active station to ${found.name}`, 'info')
    }
  }, [activeCompany, showToast])

  // Refresh Shifts from DB
  const refreshShiftsFromDB = useCallback(async () => {
    try {
      let allShifts = await db.shifts.toArray()
      if (allShifts.length === 0) {
        allShifts = []
      }
      allShifts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setAllCompanyShifts(allShifts)

      // Filter shifts for active company & station
      let tenantShifts = allShifts.filter(s => (s.companyId || '') === activeCompany.id)
      setShifts(tenantShifts)

      // Set active shift
      if (currentAttendant) {
        const found = tenantShifts.find(s => s.attendantId === currentAttendant.id && s.status === 'active')
        if (found) {
          setActiveShift(found)
        } else {
          const latest = tenantShifts.find(s => s.attendantId === currentAttendant.id)
          setActiveShift(latest || tenantShifts[0] || null)
        }
      } else if (tenantShifts.length > 0) {
        setActiveShift(tenantShifts[0])
      }
    } catch (err) {
      console.error('Failed to load shifts from DB:', err)
    }
  }, [activeCompany.id, currentAttendant])

  useEffect(() => {
    const init = async () => {
      await refreshShiftsFromDB()
    }
    init()
  }, [refreshShiftsFromDB])

  // Peer Synchronization Bus Listener
  useEffect(() => {
    const unsubscribe = localSyncBus.subscribe(async (msg: PeerMessage) => {
      if (networkMode === 'offline') return

      if (msg.type === 'SHIFT_SYNC_PUSH') {
        const incomingShift: ShiftRecord = msg.payload
        addPacketLog({
          source: 'Attendant Phone',
          destination: 'Supervisor Hub',
          protocol: 'Local Wi-Fi Peer',
          summary: `Peer sync received: ${incomingShift.shiftNumber} (${incomingShift.attendantName})`,
          status: 'success'
        })
        await db.shifts.put({
          ...incomingShift,
          syncStatus: isOnline ? 'synced' : 'pending',
          syncChannel: 'wifi'
        })
        await refreshShiftsFromDB()
        showToast(`Local Wi-Fi: Received Shift ${incomingShift.shiftNumber} from ${incomingShift.attendantName}`, 'success')
      } else if (msg.type === 'SHIFT_STATUS_CHANGED') {
        const { shiftId, status, supervisorNotes } = msg.payload
        const target = await db.shifts.get(shiftId)
        if (target) {
          await db.shifts.update(shiftId, { status, supervisorNotes })
          await refreshShiftsFromDB()
          addPacketLog({
            source: 'Supervisor Hub',
            destination: 'Attendant Phone',
            protocol: 'Local Wi-Fi Peer',
            summary: `Shift ${target.shiftNumber} status updated to: ${status.toUpperCase()}`,
            status: 'success'
          })
          showToast(`Shift ${target.shiftNumber} was ${status} by supervisor`, 'info')
        }
      }
    })
    return () => unsubscribe()
  }, [networkMode, isOnline, refreshShiftsFromDB, showToast, addPacketLog])

  const loginAttendant = (): boolean => {
    showToast('Use the unified gateway to sign in.', 'error')
    return false
  }

  const logoutAttendant = () => {
    setCurrentAttendant(null)
    setActiveShift(null)
    showToast('Logged out of attendant session', 'info')
  }

  const loginSupervisor = (): boolean => {
    showToast('Use the unified gateway to sign in.', 'error')
    return false
  }

  const logoutSupervisor = () => {
    setCurrentSupervisor(null)
    showToast('Supervisor session ended.', 'info')
  }

  // Start Shift
  const startNewShift = async (params: { pumpId: string; nozzleAssignment: string; openingMeters: Record<string, number> }): Promise<ShiftRecord> => {
    if (!currentAttendant) throw new Error('An authenticated attendant is required.')
    const shiftCount = shifts.length + 120
    const shiftNumber = `${activeCompany.shortCode}-SHIFT-${String(shiftCount + 1).padStart(5, '0')}`
    const now = new Date()

    const prices = activeCompany.fuelPrices

    const newShift: ShiftRecord = {
      id: `shift-${Date.now()}`,
      companyId: activeCompany.id,
      companyName: activeCompany.name,
      shiftNumber,
      attendantId: currentAttendant.id,
      attendantName: currentAttendant.name,
      stationId: activeStation.id,
      stationName: activeStation.name,
      pumpId: params.pumpId || 'Pump 1',
      nozzleAssignment: params.nozzleAssignment || 'Nozzle 1 (PMS)',
      startTime: now.toISOString(),
      status: 'active',
      openingMeters: {
        PMS: params.openingMeters.PMS || 125340.50,
        AGO: params.openingMeters.AGO || 87340.20,
        DPK: params.openingMeters.DPK || 45320.10,
        KERO: params.openingMeters.KERO || 23010.00,
      },
      closingMeters: {
        PMS: params.openingMeters.PMS || 125340.50,
        AGO: params.openingMeters.AGO || 87340.20,
        DPK: params.openingMeters.DPK || 45320.10,
        KERO: params.openingMeters.KERO || 23010.00,
      },
      fuelSales: {
        PMS: { litres: 0, amount: 0, price: prices.PMS },
        AGO: { litres: 0, amount: 0, price: prices.AGO },
        DPK: { litres: 0, amount: 0, price: prices.DPK },
        KERO: { litres: 0, amount: 0, price: prices.KERO },
      },
      expectedTotal: 0,
      breakdown: { cash: 0, momo: 0, voucher: 0, credit: 0 },
      actualTotal: 0,
      shortage: 0,
      shortageBreakdown: { cash: 0, momo: 0, voucher: 0, credit: 0 },
      receiptCount: 0,
      receiptUrls: [],
      syncStatus: 'saved_local',
      syncChannel: 'none',
      lastSyncAttempt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }

    await db.shifts.add(newShift)
    await refreshShiftsFromDB()
    setActiveShift(newShift)

    addPacketLog({
      source: 'Attendant Phone',
      destination: 'Supervisor Hub',
      protocol: 'Internal Storage',
      summary: `Shift ${newShift.shiftNumber} started & saved to IndexedDB`,
      status: 'success'
    })

    showToast(`Shift ${shiftNumber} started and saved locally!`, 'success')
    return newShift
  }

  const saveOpeningReadings = async (shiftId: string, readings: Record<string, number>) => {
    const shift = await db.shifts.get(shiftId)
    if (!shift) return
    const updated = {
      ...shift,
      openingMeters: {
        PMS: readings.PMS ?? shift.openingMeters.PMS,
        AGO: readings.AGO ?? shift.openingMeters.AGO,
        DPK: readings.DPK ?? shift.openingMeters.DPK,
        KERO: readings.KERO ?? shift.openingMeters.KERO,
      },
      updatedAt: new Date().toISOString()
    }
    await db.shifts.put(updated)
    await refreshShiftsFromDB()
    showToast('Opening meter readings saved to local database.', 'success')
  }

  const addTransaction = async (tx: Omit<TransactionRecord, 'id' | 'syncStatus' | 'timestamp'>) => {
    const newTx: TransactionRecord = {
      ...tx,
      companyId: activeCompany.id,
      id: `tx-${Date.now()}`,
      timestamp: new Date().toISOString(),
      syncStatus: 'saved_local',
    }
    await db.transactions.add(newTx)

    const targetShift = await db.shifts.get(tx.shiftId)
    if (targetShift) {
      const typeKey = tx.type.toLowerCase() as 'cash' | 'momo' | 'voucher' | 'credit'
      const updatedBreakdown = {
        ...targetShift.breakdown,
        [typeKey]: (targetShift.breakdown[typeKey] || 0) + tx.amount
      }
      const actualTotal = updatedBreakdown.cash + updatedBreakdown.momo + updatedBreakdown.voucher + updatedBreakdown.credit
      const shortage = actualTotal - targetShift.expectedTotal

      await db.shifts.update(targetShift.id, {
        breakdown: updatedBreakdown,
        actualTotal,
        shortage,
        updatedAt: new Date().toISOString()
      })
    }

    await refreshShiftsFromDB()
    showToast(`Payment of GHS ${tx.amount.toFixed(2)} (${tx.type}) recorded offline!`, 'success')
  }

  const saveReceipt = async (shiftId: string, imageUrl: string, notes?: string) => {
    const newReceipt: ReceiptRecord = {
      id: `rcpt-${Date.now()}`,
      companyId: activeCompany.id,
      shiftId,
      imageUrl,
      notes,
      capturedAt: new Date().toISOString(),
      syncStatus: 'saved_local'
    }
    await db.receipts.add(newReceipt)

    const targetShift = await db.shifts.get(shiftId)
    if (targetShift) {
      await db.shifts.update(shiftId, {
        receiptCount: (targetShift.receiptCount || 0) + 1,
        receiptUrls: [...(targetShift.receiptUrls || []), imageUrl],
        updatedAt: new Date().toISOString()
      })
    }

    await refreshShiftsFromDB()
    showToast('Receipt captured and stored in local blob store!', 'success')
  }

  const saveClosingReadings = async (shiftId: string, closingMeters: Record<string, number>) => {
    const shift = await db.shifts.get(shiftId)
    if (!shift) return

    const prices = activeCompany.fuelPrices
    const om = shift.openingMeters
    const pmsLtrs = Math.max(0, (closingMeters.PMS ?? om.PMS) - om.PMS)
    const agoLtrs = Math.max(0, (closingMeters.AGO ?? om.AGO) - om.AGO)
    const dpkLtrs = Math.max(0, (closingMeters.DPK ?? om.DPK) - om.DPK)
    const keroLtrs = Math.max(0, (closingMeters.KERO ?? om.KERO) - om.KERO)

    const pmsAmt = pmsLtrs * prices.PMS
    const agoAmt = agoLtrs * prices.AGO
    const dpkAmt = dpkLtrs * prices.DPK
    const keroAmt = keroLtrs * prices.KERO

    const expectedTotal = pmsAmt + agoAmt + dpkAmt + keroAmt
    const actualTotal = shift.breakdown.cash + shift.breakdown.momo + shift.breakdown.voucher + shift.breakdown.credit
    const shortage = actualTotal - expectedTotal

    const updated: ShiftRecord = {
      ...shift,
      closingMeters: {
        PMS: closingMeters.PMS ?? om.PMS,
        AGO: closingMeters.AGO ?? om.AGO,
        DPK: closingMeters.DPK ?? om.DPK,
        KERO: closingMeters.KERO ?? om.KERO,
      },
      fuelSales: {
        PMS: { litres: pmsLtrs, amount: pmsAmt, price: prices.PMS },
        AGO: { litres: agoLtrs, amount: agoAmt, price: prices.AGO },
        DPK: { litres: dpkLtrs, amount: dpkAmt, price: prices.DPK },
        KERO: { litres: keroLtrs, amount: keroAmt, price: prices.KERO },
      },
      expectedTotal,
      actualTotal,
      shortage,
      updatedAt: new Date().toISOString()
    }

    await db.shifts.put(updated)
    await refreshShiftsFromDB()
    showToast('Closing readings saved and shift calculations updated!', 'success')
  }

  const endCurrentShift = async (shiftId: string, notes?: string): Promise<ShiftRecord> => {
    const shift = await db.shifts.get(shiftId)
    if (!shift) throw new Error('Shift not found')

    const { packageString } = createShiftQRPackage(shift)

    const endedShift: ShiftRecord = {
      ...shift,
      endTime: new Date().toISOString(),
      status: 'completed',
      notes: notes || shift.notes,
      syncStatus: 'pending',
      qrPackagePayload: packageString,
      updatedAt: new Date().toISOString()
    }

    await db.shifts.put(endedShift)
    await refreshShiftsFromDB()
    setActiveShift(endedShift)

    if (isOnline || isLocalWifi) {
      localSyncBus.send({
        type: 'SHIFT_SYNC_PUSH',
        senderId: currentAttendant?.id || '',
        senderRole: 'attendant',
        payload: endedShift,
        timestamp: new Date().toISOString()
      })
    }

    addPacketLog({
      source: 'Attendant Phone',
      destination: isOnline ? 'Cloud Gateway' : (isLocalWifi ? 'Supervisor Hub' : 'Attendant Phone'),
      protocol: isOnline ? 'Cloud REST / HTTPS' : (isLocalWifi ? 'Local Wi-Fi Peer' : 'Internal Storage'),
      summary: `Shift ${endedShift.shiftNumber} locked & queued for synchronization`,
      status: isOffline ? 'queued' : 'success'
    })

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      })
    } catch {}

    showToast(`Shift ${endedShift.shiftNumber} successfully ended & saved locally!`, 'success')
    return endedShift
  }

  const reviewShift = async (shiftId: string, status: 'approved' | 'rejected', notes?: string) => {
    const target = await db.shifts.get(shiftId)
    if (!target) return

    await db.shifts.update(shiftId, {
      status,
      supervisorNotes: notes || `Shift ${status} by ${currentSupervisor?.name || 'Supervisor'}`,
      syncStatus: isOnline ? 'synced' : 'pending',
      updatedAt: new Date().toISOString()
    })

    await refreshShiftsFromDB()

    localSyncBus.send({
      type: 'SHIFT_STATUS_CHANGED',
      senderId: currentSupervisor?.id || '',
      senderRole: 'supervisor',
      payload: { shiftId, status, supervisorNotes: notes },
      timestamp: new Date().toISOString()
    })

    showToast(`Shift ${target.shiftNumber} was marked as ${status.toUpperCase()}!`, status === 'approved' ? 'success' : 'warning')
  }

  const importShiftViaQR = async (qrEnvelopeString: string) => {
    const result = decodeShiftQRPackage(qrEnvelopeString)
    if (!result.valid || !result.shift) {
      showToast(`QR Scan Failed: ${result.error}`, 'error')
      return { success: false, message: result.error || 'Failed to decode QR code' }
    }

    const shift = result.shift
    await db.shifts.put({
      ...shift,
      companyId: shift.companyId || activeCompany.id,
      companyName: shift.companyName || activeCompany.name,
      syncStatus: 'synced',
      syncChannel: 'qr',
      lastSyncAttempt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      updatedAt: new Date().toISOString()
    })

    await refreshShiftsFromDB()

    addPacketLog({
      source: 'QR Camera',
      destination: 'Supervisor Hub',
      protocol: 'Air-Gapped QR Optical',
      summary: `Optical Air-gap Transfer: Shift ${shift.shiftNumber} (Checksum ${result.checksum}) imported!`,
      status: 'success'
    })

    try {
      confetti({
        particleCount: 100,
        spread: 90,
        origin: { y: 0.5 }
      })
    } catch {}

    showToast(`QR Transfer Successful! Shift ${shift.shiftNumber} imported into supervisor records.`, 'success')
    return { success: true, message: 'Shift successfully imported via QR Code', shift }
  }

  const addNewAttendant = (): void => {
    showToast('Use the approved self-registration gateway to add staff.', 'info')
  }

  const syncSingleShift = async (shiftId: string, channel: 'wifi' | 'cloud' | 'qr'): Promise<boolean> => {
    const shift = await db.shifts.get(shiftId)
    if (!shift) return false

    await db.shifts.update(shiftId, { syncStatus: 'transferring' })
    await refreshShiftsFromDB()

    if (channel === 'cloud' && isOnline) {
      await uploadShiftToCloud(shift)
      await db.shifts.update(shiftId, {
        syncStatus: 'synced',
        syncChannel: 'cloud',
        lastSyncAttempt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })
      addPacketLog({
        source: 'Attendant Phone',
        destination: 'Cloud Gateway',
        protocol: 'Cloud REST / HTTPS',
        summary: `Cloud Sync: Shift ${shift.shiftNumber} pushed to Head Office Data Lake`,
        status: 'success'
      })
    } else if (channel === 'wifi' && (isLocalWifi || isOnline)) {
      localSyncBus.send({
        type: 'SHIFT_SYNC_PUSH',
        senderId: currentAttendant?.id || '',
        senderRole: 'attendant',
        payload: shift,
        timestamp: new Date().toISOString()
      })
      await db.shifts.update(shiftId, {
        syncStatus: isOnline ? 'synced' : 'pending',
        syncChannel: 'wifi',
        lastSyncAttempt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })
    }

    await refreshShiftsFromDB()
    return true
  }

  const syncAllPending = async (forcedChannel?: 'wifi' | 'cloud'): Promise<number> => {
    setIsSyncing(true)
    const pendingShifts = shifts.filter(s => s.syncStatus === 'pending' || s.syncStatus === 'saved_local' || s.syncStatus === 'failed')

    if (pendingShifts.length === 0) {
      showToast('All records are already up to date!', 'info')
      setIsSyncing(false)
      return 0
    }

    let syncedCount = 0
    for (const shift of pendingShifts) {
      if (isOnline || forcedChannel === 'cloud') {
        await uploadShiftToCloud(shift)
        await db.shifts.update(shift.id, {
          syncStatus: 'synced',
          syncChannel: 'cloud',
          lastSyncAttempt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })
        syncedCount++
      } else if (isLocalWifi || forcedChannel === 'wifi') {
        localSyncBus.send({
          type: 'SHIFT_SYNC_PUSH',
          senderId: currentAttendant?.id || '',
          senderRole: 'attendant',
          payload: shift,
          timestamp: new Date().toISOString()
        })
        await db.shifts.update(shift.id, {
          syncStatus: 'pending',
          syncChannel: 'wifi',
          lastSyncAttempt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        })
        syncedCount++
      } else {
        addPacketLog({
          source: 'Attendant Phone',
          destination: 'Supervisor Hub',
          protocol: 'Local Wi-Fi Peer',
          summary: `Sync failed: Network is offline. Use QR Code Transfer.`,
          status: 'dropped'
        })
      }
    }

    await refreshShiftsFromDB()
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setLastSyncTime(nowTime)
    setIsSyncing(false)

    if (syncedCount > 0) {
      showToast(`Successfully synchronized ${syncedCount} shift record(s)!`, 'success')
    } else if (isOffline) {
      showToast('Network is currently offline. Switch to QR Code Transfer or connect to Station Wi-Fi.', 'warning')
    }

    return syncedCount
  }

  const clearAndResetData = async () => {
    await db.shifts.clear()
    await db.transactions.clear()
    await db.receipts.clear()
    await db.syncQueue.clear()
    await refreshShiftsFromDB()
    showToast('Local demo records cleared.', 'info')
  }

  const pendingCount = shifts.filter(s => s.syncStatus === 'pending' || s.syncStatus === 'saved_local').length
  const syncedCount = shifts.filter(s => s.syncStatus === 'synced').length

  return (
    <ForecourtContext.Provider
      value={{
        activeCompany,
        switchCompany,
        activeStation,
        switchStation,
        station: activeStation,
        attendants,
        shifts,
        allCompanyShifts,
        activeShift,
        currentAttendant,
        currentSupervisor,
        isSyncing,
        syncStats: {
          totalLocal: shifts.length,
          pendingCount,
          syncedCount,
          lastSyncTime
        },
        notification,
        setNotification,
        loginAttendant,
        logoutAttendant,
        startNewShift,
        saveOpeningReadings,
        addTransaction,
        saveReceipt,
        saveClosingReadings,
        endCurrentShift,
        loginSupervisor,
        logoutSupervisor,
        reviewShift,
        importShiftViaQR,
        addNewAttendant,
        syncAllPending,
        syncSingleShift,
        clearAndResetData
      }}
    >
      {children}
    </ForecourtContext.Provider>
  )
}

export function useForecourt() {
  const context = useContext(ForecourtContext)
  if (!context) {
    throw new Error('useForecourt must be used within a ForecourtProvider')
  }
  return context
}
