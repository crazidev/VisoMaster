import { Clapperboard, ChevronFirst, ChevronLast, ChevronsLeft, ChevronsRight, Circle, Loader2, Monitor, MonitorOff, Moon, Pause, Play, Repeat, ScanFace, Settings2, Sun, Video, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppStore, type Provider } from '@/store/appStore'
import { api } from '@/api/client'
import { transport, isDesktop } from '@/transport'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Switch } from '../ui/switch'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LoadedModelsPopover } from './LoadedModelsDialog'
import { playbackService } from '@/hooks/usePlaybackStream'

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: 'CUDA',            label: 'CUDA' },
  { value: 'TensorRT',        label: 'TensorRT' },
  { value: 'TensorRT-Engine', label: 'TRT-Engine' },
]

type PanelKey = 'source' | 'faceswap' | 'faceoptions' | 'output'

const PANEL_TOGGLES: { key: PanelKey; label: string; icon: React.ReactNode }[] = [
  { key: 'source',      label: 'Input Source',     icon: <Video        className="size-3.5" /> },
  { key: 'faceswap',    label: 'Face Swapping',     icon: <ScanFace     className="size-3.5" /> },
  { key: 'faceoptions', label: 'Face Swap Options', icon: <Settings2    className="size-3.5" /> },
  { key: 'output',      label: 'Output',            icon: <Clapperboard className="size-3.5" /> },
]

function ResourceMeter({ label, value, detail }: { label: string; value: number; detail?: string }) {
  const color = value > 85 ? 'bg-destructive' : value > 70 ? 'bg-amber-500' : 'bg-primary'
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs w-8 shrink-0">{label}</span>
      <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{detail ?? `${Math.round(value)}%`}</span>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(frame: number, fps: number): string {
  if (fps <= 0) return '0:00'
  const s = frame / fps
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

// ── Inline compact playback strip ─────────────────────────────────────────────
// Sits in the TopBar center. Direct-DOM scrubber + rAF lerp — zero re-renders
// per frame. Only play/pause/loop/rec state triggers React re-renders.

// Shared lerp state — both the top seeker and the inline strip read from the
// same playbackService subscription, but we only want one rAF loop driving
// both DOM elements. We lift the lerp into a module-level singleton so
// InlinePlayback and TopSeeker share it without prop-drilling.

let _sharedTargetPct  = 0   // last confirmed position (0-100)
let _sharedVisualPct  = 0   // current rendered position
let _sharedMaxFR      = 0
let _sharedFpsR       = 0
let _sharedIsPlaying  = false
let _sharedLastUpdate = 0   // performance.now() when last WS message arrived
const _seekerFills: Set<HTMLElement> = new Set()
const _seekerThumbs: Set<HTMLElement> = new Set()

function _applySharedPct(pct: number) {
  const p = `${pct.toFixed(3)}%`
  _seekerFills.forEach(el  => { el.style.width = p })
  _seekerThumbs.forEach(el => { el.style.left  = p })
}

// Reset the extrapolation anchor when the tab becomes visible again.
// Without this, `performance.now() - _sharedLastUpdate` accumulates the full
// hidden duration and the seeker overshoots to 100% on the first rAF tick.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Snap visual to the last confirmed server position and restart extrapolation
      // from now so the next rAF tick has a sane elapsed value.
      _sharedVisualPct  = _sharedTargetPct
      _sharedLastUpdate = performance.now()
      _applySharedPct(_sharedVisualPct)
    }
  })
}

