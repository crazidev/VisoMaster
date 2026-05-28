import { create } from 'zustand'

export type SourceType = 'media' | 'webcam' | 'streaming'
export type Provider = 'CUDA' | 'TensorRT' | 'TensorRT-Engine' | 'CPU'

export interface FacePair {
  id: string
  sourceFaceId: string | null
  targetFaceId: string | null
}

export interface FaceCard {
  face_id: string
  thumbnail_url: string
  assigned_input_face_ids: string[]
  assigned_embedding_ids: string[]
}

export interface InputFaceCard {
  face_id: string
  media_path: string
  thumbnail_url: string
}

export interface MediaCard {
  media_id: string
  media_path: string
  file_type: string
  thumbnail_url: string
}

export interface EmbeddingCard {
  embedding_id: string
  name: string
}

export interface PlaybackState {
  file_type: string | null
  fps: number
  current_frame: number
  max_frame: number
  is_playing: boolean
  is_recording: boolean
  swap_enabled: boolean
  edit_enabled: boolean
  loop_enabled: boolean
}

export interface GpuMemory {
  used_mb: number
  total_mb: number
}

interface AppStore {
  sourceType: SourceType
  setSourceType: (t: SourceType) => void
  selectedMediaId: string | null
  setSelectedMediaId: (id: string | null) => void
  mediaList: MediaCard[]
  setMediaList: (list: MediaCard[]) => void

  targetFaces: FaceCard[]
  setTargetFaces: (faces: FaceCard[]) => void
  inputFaces: InputFaceCard[]
  setInputFaces: (faces: InputFaceCard[]) => void
  embeddings: EmbeddingCard[]
  setEmbeddings: (e: EmbeddingCard[]) => void
  selectedFaceId: string | null
  setSelectedFaceId: (id: string | null) => void
  facePairs: FacePair[]
  setFacePairs: (pairs: FacePair[]) => void

  playback: PlaybackState
  setPlayback: (p: Partial<PlaybackState>) => void
  markers: number[]
  setMarkers: (m: number[]) => void

  parameters: Record<string, Record<string, unknown>>
  setFaceParameters: (faceId: string, params: Record<string, unknown>) => void
  updateFaceParameter: (faceId: string, name: string, value: unknown) => void

  control: Record<string, unknown>
  setControl: (updates: Record<string, unknown>) => void

  provider: Provider
  setProvider: (p: Provider) => void
  gpuMemory: GpuMemory
  setGpuMemory: (m: GpuMemory) => void
  cpuPercent: number
  setCpuPercent: (v: number) => void
  gpuPercent: number
  setGpuPercent: (v: number) => void

  activeBlocks: string[]
  setActiveBlocks: (blocks: string[]) => void

  lastMediaFolder: string
  setLastMediaFolder: (path: string) => void

  lastInputFacesFolder: string
  setLastInputFacesFolder: (path: string) => void

  panelVisibility: { source: boolean; faceswap: boolean; faceoptions: boolean; output: boolean }
  togglePanel: (panel: 'source' | 'faceswap' | 'faceoptions' | 'output') => void

  externalPreview: boolean
  setExternalPreview: (v: boolean) => void

  theme: 'dark' | 'light'
  toggleTheme: () => void

  webrtcRunning: boolean
  setWebrtcRunning: (v: boolean) => void
  webrtcUrls: { http_url: string; https_url?: string; ws_url: string; wss_url?: string } | null
  setWebrtcUrls: (u: { http_url: string; https_url?: string; ws_url: string; wss_url?: string } | null) => void
  webrtcFps: number
  setWebrtcFps: (v: number) => void

  selectedWebcamIndex: number | null
  setSelectedWebcamIndex: (i: number | null) => void

  webcamList: import('@/api/client').WebcamRaw[]
  setWebcamList: (list: import('@/api/client').WebcamRaw[]) => void

  virtCamEnabled: boolean
  setVirtCamEnabled: (v: boolean) => void
}

const DEFAULT_BLOCKS = ['Face Similarity', 'Face Mask']

