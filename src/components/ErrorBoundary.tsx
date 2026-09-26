import React from 'react'
import { AlertOctagon, RotateCcw } from 'lucide-react'

interface Props {
  children: React.ReactNode
  /** Shown instead of the default panel. */
  label?: string
}

interface State {
  error: Error | null
}

/**
 * Catches render-time exceptions anywhere below it.
 *
 * The app previously mounted <App /> bare, so a single TypeError in any portal
 * white-screened the whole POS with no way back — on a terminal where the
 * attendant may be mid-shift with a queue of unsynced sales.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] render failed', error, info.componentStack)
  }

  private handleReload = (): void => {
    // A plain reload, not a data reset: IndexedDB survives, so nothing recorded
    // this shift is lost.
    window.location.reload()
  }

  render(): React.ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-rose-500/40 bg-rose-950/30 p-6 text-center">
          <AlertOctagon className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <h1 className="text-base font-black text-white mb-1">
            {this.props.label ?? 'Something went wrong'}
          </h1>
          <p className="text-xs text-rose-200/80 mb-1">
            The screen stopped unexpectedly. Your recorded sales are stored on this device and have not been
            lost.
          </p>
          <p className="text-[10px] font-mono text-slate-500 mb-4 break-words">
            {error.message}
          </p>
          <button
            onClick={this.handleReload}
            className="w-full rounded-xl bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white py-3 text-sm font-black flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> Reload
          </button>
        </div>
      </div>
    )
  }
}
