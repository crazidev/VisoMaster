// transport/http.ts
// HTTP + WebSocket adapter — used when running in a browser (headless/RunPod mode).
// Wraps the existing FastAPI backend exactly as the current api/client.ts does.

import type { AppTransport, TransportEvent, PlaybackState, StateSnapshot, MediaItem, FaceCard, Webcam, WebRTCUrls } from './types'

const BASE = '/api'

export class HttpTransport implements AppTransport {
  private _ws: WebSocket | null = null
  private _wsUrl: string
  private _handlers = new Map<TransportEvent, Set<(p: unknown) => void>>()
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(wsUrl = 'ws://localhost:8000/ws/events') {
    this._wsUrl = wsUrl
  }

  async init(): Promise<void> {
    this._connect()
    // Resolve immediately — HTTP calls work even before WS connects
    return Promise.resolve()
  }

  private _connect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    try {
      this._ws = new WebSocket(this._wsUrl)
      this._ws.onmessage = (e) => {
        try {
          const { type, payload } = JSON.parse(e.data as string)
          this._emit(type as TransportEvent, payload)
        } catch (err) {
          console.warn('[HttpTransport] WS message parse error:', err)
        }
      }
      this._ws.onclose = (e) => {
        console.warn(`[HttpTransport] WS closed (code=${e.code}, reason="${e.reason}")`)
        this._reconnectTimer = setTimeout(() => this._connect(), 2000)
      }
      this._ws.onerror = (e) => {
        console.error('[HttpTransport] WS error:', e)
        // onclose fires automatically after onerror — don't close manually
        // to avoid triggering a double reconnect timer.
      }
    } catch (err) {
      console.error('[HttpTransport] WS connect error:', err)
      // Retry after delay
      this._reconnectTimer = setTimeout(() => this._connect(), 2000)
    }
  }

  private _emit(event: TransportEvent, payload: unknown) {
    this._handlers.get(event)?.forEach(fn => fn(payload))
  }

  on(event: TransportEvent, handler: (p: unknown) => void) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set())
    this._handlers.get(event)!.add(handler)
    return () => this._handlers.get(event)?.delete(handler)
  }

  private _wsSend(type: string, payload?: unknown) {
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type, payload: payload ?? {} }))
    }
  }

  private async _req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as { detail?: string }).detail ?? res.statusText)
    }
    return res.json() as Promise<T>
  }

  // ── Folder browser ──────────────────────────────────────────────────────────
  browseFolder(path = '', showFiles = false) {
    const params = new URLSearchParams({ path, show_files: String(showFiles) })
    return this._req<import('./types').BrowseFolderResult>('GET', `/system/browse-folder?${params}`)
  }
  getQuickFolders() {
    return this._req<{ folders: import('./types').QuickFolder[] }>('GET', '/system/quick-folders')
  }

  // ── Playback ────────────────────────────────────────────────────────────
  play()              { this._wsSend('play') }
  stop()              { this._wsSend('stop') }
  seek(frame: number) { this._wsSend('seek', { frame }) }
  step(n: number)     { this._wsSend('step', { n }) }
  getPlayback()       { return this._req<PlaybackState>('GET', '/playback') }

  // ── State ───────────────────────────────────────────────────────────────
  getState()          { return this._req<StateSnapshot>('GET', '/state') }
  setControl(name: string, value: unknown) {
    this._wsSend('set_control', { name, value })
  }
  setParameter(faceId: string, name: string, value: unknown) {
    this._wsSend('set_parameter', { face_id: faceId, name, value })
  }

  // ── Media ───────────────────────────────────────────────────────────────
  // Browser mode: no native folder picker — return empty string
  pickFolder()             { return Promise.resolve('') }
  pickFolderAt(_initialDir: string) { return Promise.resolve('') }
  scanFolder(path: string, recursive = false) {
    return this._req<{ items: MediaItem[] }>('POST', '/target-media/scan-folder', { path, recursive })
  }
  selectMedia(id: string)  { return this._req<unknown>('POST', `/target-media/${id}/select`) }
  deleteMedia(id: string)  { this._req('DELETE', `/target-media/${id}`) }

  // ── Faces ───────────────────────────────────────────────────────────────
  findFaces()              { return this._req<{ found: number; faces: FaceCard[] }>('POST', '/target-faces/find') }
  clearFaces()             { this._req('POST', '/target-faces/clear') }
  selectFace(id: string)   { this._req('POST', `/target-faces/${id}/select`) }
  assignInput(fid: string, iid: string) { this._req('POST', `/target-faces/${fid}/assign-input/${iid}`) }
  unassignInput(fid: string, iid: string) { this._req('DELETE', `/target-faces/${fid}/assign-input/${iid}`) }
  scanInputFolder(path: string, r = false) {
    return this._req<{ items: Array<{ face_id: string; media_path: string; thumbnail_url: string }> }>(
      'POST', '/input-faces/scan-folder', { path, recursive: r }
    )
  }

  // ── Embeddings ──────────────────────────────────────────────────────────
  mergeEmbeddings(name: string, ids: string[]) {
    return this._req<void>('POST', '/embeddings/merge', { name, input_face_ids: ids })
  }
  deleteEmbedding(id: string) { this._req('DELETE', `/embeddings/${id}`) }

  // ── Recording ───────────────────────────────────────────────────────────
  recordStart(folder = '') {
    return this._req<void>('POST', '/playback/record/start', { output_folder: folder })
  }
  recordStop()             { return this._req<{ output_path: string }>('POST', '/playback/record/stop') }
  saveFrame()              { return this._req<{ output_path: string }>('POST', '/playback/save-frame') }

  // ── File actions ─────────────────────────────────────────────────────────
  openFile(path: string) {
    return this._req<void>('POST', '/system/open-file', { path })
  }
  revealInFolder(path: string) {
    return this._req<void>('POST', '/system/reveal-in-folder', { path })
  }

  // ── Markers ─────────────────────────────────────────────────────────────
  addMarker()              { this._req('POST', '/playback/markers') }
  deleteMarker(f: number)  { this._req('DELETE', `/playback/markers/${f}`) }

  // ── Sources ─────────────────────────────────────────────────────────────
  getWebcams()             { return this._req<{ webcams: Webcam[] }>('GET', '/sources/webcams') }
  selectWebcam(i: number)  { this._req('POST', `/sources/webcams/${i}/select`) }
  startWebrtc()            { return this._req<WebRTCUrls>('POST', '/sources/webrtc/start') }
  stopWebrtc()             { this._req('POST', '/sources/webrtc/stop') }
  setTransform(r: number, h: boolean, v: boolean) {
    this._req('PUT', '/sources/transform', { rotation: r, flip_h: h, flip_v: v })
  }

  // ── System ──────────────────────────────────────────────────────────────
  setProvider(p: string)   { this._req('POST', '/system/providers', { provider: p }) }
  clearMemory()            { this._req('POST', '/system/clear-memory') }
  getGpuMemory()           { return this._req<{ used_mb: number; total_mb: number }>('GET', '/system/gpu-memory') }

  // ── Preview window ───────────────────────────────────────────────────────
  togglePreviewWindow()    { this._wsSend('open_preview_window'); return Promise.resolve() }

  // ── Workspace ───────────────────────────────────────────────────────────
  saveWorkspace(f = 'last_workspace.json') {
    return this._req<void>('POST', '/workspace/save', { filename: f })
  }
  loadWorkspace(f: string) { return this._req<void>('POST', '/workspace/load', { filename: f }) }
  resetWorkspace()         { return this._req<void>('POST', '/workspace/reset') }

  // ── Thumbnails ──────────────────────────────────────────────────────────
  thumbnailUrl(type: 'face' | 'input' | 'media', id: string): string {
    if (type === 'face')  return `/api/target-faces/${id}/thumbnail`
    if (type === 'input') return `/api/input-faces/${id}/thumbnail`
    return `/api/target-media/${id}/thumbnail`
  }
}
