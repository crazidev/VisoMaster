import { useState, useEffect } from 'react'
import { FolderOpen, Circle, Image, ExternalLink, Copy, Video, Radio, Camera, Play, Square, Settings, SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/appStore'
import { api } from '@/api/client'
import { useEvents } from '@/hooks/useEvents'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { showFileSavedToast } from '@/components/shared/FileSavedToast'

// ── Shared helpers ────────────────────────────────────────────────────────────

function StatusPill({ running, label }: { running: boolean; label: string }) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-2 py-1.5 rounded border text-xs',
      running
        ? 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400'
        : 'border-border text-muted-foreground',
    )}>
      <span className={cn('size-1.5 rounded-full shrink-0', running ? 'bg-green-500' : 'bg-muted-foreground')} />
      {running ? label : 'Stopped'}
    </div>
  )
}

function SettingsField({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <Input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} className="h-7 text-xs" />
    </div>
  )
}

// ── WebSocket Output section ──────────────────────────────────────────────────
// Always-on on port 8765 — started automatically at launch.

function WsOutputSection() {
  const url = 'ws://localhost:8765/ws/preview'
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">WebSocket Output</p>

      <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-green-500/40 bg-green-500/10">
        <span className="size-1.5 rounded-full bg-green-500 shrink-0" />
        <span className="text-xs text-green-600 dark:text-green-400 flex-1 font-mono truncate">{url}</span>
        <Button variant="ghost" size="icon" className="size-6 shrink-0"
          onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Copied'))}>
          <Copy className="size-3" />
        </Button>
      </div>

      <div className="text-xs text-muted-foreground space-y-0.5">
        <p className="font-medium">Connect with:</p>
        <code className="block bg-muted px-2 py-1 rounded text-[10px] break-all">
          python preview-ws.py
        </code>
      </div>
    </div>
  )
}

// ── UDP Output section ────────────────────────────────────────────────────────

