import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { TopBar } from '@/components/layout/TopBar'
import { SourcePanel } from '@/components/source/SourcePanel'
import { FaceSwapPanel } from '@/components/faces/FaceSwapPanel'
import { FaceOptionsPanel } from '@/components/parameters/FaceOptionsPanel'
import { OutputPanel } from '@/components/output/OutputPanel'
import { DebugOverlay } from '@/components/shared/DebugOverlay'
import { useEvents } from '@/hooks/useEvents'
import { useAppStore } from '@/store/appStore'
import { useClientLogger } from '@/hooks/useClientLogger'
import { api } from '@/api/client'
import { transport } from '@/transport'
import type { StateSnapshot } from '@/transport'

export const Route = createFileRoute('/')({ component: VisoMasterApp })

function VisoMasterApp() {
  useClientLogger()
  useEvents()

  const { setPlayback, setMarkers, setTargetFaces, setInputFaces, setEmbeddings,
    setControl, setProvider, setFacePairs, setSelectedMediaId, setMediaList,
    panelVisibility, setLastMediaFolder, setLastInputFacesFolder, theme } = useAppStore()

  // Apply dark/light class to <html> so Tailwind dark: variants and portals
  // (dropdowns, tooltips, dialogs) all pick up the correct theme.
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  useEffect(() => {
    const load = async () => {
      try {
        const state: StateSnapshot = await transport.getState()

        if (state.control) setControl(state.control)

        // Restore last media folder from server-side workspace (Qt mode)
        // This takes priority over localStorage if the server has a newer path
        if (state.last_target_media_folder_path) {
          setLastMediaFolder(state.last_target_media_folder_path)
        }
        if (state.last_input_media_folder_path) {
          setLastInputFacesFolder(state.last_input_media_folder_path)
        }

        // Restore target/input faces — deduplicate by face_id in case the
        // server snapshot has stale duplicates from a previous session.
        const seenFaceIds = new Set<string>()
        const targetFaceList = Object.values(state.target_faces).filter(tf => {
          if (seenFaceIds.has(tf.face_id)) return false
          seenFaceIds.add(tf.face_id)
          return true
        })
        const inputFaceList = Object.values(state.input_faces)

        if (targetFaceList.length) {
          setTargetFaces(targetFaceList.map(tf => ({
            face_id: tf.face_id,
            thumbnail_url: transport.thumbnailUrl('face', tf.face_id),
            assigned_input_face_ids: tf.assigned_input_face_ids,
            assigned_embedding_ids: tf.assigned_embedding_ids,
          })))
        }

        if (inputFaceList.length) {
          setInputFaces(inputFaceList.map(f => ({
            face_id: f.face_id,
            media_path: f.media_path,
            thumbnail_url: transport.thumbnailUrl('input', f.face_id),
          })))
        }

        // Reconstruct face pairs
        if (targetFaceList.length) {
          const pairs = targetFaceList.flatMap(tf =>
            tf.assigned_input_face_ids.length > 0
              ? tf.assigned_input_face_ids.map((inputId: string) => ({
                id: crypto.randomUUID(),
                targetFaceId: tf.face_id,
                sourceFaceId: inputId as string | null,
              }))
              : [{ id: crypto.randomUUID(), targetFaceId: tf.face_id, sourceFaceId: null as string | null }]
          )
          setFacePairs(pairs)
        }

        if (state.selected_media_id) setSelectedMediaId(state.selected_media_id)

        if (state.target_media?.length) {
          setMediaList(state.target_media.map(m => ({
            media_id: m.media_id,
            media_path: m.media_path,
            file_type: m.file_type,
            thumbnail_url: transport.thumbnailUrl('media', m.media_id),
          })))
        }

        if (state.playback) setPlayback(state.playback)
        if (state.markers) setMarkers(state.markers)

        const ctrl = state.control
        if (ctrl?.ProvidersPrioritySelection) setProvider(ctrl.ProvidersPrioritySelection as never)

        // In HTTP mode also fetch playback/markers separately (richer data)
        try {
          const [playback, markers] = await Promise.all([
            api.get<Record<string, unknown>>('/playback'),
            api.get<{ markers: number[] }>('/playback/markers'),
          ])
          setPlayback(playback as never)
          setMarkers(markers.markers)
        } catch { /* Qt mode — no HTTP endpoints */ }

      } catch {
        // Server not ready yet — will sync via transport events when it connects
      }
    }
    load()

    // Re-pull state whenever the backend signals a workspace was just loaded
    // (Qt desktop mode: the load happens after this component mounts so the
    // initial getState() returns an empty snapshot).
    const unsub = transport.on('workspace_loaded', () => {
      load()
    })
    return () => { unsub() }
  }, [setPlayback, setMarkers, setTargetFaces, setInputFaces, setEmbeddings,
    setControl, setProvider, setFacePairs, setSelectedMediaId, setMediaList,
    setLastMediaFolder, setLastInputFacesFolder])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Group orientation="vertical" className="flex-1 overflow-hidden">
        <TopBar />
        <Separator className="h-divider bg-border hover:bg-primary/50 transition-colors cursor-row-resize" />
        <DebugOverlay />
        <Group orientation="horizontal" className="flex-1 overflow-hidden">
          {/* Col 1 — Input Source */}
          {panelVisibility.source && (
            <>
              <Panel defaultSize={300} minSize={300} maxSize={350} id="source">
                <div className="h-full overflow-hidden">
                  <SourcePanel />
                </div>
              </Panel>
              {(panelVisibility.faceswap || panelVisibility.faceoptions || panelVisibility.output) && (
                <Separator className="w-divider bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />
              )}
            </>
          )}

          {/* Col 2 — Face Swapping */}
          {panelVisibility.faceswap && (
            <>
              <Panel defaultSize={300} minSize={300} maxSize={350} id="faceswap">
                <div className="h-full overflow-hidden">
                  <FaceSwapPanel />
                </div>
              </Panel>
              {(panelVisibility.faceoptions || panelVisibility.output) && (
                <Separator className="w-divider bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />
              )}
            </>
          )}

          {/* Col 3 — Face Options */}
          {panelVisibility.faceoptions && (
            <>
              <Panel defaultSize={30} minSize={15} id="faceoptions">
                <div className="h-full overflow-hidden">
                  <FaceOptionsPanel />
                </div>
              </Panel>
              {panelVisibility.output && (
                <Separator className="w-divider bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />
              )}
            </>
          )}

          {/* Col 4 — Output */}
          {panelVisibility.output && (
            <Panel defaultSize={20} minSize={250} maxSize={350}  id="output">
              <div className="h-full overflow-hidden">
                <OutputPanel />
              </div>
            </Panel>
          )}
        </Group>
      </Group>
    </div>
  )
}
