/**
 * Local Wi-Fi Peer Synchronization Service
 * Simulates local station network peer-to-peer sync using BroadcastChannel & CustomEvents
 * Allows Attendants to sync data directly to the Station Supervisor Hub without the internet!
 */

export interface PeerMessage {
  type: 'SHIFT_SYNC_PUSH' | 'SHIFT_SYNC_ACK' | 'SHIFT_STATUS_CHANGED' | 'PING' | 'PONG'
  senderId: string
  senderRole: 'attendant' | 'supervisor'
  payload: any
  timestamp: string
}

class LocalSyncChannel {
  private channel: BroadcastChannel | null = null
  private listeners: ((msg: PeerMessage) => void)[] = []

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('mvp_forecourt_mesh_bus')
      this.channel.onmessage = (event) => {
        this.notifyListeners(event.data)
      }
    }
  }

  public send(msg: PeerMessage) {
    if (this.channel) {
      this.channel.postMessage(msg)
    }
    // Also dispatch to local window for split-screen simulated dual device
    window.dispatchEvent(new CustomEvent('mvp_peer_message', { detail: msg }))
  }

  public subscribe(callback: (msg: PeerMessage) => void): () => void {
    this.listeners.push(callback)
    const windowHandler = (e: Event) => {
      const customEvent = e as CustomEvent<PeerMessage>
      callback(customEvent.detail)
    }
    window.addEventListener('mvp_peer_message', windowHandler)

    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback)
      window.removeEventListener('mvp_peer_message', windowHandler)
    }
  }

  private notifyListeners(msg: PeerMessage) {
    this.listeners.forEach(cb => {
      try {
        cb(msg)
      } catch (err) {
        console.error('Error in local sync listener:', err)
      }
    })
  }
}

export const localSyncBus = new LocalSyncChannel()
