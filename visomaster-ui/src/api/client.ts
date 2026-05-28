// api/client.ts
// Thin facade over the active transport adapter.
// All components import from here — the transport layer is invisible to them.

import { transport, channelTransport } from '@/transport'

// Generic HTTP helpers for any components that still use api.get / api.post directly
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
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

export const api = {
  // Raw HTTP helpers (used by some components directly)
  get:    <T>(path: string) => req<T>('GET', path),
  post:   <T>(path: string, body?: unknown) => req<T>('POST', path, body),
  put:    <T>(path: string, body?: unknown) => req<T>('PUT', path, body),
  delete: <T>(path: string) => req<T>('DELETE', path),

  ...transport,

  // Class methods on transport instances live on the prototype and aren't
  // copied by `...transport`. Re-expose the ones components rely on so
  // they're invokable as api.setControl / api.setParameter.
  setControl:    (name: string, value: unknown) => transport.setControl(name, value),
  setParameter:  (faceId: string, name: string, value: unknown) =>
                   transport.setParameter(faceId, name, value),
  on:            (event: import('@/transport/types').TransportEvent,
                  handler: (p: unknown) => void) => transport.on(event, handler),

  // Extra: async thumbnail for Qt mode (falls back to URL in HTTP mode)
  getThumbnail: async (type: 'face' | 'input' | 'media', id: string): Promise<string> => {
    if (channelTransport) {
      return channelTransport.getThumbnailAsync(type, id)
    }
    return transport.thumbnailUrl(type, id)
  },

  pickFolder: () => transport.pickFolder(),
  pickFolderAt: (initialDir: string) => transport.pickFolderAt?.(initialDir) ?? Promise.resolve(''),
  browseFolder: (path: string, showFiles = false) => transport.browseFolder(path, showFiles),
  getQuickFolders: () => transport.getQuickFolders(),

  // Keep legacy method names that existing components use
  setProvider:   (p: string) => transport.setProvider(p),
  scanFolder:    (path: string, recursive = false) => transport.scanFolder(path, recursive),
  addFiles:      (_paths: string[]) => Promise.resolve({ items: [] as import('@/transport').MediaItem[] }),
  selectMedia:   (id: string) => transport.selectMedia(id),
  deleteMedia:   (id: string) => transport.deleteMedia(id),
  findFaces:     () => transport.findFaces(),
  clearFaces:    () => transport.clearFaces(),
  selectFace:    (id: string) => transport.selectFace(id),
  deleteFace:    (id: string) => transport.selectFace(id), // stub
  assignInput:   (fid: string, iid: string) => transport.assignInput(fid, iid),
  unassignInput: (fid: string, iid: string) => transport.unassignInput(fid, iid),
  assignEmbed:   (_fid: string, _eid: string) => Promise.resolve(),
  scanInputFolder: (path: string, r = false) => transport.scanInputFolder(path, r),
  clearInputFaces: () => Promise.resolve(),
  mergeEmbeddings: (name: string, ids: string[]) => transport.mergeEmbeddings(name, ids),
  deleteEmbedding: (id: string) => transport.deleteEmbedding(id),
  play:          () => transport.play(),
  stop:          () => transport.stop(),
  seek:          (frame: number) => transport.seek(frame),
  step:          (n: number) => transport.step(n),
  enableLoop:    () => transport.setControl('loop_enabled', true),
  disableLoop:   () => transport.setControl('loop_enabled', false),
  recordStart:   (folder?: string) => transport.recordStart(folder),
  recordStop:    () => transport.recordStop(),
  saveFrame:     () => transport.saveFrame(),
  openFile:      (path: string) => transport.openFile(path),
  revealInFolder:(path: string) => transport.revealInFolder(path),
  addMarker:     () => transport.addMarker(),
  deleteMarker:  (f: number) => transport.deleteMarker(f),
  getWebcams:    () => transport.getWebcams(),
  selectWebcam:  (i: number) => transport.selectWebcam(i),
  startWebrtc:   () => transport.startWebrtc(),
  stopWebrtc:    () => transport.stopWebrtc(),
  setTransform:  (r: number, h: boolean, v: boolean) => transport.setTransform(r, h, v),
  getState:      () => transport.getState(),
  patchControl:  (updates: Record<string, unknown>) => {
    Object.entries(updates).forEach(([k, v]) => transport.setControl(k, v))
    return Promise.resolve()
  },
  patchParams:   (faceId: string, updates: Record<string, unknown>) => {
    Object.entries(updates).forEach(([k, v]) => transport.setParameter(faceId, k, v))
    return Promise.resolve()
  },
  copyParams:    (_id: string) => Promise.resolve(),
  pasteParams:   (_id: string) => Promise.resolve(),
  resetParams:   (_id: string) => Promise.resolve(),
  saveWorkspace: (f?: string) => transport.saveWorkspace(f),
  loadWorkspace: (f: string) => transport.loadWorkspace(f),
  resetWorkspace:() => transport.resetWorkspace(),

  // Model management — route through transport in Qt mode, raw fetch in HTTP mode
  getLoadedModels: (): Promise<{ models: Array<{ name: string; store: string; device: string; vram_mb: number }> }> => {
    if (channelTransport) return (channelTransport as unknown as { getLoadedModels(): Promise<{ models: Array<{ name: string; store: string; device: string; vram_mb: number }> }> }).getLoadedModels()
    return req('GET', '/models')
  },
  unloadModel: (name: string): Promise<{ ok: boolean; message: string }> => {
    if (channelTransport) return (channelTransport as unknown as { unloadModel(n: string): Promise<{ ok: boolean; message: string }> }).unloadModel(name)
    return req('DELETE', `/models/${encodeURIComponent(name)}`)
  },
   // clearMemory:   () => transport.clearMemory(),
  clearMemory: (): Promise<void> => {
    transport.clearMemory()
    return Promise.resolve()
  },
}

// Re-export types for components that need them
export type { FaceCard as FaceCardRaw, Webcam as WebcamRaw, WebRTCUrls, StateSnapshot as StateRaw }
  from '@/transport'