let _rafRunning = false
function _ensureRaf() {
  if (_rafRunning) return
  _rafRunning = true
  const tick = (now: number) => {
    requestAnimationFrame(tick)

    let target = _sharedTargetPct

    // While playing, extrapolate forward from the last confirmed frame so the
    // bar moves at display refresh rate between WS ticks (every ~33 ms at 30fps).
    if (_sharedIsPlaying && _sharedFpsR > 0 && _sharedMaxFR > 0 && _sharedLastUpdate > 0) {
      // Cap elapsed to 2× the expected WS tick interval so a stale timestamp
      // (e.g. after tab wake-up before visibilitychange fires) can't overshoot.
      const maxElapsed = 2 / Math.max(_sharedFpsR, 1)
      const elapsed = Math.min((now - _sharedLastUpdate) / 1000, maxElapsed)
      const extraFrames = elapsed * _sharedFpsR
      const extraPct    = (extraFrames / _sharedMaxFR) * 100
      target = Math.min(100, _sharedTargetPct + extraPct)
    }

    // Snap directly when not playing, already close enough, OR when target
    // jumped backward (loop restart) — never animate the end→start scroll.
    const diff = target - _sharedVisualPct
    const jumpedBack = target < _sharedVisualPct - 5   // >5% backward = loop snap
    if (!_sharedIsPlaying || Math.abs(diff) < 0.02 || jumpedBack) {
      if (_sharedVisualPct !== target) { _sharedVisualPct = target; _applySharedPct(target) }
      return
    }

    // Light lerp to smooth out any jitter in the extrapolated position
    _sharedVisualPct += diff * 0.35
    _applySharedPct(_sharedVisualPct)
  }
  requestAnimationFrame(tick)
}

// ── Top seeker — full-width progress bar flush at the top of the header ───────

function TopSeeker() {
  const trackEl = useRef<HTMLDivElement>(null)
  const fillEl  = useRef<HTMLDivElement>(null)
  const thumbEl = useRef<HTMLDivElement>(null)

  const dragging = useRef(false)
  const lastSeek = useRef(-1)
  const [isVideo, setIsVideo] = useState(useAppStore.getState().playback.file_type === 'video')

  useEffect(() => {
    // Register fill + thumb with the shared lerp
    const fill  = fillEl.current
    const thumb = thumbEl.current
    if (fill)  _seekerFills.add(fill)
    if (thumb) _seekerThumbs.add(thumb)
    _ensureRaf()
    return () => {
      if (fill)  _seekerFills.delete(fill)
      if (thumb) _seekerThumbs.delete(thumb)
    }
  }, [])

  useEffect(() => {
    return playbackService.subscribeRaw((msg) => {
      _sharedMaxFR      = msg.max_frame
      _sharedFpsR       = msg.fps
      _sharedIsPlaying  = msg.is_playing
      _sharedLastUpdate = performance.now()
      _sharedTargetPct  = msg.max_frame > 0 ? Math.min(100, (msg.current_frame / msg.max_frame) * 100) : 0
    })
  }, [])

  useEffect(() => {
    return useAppStore.subscribe(
      (s) => { setIsVideo(s.playback.file_type === 'video') },
    )
  }, [])

  const frameFromX = (clientX: number) => {
    const t = trackEl.current; if (!t) return 0
    const r = t.getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * _sharedMaxFR)
  }
  const applyDrag = (frame: number) => {
    const pct = _sharedMaxFR > 0 ? (frame / _sharedMaxFR) * 100 : 0
    _sharedVisualPct = pct; _sharedTargetPct = pct; _sharedLastUpdate = 0
    _applySharedPct(pct)
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isVideo) return
    dragging.current = true
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    applyDrag(frameFromX(e.clientX))
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => { if (dragging.current) applyDrag(frameFromX(e.clientX)) }
  const onUp   = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    const f = frameFromX(e.clientX); applyDrag(f)
    if (f !== lastSeek.current) { lastSeek.current = f; api.seek(f) }
  }

  return (
    <div
      className="absolute top-0 inset-x-0 flex justify-center z-20 pointer-events-none"
    >
      <div
        ref={trackEl}
        role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}
        tabIndex={isVideo ? 0 : -1}
        className={cn(
          'relative w-[320px] h-[3px] group pointer-events-auto',
          isVideo ? 'cursor-pointer' : 'pointer-events-none opacity-40',
        )}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
      >
        {/* Track */}
        <div className="absolute inset-0 rounded-b-full bg-border" />
        {/* Fill */}
        <div
          ref={fillEl}
          className="absolute left-0 inset-y-0 rounded-b-full bg-primary pointer-events-none"
          style={{ width: '0%' }}
        />
        {/* Hover hit-area + thumb */}
        <div className="absolute inset-x-0 -top-1 h-[10px]">
          <div
            ref={thumbEl}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-2.5 rounded-full bg-primary shadow opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: '0%' }}
          />
        </div>
      </div>
    </div>
  )
}

