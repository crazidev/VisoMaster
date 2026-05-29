// transport/channel.ts
// QWebChannel adapter — used when running inside QWebEngineView (Qt desktop).

import type { AppTransport, TransportEvent, PlaybackState, StateSnapshot, MediaItem, FaceCard, Webcam, WebRTCUrls } from './types'

// Qt injects this global at runtime
declare global {
  interface Window {
    qt?: { webChannelTransport: unknown }
    QWebChannel: new (
      transport: unknown,
      callback: (channel: { objects: Record<string, QtBackend> }) => void
    ) => void
  }
}

interface QtBackend {
  [method: string]: ((...args: unknown[]) => void) & {
    connect?: (fn: (...args: unknown[]) => void) => void
  }
}

export class ChannelTransport implements AppTransport {
  private _b!: QtBackend
  private _handlers = new Map<TransportEvent, Set<(p: unknown) => void>>()

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.qt?.webChannelTransport) {
        reject(new Error('No QWebChannel transport available'))
        return
      }
      console.log('[channel:init] QWebChannel transport found — connecting...')
      new window.QWebChannel(window.qt.webChannelTransport, (ch) => {
        this._b = ch.objects.backend as QtBackend
        console.log('[channel:init] backend object acquired, slots available:',
          Object.keys(this._b).filter(k => typeof (this._b as Record<string,unknown>)[k] === 'function'))

        const signalMap: Array<[string, TransportEvent]> = [
          ['playbackStateChanged', 'playback_state'],
          ['framePositionChanged', 'frame_position'],
          ['gpuMemoryChanged',     'gpu_memory'],
          ['stateUpdated',         'state_updated'],
          ['fpsUpdated',           'fps_update'],
          ['recordingFinished',    'recording_finished'],
          ['workspaceLoaded',      'workspace_loaded'],
          ['virtcamStateChanged',  'virtcam_state'],
          ['errorOccurred',        'error'],
          ['previewWindowOpened',  'preview_window_opened'],
          ['previewWindowClosed',  'preview_window_closed'],
        ]
        for (const [signal, event] of signalMap) {
          if (this._b[signal]?.connect) {
            this._b[signal]?.connect?.((json: unknown) => {
              try {
                const parsed = typeof json === 'string' ? JSON.parse(json) : json
                console.debug(`[channel:signal] ${signal} →`, parsed)
                this._emit(event, parsed)
              } catch (e) { console.warn(`[channel:signal] ${signal} parse error:`, e, json) }
            })
            console.log(`[channel:init] signal '${signal}' → event '${event}' connected`)
          } else {
            console.warn(`[channel:init] signal '${signal}' NOT found on backend`)
          }
        }

        this._b['modelLoading']?.connect?.(() => { console.debug('[channel:signal] modelLoading'); this._emit('model_loading', {}) })
        this._b['modelLoaded']?.connect?.(() => { console.debug('[channel:signal] modelLoaded'); this._emit('model_loaded', {}) })

        console.log('[channel:init] all signals wired — bridge ready')
        resolve()
      })
    })
  }

  private _emit(event: TransportEvent, payload: unknown) {
    this._handlers.get(event)?.forEach(fn => fn(payload))
  }

  on(event: TransportEvent, handler: (p: unknown) => void) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set())
    this._handlers.get(event)!.add(handler)
    return () => this._handlers.get(event)?.delete(handler)
  }

  // Wrap callback-based Qt slots into Promises
  private _call<T>(method: string, ...args: unknown[]): Promise<T> {
    console.debug(`[channel:_call] → ${method}`, args.length ? args.slice(0, -1) : '(no args)')
    return new Promise((resolve, reject) => {
      try {
        ;(this._b[method] as (...a: unknown[]) => void)(
          ...args,
          (result: string) => {
            let parsed: T
            try {
              parsed = JSON.parse(result) as T
            } catch {
              const msg = `[channel:_call] ${method} — invalid JSON: ${result.slice(0, 200)}`
              console.error(msg)
              reject(new Error(msg))
              return
            }
            const r = parsed as Record<string, unknown>
            if (r && typeof r === 'object' && r['error']) {
              const msg = `[Qt:${method}] ${String(r['error'])}`
              const stack = r['traceback'] ? String(r['traceback']) : undefined
              console.error(msg, stack ?? '')
              import('@/components/shared/DebugOverlay').then(({ pushDebugError }) => {
                pushDebugError({ level: 'error', message: msg, stack })
              }).catch(() => {})
            } else {
              console.debug(`[channel:_call] ← ${method}`, parsed)
            }
            resolve(parsed)
          }
        )
      } catch (e) {
        console.error(`[channel:_call] ${method} threw synchronously:`, e)
        reject(e)
      }
    })
  }

  private _send(method: string, ...args: unknown[]) {
    console.debug(`[channel:_send] → ${method}`, args)
    ;(this._b[method] as (...a: unknown[]) => void)(...args)
  }

  // ── Playback ────────────────────────────────────────────────────────────
  play()              { console.debug('[channel] play()'); this._send('play') }
  stop()              { console.debug('[channel] stop()'); this._send('stop') }
  seek(frame: number) { console.debug(`[channel] seek(${frame})`); this._send('seek', frame) }
  step(n: number)     { console.debug(`[channel] step(${n})`); this._send('step', n) }
  getPlayback()       { return this._call<PlaybackState>('getPlayback') }

  // ── State ───────────────────────────────────────────────────────────────
  getState()          { return this._call<StateSnapshot>('getState') }

  setControl(name: string, value: unknown) {
    this._send('setControl', name, JSON.stringify(value))
  }
  setParameter(faceId: string, name: string, value: unknown) {
    this._send('setParameter', faceId, name, JSON.stringify(value))
  }

  // ── Folder browser — delegate to HTTP since the backend is always running ──
  browseFolder(path = '', showFiles = false) {
    const params = new URLSearchParams({ path, show_files: String(showFiles) })
    return fetch(`/api/system/browse-folder?${params}`)
      .then(r => r.json()) as Promise<import('./types').BrowseFolderResult>
  }
  getQuickFolders() {
    return fetch('/api/system/quick-folders')
      .then(r => r.json()) as Promise<{ folders: import('./types').QuickFolder[] }>
  }

  // ── Media ───────────────────────────────────────────────────────────────
  pickFolder()             { return this._call<string>('pickFolder') }
  pickFolderAt(initialDir: string) { return this._call<string>('pickFolderAt', initialDir) }
  scanFolder(path: string, recursive = false) {
    return this._call<{ items: MediaItem[] }>('scanFolder', path, recursive)
  }
  selectMedia(id: string)  { return this._call<unknown>('selectMedia', id) }
  deleteMedia(id: string)  { this._send('deleteMedia', id) }

  // ── Faces ───────────────────────────────────────────────────────────────
  findFaces()              { return this._call<{ found: number; faces: FaceCard[] }>('findFaces') }
  clearFaces()             { this._send('clearFaces') }
  selectFace(id: string)   { this._send('selectFace', id) }
  assignInput(fid: string, iid: string) { this._send('assignInput', fid, iid) }
  unassignInput(fid: string, iid: string) { this._send('unassignInput', fid, iid) }
  scanInputFolder(path: string, r = false) {
    return this._call<{ items: Array<{ face_id: string; media_path: string; thumbnail_url: string }> }>(
      'scanInputFolder', path, r
    )
  }

  // ── Embeddings ──────────────────────────────────────────────────────────
  mergeEmbeddings(name: string, ids: string[]) {
    return this._call<void>('mergeEmbeddings', name, JSON.stringify(ids))
  }
  deleteEmbedding(id: string) { this._send('deleteEmbedding', id) }

  // ── Recording ───────────────────────────────────────────────────────────
  recordStart(folder = '') { return this._call<void>('recordStart', folder) }
  recordStop()             { return this._call<{ output_path: string }>('recordStop') }
  saveFrame()              { return this._call<{ output_path: string }>('saveFrame') }

  // ── File actions ─────────────────────────────────────────────────────────
  openFile(path: string)       { return this._call<void>('openFile', path) }
  revealInFolder(path: string) { return this._call<void>('revealInFolder', path) }

  // ── Markers ─────────────────────────────────────────────────────────────
  addMarker()              { this._send('addMarker') }
  deleteMarker(f: number)  { this._send('deleteMarker', f) }

  // ── Sources ─────────────────────────────────────────────────────────────
  getWebcams()             { return this._call<{ webcams: Webcam[] }>('getWebcams') }
  selectWebcam(i: number)  { this._send('selectWebcam', i) }
  startWebrtc()            { return this._call<WebRTCUrls>('startWebrtc') }
  stopWebrtc()             { this._send('stopWebrtc') }
  setTransform(r: number, h: boolean, v: boolean) { this._send('setTransform', r, h, v) }

  // ── UDP input / output (Qt bridge) ──────────────────────────────────────
  startUdpInput(opts: Record<string, unknown>) {
    return this._call<{ ok: boolean; url: string; port: number; width: number; height: number; fps: number }>(
      'startUdpInput', JSON.stringify(opts)
    )
  }
  stopUdpInput()  { return this._call<{ ok: boolean; message: string }>('stopUdpInput') }
  startUdpOutput(opts: Record<string, unknown>) {
    return this._call<{ ok: boolean; url: string }>('startUdpOutput', JSON.stringify(opts))
  }
  stopUdpOutput() { return this._call<{ ok: boolean; message: string }>('stopUdpOutput') }

  // ── WebSocket output (Qt bridge) ─────────────────────────────────────────
  startWsOutput(opts: Record<string, unknown>) {
    return this._call<{ ok: boolean; url: string }>('startWsOutput', JSON.stringify(opts))
  }
  stopWsOutput() { return this._call<{ ok: boolean; message: string }>('stopWsOutput') }

  // ── System ──────────────────────────────────────────────────────────────
  setProvider(p: string)   { this._send('setProvider', p) }
  clearMemory()            { this._send('clearMemory') }
  getGpuMemory()           { return this._call<{ used_mb: number; total_mb: number }>('getGpuMemory') }

  // ── Model management (Qt bridge) ────────────────────────────────────────
  getLoadedModels()        { return this._call<{ models: Array<{ name: string; store: string; device: string; vram_mb: number }> }>('getLoadedModels') }
  unloadModel(name: string){ return this._call<{ ok: boolean; message?: string; error?: string }>('unloadModel', name) }

  // ── Preview window (Qt only) ────────────────────────────────────────────
  togglePreviewWindow()    { return this._call<{ ok: boolean; open?: boolean }>('togglePreviewWindow') }

  // ── Workspace ───────────────────────────────────────────────────────────
  saveWorkspace(_f = 'last_workspace.json') { return this._call<void>('saveWorkspace') }
  loadWorkspace(f: string) { return this._call<void>('loadWorkspace', f) }
  resetWorkspace()         { return this._call<void>('resetWorkspace') }

  // ── Thumbnails ──────────────────────────────────────────────────────────
  // Qt mode: fetch base64 synchronously via a slot call.
  // We return a placeholder and let components call getThumbnail() separately.
  thumbnailUrl(_type: 'face' | 'input' | 'media', _id: string): string {
    return '' // components should use getThumbnailAsync() instead
  }

  getThumbnailAsync(type: 'face' | 'input' | 'media', id: string): Promise<string> {
    return this._call<string>('getThumbnail', type, id)
  }
}
