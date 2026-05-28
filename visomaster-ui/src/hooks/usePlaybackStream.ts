/**
 * usePlaybackStream / playbackService
 *
 * Dedicated WebSocket connection to /ws/playback — a latest-wins push channel
 * that carries only { current_frame, max_frame, is_playing, fps, is_recording }.
 *
 * Why a separate channel?
 *   /ws/events is a general-purpose JSON queue shared by control messages,
 *   state updates, errors, etc.  At 30 fps, frame_position events flood that
 *   queue and cause the seeker/playback bar to glitch.
 *
 *   /ws/playback uses the same latest-frame-wins asyncio.Event pattern as
 *   /ws/preview: the backend stores only the most recent state and wakes
 *   senders — bursts of 30 updates/sec collapse into one delivery per
 *   event-loop tick, with zero queue buildup.
 *
 * Performance design:
 *   PlaybackBar subscribes via `subscribeRaw` and writes directly to DOM
 *   element styles — zero React re-renders per frame.  Only button state
 *   (is_playing, is_recording) triggers React re-renders, and only when
 *   those values actually change.
 *
 * The hook (`usePlaybackStream`) is kept for components that need reactive
 * state (e.g. the existing OutputPanel recording indicator).
 */

import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store/appStore'

const WS_URL = 'ws://localhost:8000/ws/playback'
const RECONNECT_DELAY_MS = 2000

export interface PlaybackMsg {
  current_frame: number
  max_frame: number
  is_playing: boolean
  fps: number
  is_recording: boolean
}

// ─── Singleton service ────────────────────────────────────────────────────────

class PlaybackStreamService {
  private ws: WebSocket | null = null
  private _destroyed = false

  private _isConnected = false
  private connectedListeners = new Set<(v: boolean) => void>()

  // Raw subscribers — called synchronously on every message, no React involved
  private rawListeners = new Set<(msg: PlaybackMsg) => void>()

  // Zustand store updater — injected once on first hook mount
  private storeUpdater: ((p: Partial<PlaybackMsg>) => void) | null = null

  private _state: PlaybackMsg = {
    current_frame: 0,
    max_frame: 0,
    is_playing: false,
    fps: 0,
    is_recording: false,
  }

  constructor() {
    this.connect()
  }

  setStoreUpdater(fn: (p: Partial<PlaybackMsg>) => void) {
    this.storeUpdater = fn
  }

  // ── Connection ──────────────────────────────────────────────────────────

  private connect() {
    if (this._destroyed) return
    this.ws = new WebSocket(WS_URL)

    this.ws.onopen = () => {
      this.setConnected(true)
      // Request an immediate snapshot so the bar shows current state on connect
      this.ws?.send('sync')
    }

    this.ws.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as PlaybackMsg
        this._state = msg

        // 1. Notify raw (direct-DOM) subscribers synchronously — no React
        this.rawListeners.forEach((fn) => fn(msg))

        // 2. Update Zustand store (batched by React, only triggers re-renders
        //    in components that actually read the changed fields)
        this.storeUpdater?.({
          current_frame: msg.current_frame,
          max_frame:     msg.max_frame,
          is_playing:    msg.is_playing,
          fps:           msg.fps,
          is_recording:  msg.is_recording,
        })
      } catch {
        // ignore malformed messages
      }
    }

    this.ws.onclose = (e) => {
      console.warn(`[PlaybackStream] WebSocket closed (code=${e.code})`)
      this.setConnected(false)
      if (!this._destroyed) {
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

  // ── Subscriptions ───────────────────────────────────────────────────────

  /** Subscribe to connection state changes (React-friendly). */
  subscribeConnected(fn: (v: boolean) => void): () => void {
    this.connectedListeners.add(fn)
    fn(this._isConnected)
    return () => this.connectedListeners.delete(fn)
  }

  /**
   * Subscribe to raw playback messages — called synchronously on every
   * incoming message, before any React state update.  Use this for direct
   * DOM manipulation (e.g. scrubber position) to avoid re-render overhead.
   */
  subscribeRaw(fn: (msg: PlaybackMsg) => void): () => void {
    this.rawListeners.add(fn)
    fn(this._state) // fire immediately with current state
    return () => this.rawListeners.delete(fn)
  }

  get isConnected() { return this._isConnected }
  get state() { return this._state }
}

// Module-level singleton — created once, shared by all consumers
export const playbackService = new PlaybackStreamService()

// ─── React hook (for components that need reactive state) ─────────────────────

export function usePlaybackStream() {
  const setPlayback = useAppStore((s) => s.setPlayback)
  const [isConnected, setIsConnected] = useState(playbackService.isConnected)
  const [state, setState] = useState<PlaybackMsg>(playbackService.state)

  // Wire the store updater once
  const wiredRef = useRef(false)
  if (!wiredRef.current) {
    playbackService.setStoreUpdater(setPlayback)
    wiredRef.current = true
  }

  useEffect(() => {
    return playbackService.subscribeConnected(setIsConnected)
  }, [])

  useEffect(() => {
    return playbackService.subscribeRaw(setState)
  }, [])

  return {
    currentFrame: state.current_frame,
    maxFrame:     state.max_frame,
    isPlaying:    state.is_playing,
    fps:          state.fps,
    isRecording:  state.is_recording,
    isConnected,
  }
}
