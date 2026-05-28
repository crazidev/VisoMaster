/**
 * DebugOverlay — catches and displays JS errors + Qt channel errors in-app.
 *
 * Shown only when there are errors. Click the badge to expand/collapse.
 * Each error shows message + optional stack trace.
 * Errors are also forwarded to the server via /api/client-log when available.
 */
import { useEffect, useRef, useState } from 'react'
import { X, ChevronDown, ChevronUp, Bug } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DebugEntry {
  id: string
  time: string
  level: 'error' | 'warn'
  message: string
  source?: string
  stack?: string
}

// Global singleton so the Qt transport can push errors into it
let _pushError: ((e: Omit<DebugEntry, 'id' | 'time'>) => void) | null = null

export function pushDebugError(e: Omit<DebugEntry, 'id' | 'time'>) {
  _pushError?.(e)
}

export function DebugOverlay() {
  const [entries, setEntries] = useState<DebugEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const counterRef = useRef(0)

  const push = (e: Omit<DebugEntry, 'id' | 'time'>) => {
    const entry: DebugEntry = {
      ...e,
      id: String(++counterRef.current),
      time: new Date().toLocaleTimeString(),
    }
    setEntries(prev => [entry, ...prev].slice(0, 50))
    setExpanded(true)
  }

  // Register global singleton
  useEffect(() => {
    _pushError = push
    return () => { _pushError = null }
  }, [])

  // Intercept window errors and unhandled rejections
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      push({ level: 'error', message: e.message, source: `${e.filename}:${e.lineno}`, stack: e.error?.stack })
    }
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const r = e.reason
      push({ level: 'error', message: `Unhandled rejection: ${String(r?.message ?? r)}`, stack: r?.stack })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandled)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandled)
    }
  }, [])

  if (entries.length === 0) return null

  const errorCount = entries.filter(e => e.level === 'error').length

  return (
    <div className="fixed bottom-3 right-3 z-50 flex flex-col items-end gap-1 max-w-[520px] w-full pointer-events-none">
      {/* Badge / toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={cn(
          'pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shadow-lg transition-colors',
          errorCount > 0
            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/80'
            : 'bg-amber-500 text-white hover:bg-amber-400',
        )}
      >
        <Bug className="size-3" />
        {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : `${entries.length} warn`}
        {expanded ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
      </button>

      {/* Panel */}
      {expanded && (
        <div className="pointer-events-auto w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
            <span className="text-xs font-semibold text-foreground">Debug Log</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEntries([])}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
              <button onClick={() => setExpanded(false)}>
                <X className="size-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          </div>

          {/* Entries */}
          <div className="max-h-72 overflow-y-auto divide-y divide-border">
            {entries.map(entry => (
              <div key={entry.id} className="px-3 py-2">
                <button
                  className="w-full text-left"
                  onClick={() => setOpenId(openId === entry.id ? null : entry.id)}
                >
                  <div className="flex items-start gap-2">
                    <span className={cn(
                      'shrink-0 text-[10px] font-bold uppercase mt-0.5',
                      entry.level === 'error' ? 'text-destructive' : 'text-amber-500',
                    )}>
                      {entry.level}
                    </span>
                    <span className="flex-1 text-xs text-foreground break-all line-clamp-2">
                      {entry.message}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                      {entry.time}
                    </span>
                  </div>
                  {entry.source && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 ml-8 truncate">{entry.source}</p>
                  )}
                </button>

                {/* Expanded stack trace */}
                {openId === entry.id && entry.stack && (
                  <pre className="mt-1.5 ml-8 text-[10px] text-muted-foreground bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {entry.stack}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
