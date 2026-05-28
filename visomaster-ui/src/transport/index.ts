// transport/index.ts
// Detects the runtime environment and exports the correct adapter.
// Everything else in the app imports from here — never from channel.ts or http.ts directly.

import { ChannelTransport } from './channel'
import { HttpTransport }    from './http'
import type { AppTransport } from './types'

export type { AppTransport, TransportEvent } from './types'
export type { PlaybackState, StateSnapshot, MediaItem, FaceCard, Webcam, WebRTCUrls, BrowseFolderResult, QuickFolder, FolderEntry } from './types'

// Qt WebEngine injects window.qt.webChannelTransport before the page loads
const isQtDesktop =
  typeof window !== 'undefined' &&
  typeof window.qt !== 'undefined' &&
  !!window.qt?.webChannelTransport

export const isDesktop = isQtDesktop

export const transport: AppTransport = isQtDesktop
  ? new ChannelTransport()
  : new HttpTransport()

// Convenience: typed cast for Qt-only features (e.g. getThumbnailAsync)
export const channelTransport = isQtDesktop
  ? (transport as ChannelTransport)
  : null
