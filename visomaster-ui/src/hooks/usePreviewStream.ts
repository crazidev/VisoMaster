/**
 * Shared singleton preview stream.
 *
 * Problem: multiple components (SourcePreview, OutputPanel) each used to open
 * their own WebSocket to /ws/preview. The backend encoded + sent the JPEG
 * twice, the browser decoded it twice — halving effective FPS.
 *
 * Solution: one WebSocket, one decode pipeline, N canvases.
 *
 * Architecture:
 *   PreviewStreamService  — module-level singleton
 *     • Owns the single WebSocket connection
 *     • Decodes each incoming JPEG with createImageBitmap (off main thread)
 *     • Stores the latest ImageBitmap in a slot
 *     • Runs one shared requestAnimationFrame loop that paints all registered
 *       canvases and updates the shared FPS counter
 *
 *   usePreviewStream(quality?)  — React hook
 *     • Registers a canvas ref with the service on mount, unregisters on unmount
 *     • Returns { canvasRef, isConnected, previewFps }
 *     • Re-renders only when isConnected or previewFps changes — never on frames
 */

import { useEffect, useRef, useState } from 'react'

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

  constructor() {
    this.connect()
    this.startPaintLoop()
  }

  // ── Connection ──────────────────────────────────────────────────────────

  private connect() {
    if (this._destroyed) return
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
          // Replace any pending bitmap that hasn't been painted yet
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
      if (!this._destroyed) {
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS)
      }
    }

    this.ws.onerror = (e) => {
      console.error('[PreviewStream] WebSocket error:', e)
      // onclose fires automatically after onerror — don't close manually
      // to avoid triggering a double reconnect timer.
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
    fn(this._isConnected) // fire immediately with current state
    return () => this.connectedListeners.delete(fn)
  }

  subscribeFps(fn: (v: number) => void): () => void {
    this.fpsListeners.add(fn)
    fn(this._fps)
    return () => this.fpsListeners.delete(fn)
  }

  get isConnected() { return this._isConnected }
  get fps() { return this._fps }
}

// Module-level singleton — created once, shared by all hook instances
const service = new PreviewStreamService()

// ─── React hook ───────────────────────────────────────────────────────────────

/**
 * Attach a canvas to the shared preview stream.
 *
 * @param quality  JPEG quality sent to the server (1-100, default 85)
 * @returns { canvasRef, isConnected, previewFps }
 */
export function usePreviewStream(quality = 85) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isConnected, setIsConnected] = useState(service.isConnected)
  const [previewFps, setPreviewFps] = useState(service.fps)

  // Update quality on the shared service whenever it changes
  useEffect(() => {
    service.setQuality(quality)
  }, [quality])

  // Register / unregister this canvas with the shared paint loop.
  // No dependency array — re-runs every render so the ref is always current.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    service.registerCanvas(canvas)
    return () => service.unregisterCanvas(canvas)
  })

  // Subscribe to connection state changes
  useEffect(() => {
    return service.subscribeConnected(setIsConnected)
  }, [])

  // Subscribe to FPS updates
  useEffect(() => {
    return service.subscribeFps(setPreviewFps)
  }, [])

  return { canvasRef, isConnected, previewFps }
}