function InlinePlayback() {
  const { playback, control, setControl } = useAppStore()

  const timecodeEl = useRef<HTMLSpanElement>(null)

  // Lerp state — shared with TopSeeker via module-level singleton
  const dragging  = useRef(false)
  const lastSeek  = useRef(-1)

  const trackEl = useRef<HTMLDivElement>(null)
  const fillEl  = useRef<HTMLDivElement>(null)
  const thumbEl = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fill  = fillEl.current
    const thumb = thumbEl.current
    if (fill)  _seekerFills.add(fill)
    if (thumb) _seekerThumbs.add(thumb)
    _ensureRaf()
    return () => {
      if (fill)  _seekerFills.delete(fill)
      if (thumb) _seekerThumbs.delete(thumb)
    }
  }, [])

  const [isPlaying,   setIsPlaying]   = useState(playback.is_playing)
  const [isRecording, setIsRecording] = useState(playback.is_recording)
  const [hasMedia,    setHasMedia]    = useState(playback.file_type !== null)
  const [isVideo,     setIsVideo]     = useState(playback.file_type === 'video')
  const [loopOn,      setLoopOn]      = useState(!!(control.loop_enabled ?? playback.loop_enabled))

  // Keep hasMedia / isVideo in sync with the store (file_type is set when
  // media is selected, before any playback WS message arrives).
  useEffect(() => {
    return useAppStore.subscribe((s) => {
      setHasMedia(s.playback.file_type !== null)
      setIsVideo(s.playback.file_type === 'video')
    })
  }, [])

  useEffect(() => {
    return playbackService.subscribeRaw((msg) => {
      // Update shared extrapolation state
      _sharedMaxFR      = msg.max_frame
      _sharedFpsR       = msg.fps
      _sharedIsPlaying  = msg.is_playing
      _sharedLastUpdate = performance.now()
      _sharedTargetPct  = msg.max_frame > 0 ? Math.min(100, (msg.current_frame / msg.max_frame) * 100) : 0
      if (timecodeEl.current) timecodeEl.current.textContent = fmt(msg.current_frame, msg.fps)
      setIsPlaying((p)   => p !== msg.is_playing   ? msg.is_playing   : p)
      setIsRecording((p) => p !== msg.is_recording ? msg.is_recording : p)
    })
  }, [])

  useEffect(() => { setLoopOn(!!(control.loop_enabled ?? playback.loop_enabled)) }, [control.loop_enabled, playback.loop_enabled])

  const frameFromX = (clientX: number) => {
    const t = trackEl.current; if (!t) return 0
    const r = t.getBoundingClientRect()
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * _sharedMaxFR)
  }
  const applyDrag = (frame: number) => {
    const pct = _sharedMaxFR > 0 ? (frame / _sharedMaxFR) * 100 : 0
    _sharedVisualPct = pct; _sharedTargetPct = pct; _sharedLastUpdate = 0
    _applySharedPct(pct)
    if (timecodeEl.current) timecodeEl.current.textContent = fmt(frame, _sharedFpsR)
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isVideo) return
    dragging.current = true
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    applyDrag(frameFromX(e.clientX))
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => { if (dragging.current) applyDrag(frameFromX(e.clientX)) }
  const onUp   = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    const f = frameFromX(e.clientX); applyDrag(f)
    if (f !== lastSeek.current) { lastSeek.current = f; api.seek(f) }
  }

  const handlePlayPause = useCallback(() => { if (isPlaying) api.stop(); else api.play() }, [isPlaying])
  const handleStep = useCallback((n: number) => { api.step(n) }, [])
  const handleSeekTo = useCallback((frame: number) => { api.seek(frame) }, [])
  const handleLoop = useCallback(() => {
    const next = !loopOn; setLoopOn(next); setControl({ loop_enabled: next })
    if (next) api.enableLoop(); else api.disableLoop()
  }, [loopOn, setControl])

  return (
    <div className="flex items-center gap-1 w-full max-w-[500px]">
      <Tooltip><TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleSeekTo(0)} disabled={!isVideo}><ChevronFirst className="size-3" /></Button>
      </TooltipTrigger><TooltipContent side="bottom">Jump to start</TooltipContent></Tooltip>

      <Tooltip><TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleStep(-30)} disabled={!isVideo}><ChevronsLeft className="size-3" /></Button>
      </TooltipTrigger><TooltipContent side="bottom">−30 frames</TooltipContent></Tooltip>

      <Tooltip><TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 shrink-0 rounded-full text-foreground hover:bg-accent" onClick={handlePlayPause} disabled={!hasMedia}>
          {isPlaying ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
        </Button>
      </TooltipTrigger><TooltipContent side="bottom">{isPlaying ? 'Pause' : 'Play'}</TooltipContent></Tooltip>

      <Tooltip><TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleStep(30)} disabled={!isVideo}><ChevronsRight className="size-3" /></Button>
      </TooltipTrigger><TooltipContent side="bottom">+30 frames</TooltipContent></Tooltip>

      <Tooltip><TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => handleSeekTo(_sharedMaxFR)} disabled={!isVideo}><ChevronLast className="size-3" /></Button>
      </TooltipTrigger><TooltipContent side="bottom">Jump to end</TooltipContent></Tooltip>

      {/* Inline scrubber — shares fill/thumb with TopSeeker via module singleton */}
      <div ref={trackEl} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}
        tabIndex={isVideo ? 0 : -1}
        className={cn('relative flex-1 h-5 flex items-center cursor-pointer group select-none', !isVideo && 'opacity-30 pointer-events-none')}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
        <div className="absolute inset-x-0 h-[2px] rounded-full bg-muted  " />
        <div ref={fillEl}  className="absolute left-0 h-[2px] rounded-full bg-primary pointer-events-none" style={{ width: '0%' }} />
        <div ref={thumbEl} className="absolute -translate-x-1/2 size-2.5 rounded-full bg-foreground shadow pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" style={{ left: '0%' }} />
      </div>

      <span ref={timecodeEl} className="text-[10px] font-mono text-muted-foreground shrink-0 tabular-nums w-[28px] text-right">0:00</span>

      <Tooltip><TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('size-6 shrink-0', loopOn ? 'text-primary' : 'text-muted-foreground hover:text-foreground')} onClick={handleLoop} disabled={!isVideo} aria-pressed={loopOn}><Repeat className="size-3" /></Button>
      </TooltipTrigger><TooltipContent side="bottom">Loop {loopOn ? '(on)' : '(off)'}</TooltipContent></Tooltip>

      {isRecording && <span className="flex items-center gap-0.5 text-[9px] text-red-500 font-medium shrink-0"><Circle className="size-1.5 fill-current animate-pulse" />REC</span>}
    </div>
  )
}

