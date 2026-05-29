/**
 * PlaybackBar — floating, centered, rounded pill at the bottom of the screen.
 *
 * Performance design
 * ──────────────────
 * • Position updates arrive from /ws/playback (latest-wins, up to 30 fps).
 * • The scrubber fill/thumb are driven by a requestAnimationFrame loop that
 *   lerps the visual position toward the target — smooth even when frames
 *   arrive irregularly or the network hiccups.
 * • Zero React re-renders per frame. Only is_playing / is_recording / hasMedia
 *   trigger re-renders, and only when those values actually change.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play, Pause, SkipBack, SkipForward,
  ChevronLeft, ChevronRight, Repeat, Circle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/appStore'
import { playbackService } from '@/hooks/usePlaybackStream'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimecode(frame: number, fps: number): string {
  if (fps <= 0) return '00:00:00'
  const totalSec = frame / fps
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = Math.floor(totalSec % 60)
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

// ── Direct-DOM scrubber with rAF lerp ─────────────────────────────────────────

interface ScrubberHandle {
  /** Called by PlaybackBar when a new position arrives from the WS */
  setTarget: (frame: number, maxFrame: number, fps: number) => void
  /** Returns the frame the user dragged to (only valid while scrubbing) */
  getDragFrame: () => number
  isScrubbing: () => boolean
}

interface ScrubberProps {
  onSeek:       (frame: number) => void
  onScrubStart: () => void
  onScrubEnd:   () => void
  disabled:     boolean
  timecodeRef:  React.RefObject<HTMLSpanElement | null>
  frameRef:     React.RefObject<HTMLSpanElement | null>
  totalRef:     React.RefObject<HTMLSpanElement | null>
  handle:       React.RefObject<ScrubberHandle | null>
}

function DirectScrubber({
  onSeek, onScrubStart, onScrubEnd, disabled,
  timecodeRef, frameRef, totalRef, handle,
}: ScrubberProps) {
  const trackEl  = useRef<HTMLDivElement>(null)
  const fillEl   = useRef<HTMLDivElement>(null)
  const thumbEl  = useRef<HTMLDivElement>(null)

  // Lerp state — all mutable, never triggers React
  const targetPct  = useRef(0)   // where the WS says we are (0-100)
  const visualPct  = useRef(0)   // where the scrubber is drawn right now
  const maxFrame   = useRef(0)
  const fps        = useRef(0)
  const isDragging = useRef(false)
  const dragFrame  = useRef(0)
  const rafId      = useRef(0)

  // Lerp speed: how quickly the visual catches up to the target.
  // 0.18 feels smooth without overshooting at 30 fps.
  const LERP = 0.18

  const applyPct = (pct: number) => {
    const p = `${pct.toFixed(3)}%`
    if (fillEl.current)  fillEl.current.style.width = p
    if (thumbEl.current) thumbEl.current.style.left = p
  }

  // rAF loop — runs continuously while mounted
  useEffect(() => {
    const tick = () => {
      rafId.current = requestAnimationFrame(tick)
      if (isDragging.current) return  // user is dragging — don't lerp

      const diff = targetPct.current - visualPct.current
      if (Math.abs(diff) < 0.01) {
        // Close enough — snap and stop wasting cycles
        if (visualPct.current !== targetPct.current) {
          visualPct.current = targetPct.current
          applyPct(visualPct.current)
        }
        return
      }
      visualPct.current += diff * LERP
      applyPct(visualPct.current)
    }
    rafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId.current)
  }, [])

  // Expose imperative handle to parent
  useEffect(() => {
    handle.current = {
      setTarget(frame, max, f) {
        maxFrame.current = max
        fps.current = f
        targetPct.current = max > 0 ? Math.min(100, (frame / max) * 100) : 0

        // Update text nodes directly — no React
        if (timecodeRef.current) {
          timecodeRef.current.textContent = formatTimecode(frame, f)
        }
        if (frameRef.current) {
          frameRef.current.textContent = String(frame)
        }
        if (totalRef.current) {
          totalRef.current.textContent = `/ ${max}`
        }
      },
      getDragFrame: () => dragFrame.current,
      isScrubbing:  () => isDragging.current,
    }
  })

  // ── Pointer interaction ─────────────────────────────────────────────────

  const frameFromClientX = (clientX: number) => {
    const track = trackEl.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return Math.round(pct * maxFrame.current)
  }

  const applyDragFrame = (frame: number) => {
    dragFrame.current = frame
    const pct = maxFrame.current > 0 ? (frame / maxFrame.current) * 100 : 0
    visualPct.current = pct
    targetPct.current = pct
    applyPct(pct)
    if (timecodeRef.current) {
      timecodeRef.current.textContent = formatTimecode(frame, fps.current)
    }
    if (frameRef.current) {
      frameRef.current.textContent = String(frame)
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    isDragging.current = true
    onScrubStart()
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    applyDragFrame(frameFromClientX(e.clientX))
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || disabled) return
    applyDragFrame(frameFromClientX(e.clientX))
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return
    isDragging.current = false
    onScrubEnd()
    const frame = frameFromClientX(e.clientX)
    applyDragFrame(frame)
    onSeek(frame)
  }

  return (
    <div
      ref={trackEl}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      tabIndex={disabled ? -1 : 0}
      className={cn(
        'relative flex-1 min-w-0 h-5 flex items-center cursor-pointer group select-none',
        disabled && 'opacity-40 pointer-events-none',
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Track */}
      <div className="absolute inset-x-0 h-[3px] rounded-full bg-white/10" />
      {/* Fill */}
      <div
        ref={fillEl}
        className="absolute left-0 h-[3px] rounded-full bg-primary pointer-events-none"
        style={{ width: '0%' }}
      />
      {/* Thumb — visible on hover */}
      <div
        ref={thumbEl}
        className={cn(
          'absolute -translate-x-1/2 size-3 rounded-full bg-white shadow',
          'pointer-events-none',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-150',
        )}
        style={{ left: '0%' }}
      />
    </div>
  )
}

