/**
 * Shared singleton preview stream.
 *
 * In Qt WebEngine mode (QWebChannel), frames arrive via the bridge's
 * framePositionChanged signal — no WebSocket needed. The service detects
 * the runtime and skips the WebSocket connection entirely.
 *
 * In HTTP/headless mode, a single WebSocket to /ws/preview is shared by
 * all canvases to avoid double-encoding on the backend.
 */

import { useEffect, useRef, useState } from 'react'
import { isDesktop } from '@/transport'

// ─── Singleton service ────────────────────────────────────────────────────────

const WS_URL = 'ws://localhost:8000/ws/preview'
const RECONNECT_DELAY_MS = 2000

class PreviewStreamService {
  private ws: WebSocket | null = null
  private _destroyed = false

  // Latest decoded frame waiting to be painted on the next rAF tick
  private pendingBitmap: ImageBitmap | null = null

  // All canvases currently registered
  private canvases = new Set<HTMLCanvasElement>()

  // Connection state listeners
  private connectedListeners = new Set<(v: boolean) => void>()
  private _isConnected = false

  // FPS tracking
  private fpsListeners = new Set<(v: number) => void>()
  private _fps = 0
  private fpsFrameCount = 0
  private fpsLastTime = performance.now()

  // Current quality setting (sent to server on connect / change)
  private quality = 85

  // Whether we're in Qt desktop mode (no WebSocket needed)
  private readonly _isQtMode: boolean

  constructor() {
    this._isQtMode = isDesktop
    if (!this._isQtMode) {
      this.connect()
    }
    this.startPaintLoop()
  }

  // ── Connection ──────────────────────────────────────────────────────────

  private connect() {
    if (this._destroyed || this._isQtMode) return
    this.ws = new WebSocket(WS_URL)
    this.ws.binaryType = 'arraybuffer'

    this.ws.onopen = () => {
      this.setConnected(true)
      this.sendQuality()
    }

    this.ws.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (!(e.data instanceof ArrayBuffer)) return
      const blob = new Blob([e.data], { type: 'image/jpeg' })
      createImageBitmap(blob)
        .then((bitmap) => {
          this.pendingBitmap?.close()
          this.pendingBitmap = bitmap
        })
        .catch((err) => {
          console.warn('[PreviewStream] createImageBitmap failed:', err)
        })
    }

    this.ws.onclose = (e) => {
      console.warn(`[PreviewStream] WebSocket closed (code=${e.code}, reason="${e.reason}")`)
      this.setConnected(false)
      if (!this._destroyed && !this._isQtMode) {
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS)
      }
    }

    this.ws.onerror = () => {
      // onclose fires automatically after onerror
    }
  }

  private setConnected(v: boolean) {
    if (this._isConnected === v) return
    this._isConnected = v
    this.connectedListeners.forEach((fn) => fn(v))
  }

  private sendQuality() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ quality: this.quality }))
    }
  }

  setQuality(q: number) {
    this.quality = q
    this.sendQuality()
  }

  /**
   * Push a frame from the Qt bridge (called when a JPEG data URI or raw
   * ArrayBuffer arrives via QWebChannel). In Qt mode this is the only
   * frame delivery path.
   */
  pushQtFrame(data: ArrayBuffer | Blob) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'image/jpeg' })
    createImageBitmap(blob)
      .then((bitmap) => {
        this.pendingBitmap?.close()
        this.pendingBitmap = bitmap
        // Mark as connected once we receive the first frame
        this.setConnected(true)
      })
      .catch((err) => {
        console.warn('[PreviewStream] Qt frame decode failed:', err)
      })
  }

  // ── Paint loop ──────────────────────────────────────────────────────────

  private startPaintLoop() {
    const paint = () => {
      requestAnimationFrame(paint)

      const bitmap = this.pendingBitmap
      if (!bitmap || this.canvases.size === 0) return
      this.pendingBitmap = null

      for (const canvas of this.canvases) {
        if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
          canvas.width = bitmap.width
          canvas.height = bitmap.height
        }
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
      }
      bitmap.close()

      // FPS counter — update listeners once per second
      this.fpsFrameCount++
      const now = performance.now()
      const elapsed = now - this.fpsLastTime
      if (elapsed >= 1000) {
        this._fps = Math.round((this.fpsFrameCount * 1000) / elapsed)
        this.fpsFrameCount = 0
        this.fpsLastTime = now
        this.fpsListeners.forEach((fn) => fn(this._fps))
      }
    }
    requestAnimationFrame(paint)
  }

  // ── Canvas registration ─────────────────────────────────────────────────

  registerCanvas(canvas: HTMLCanvasElement) {
    this.canvases.add(canvas)
  }

  unregisterCanvas(canvas: HTMLCanvasElement) {
    this.canvases.delete(canvas)
  }

  // ── State subscriptions ─────────────────────────────────────────────────

  subscribeConnected(fn: (v: boolean) => void): () => void {
    this.connectedListeners.add(fn)
    fn(this._isConnected)
    return () => this.connectedListeners.delete(fn)
  }

  subscribeFps(fn: (v: number) => void): () => void {
    this.fpsListeners.add(fn)
    fn(this._fps)
    return () => this.fpsListeners.delete(fn)
  }

  get isConnected() { return this._isConnected }
  get fps() { return this._fps }
  get isQtMode() { return this._isQtMode }
}

// Module-level singleton — created once, shared by all hook instances
const service = new PreviewStreamService()

// ─── React hook ───────────────────────────────────────────────────────────────

export function usePreviewStream(quality = 85) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isConnected, setIsConnected] = useState(service.isConnected)
  const [previewFps, setPreviewFps] = useState(service.fps)

  useEffect(() => {
    service.setQuality(quality)
  }, [quality])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    service.registerCanvas(canvas)
    return () => service.unregisterCanvas(canvas)
  })

  useEffect(() => {
    return service.subscribeConnected(setIsConnected)
  }, [])

  useEffect(() => {
    return service.subscribeFps(setPreviewFps)
  }, [])

  return { canvasRef, isConnected, previewFps }
}

// Export service for Qt bridge to push frames into
export { service as previewStreamService }
