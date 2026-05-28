// hooks/useEvents.ts
// Transport-agnostic event subscription hook.
// In Qt mode: subscribes to QWebChannel signals via ChannelTransport.
// In HTTP mode: subscribes to WebSocket messages via HttpTransport.
// Components call this exactly as before — the transport is invisible.

import { useEffect } from 'react'
import { transport } from '@/transport'
import { useAppStore } from '@/store/appStore'
import { toast } from 'sonner'
import { showFileSavedToast } from '@/components/shared/FileSavedToast'

export function useEvents() {
  const setPlayback         = useAppStore((s) => s.setPlayback)
  const setWebrtcFps        = useAppStore((s) => s.setWebrtcFps)
  const setWebrtcRunning    = useAppStore((s) => s.setWebrtcRunning)
  const setWebrtcUrls       = useAppStore((s) => s.setWebrtcUrls)
  const setControl          = useAppStore((s) => s.setControl)
  const updateFaceParameter = useAppStore((s) => s.updateFaceParameter)
  const setGpuMemory        = useAppStore((s) => s.setGpuMemory)
  const setVirtCamEnabled   = useAppStore((s) => s.setVirtCamEnabled)

  // Poll GPU memory every 3 s as a reliable fallback.
  // In HTTP mode the WebSocket gpu_memory event also updates the store, so
  // the poll just fills in the gap on first load and after reconnects.
  // In Qt webview mode the QWebChannel signal can be missed on startup, so
  // polling is the primary update mechanism.
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const mem = await transport.getGpuMemory()
        if (!cancelled) setGpuMemory({ used_mb: mem.used_mb ?? 0, total_mb: mem.total_mb ?? 0 })
      } catch {
        // Silently ignore — server may not be ready yet
      }
    }
    // Fire immediately on mount so the bar shows a value right away
    poll()
    const id = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [setGpuMemory])

  useEffect(() => {
    const unsubs = [
      transport.on('playback_state', (p) => {
        setPlayback(p as Parameters<typeof setPlayback>[0])
      }),

      transport.on('frame_position', (p) => {
        const payload = p as { current_frame: number; max_frame: number; is_playing?: boolean }
        setPlayback({
          current_frame: payload.current_frame,
          max_frame: payload.max_frame,
          ...(payload.is_playing !== undefined ? { is_playing: payload.is_playing } : {}),
        })
      }),

      transport.on('fps_update', (p) => {
        const fps = ((p as { fps: number }).fps) ?? 0
        setWebrtcFps(fps)
        if (fps > 0) setWebrtcRunning(true)
      }),

      transport.on('webrtc_stopped', () => {
        setWebrtcRunning(false)
        setWebrtcUrls(null)
        setWebrtcFps(0)
      }),

      transport.on('gpu_memory', (p) => {
        const payload = p as { used_mb: number; total_mb: number }
        setGpuMemory({ used_mb: payload.used_mb ?? 0, total_mb: payload.total_mb ?? 0 })
      }),

      transport.on('state_updated', (p) => {
        const payload = p as { section: string; name?: string; value?: unknown; face_id?: string }
        if (payload.section === 'control' && payload.name) {
          setControl({ [payload.name]: payload.value })
          // When the backend closes the preview window (e.g. user clicks the
          // native window's X button), sync the externalPreview toggle off.
          if (payload.name === 'PreviewWindowEnableToggle' && payload.value === false) {
            useAppStore.getState().setExternalPreview(false)
          }
        } else if (payload.section === 'parameters' && payload.face_id && payload.name) {
          updateFaceParameter(payload.face_id, payload.name, payload.value)
        }
      }),

      transport.on('recording_finished', (p) => {
        const payload = p as { output_path: string }
        // Clear recording state
        useAppStore.getState().setPlayback({ is_recording: false, is_playing: false })
        // Show toast — the OutputPanel's handleRecordStop may have already shown
        // one if the path was returned synchronously; use a stable id so sonner
        // deduplicates and only shows one toast per recording.
        if (payload.output_path) {
          const id = `recording-saved-${payload.output_path}`
          showFileSavedToast(payload.output_path, 'Recording saved', id)
        }
      }),

      transport.on('virtcam_state', (p) => {
        const payload = p as { enabled: boolean }
        setVirtCamEnabled(payload.enabled ?? false)
      }),

      transport.on('error', (p) => {
        const payload = p as { message: string }
        if (payload.message) toast.error(payload.message)
      }),

      // Preview window closed by the user (X button) — sync the TopBar switch off
      transport.on('preview_window_closed', () => {
        useAppStore.getState().setExternalPreview(false)
      }),

      transport.on('preview_window_opened', () => {
        useAppStore.getState().setExternalPreview(true)
      }),
    ]

    return () => unsubs.forEach(fn => fn())
  }, [setPlayback, setWebrtcFps, setWebrtcRunning, setWebrtcUrls,
      setControl, updateFaceParameter, setGpuMemory, setVirtCamEnabled])

  // send() is kept for backward compat with components that call send('play') etc.
  const send = (type: string, payload?: Record<string, unknown>) => {
    switch (type) {
      case 'play':    transport.play(); break
      case 'stop':    transport.stop(); break
      case 'seek':    transport.seek((payload?.frame as number) ?? 0); break
      case 'step':    transport.step((payload?.n as number) ?? 1); break
      case 'set_control':
        if (payload?.name) transport.setControl(payload.name as string, payload.value); break
      case 'set_parameter':
        if (payload?.face_id && payload?.name)
          transport.setParameter(payload.face_id as string, payload.name as string, payload.value)
        break
      case 'source_tab_changed':
        // In Qt mode this is handled natively; in HTTP mode send via WS
        transport.setControl('_source_tab', payload?.source ?? 'media')
        break
      case 'preview_quality':
        transport.setControl('_preview_quality', payload?.quality ?? 75)
        break
      case 'open_preview_window':
        useAppStore.getState().setExternalPreview(true)
        break
      default:
        console.warn('[useEvents] unhandled send type:', type)
    }
  }

  return { send, isConnected: true }
}
