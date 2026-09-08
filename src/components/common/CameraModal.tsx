import React, { useState, useRef, useEffect } from 'react'
import { Camera, X, RefreshCw, Zap, Check, Image as ImageIcon, Sparkles } from 'lucide-react'
import { generateSampleReceiptImage } from '../../utils/receiptGenerator'

interface CameraModalProps {
  isOpen: boolean
  onClose: () => void
  onCapture: (imageDataUrl: string) => void
  shiftNumber?: string
  attendantName?: string
  stationName?: string
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  shiftNumber = 'SHIFT-000123',
  attendantName = 'John Attendant',
  stationName = 'Green Valley Station'
}) => {
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState<boolean>(false)
  const [flashEnabled, setFlashEnabled] = useState<boolean>(false)
  const [useSimulatedReceipt, setUseSimulatedReceipt] = useState<boolean>(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null)
      startWebcam()
    } else {
      stopWebcam()
    }
    return () => {
      stopWebcam()
    }
  }, [isOpen])

  const startWebcam = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          setCameraActive(true)
        }
      } else {
        // Fallback to simulated paper receipt generator
        generateFallbackSample()
      }
    } catch (err) {
      console.warn('Webcam permission denied or camera not available, falling back to simulated receipt:', err)
      generateFallbackSample()
    }
  }

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  const generateFallbackSample = () => {
    setUseSimulatedReceipt(true)
    const sample = generateSampleReceiptImage({
      shiftNumber,
      attendantName,
      stationName,
      fuelType: 'Super Petrol (PMS)',
      litres: 15.00,
      pricePerLitre: 14.80,
      totalAmount: 222.00,
      paymentMethod: 'Cash',
      dateStr: new Date().toLocaleString()
    })
    setCapturedImage(sample)
  }

  const handleShutter = () => {
    if (flashEnabled) {
      // Trigger subtle flash effect
    }

    if (cameraActive && videoRef.current) {
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 480
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        setCapturedImage(dataUrl)
      }
    } else {
      generateFallbackSample()
    }
  }

  const handleRetake = () => {
    setCapturedImage(null)
    if (!cameraActive) {
      startWebcam()
    }
  }

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950/80 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-base">Capture Receipt</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFlashEnabled(!flashEnabled)}
              className={`p-2 rounded-full transition ${flashEnabled ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
              title="Toggle Flash"
            >
              <Zap className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewport */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[360px]">
          {capturedImage ? (
            <div className="relative w-full h-full flex items-center justify-center p-4 bg-slate-950">
              <img
                src={capturedImage}
                alt="Captured Receipt"
                className="max-h-[380px] w-auto object-contain rounded-xl shadow-lg border border-slate-700"
              />
              <div className="absolute top-6 right-6 bg-emerald-500 text-slate-950 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-md">
                <Check className="w-3.5 h-3.5" /> Photo Captured
              </div>
            </div>
          ) : cameraActive ? (
            <div className="relative w-full h-full">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Receipt Guideline Grid */}
              <div className="absolute inset-8 border-2 border-dashed border-emerald-400/60 rounded-2xl pointer-events-none flex items-center justify-center">
                <span className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs text-emerald-300 font-medium">
                  Align receipt paper inside frame
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <ImageIcon className="w-12 h-12 text-slate-600 mb-3" />
              <p className="text-sm font-semibold text-slate-200">No camera active</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                You can generate a realistic simulated station fuel receipt photo for testing.
              </p>
              <button
                onClick={generateFallbackSample}
                className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md hover:bg-emerald-500"
              >
                <Sparkles className="w-4 h-4 text-amber-300" /> Generate Demo Receipt
              </button>
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div className="p-5 bg-slate-950 border-t border-slate-800 flex flex-col gap-3">
          {capturedImage ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleConfirm}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 hover:from-orange-500 hover:to-amber-400 text-white font-extrabold text-sm tracking-wide shadow-lg shadow-orange-950/60 border border-orange-400/30 flex items-center justify-center gap-2 active:scale-98 transition"
              >
                <Check className="w-4 h-4" /> USE PHOTO
              </button>
              <button
                onClick={handleRetake}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Retake
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <button
                onClick={generateFallbackSample}
                className="text-xs text-orange-400 font-semibold flex items-center gap-1 hover:underline"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Demo Sample
              </button>

              <button
                onClick={handleShutter}
                className="w-16 h-16 rounded-full border-4 border-white bg-gradient-to-br from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 active:scale-90 transition-transform shadow-xl flex items-center justify-center text-slate-950 cursor-pointer shadow-orange-950/50"
                title="Capture Photo"
              >
                <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center">
                  <Camera className="w-6 h-6 text-orange-600" />
                </div>
              </button>

              <button
                onClick={startWebcam}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Restart
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
