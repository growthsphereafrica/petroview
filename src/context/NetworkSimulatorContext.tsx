import React, { createContext, useContext, useState, useEffect } from 'react'

export type NetworkMode = 'online' | 'local_wifi' | 'offline'

export interface NetworkPacketLog {
  id: string
  timestamp: string
  source: 'Attendant Phone' | 'Supervisor Hub' | 'Cloud Gateway' | 'QR Camera'
  destination: 'Attendant Phone' | 'Supervisor Hub' | 'Cloud Gateway'
  protocol: 'Local Wi-Fi Peer' | 'Cloud REST / HTTPS' | 'Air-Gapped QR Optical' | 'Internal Storage'
  summary: string
  status: 'success' | 'queued' | 'dropped'
}

interface NetworkSimulatorContextType {
  networkMode: NetworkMode
  setNetworkMode: (mode: NetworkMode) => void
  isOnline: boolean
  isLocalWifi: boolean
  isOffline: boolean
  packetLogs: NetworkPacketLog[]
  addPacketLog: (log: Omit<NetworkPacketLog, 'id' | 'timestamp'>) => void
  clearLogs: () => void
}

const NetworkSimulatorContext = createContext<NetworkSimulatorContextType | undefined>(undefined)

export const NetworkSimulatorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [networkMode, setNetworkMode] = useState<NetworkMode>('local_wifi')
  const [packetLogs, setPacketLogs] = useState<NetworkPacketLog[]>([
    {
      id: 'pkt-1',
      timestamp: '10:15:02 AM',
      source: 'Attendant Phone',
      destination: 'Supervisor Hub',
      protocol: 'Local Wi-Fi Peer',
      summary: 'Handshake: Attendant ATT1234 active on Pump 1',
      status: 'success'
    },
    {
      id: 'pkt-2',
      timestamp: '10:18:24 AM',
      source: 'Supervisor Hub',
      destination: 'Cloud Gateway',
      protocol: 'Cloud REST / HTTPS',
      summary: 'Shift batch sync: 2 completed shifts queued',
      status: 'queued'
    }
  ])

  const addPacketLog = (log: Omit<NetworkPacketLog, 'id' | 'timestamp'>) => {
    const newLog: NetworkPacketLog = {
      ...log,
      id: `pkt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
    setPacketLogs(prev => [newLog, ...prev.slice(0, 49)])
  }

  const clearLogs = () => setPacketLogs([])

  return (
    <NetworkSimulatorContext.Provider
      value={{
        networkMode,
        setNetworkMode,
        isOnline: networkMode === 'online',
        isLocalWifi: networkMode === 'local_wifi',
        isOffline: networkMode === 'offline',
        packetLogs,
        addPacketLog,
        clearLogs
      }}
    >
      {children}
    </NetworkSimulatorContext.Provider>
  )
}

export function useNetworkSimulator() {
  const context = useContext(NetworkSimulatorContext)
  if (!context) {
    throw new Error('useNetworkSimulator must be used within a NetworkSimulatorProvider')
  }
  return context
}