function UDPOutputSection() {
  const { udpOutputRunning, setUdpOutputRunning, udpOutputUrl, setUdpOutputUrl } = useAppStore()
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('5001')
  const [codec, setCodec] = useState('h264')
  const [bitrate, setBitrate] = useState('4000')

  const handleStart = async () => {
    try {
      const res = await api.startUdpOutput({
        host, port: parseInt(port) || 5001,
        codec, bitrate_kbps: parseInt(bitrate) || 4000,
      })
      const r = res as { url?: string }
      setUdpOutputUrl(r.url ?? `udp://${host}:${port}`)
      setUdpOutputRunning(true)
    } catch (e) {
      const msg = String(e)
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch') || msg.includes('NetworkError')) {
        toast.error('Cannot reach backend — is the API server running?')
      } else {
        toast.error(msg)
      }
    }
  }

  const handleStop = async () => {
    try {
      await api.stopUdpOutput()
      setUdpOutputRunning(false)
      setUdpOutputUrl('')
    } catch (e) {
      setUdpOutputRunning(false)
      setUdpOutputUrl('')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UDP Output</p>
      <StatusPill running={udpOutputRunning} label={`Streaming → ${udpOutputUrl}`} />

      <div className="flex items-center gap-2">
        {!udpOutputRunning ? (
          <Button onClick={handleStart} className="gap-1.5">
            <Play className="size-3" />Start
          </Button>
        ) : (
          <Button variant="destructive" onClick={handleStop} className="gap-1.5">
            <Square className="size-3" />Stop
          </Button>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="size-8">
              <Settings className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="end">
            <p className="text-sm font-medium mb-3">UDP Output Settings</p>
            <div className="flex flex-col gap-2">
              <SettingsField label="Host" value={host} onChange={setHost} placeholder="127.0.0.1" />
              <SettingsField label="Port" value={port} onChange={setPort} type="number" placeholder="5001" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-20 shrink-0">Codec</span>
                <select value={codec} onChange={e => setCodec(e.target.value)}
                  className="flex-1 h-7 px-2 text-xs bg-muted border border-border rounded focus:outline-none">
                  <option value="h264">H.264</option>
                  <option value="h265">H.265</option>
                </select>
              </div>
              <SettingsField label="Bitrate (kbps)" value={bitrate} onChange={setBitrate} type="number" placeholder="4000" />
            </div>
          </PopoverContent>
        </Popover>

        {udpOutputRunning && (
          <Button variant="ghost" size="icon" className="size-8 shrink-0"
            onClick={() => navigator.clipboard.writeText(udpOutputUrl).then(() => toast.success('Copied'))}>
            <Copy className="size-3.5" />
          </Button>
        )}
      </div>

      {udpOutputRunning && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p className="font-medium">Receive with:</p>
          <code className="block bg-muted px-2 py-1 rounded text-[10px] break-all">
            ffplay -fflags nobuffer -flags low_delay -framedrop {udpOutputUrl}
          </code>
          <code className="block bg-muted px-2 py-1 rounded text-[10px] break-all">
            vlc udp://@:{port}
          </code>
        </div>
      )}
    </div>
  )
}

export function OutputPanel() {
  const { playback, control, setControl, externalPreview, virtCamEnabled, setVirtCamEnabled, udpOutputRunning } = useAppStore()
  const { send } = useEvents()

  // Sync local folder state from control (e.g. loaded from workspace)
  const [outputFolder, setOutputFolderLocal] = useState((control.OutputMediaFolder as string) ?? '')
  useEffect(() => {
    const fromStore = (control.OutputMediaFolder as string) ?? ''
    if (fromStore !== outputFolder) setOutputFolderLocal(fromStore)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [control.OutputMediaFolder])

  const [recordTimer, setRecordTimer] = useState(0)
  const [timerInterval, setTimerInterval] = useState<ReturnType<typeof setInterval> | null>(null)
  const [activeTab, setActiveTab] = useState<'record' | 'stream' | 'virtcam' | 'settings'>('record')

  // Commit folder path to backend state
  const commitFolder = (path: string) => {
    setOutputFolderLocal(path)
    setControl({ OutputMediaFolder: path })
    send('set_control', { name: 'OutputMediaFolder', value: path })
  }

  const handlePickFolder = async () => {
    try {
      // Use pickFolderAt so the dialog opens at the current output folder (Qt mode).
      // In browser mode this returns '' — user must type/paste the path.
      const picked = await api.pickFolderAt(outputFolder || '')
      if (picked) commitFolder(picked)
    } catch (e) { toast.error(String(e)) }
  }

  // Keep the timer in sync with the authoritative is_recording from the store.
  // If the backend stops recording (e.g. video ends), clear the local timer too.
  useEffect(() => {
    if (!playback.is_recording && timerInterval !== null) {
      clearInterval(timerInterval)
      setTimerInterval(null)
      setRecordTimer(0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.is_recording])


  const handleRecordStart = async () => {
    if (!outputFolder) { toast.error('Set output folder first'); return }
    try {
      await api.recordStart(outputFolder)
      // Optimistically flip the UI to recording state immediately — the
      // playback_state WS event will confirm, but may arrive with a small delay.
      useAppStore.getState().setPlayback({ is_recording: true })
      const id = setInterval(() => setRecordTimer(t => t + 1), 1000)
      setTimerInterval(id)
    } catch (e) { toast.error(String(e)) }
  }

  const handleRecordStop = async () => {
    try {
      const res = await api.recordStop()
      // Optimistically clear recording state
      useAppStore.getState().setPlayback({ is_recording: false })
      if (timerInterval) clearInterval(timerInterval)
      setTimerInterval(null)
      setRecordTimer(0)
      // Show the toast immediately from the API response.
      // The recording_finished WS/signal event may also fire later — useEvents
      // deduplicates by checking output_path before showing a second toast.
      const path = (res as { output_path?: string })?.output_path ?? ''
      if (path) showFileSavedToast(path, 'Recording saved', `recording-saved-${path}`)
    } catch (e) { toast.error(String(e)) }
  }

  const handleSaveFrame = async () => {
    if (!outputFolder) { toast.error('Set output folder first'); return }
    try {
      const res = await api.saveFrame() as unknown as { output_path?: string; message?: string }
      const path = res?.output_path ?? ''
      if (path) {
        showFileSavedToast(path, 'Frame saved')
      } else {
        toast.success(res?.message ?? 'Frame saved')
      }
    } catch (e) { toast.error(String(e)) }
  }

  const toggleVirtCam = (v: boolean) => {
    // Optimistically update the toggle so it feels responsive,
    // but the backend will confirm (or correct) via the virtcam_state WS event.
    setVirtCamEnabled(v)
    setControl({ SendVirtCamFramesEnableToggle: v })
    send('set_control', { name: 'SendVirtCamFramesEnableToggle', value: v })
  }

  // Always send open_preview_window — the backend decides whether to open or
  // close. This means clicking the button when the window was closed or
  // crashed always re-opens it rather than toggling based on stale local state.
  const handlePopOutPreview = () => send('open_preview_window', {})

  const fmtTimer = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const setCtrl = (name: string, value: unknown) => {
    setControl({ [name]: value })
    send('set_control', { name, value })
  }

  // Sidebar nav items
  const navItems = [
    {
      id: 'record' as const,
      icon: Video,
      label: 'Record',
      indicator: playback.is_recording
        ? <span className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive animate-pulse" />
        : null,
    },
    {
      id: 'stream' as const,
      icon: Radio,
      label: 'Stream',
      indicator: udpOutputRunning
        ? <span className="absolute top-1 right-1 size-1.5 rounded-full bg-green-500 animate-pulse" />
        : null,
    },
    {
      id: 'virtcam' as const,
      icon: Camera,
      label: 'Virtual Camera',
      indicator: virtCamEnabled
        ? <span className="absolute top-1 right-1 size-1.5 rounded-full bg-green-500" />
        : null,
    },
    {
      id: 'settings' as const,
      icon: SettingsIcon,
      label: 'Settings',
      indicator: null,
    },
  ]

  return (
    <div className="flex h-full bg-card">
      {/* Vertical icon sidebar */}
      <div className="flex flex-col items-center gap-1 py-2 px-1 border-r bg-card shrink-0 w-12">
        {navItems.map(({ id, icon: Icon, label, indicator }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setActiveTab(id)}
                className={cn(
                  'relative flex flex-col items-center justify-center w-9 h-9 rounded-lg transition-colors text-[9px] gap-0.5',
                  activeTab === id
                    ? 'bg-primary/15 w-full text-primary'
                    : 'text-muted-foreground w-full  hover:text-foreground hover:bg-accent',
                )}
                aria-pressed={activeTab === id}
                aria-label={label}
              >
                <Icon className="size-4 shrink-0" />
                {indicator}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ))}

        {/* Spacer + pop-out button at bottom */}
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={externalPreview ? 'default' : 'ghost'}
              size="icon"
              className="size-9 shrink-0"
              onClick={handlePopOutPreview}
              aria-label={externalPreview ? 'Close preview window' : 'Open external preview window'}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {externalPreview ? 'Close preview window' : 'Pop-out preview'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Panel content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Panel title */}
        <div style={{
          paddingLeft: 10,
          marginBottom: 10
        }} className="w-full rounded-none border-b items-center flex !h-[50px] bg-card shrink-0">
          <span className="ml-[100px] text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {navItems.find(n => n.id === activeTab)?.label}
          </span>
        </div>

        <ScrollArea className="flex-1">
          {/* Record panel */}
          {activeTab === 'record' && (
            <div className="px-3 py-3 flex flex-col gap-3">
              <div className="flex items-center gap-1.5">
                <Input
                  value={outputFolder}
                  onChange={e => commitFolder(e.target.value)}
                  onBlur={e => commitFolder(e.target.value.trim())}
                  placeholder="Output folder path..."
                  className="flex-1"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={handlePickFolder}>
                      <FolderOpen className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Browse for output folder</TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {!playback.is_recording ? (
                  <Button variant="outline" size="sm" onClick={handleRecordStart} className="gap-1.5 flex items-center border-destructive/50 text-destructive hover:bg-destructive/10">
                    <Circle data-icon="inline-start" className="fill-current" />Start Recording
                  </Button>
                ) : (
                  <Button variant="destructive" size="sm" onClick={handleRecordStop} className="gap-1.5">
                    <Circle data-icon="inline-start" />Stop · {fmtTimer(recordTimer)}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleSaveFrame} className="gap-1.5">
                  <Image data-icon="inline-start" />Save Frame
                </Button>
              </div>
            </div>
          )}

          {/* Stream panel */}
          {activeTab === 'stream' && (
            <div className="px-3 py-3 flex flex-col gap-4">
              <WsOutputSection />
              <div className="border-t" />
              <UDPOutputSection />
            </div>
          )}

          {/* Virtual Camera panel */}
          {activeTab === 'virtcam' && (
            <div className="px-3 py-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Backend</span>
                  <Select value={(control.VirtCamBackendSelection as string) ?? 'obs'} onValueChange={v => setCtrl('VirtCamBackendSelection', v)}>
                    <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="obs" className="text-xs">OBS</SelectItem>
                      <SelectItem value="unitycapture" className="text-xs">Unity Capture</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Switch checked={virtCamEnabled} onCheckedChange={toggleVirtCam} className="scale-75" />
              </div>
              {virtCamEnabled && (
                <Badge variant="secondary" className="self-start text-xs text-green-600 dark:text-green-400">● Active</Badge>
              )}
            </div>
          )}

          {/* Settings panel */}
          {activeTab === 'settings' && (
            <div className="px-3 py-3 flex flex-col gap-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Threads</span>
                  <span className="text-xs text-muted-foreground">{(control.nThreadsSlider as number) ?? 2}</span>
                </div>
                <Slider min={1} max={30} step={1} value={[(control.nThreadsSlider as number) ?? 2]}
                  onValueChange={([v]) => setCtrl('nThreadsSlider', v)} className="w-full" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Similarity Type</span>
                <Select value={(control.SimilarityTypeSelection as string) ?? 'Opal'} onValueChange={v => setCtrl('SimilarityTypeSelection', v)}>
                  <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>{['Opal', 'Pearl', 'Optimal'].map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Emb Merge</span>
                <Select value={(control.EmbMergeMethodSelection as string) ?? 'Mean'} onValueChange={v => setCtrl('EmbMergeMethodSelection', v)}>
                  <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>{['Mean', 'Median'].map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