// ── TopBar ────────────────────────────────────────────────────────────────────

export function TopBar() {
  const { gpuMemory, provider, setProvider, panelVisibility, togglePanel, externalPreview, theme, toggleTheme } = useAppStore()

  const [previewPending, setPreviewPending] = useState(false)
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [modelsDialogOpen, setModelsDialogOpen] = useState(false)

  useEffect(() => {
    const unsubs = [
      transport.on('preview_window_opened', () => { setPreviewPending(false); if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current) }),
      transport.on('preview_window_closed', () => { setPreviewPending(false); if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current) }),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [])

  const vramPct    = gpuMemory.total_mb > 0 ? (gpuMemory.used_mb / gpuMemory.total_mb) * 100 : 0
  const vramDetail = gpuMemory.total_mb > 0 ? `${(gpuMemory.used_mb / 1024).toFixed(1)}/${(gpuMemory.total_mb / 1024).toFixed(0)}GB` : '—'

  const handleProvider = (p: Provider) => {
    setProvider(p)
    try { api.setProvider(p); toast.success(`Provider → ${p}`) } catch (e) { toast.error(String(e)) }
  }

  const handleToggleNativeOutput = async () => {
    if (!isDesktop) {
      setPreviewPending(true)
      pendingTimeoutRef.current = setTimeout(() => setPreviewPending(false), 8000)
    }
    try { if (transport.togglePreviewWindow) await transport.togglePreviewWindow() }
    catch (e) { setPreviewPending(false); if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current); console.warn('togglePreviewWindow failed:', e) }
  }

  return (
    // `relative` so TopSeeker and the absolute-centered playback strip don't affect flex layout
    <header className="relative h-11 bg-card flex items-center px-3 gap-2 shrink-0 overflow-visible">

      {/* ── Full-width seeker — sits flush at the top edge, acts as the top border ── */}
      {/* <TopSeeker /> */}

      {/* ── Left ── */}
      <div className="flex items-center gap-2 shrink-0 z-10">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="size-6 bg-primary rounded flex items-center justify-center text-xs font-bold text-primary-foreground">VM</div>
          <span className="text-sm font-semibold hidden sm:block">VisoMaster</span>
        </div>

        <Separator orientation="vertical" className="self-stretch h-5" />

        <div className="flex items-center gap-0.5 shrink-0">
          {PANEL_TOGGLES.map(({ key, label, icon }) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => togglePanel(key)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                    panelVisibility[key] ? 'bg-primary text-primary-foreground hover:bg-primary/75' : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >{icon}</button>
              </TooltipTrigger>
              <TooltipContent>{panelVisibility[key] ? `Hide ${label}` : `Show ${label}`}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* ── Center — playback (absolute so it doesn't push left/right) ── */}
      {/* <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <InlinePlayback />
        </div>
      </div> */}

      {/* ── Right ── */}
      <div className="ml-auto flex items-center gap-2 shrink-0 z-10">

        {/* Provider dropdown */}
        <Select value={provider} onValueChange={(v) => handleProvider(v as Provider)}>
          <SelectTrigger className="h-7 text-xs w-[108px] bg-muted border-0 focus:ring-0 focus:ring-offset-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map(({ value, label }) => (
              <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="self-stretch h-5" />

        <ResourceMeter label="VRAM" value={vramPct} detail={vramDetail} />

        <LoadedModelsPopover
          open={modelsDialogOpen}
          onOpenChange={setModelsDialogOpen}
          trigger={
            <Button variant="outline" size="sm" className="gap-1 h-7 px-2">
              <Layers className="size-3.5" />
            </Button>
          }
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={toggleTheme} className="h-7 px-2">
              {theme === 'dark' ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline" size="sm"
              onClick={handleToggleNativeOutput}
              disabled={previewPending}
              className={cn('gap-1.5 px-2 h-7', externalPreview ? 'text-green-500 hover:text-green-400' : 'text-muted-foreground hover:text-foreground')}
            >
              {previewPending ? <Loader2 className="size-3.5 animate-spin" /> : externalPreview ? <Monitor className="size-3.5" /> : <MonitorOff className="size-3.5" />}
              <span className="hidden md:block text-xs">Preview</span>
              {!previewPending && <Switch size="sm" checked={externalPreview} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{previewPending ? 'Opening…' : externalPreview ? 'Close preview window' : 'Open preview window'}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
