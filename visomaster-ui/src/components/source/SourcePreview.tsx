import { useState, useRef, useEffect, useCallback } from 'react'
import { RotateCcw, RotateCw, FlipHorizontal, FlipVertical, Play, Square, ChevronFirst, ChevronLast, ChevronsLeft, ChevronsRight, Repeat, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/appStore'
import { api } from '@/api/client'
import { useEvents } from '@/hooks/useEvents'
import { usePreviewStream } from '@/hooks/usePreviewStream'

// ── Smooth progress hook ──────────────────────────────────────────────────────
//
// Interpolates the slider position between WS frame updates using rAF so the
// thumb moves smoothly at display refresh rate instead of jumping per-event.
// Writes the interpolated value directly to a CSS custom property on the track
// element — zero React re-renders per frame.

function useSmoothProgress(
  currentFrame: number,
  maxFrame: number,
  fps: number,
  isPlaying: boolean,
) {
  const trackRef = useRef<HTMLDivElement>(null)

  // Refs updated synchronously from props — no stale closure issues
  const stateRef = useRef({ currentFrame, maxFrame, fps, isPlaying })
  useEffect(() => {
    stateRef.current = { currentFrame, maxFrame, fps, isPlaying }
  })

  // Anchor: the last confirmed frame + the wall-clock time it arrived
  const anchorRef = useRef({ frame: currentFrame, time: performance.now() })
  useEffect(() => {
    anchorRef.current = { frame: currentFrame, time: performance.now() }
  }, [currentFrame])

  // rAF loop — runs only while mounted, writes CSS var directly
  useEffect(() => {
    let rafId: number

    const tick = () => {
      rafId = requestAnimationFrame(tick)
      const track = trackRef.current
      if (!track) return

      const { currentFrame, maxFrame, fps, isPlaying } = stateRef.current
      if (maxFrame <= 0) return

      let displayFrame: number
      if (isPlaying && fps > 0) {
        // Extrapolate forward from the last confirmed frame
        const elapsed = (performance.now() - anchorRef.current.time) / 1000
        displayFrame = Math.min(anchorRef.current.frame + elapsed * fps, maxFrame)
      } else {
        displayFrame = currentFrame
      }

      const pct = (displayFrame / maxFrame) * 100
      track.style.setProperty('--progress', `${pct}%`)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, []) // intentionally empty — stateRef/anchorRef are always current

  return trackRef
}

export function SourcePreview() {
  const { sourceType, playback, setPlayback, markers, mediaList, selectedMediaId, externalPreview } = useAppStore()
  const { send } = useEvents()
  const { canvasRef, isConnected: previewConnected, previewFps } = usePreviewStream(85)

  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)

  // Drag state — while dragging we show the local value, not the interpolated one
  const [dragValue, setDragValue] = useState<number | null>(null)
  const isDragging = useRef(false)

  // Attach useSmoothProgress to the outer playback container so --progress
  // is set on a single ancestor and both seeker fill divs inherit it via
  // the same CSS custom property.
  const trackRef = useSmoothProgress(
    playback.current_frame,
    playback.max_frame,
    playback.fps,
    playback.is_playing && !isDragging.current,
  )

  const applyTransform = (r: number, h: boolean, v: boolean) => {
    try { api.setTransform(r, h, v) } catch { /* ignore */ }
  }

  const rotateCCW = () => { const r = (rotation - 90 + 360) % 360; setRotation(r); applyTransform(r, flipH, flipV) }
  const rotateCW  = () => { const r = (rotation + 90) % 360;       setRotation(r); applyTransform(r, flipH, flipV) }
  const toggleH   = () => { const h = !flipH; setFlipH(h); applyTransform(rotation, h, flipV) }
  const toggleV   = () => { const v = !flipV; setFlipV(v); applyTransform(rotation, flipH, v) }

  const selectedMedia = selectedMediaId ? mediaList.find(m => m.media_id === selectedMediaId) : null
  const isVideo = selectedMedia?.file_type === 'video' && sourceType === 'media'

  // The Slider value: drag position while dragging, confirmed frame otherwise
  const sliderValue = isDragging.current && dragValue !== null
    ? dragValue
    : playback.current_frame

  const handleSeekStart = useCallback(() => {
    isDragging.current = true
    setDragValue(playback.current_frame)
  }, [playback.current_frame])

  const handleSeekChange = useCallback((value: number[]) => {
    setDragValue(value[0])
  }, [])

  const handleSeekCommit = useCallback((value: number[]) => {
    isDragging.current = false
    setDragValue(null)
    send('seek', { frame: value[0] })
  }, [send])

  const handleToggleLoop = async () => {
    const next = !playback.loop_enabled
    setPlayback({ loop_enabled: next })
    try {
      if (next) { await api.enableLoop() } else { await api.disableLoop() }
    } catch {
      setPlayback({ loop_enabled: !next })
    }
  }

  return (
    <div className="shrink-0 flex flex-col bg-background border-b">
      {/* Preview canvas — replaced by placeholder when external window is open */}
      {externalPreview ? (
        <div className="relative bg-black aspect-video flex flex-col items-center justify-center gap-3">
          <ExternalLink className="size-5 text-muted-foreground opacity-40" />
          <span className="text-xs text-muted-foreground opacity-50">Preview in external window</span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-7 mt-1"
            onClick={() => send('open_preview_window', {})}
          >
            <ExternalLink className="size-3" />
            Relaunch window
          </Button>
        </div>
      ) : (
        <div className="relative bg-black">
          <canvas
            ref={canvasRef}
            className="w-full aspect-video object-contain"
            aria-label="Source preview"
          />
          {!previewConnected && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
              No source
            </div>
          )}
          {previewFps > 0 && (
            <Badge variant="outline" className="absolute top-1.5 right-1.5 text-xs tabular-nums bg-black/50 text-white border-white/20">
              {previewFps} fps
            </Badge>
          )}
          {playback.is_playing && (
            <Badge className="absolute top-1.5 left-1.5 text-xs">▶ Live</Badge>
          )}
        </div>
      )}

      {/* Transform — always visible */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-t">
        <span className="text-[10px] text-muted-foreground mr-0.5">Transform</span>
        <Button variant="outline" size="icon" className="size-6" onClick={rotateCCW}>
          <RotateCcw className="size-3" />
        </Button>
        <Button variant="outline" size="icon" className="size-6" onClick={rotateCW}>
          <RotateCw className="size-3" />
        </Button>
        <span className="text-[10px] text-muted-foreground w-7 text-center">{rotation}°</span>
        <Button variant={flipH ? 'default' : 'outline'} size="icon" className="size-6" onClick={toggleH}>
          <FlipHorizontal className="size-3" />
        </Button>
        <Button variant={flipV ? 'default' : 'outline'} size="icon" className="size-6" onClick={toggleV}>
          <FlipVertical className="size-3" />
        </Button>
      </div>

      {/* Playback controls — only when a video is selected and not using external preview */}
      {isVideo && !externalPreview && (
        <div ref={trackRef} className="border-t bg-card/50 rounded-b-lg mx-1 mb-1 shadow-sm">
          {/* Top seeker — slim accent bar */}
          <div className="relative px-2 pt-2">
            <div
              className="absolute inset-y-0 left-2 right-2 flex items-center pointer-events-none"
              aria-hidden
            >
              <div className="relative w-full h-1 rounded-full bg-accent/30 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-accent rounded-full transition-none"
                  style={{ width: 'var(--progress, 0%)' }}
                />
              </div>
            </div>
            <Slider
              min={0}
              max={playback.max_frame || 1}
              value={[sliderValue]}
              onPointerDown={handleSeekStart}
              onValueChange={handleSeekChange}
              onValueCommit={handleSeekCommit}
              className="w-full [&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-range]]:bg-transparent"
            />
            {markers.map(m => (
              <div
                key={m}
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-amber-400 pointer-events-none"
                style={{ left: `calc(${(m / (playback.max_frame || 1)) * 100}% + 8px)` }}
              />
            ))}
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-center gap-0.5 px-2 py-1">
            {/* Jump to start */}
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7"
                onClick={() => send('seek', { frame: 0 })}>
                <ChevronFirst className="size-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>Jump to start</TooltipContent></Tooltip>

            {/* -30 frames */}
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7"
                onClick={() => send('step', { n: -30 })}>
                <ChevronsLeft className="size-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>−30 frames</TooltipContent></Tooltip>

            {/* Play / Stop */}
            <Button
              variant={playback.is_playing ? 'default' : 'secondary'}
              size="icon" className="size-8 rounded-full"
              onClick={() => send(playback.is_playing ? 'stop' : 'play')}
            >
              {playback.is_playing
                ? <Square className="size-3 fill-current" />
                : <Play className="size-3 fill-current" />}
            </Button>

            {/* +30 frames */}
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7"
                onClick={() => send('step', { n: 30 })}>
                <ChevronsRight className="size-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>+30 frames</TooltipContent></Tooltip>

            {/* Jump to end */}
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7"
                onClick={() => send('seek', { frame: playback.max_frame })}>
                <ChevronLast className="size-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>Jump to end</TooltipContent></Tooltip>

            {/* Loop toggle */}
            <Tooltip><TooltipTrigger asChild>
              <Button
                variant={playback.loop_enabled ? 'default' : 'ghost'}
                size="icon" className="size-7 ml-1"
                onClick={handleToggleLoop}
                aria-pressed={playback.loop_enabled}
              >
                <Repeat className="size-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>Loop {playback.loop_enabled ? '(on)' : '(off)'}</TooltipContent></Tooltip>
          </div>

          {/* Bottom seeker + frame labels */}
          <div className="px-2 pb-2 flex flex-col gap-1">
            <div className="relative px-1">
              <div
                className="absolute inset-y-0 left-1 right-1 flex items-center pointer-events-none"
                aria-hidden
              >
                <div className="relative w-full h-1 rounded-full bg-accent/30 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-accent rounded-full transition-none"
                    style={{ width: 'var(--progress, 0%)' }}
                  />
                </div>
              </div>
              <Slider
                min={0}
                max={playback.max_frame || 1}
                value={[sliderValue]}
                onPointerDown={handleSeekStart}
                onValueChange={handleSeekChange}
                onValueCommit={handleSeekCommit}
                className="w-full [&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-range]]:bg-transparent"
              />
              {markers.map(m => (
                <div
                  key={m}
                  className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-amber-400 pointer-events-none"
                  style={{ left: `calc(${(m / (playback.max_frame || 1)) * 100}% + 4px)` }}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1 select-none">
              <span>{isDragging.current && dragValue !== null ? dragValue : sliderValue}</span>
              <span>{playback.max_frame}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
