import React, { useState, useRef, useEffect } from 'react'
import { QrCode, X, Camera, Sparkles, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { scanVideoFrameForQR, createShiftQRPackage } from '../../services/qrService'
import { useForecourt } from '../../context/ForecourtContext'

interface QRScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScanSuccess: (decodedEnvelope: string) => void
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess
}) => {
  const { shifts } = useForecourt()
  const [scanning, setScanning] = useState<boolean>(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualText, setManualText] = useState<string>('')
  const [showManualInput, setShowManualInput] = useState<boolean>(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (isOpen) {
      setCameraError(null)
      startScanner()
    } else {
      stopScanner()
    }
    return () => {
      stopScanner()
    }
  }, [isOpen])

  const startScanner = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setScanning(true)
          requestScanFrame()
        }
      } else {
        setCameraError('Webcam not supported in this browser. Use Demo Scan or paste payload.')
      }
    } catch (err: any) {
      setCameraError(`Camera unavailable (${err.message || 'permission denied'}). Use demo scan below.`)
    }
  }

  const stopScanner = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setScanning(false)
  }

  const requestScanFrame = () => {
    if (!videoRef.current || !canvasRef.current) return

    const qrResult = scanVideoFrameForQR(videoRef.current, canvasRef.current)
    if (qrResult) {
      handleSuccessfulScan(qrResult)
      return
    }

    animationFrameRef.current = requestAnimationFrame(requestScanFrame)
  }

  const handleSuccessfulScan = (qrData: string) => {
    stopScanner()
    onScanSuccess(qrData)
    onClose()
  }

  // Quick test sample using current shift
  const triggerDemoShiftScan = () => {
    const shift = shifts[0]
    if (shift) {
      const { packageString } = createShiftQRPackage(shift)
      handleSuccessfulScan(packageString)
    } else {
      setCameraError('No sample shift found in database to simulate.')
    }
  }

  const handleManualSubmit = () => {
    if (manualText.trim()) {
      handleSuccessfulScan(manualText.trim())
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-base">QR Air-Gap Scanner</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner Viewport */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[320px] overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanner Optical Reticle */}
          <div className="absolute inset-10 border-2 border-dashed border-amber-400/80 rounded-2xl pointer-events-none flex flex-col items-center justify-between p-4 bg-amber-500/5">
            {/* Animated Laser Scanline */}
            <div className="w-full h-1 bg-amber-400 shadow-[0_0_12px_#f59e0b] rounded-full animate-scanline" />
            <span className="bg-black/75 backdrop-blur-md px-3 py-1 rounded-full text-[11px] text-amber-300 font-bold tracking-wide">
              Point camera at Attendant QR Screen
            </span>
            <div className="w-full" />
          </div>

          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-400 mb-2" />
              <p className="text-xs text-slate-300 mb-4 max-w-xs">{cameraError}</p>
              <button
                onClick={triggerDemoShiftScan}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg transition"
              >
                <Sparkles className="w-4 h-4" /> Simulate QR Scan from Attendant
              </button>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col gap-2.5">
          <button
            onClick={triggerDemoShiftScan}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition"
          >
            <Sparkles className="w-4 h-4 text-amber-300" /> Instant Test Scan (Attendant Shift QR)
          </button>

          <button
            onClick={() => setShowManualInput(!showManualInput)}
            className="text-[11px] text-slate-400 hover:text-slate-200 text-center font-medium transition"
          >
            {showManualInput ? 'Hide manual payload input' : 'Paste encrypted QR payload string'}
          </button>

          {showManualInput && (
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder='{"chk":"...","data":{...}}'
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-emerald-500"
              />
              <button
                onClick={handleManualSubmit}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl"
              >
                Import
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
