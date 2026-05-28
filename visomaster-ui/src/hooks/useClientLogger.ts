import { useEffect } from 'react'

function sendLog(level: string, message: string, source?: string, stack?: string) {
  fetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, message, source, stack }),
  }).catch(() => { /* never throw from the logger */ })
}

/**
 * Forwards browser errors and console.warn/error to the API server
 * so they appear in the Python server's stdout alongside API logs.
 * Call once at the top of the app.
 */
export function useClientLogger() {
  useEffect(() => {
    // Global error handler
    const onError = (e: ErrorEvent) => {
      sendLog(
        'error',
        e.message,
        `${e.filename}:${e.lineno}:${e.colno}`,
        e.error?.stack,
      )
    }

    // Unhandled promise rejections
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const reason = e.reason
      sendLog(
        'error',
        `Unhandled rejection: ${String(reason?.message ?? reason)}`,
        undefined,
        reason?.stack,
      )
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandled)

    // Patch console.error and console.warn
    const origError = console.error.bind(console)
    const origWarn  = console.warn.bind(console)

    console.error = (...args: unknown[]) => {
      origError(...args)
      sendLog('error', args.map(String).join(' '))
    }
    console.warn = (...args: unknown[]) => {
      origWarn(...args)
      sendLog('warn', args.map(String).join(' '))
    }

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandled)
      console.error = origError
      console.warn  = origWarn
    }
  }, [])
}
