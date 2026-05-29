import { useState } from 'react'
import { Play, Square, Settings, ExternalLink, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAppStore } from '@/store/appStore'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Shared helpers ────────────────────────────────────────────────────────────

function StatusBadge({ running, fps, label }: { running: boolean; fps?: number; label?: string }) {
  const live = running && (fps === undefined || fps > 0)
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded border text-xs',
      live ? 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400'
        : running ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
        : 'border-border text-muted-foreground',
    )}>
      <span className={cn('size-2 rounded-full shrink-0',
        live ? 'bg-green-500' : running ? 'bg-amber-500 animate-pulse' : 'bg-muted-foreground'
      )} />
      {live ? `${label ?? 'Live'}${fps !== undefined && fps > 0 ? ` · ${fps.toFixed(1)} fps` : ''}`
        : running ? 'Waiting for stream...' : 'Stopped'}
    </div>
  )
}

function UrlRow({ label, url, openable }: { label: string; url: string; openable?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-14 shrink-0 text-xs">{label}</span>
      <span className="text-foreground truncate flex-1 text-xs font-mono">{url}</span>
      <Button variant="ghost" size="icon" className="size-6 shrink-0"
        onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Copied'))}>
        <Copy className="size-3" />
      </Button>
      {openable && (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost" size="icon" className="size-6 shrink-0">
            <ExternalLink className="size-3" />
          </Button>
        </a>
      )}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-fit" />
    </div>
  )
}

// ── WebRTC tab ────────────────────────────────────────────────────────────────

function WebRTCTab() {
  const { webrtcRunning, setWebrtcRunning, webrtcUrls, setWebrtcUrls, webrtcFps } = useAppStore()
  const [httpPort, setHttpPort] = useState('9091')
  const [httpsPort, setHttpsPort] = useState('9090')
  const [bindAddr, setBindAddr] = useState('0.0.0.0')

  const handleStart = async () => {
    try {
      const res = await api.startWebrtc()
      setWebrtcUrls({ http_url: res.http_url, https_url: res.https_url, ws_url: res.whip_url ?? '', wss_url: res.whip_https_url ?? '' })
      setWebrtcRunning(true)
    } catch (e) { toast.error(String(e)) }
  }

  const handleStop = () => {
    api.stopWebrtc()
    setWebrtcRunning(false)
    setWebrtcUrls(null)
  }

  const applySettings = () => {
    api.patchControl({ WebRTCHttpPortText: httpPort, WebRTCHttpsPortText: httpsPort, WebRTCBindAddressText: bindAddr }).catch(() => {})
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusBadge running={webrtcRunning} fps={webrtcFps} label="Live" />
      <div className="flex items-center gap-2">
        {!webrtcRunning ? (
          <Button size="sm" onClick={handleStart} className="gap-1.5"><Play data-icon="inline-start" />Start Server</Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleStop} className="gap-1.5"><Square data-icon="inline-start" />Stop</Button>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="size-8"><Settings className="size-3.5" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <p className="text-sm font-medium mb-3">Port Settings</p>
            <div className="flex flex-col gap-2">
              <Field label="HTTP Port" value={httpPort} onChange={setHttpPort} type="number" />
              <Field label="HTTPS Port" value={httpsPort} onChange={setHttpsPort} type="number" />
              <Field label="Bind Address" value={bindAddr} onChange={setBindAddr} />
              <Button size="sm" className="mt-1" onClick={applySettings}>Apply</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {webrtcUrls && (
        <div className="flex flex-col gap-1.5">
          <UrlRow label="HTTP" url={webrtcUrls.http_url} openable />
          {webrtcUrls.https_url && <UrlRow label="HTTPS" url={webrtcUrls.https_url} openable />}
        </div>
      )}
      {!webrtcRunning && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          Opens a browser camera page. Phone or desktop browser connects via WebRTC — no STUN/TURN needed on LAN.
        </p>
      )}
    </div>
  )
}

// ── UDP input tab ─────────────────────────────────────────────────────────────

function UDPInputTab() {
  const { udpInputRunning, setUdpInputRunning, udpInputUrl, setUdpInputUrl } = useAppStore()
  const [port, setPort] = useState('5000')
  const [format, setFormat] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const handleStart = async () => {
    try {
      const res = await api.startUdpInput({ port: parseInt(port) || 5000, input_format: format })
      const r = res as { url?: string }
      setUdpInputUrl(r.url ?? `udp://0.0.0.0:${port}`)
      setUdpInputRunning(true)
    } catch (e) { toast.error(String(e)) }
  }

  const handleStop = async () => {
    try {
      await api.stopUdpInput()
      setUdpInputRunning(false)
      setUdpInputUrl('')
    } catch (e) { toast.error(String(e)) }
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusBadge running={udpInputRunning} label="Receiving UDP" />
      <div className="flex items-center gap-2">
        {!udpInputRunning ? (
          <Button size="sm" onClick={handleStart} className="gap-1.5"><Play data-icon="inline-start" />Listen</Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleStop} className="gap-1.5"><Square data-icon="inline-start" />Stop</Button>
        )}
        <Popover open={showSettings} onOpenChange={setShowSettings}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="size-8"><Settings className="size-3.5" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <p className="text-sm font-medium mb-3">UDP Input Settings</p>
            <div className="flex flex-col gap-2">
              <Field label="Listen Port" value={port} onChange={setPort} type="number" placeholder="5000" />
              <Field label="Format (opt)" value={format} onChange={setFormat} placeholder="auto / h264 / mpegts" />
              <p className="text-xs text-muted-foreground">Leave format blank for auto-detection.</p>
              <Button size="sm" className="mt-1" onClick={() => setShowSettings(false)}>Done</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {udpInputUrl && <UrlRow label="Listen URL" url={udpInputUrl} />}
      {!udpInputRunning && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Push MPEG-TS over UDP from any sender:</p>
          <code className="block bg-muted px-2 py-1 rounded text-[10px] break-all">
            ffmpeg -re -i input.mp4 -c:v libx264 -f mpegts udp://&lt;this-ip&gt;:{port}
          </code>
          <code className="block bg-muted px-2 py-1 rounded text-[10px] break-all">
            ffmpeg -f lavfi -i testsrc2 -c:v libx264 -f mpegts udp://&lt;this-ip&gt;:{port}
          </code>
        </div>
      )}
    </div>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export function StreamingSource() {
  const [activeTab, setActiveTab] = useState<'webrtc' | 'udp'>('webrtc')

  return (
    <div className="p-3 flex flex-col gap-3">
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
        <TabsList className="w-full h-8 text-xs">
          <TabsTrigger value="webrtc" className="flex-1 text-xs py-1">Browser / WebRTC</TabsTrigger>
          <TabsTrigger value="udp" className="flex-1 text-xs py-1">UDP</TabsTrigger>
        </TabsList>
        <TabsContent value="webrtc" className="mt-3"><WebRTCTab /></TabsContent>
        <TabsContent value="udp" className="mt-3"><UDPInputTab /></TabsContent>
      </Tabs>
    </div>
  )
}
