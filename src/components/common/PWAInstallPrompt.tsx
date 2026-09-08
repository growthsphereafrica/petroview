import React, { useState, useEffect } from 'react'
import { Download, Smartphone, CheckCircle2, X } from 'lucide-react'

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showToast, setShowToast] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setIsInstalled(true)
        setDeferredPrompt(null)
      }
    } else {
      setShowToast(true)
      setTimeout(() => setShowToast(false), 5000)
    }
  }

  if (isInstalled) return null

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition shadow-xs"
        title="Install as native app on Android, iOS or Desktop"
      >
        <Download className="w-3.5 h-3.5 text-emerald-400" />
        <span className="hidden sm:inline">Install App</span>
      </button>

      {showToast && (
        <div className="fixed top-16 right-6 z-50 bg-slate-900 border border-slate-700 text-white p-4 rounded-2xl shadow-2xl max-w-sm animate-in fade-in">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <h4 className="font-bold text-xs">Install on Android or iOS</h4>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  On Chrome/Android: Tap menu (⋮) ➔ <b>"Install app"</b>.<br />
                  On Safari/iOS: Tap Share (<span className="text-blue-400">⎙</span>) ➔ <b>"Add to Home Screen"</b>.
                </p>
              </div>
            </div>
            <button onClick={() => setShowToast(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
