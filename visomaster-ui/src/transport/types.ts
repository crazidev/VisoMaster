// transport/types.ts
// Shared interface both adapters (QWebChannel + HTTP) must implement.

export type TransportEvent =
  | 'playback_state'
  | 'frame_position'
  | 'gpu_memory'
  | 'state_updated'
  | 'fps_update'
  | 'recording_finished'
  | 'model_loading'
  | 'model_loaded'
  | 'faces_found'
  | 'workspace_loaded'
  | 'webrtc_stopped'
  | 'virtcam_state'
  | 'error'
  | 'preview_window_opened'
  | 'preview_window_closed'

export interface PlaybackState {
  is_playing: boolean
  is_recording: boolean
  current_frame: number
  max_frame: number
  fps: number
  file_type: string | null
  loop_enabled: boolean
  swap_enabled: boolean
  edit_enabled: boolean
}

export interface MediaItem {
  media_id: string
  media_path: string
  file_type: string
}

export interface FaceCard {
  face_id: string
  thumbnail_url: string
  assigned_input_face_ids: string[]
  assigned_embedding_ids: string[]
}

export interface Webcam {
  index: number
  label: string
}

export interface WebRTCUrls {
  http_url: string
  https_url: string
  whip_url: string
  whip_https_url: string
}

export interface StateSnapshot {
  control: Record<string, unknown>
  target_faces: Record<string, { face_id: string; assigned_input_face_ids: string[]; assigned_embedding_ids: string[] }>
  input_faces: Record<string, { face_id: string; media_path: string }>
  target_media: MediaItem[]
  selected_media_id: string | null
  markers: number[]
  playback: PlaybackState
  last_target_media_folder_path?: string
  last_input_media_folder_path?: string
}

export interface FolderEntry {
  name: string
  path: string
  is_dir: boolean
}

export interface BrowseFolderResult {
  path: string
  parent: string | null
  entries: FolderEntry[]
}

export interface QuickFolder {
  label: string
  path: string
}

export interface AppTransport {
  init(): Promise<void>

  // Folder browser
  browseFolder(path: string, showFiles?: boolean): Promise<BrowseFolderResult>
  getQuickFolders(): Promise<{ folders: QuickFolder[] }>

  // Playback
  play(): void
  stop(): void
  seek(frame: number): void
  step(n: number): void
  getPlayback(): Promise<PlaybackState>

  // State
  getState(): Promise<StateSnapshot>
  setControl(name: string, value: unknown): void
  setParameter(faceId: string, name: string, value: unknown): void

  // Media
  pickFolder(): Promise<string>
  pickFolderAt?(initialDir: string): Promise<string>
  scanFolder(path: string, recursive?: boolean): Promise<{ items: MediaItem[] }>
  selectMedia(id: string): void | Promise<unknown>
  deleteMedia(id: string): void

  // Faces
  findFaces(): Promise<{ found: number; faces: FaceCard[] }>
  clearFaces(): void
  selectFace(id: string): void
  assignInput(faceId: string, inputId: string): void
  unassignInput(faceId: string, inputId: string): void
  scanInputFolder(path: string, recursive?: boolean): Promise<{ items: Array<{ face_id: string; media_path: string; thumbnail_url: string }> }>

  // Embeddings
  mergeEmbeddings(name: string, ids: string[]): Promise<void>
  deleteEmbedding(id: string): void

  // Recording
  recordStart(folder?: string): Promise<void>
  recordStop(): Promise<{ output_path: string }>
  saveFrame(): Promise<{ output_path: string } | void>

  // File actions
  openFile(path: string): Promise<void>
  revealInFolder(path: string): Promise<void>

  // Markers
  addMarker(): void
  deleteMarker(frame: number): void

  // Sources
  getWebcams(): Promise<{ webcams: Webcam[] }>
  selectWebcam(index: number): void
  startWebrtc(): Promise<WebRTCUrls>
  stopWebrtc(): void
  setTransform(rotation: number, flipH: boolean, flipV: boolean): void

  // System
  setProvider(provider: string): void
  clearMemory(): void
  getGpuMemory(): Promise<{ used_mb: number; total_mb: number }>

  // Preview window — Qt only, HTTP mode is a no-op
  togglePreviewWindow?(): Promise<unknown>

  // Workspace
  saveWorkspace(filename?: string): Promise<void>
  loadWorkspace(filename: string): Promise<void>
  resetWorkspace(): Promise<void>

  // Thumbnail URL — differs between Qt (base64 slot) and HTTP (REST endpoint)
  thumbnailUrl(type: 'face' | 'input' | 'media', id: string): string

  // Event subscriptions
  on(event: TransportEvent, handler: (payload: unknown) => void): () => void
}