// ─── PlaybackBar ──────────────────────────────────────────────────────────────

export function PlaybackBar() {
  const { playback, control, setControl } = useAppStore()

  // Text node refs — updated directly, no React
  const timecodeRef = useRef<HTMLSpanElement>(null)
  const frameRef    = useRef<HTMLSpanElement>(null)
  const totalRef    = useRef<HTMLSpanElement>(null)
  const fpsSpanRef  = useRef<HTMLSpanElement>(null)

  // Scrubber imperative handle
  const scrubberHandle = useRef<ScrubberHandle>(null)

  // React state — only for things that change button layout
  const [isPlaying,   setIsPlaying]   = useState(playback.is_playing)
  const [isRecording, setIsRecording] = useState(playback.is_recording)
  const [hasMedia,    setHasMedia]    = useState(playback.file_type !== null)
  const [isVideo,     setIsVideo]     = useState(playback.file_type === 'video')
  const [isConnected, setIsConnected] = useState(playbackService.isConnected)

  const scrubbingRef = useRef(false)
  const lastSeekRef  = useRef(-1)

  // ── Wire to the playback service ──────────────────────────────────────────
  useEffect(() => {
    const unsubConn = playbackService.subscribeConnected(setIsConnected)

    const unsubRaw = playbackService.subscribeRaw((msg) => {
      // Push position to scrubber (lerp handles the animation)
      scrubberHandle.current?.setTarget(msg.current_frame, msg.max_frame, msg.fps)

      // Update fps text
      if (fpsSpanRef.current && msg.fps > 0) {
        fpsSpanRef.current.textContent = `${msg.fps.toFixed(1)} fps`
      }

      // React state — only flip when value actually changes
      setIsPlaying((p)   => p !== msg.is_playing   ? msg.is_playing   : p)
      setIsRecording((p) => p !== msg.is_recording ? msg.is_recording : p)
    })

    return () => {
      unsubConn()
      unsubRaw()
    }
  }, [])

  // Sync file_type from store (not in WS message)
  useEffect(() => {
    setHasMedia(playback.file_type !== null)
    setIsVideo(playback.file_type === 'video')
  }, [playback.file_type])

  // Seed initial state from store on mount
  useEffect(() => {
    scrubberHandle.current?.setTarget(
      playback.current_frame,
      playback.max_frame,
      playback.fps,
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handlePlayPause = useCallback(() => {
    if (isPlaying) api.stop()
    else           api.play()
  }, [isPlaying])

  const handleStep = useCallback((n: number) => {
    api.step(n)
  }, [])

  const handleSeek = useCallback((frame: number) => {
    if (frame === lastSeekRef.current) return
    lastSeekRef.current = frame
    api.seek(frame)
  }, [])

  const loopEnabled = !!(control.loop_enabled ?? playback.loop_enabled)

  const handleLoopToggle = useCallback(() => {
    const next = !loopEnabled
    setControl({ loop_enabled: next })
    if (next) api.enableLoop()
    else      api.disableLoop()
  }, [loopEnabled, setControl])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      // Floating pill — fixed, centered, above everything
      className={cn(
        'fixed bottom-5 left-1/2 -translate-x-1/2 z-50',
        'flex flex-col gap-1.5',
        'px-4 pt-2.5 pb-2',
        'rounded-2xl border border-white/10',
        'bg-black/70 backdrop-blur-md shadow-2xl',
        'w-[min(680px,calc(100vw-2rem))]',
        'select-none',
        !isConnected && 'opacity-40 pointer-events-none',
      )}
      aria-label="Playback controls"
    >
      {/* ── Scrubber row ── */}
      <div className="flex items-center gap-2">
        {/* Current timecode */}
        <span
          ref={timecodeRef}
          className="text-[10px] font-mono text-white/60 shrink-0 w-[52px] text-right tabular-nums"
        >
          00:00:00
        </span>

        {/* Scrubber */}
        <DirectScrubber
          handle={scrubberHandle}
          timecodeRef={timecodeRef}
          frameRef={frameRef}
          totalRef={totalRef}
          onSeek={handleSeek}
          onScrubStart={() => { scrubbingRef.current = true }}
          onScrubEnd={() => { scrubbingRef.current = false }}
          disabled={!isVideo}
        />

        {/* Total timecode */}
        <span className="text-[10px] font-mono text-white/40 shrink-0 w-[52px] tabular-nums">
          {/* populated by setTarget via totalRef */}
          / 0
        </span>
      </div>

      {/* ── Transport row ── */}
      <div className="flex items-center justify-between">
        {/* Left: frame counter + fps */}
        <div className="flex items-center gap-2 w-[120px]">
          <div className="flex items-center gap-1 text-[10px] font-mono text-white/40 tabular-nums">
            <span ref={frameRef}>0</span>
            <span ref={totalRef}>/ 0</span>
          </div>
          <span
            ref={fpsSpanRef}
            className="text-[10px] font-mono text-white/30 tabular-nums"
          />
        </div>

        {/* Center: transport buttons */}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="size-7 text-white/70 hover:text-white hover:bg-white/10"
                onClick={() => handleStep(-1)}
                disabled={!isVideo}
                aria-label="Step back 1 frame"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Step −1</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="size-7 text-white/70 hover:text-white hover:bg-white/10"
                onClick={() => handleStep(-30)}
                disabled={!isVideo}
                aria-label="Step back 30 frames"
              >
                <SkipBack className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Step −30</TooltipContent>
          </Tooltip>

          {/* Play / Pause — slightly larger */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="size-9 mx-1 text-white hover:bg-white/15 rounded-full"
                onClick={handlePlayPause}
                disabled={!hasMedia}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying
                  ? <Pause className="size-[18px] fill-current" />
                  : <Play  className="size-[18px] fill-current" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{isPlaying ? 'Pause' : 'Play'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="size-7 text-white/70 hover:text-white hover:bg-white/10"
                onClick={() => handleStep(30)}
                disabled={!isVideo}
                aria-label="Step forward 30 frames"
              >
                <SkipForward className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Step +30</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className="size-7 text-white/70 hover:text-white hover:bg-white/10"
                onClick={() => handleStep(1)}
                disabled={!isVideo}
                aria-label="Step forward 1 frame"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Step +1</TooltipContent>
          </Tooltip>
        </div>

        {/* Right: loop + recording */}
        <div className="flex items-center gap-1 w-[120px] justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                className={cn(
                  'size-7',
                  loopEnabled
                    ? 'text-primary bg-primary/20 hover:bg-primary/30'
                    : 'text-white/50 hover:text-white hover:bg-white/10',
                )}
                onClick={handleLoopToggle}
                disabled={!isVideo}
                aria-pressed={loopEnabled}
                aria-label="Toggle loop"
              >
                <Repeat className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Loop {loopEnabled ? '(on)' : '(off)'}</TooltipContent>
          </Tooltip>

          {isRecording && (
            <span className="flex items-center gap-1 text-[10px] text-red-400 font-medium">
              <Circle className="size-2 fill-current animate-pulse" />
              REC
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