const savedBlocks = (() => {
  if (typeof localStorage === 'undefined') return DEFAULT_BLOCKS
  try {
    const s = localStorage.getItem('vm_active_blocks')
    return s ? JSON.parse(s) : DEFAULT_BLOCKS
  } catch { return DEFAULT_BLOCKS }
})()

export const useAppStore = create<AppStore>((set) => ({
  sourceType: 'media',
  setSourceType: (t) => set({ sourceType: t }),
  selectedMediaId: null,
  setSelectedMediaId: (id) => set({ selectedMediaId: id }),
  mediaList: [],
  setMediaList: (list) => set({ mediaList: list }),

  targetFaces: [],
  setTargetFaces: (faces) => set({
    targetFaces: faces.filter((f, idx, arr) => arr.findIndex(x => x.face_id === f.face_id) === idx)
  }),
  inputFaces: [],
  setInputFaces: (faces) => set({ inputFaces: faces }),
  embeddings: [],
  setEmbeddings: (e) => set({ embeddings: e }),
  selectedFaceId: null,
  setSelectedFaceId: (id) => set({ selectedFaceId: id }),
  facePairs: [],
  setFacePairs: (pairs) => set({ facePairs: pairs }),

  playback: {
    file_type: null, fps: 0, current_frame: 0, max_frame: 0,
    is_playing: false, is_recording: false, swap_enabled: false, edit_enabled: false,
    loop_enabled: false,
  },
  setPlayback: (p) => set((s) => ({ playback: { ...s.playback, ...p } })),
  markers: [],
  setMarkers: (m) => set({ markers: m }),

  parameters: {},
  setFaceParameters: (faceId, params) =>
    set((s) => ({ parameters: { ...s.parameters, [faceId]: params } })),
  updateFaceParameter: (faceId, name, value) =>
    set((s) => ({
      parameters: {
        ...s.parameters,
        [faceId]: { ...(s.parameters[faceId] ?? {}), [name]: value },
      },
    })),

  control: {},
  setControl: (updates) => set((s) => ({ control: { ...s.control, ...updates } })),

  provider: 'CUDA',
  setProvider: (p) => set({ provider: p }),
  gpuMemory: { used_mb: 0, total_mb: 0 },
  setGpuMemory: (m) => set({ gpuMemory: m }),
  cpuPercent: 0,
  setCpuPercent: (v) => set({ cpuPercent: v }),
  gpuPercent: 0,
  setGpuPercent: (v) => set({ gpuPercent: v }),

  activeBlocks: savedBlocks,
  setActiveBlocks: (blocks) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vm_active_blocks', JSON.stringify(blocks))
    }
    set({ activeBlocks: blocks })
  },

  lastMediaFolder: localStorage.getItem('vm_media_folder') ?? '',
  setLastMediaFolder: (path) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vm_media_folder', path)
    }
    set({ lastMediaFolder: path })
  },

  lastInputFacesFolder: localStorage.getItem('vm_input_faces_folder') ?? '',
  setLastInputFacesFolder: (path) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vm_input_faces_folder', path)
    }
    set({ lastInputFacesFolder: path })
  },

  panelVisibility: { source: true, faceswap: true, faceoptions: true, output: true },
  togglePanel: (panel) =>
    set((s) => ({
      panelVisibility: { ...s.panelVisibility, [panel]: !s.panelVisibility[panel] },
    })),

  externalPreview: false,
  setExternalPreview: (v) => set({ externalPreview: v }),

  theme: (localStorage.getItem('vm_theme') as 'dark' | 'light') ?? 'dark',
  toggleTheme: () => set((s) => {
    const next = s.theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('vm_theme', next)
    return { theme: next }
  }),

  webrtcRunning: false,
  setWebrtcRunning: (v) => set({ webrtcRunning: v }),
  webrtcUrls: null,
  setWebrtcUrls: (u) => set({ webrtcUrls: u }),
  webrtcFps: 0,
  setWebrtcFps: (v) => set({ webrtcFps: v }),

  selectedWebcamIndex: null,
  setSelectedWebcamIndex: (i) => set({ selectedWebcamIndex: i }),

  webcamList: [],
  setWebcamList: (list) => set({ webcamList: list }),

  virtCamEnabled: false,
  setVirtCamEnabled: (v) => set({ virtCamEnabled: v }),
}))
