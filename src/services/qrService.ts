import QRCode from 'qrcode'
import jsQR from 'jsqr'
import type { ShiftRecord } from '../db/database'

export interface DecodedQRPackage {
  valid: boolean
  shift?: ShiftRecord
  checksum?: string
  generatedAt?: string
  error?: string
}

/**
 * Generates simple fast checksum for payload verification
 */
function simpleChecksum(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase()
}

/**
 * Creates a compressed, structured QR code package for an offline shift
 */
export function createShiftQRPackage(shift: ShiftRecord): { packageString: string; checksum: string } {
  // Minimize payload keys for dense QR representation
  const compactPayload = {
    v: 2,
    t: 'MVP_SHIFT',
    id: shift.id,
    cid: shift.companyId || 'COMP-MVP',
    cnm: shift.companyName || 'PetroView Petroleum',
    sn: shift.shiftNumber,
    aid: shift.attendantId,
    an: shift.attendantName,
    sid: shift.stationId,
    snm: shift.stationName,
    pid: shift.pumpId,
    na: shift.nozzleAssignment,
    st: shift.startTime,
    et: shift.endTime,
    stat: shift.status,
    om: shift.openingMeters,
    cm: shift.closingMeters,
    fs: shift.fuelSales,
    exp: shift.expectedTotal,
    bk: shift.breakdown,
    act: shift.actualTotal,
    sh: shift.shortage,
    sbk: shift.shortageBreakdown,
    nt: shift.notes || '',
    rc: shift.receiptCount || 0,
    rurls: (shift.receiptUrls || []).slice(0, 2),
    ts: new Date().toISOString()
  }

  const jsonString = JSON.stringify(compactPayload)
  const checksum = simpleChecksum(jsonString)
  const fullEnvelope = JSON.stringify({
    chk: checksum,
    data: compactPayload
  })

  return {
    packageString: fullEnvelope,
    checksum
  }
}

/**
 * Generates a Data URL QR Code image from a string payload
 */
export async function generateQRCodeDataUrl(text: string): Promise<string> {
  try {
    const url = await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
    return url
  } catch (err) {
    console.error('Failed to generate QR code:', err)
    throw err
  }
}

/**
 * Decodes and verifies a QR code package string back into a ShiftRecord
 */
export function decodeShiftQRPackage(rawQRText: string): DecodedQRPackage {
  try {
    const envelope = JSON.parse(rawQRText)
    if (!envelope || !envelope.chk || !envelope.data) {
      return { valid: false, error: 'Invalid QR format: Missing cryptographic envelope' }
    }

    const calculatedChecksum = simpleChecksum(JSON.stringify(envelope.data))
    if (calculatedChecksum !== envelope.chk) {
      return { valid: false, error: 'Checksum mismatch: Data packet may be corrupted' }
    }

    const d = envelope.data
    if (d.t !== 'MVP_SHIFT') {
      return { valid: false, error: 'Not a valid Forecourt OS Shift package' }
    }

    const shift: ShiftRecord = {
      id: d.id,
      companyId: d.cid || 'COMP-MVP',
      companyName: d.cnm || 'PetroView Petroleum',
      shiftNumber: d.sn,
      attendantId: d.aid,
      attendantName: d.an,
      stationId: d.sid,
      stationName: d.snm,
      pumpId: d.pid,
      nozzleAssignment: d.na,
      startTime: d.st,
      endTime: d.et,
      status: d.stat,
      openingMeters: d.om,
      closingMeters: d.cm,
      fuelSales: d.fs,
      expectedTotal: d.exp,
      breakdown: d.bk,
      actualTotal: d.act,
      shortage: d.sh,
      shortageBreakdown: d.sbk,
      notes: d.nt,
      supervisorNotes: '',
      receiptCount: d.rc,
      receiptUrls: d.rurls || [],
      syncStatus: 'synced',
      syncChannel: 'qr',
      lastSyncAttempt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: d.st || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    return {
      valid: true,
      shift,
      checksum: envelope.chk,
      generatedAt: d.ts,
    }
  } catch (err: any) {
    return { valid: false, error: `JSON Parse error: ${err.message}` }
  }
}

/**
 * Scans an HTML video element frame using jsQR
 */
export function scanVideoFrameForQR(videoElement: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
    return null
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  canvas.width = videoElement.videoWidth
  canvas.height = videoElement.videoHeight
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert',
  })

  if (code && code.data) {
    return code.data
  }
  return null
}
