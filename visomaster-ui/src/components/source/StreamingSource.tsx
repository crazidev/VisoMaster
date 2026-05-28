import { useState } from 'react'
import { Play, Square, Settings, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAppStore } from '@/store/appStore'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function StreamingSource() {
  const { webrtcRunning, setWebrtcRunning, webrtcUrls, setWebrtcUrls, webrtcFps } = useAppStore()
  const [httpPort, setHttpPort] = useState('9091')
  const [httpsPort, setHttpsPort] = useState('9090')
  const [bindAddr, setBindAddr] = useState('0.0.0.0')

  const handleStart = async () => {
    try {
      const res = await api.startWebrtc()
      setWebrtcUrls({ http_url: res.http_url, https_url: res.https_url, ws_url: res.whip_url ?? '', wss_url: res.whip_https_url })
      setWebrtcRunning(true)
    } catch (e) { toast.error(String(e)) }
  }

  const handleStop = async () => {
    try { await api.stopWebrtc(); setWebrtcRunning(false); setWebrtcUrls(null) }
    catch { /* ignore */ }
  }

  const applySettings = () => {
    api.patchControl({ WebRTCHttpPortText: httpPort, WebRTCHttpsPortText: httpsPort, WebRTCBindAddressText: bindAddr })
      .catch(() => {})
  }

  // Derive HTTPS URL from the stored URLs
  const httpsUrl = webrtcUrls?.https_url ?? null

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Status */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded border text-xs',
        webrtcRunning && webrtcFps > 0 ? 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400'
          : webrtcRunning ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
          : 'border-border text-muted-foreground',
      )}>
        <span className={cn('size-2 rounded-full shrink-0',
          webrtcRunning && webrtcFps > 0 ? 'bg-green-500'
            : webrtcRunning ? 'bg-amber-500 animate-pulse'
            : 'bg-muted-foreground'
        )} />
        {webrtcRunning && webrtcFps > 0 ? `Live · ${webrtcFps.toFixed(1)} fps`
          : webrtcRunning ? 'Waiting for connection...'
          : 'Server stopped'}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {!webrtcRunning ? (
          <Button size="sm" onClick={handleStart} className="gap-1.5">
            <Play data-icon="inline-start" />Start Server
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleStop} className="gap-1.5">
            <Square data-icon="inline-start" />Stop
          </Button>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="size-8"><Settings className="size-3.5" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <p className="text-sm font-medium mb-3">Port Settings</p>
            <div className="flex flex-col gap-2">
              {[
                { label: 'HTTP Port', value: httpPort, set: setHttpPort },
                { label: 'HTTPS Port', value: httpsPort, set: setHttpsPort },
                { label: 'Bind Address', value: bindAddr, set: setBindAddr },
              ].map(({ label, value, set }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
                  <input
                    value={value}
                    onChange={e => set(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs bg-muted border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
              <Button size="sm" className="mt-1" onClick={applySettings}>Apply</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* URLs */}
      {webrtcUrls && (
        <div className="flex flex-col gap-1.5 text-xs">
          {/* HTTP URL */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-12 shrink-0">HTTP</span>
            <span className="text-foreground truncate flex-1">{webrtcUrls.http_url}</span>
            <a
              href={webrtcUrls.http_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <Button variant="ghost" size="icon" className="size-6">
                <ExternalLink className="size-3" />
              </Button>
            </a>
          </div>

          {/* HTTPS URL */}
          {httpsUrl && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-12 shrink-0">HTTPS</span>
              <span className="text-foreground truncate flex-1">{httpsUrl}</span>
              <a
                href={httpsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <Button variant="ghost" size="icon" className="size-6">
                  <ExternalLink className="size-3" />
                </Button>
              </a>
            </div>
          )}

          {/* WHIP URL */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-12 shrink-0">WHIP</span>
            <span className="text-foreground truncate flex-1">{webrtcUrls.ws_url}</span>
          </div>
        </div>
      )}
    </div>
  )
}
