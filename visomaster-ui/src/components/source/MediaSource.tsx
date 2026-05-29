import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import { FolderOpen, RefreshCw, Search, ImageIcon, Video, FolderTree, FolderSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/appStore'
import { api } from '@/api/client'
import { transport, isDesktop } from '@/transport'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { FolderBrowser } from './FolderBrowser'

const LS_FOLDER = 'vm_media_folder'
const LS_RECURSIVE = 'vm_media_recursive'

export function MediaSource() {
  const { mediaList, setMediaList, selectedMediaId, setSelectedMediaId, setPlayback,
    lastMediaFolder, setLastMediaFolder } = useAppStore()
  const [search, setSearch] = useState('')
  const [showImages, setShowImages] = useState(true)
  const [showVideos, setShowVideos] = useState(true)
  const [folderPath, setFolderPath] = useState(() => lastMediaFolder || (localStorage.getItem(LS_FOLDER) ?? ''))
  const [recursive, setRecursive] = useState(() => localStorage.getItem(LS_RECURSIVE) === 'true')
  const [isScanning, setIsScanning] = useState(false)
  const [showBrowser, setShowBrowser] = useState(false)
  const pathInputRef = useRef<HTMLInputElement>(null)
  // Track whether we've done the initial auto-scan so we don't repeat it
  const didAutoScan = useRef(false)

  // ── Core scan — takes path explicitly, never opens a picker ──────────────
  const doScan = useCallback(async (path: string, rec: boolean) => {
    const trimmed = path.trim()
    if (!trimmed) return
    setIsScanning(true)
    try {
      const res = await transport.scanFolder(trimmed, rec)
      const cards = res.items.map(item => ({
        media_id: item.media_id,
        media_path: item.media_path,
        file_type: item.file_type,
        thumbnail_url: transport.thumbnailUrl('media', item.media_id),
      }))
      setMediaList(cards)
      setFolderPath(trimmed)
      setLastMediaFolder(trimmed)
      localStorage.setItem(LS_FOLDER, trimmed)
    } catch (err) {
      toast.error(`Scan failed: ${String(err)}`)
    } finally {
      setIsScanning(false)
    }
  }, [setMediaList, setLastMediaFolder])

  // Sync folderPath input when the store's lastMediaFolder is updated
  // (e.g. after getState() resolves from the server workspace)
  useEffect(() => {
    if (lastMediaFolder && lastMediaFolder !== folderPath) {
      setFolderPath(lastMediaFolder)
    }
  }, [lastMediaFolder]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scan on mount — transport is already initialized before React renders
  // so no delay is needed. Run exactly once via didAutoScan ref.
  useEffect(() => {
    if (didAutoScan.current) return
    const path = lastMediaFolder || localStorage.getItem(LS_FOLDER) || ''
    const rec = localStorage.getItem(LS_RECURSIVE) === 'true'
    if (path) {
      didAutoScan.current = true
      doScan(path, rec)
    }
  }, [lastMediaFolder, doScan])

  const filtered = mediaList.filter(m => {
    if (!showImages && m.file_type === 'image') return false
    if (!showVideos && m.file_type === 'video') return false
    return m.media_path.toLowerCase().includes(search.toLowerCase())
  })

  // ── Folder picker — toggles the inline browser for both Qt and browser mode
  const handleOpenFolder = () => {
    setShowBrowser(v => !v)
  }

  // ── Browser selection ─────────────────────────────────────────────────────
  const handleBrowserSelect = (path: string) => {
    setShowBrowser(false)
    setFolderPath(path)
    doScan(path, recursive)
  }

  // ── Enter key in path input ───────────────────────────────────────────────
  const handlePathKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = (e.target as HTMLInputElement).value.trim()
      if (val) doScan(val, recursive)
    }
  }

  // ── Refresh button ────────────────────────────────────────────────────────
  const handleRefresh = () => {
    const current = folderPath.trim()
    if (current) doScan(current, recursive)
  }

  // ── Recursive toggle ──────────────────────────────────────────────────────
  const handleToggleRecursive = () => {
    const next = !recursive
    setRecursive(next)
    localStorage.setItem(LS_RECURSIVE, String(next))
    const current = folderPath.trim()
    if (current) doScan(current, next)
  }

  // ── Media selection ───────────────────────────────────────────────────────
  const handleSelect = async (id: string) => {
    try {
      const res = await api.selectMedia(id) as { ok?: boolean; max_frame?: number; fps?: number; file_type?: string } | void
      setSelectedMediaId(id)
      const maxFrame = (res as { max_frame?: number })?.max_frame ?? 0
      const fps = (res as { fps?: number })?.fps ?? 0
      setPlayback({ current_frame: 0, max_frame: maxFrame, fps, is_playing: maxFrame > 0 })
    } catch (e) { toast.error(String(e)) }
  }

  return (
    <div className={cn('flex flex-col', showBrowser && 'h-full')}>
      {/* Folder path row — collapses to a simple title bar when the browser is open */}
      <div className="flex items-center gap-1 p-2 border-b">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showBrowser ? 'default' : 'outline'}
              size="sm"
              className="size-7 shrink-0"
              onClick={handleOpenFolder}
              disabled={isScanning}
              aria-pressed={showBrowser}
            >
              {showBrowser ? <FolderSearch className="size-3.5" /> : <FolderOpen className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {showBrowser ? 'Close browser' : 'Browse folders'}
          </TooltipContent>
        </Tooltip>

        {showBrowser ? (
          <span className="flex-1 min-w-0 px-1 text-xs font-medium text-foreground truncate">
            Browse Folders
          </span>
        ) : (
          <>
            <Input
              ref={pathInputRef}
              value={folderPath}
              onChange={e => setFolderPath(e.target.value)}
              onKeyDown={handlePathKeyDown}
              placeholder="Paste folder path and Enter"
              spellCheck={false}
              //@ts-ignore
              size={'sm'}
              className="flex-1 size-7 min-w-0 font-mono"
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={recursive ? 'default' : 'ghost'}
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={handleToggleRecursive}
                  aria-pressed={recursive}
                  disabled={isScanning}
                >
                  <FolderTree className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Recursive search {recursive ? '(on)' : '(off)'}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={handleRefresh}
                  disabled={!folderPath.trim() || isScanning}
                >
                  <RefreshCw className={cn('size-3.5', isScanning && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh folder</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      {/* Inline folder browser — fills remaining height when active */}
      {showBrowser && (
        <div className="flex-1 min-h-0">
          <FolderBrowser
            initialPath={folderPath || ''}
            onSelect={handleBrowserSelect}
            onClose={() => setShowBrowser(false)}
          />
        </div>
      )}

      {/* Search + filter row and media grid — hidden while browser is open */}
      {!showBrowser && <>
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground size-3" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full pl-6 pr-2"
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showImages ? 'default' : 'outline'}
                size="icon"
                className="size-7 shrink-0"
                onClick={() => setShowImages(v => !v)}
                aria-pressed={showImages}
              >
                <ImageIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle images</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showVideos ? 'default' : 'outline'}
                size="icon"
                className="size-7 shrink-0"
                onClick={() => setShowVideos(v => !v)}
                aria-pressed={showVideos}
              >
                <Video className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle videos</TooltipContent>
          </Tooltip>
        </div>

        {/* Media grid */}
        <div className="grid grid-cols-3 gap-1.5 p-2">
          {isScanning && (
            <div className="col-span-3 py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="size-3.5 animate-spin" />
              Scanning…
            </div>
          )}

          {!isScanning && filtered.map(m => (
            <MediaCard
              key={m.media_id}
              mediaId={m.media_id}
              mediaPath={m.media_path}
              fileType={m.file_type}
              selected={selectedMediaId === m.media_id}
              onSelect={handleSelect}
            />
          ))}

          {!isScanning && filtered.length === 0 && (
            <div className="col-span-3 py-8 text-center text-xs text-muted-foreground">
              {folderPath.trim()
                ? 'No media found — try enabling recursive search'
                : isDesktop
                  ? 'Click the folder icon to browse, or paste a path and press Enter'
                  : 'Click the folder icon to browse, or paste a path above and press Enter'}
            </div>
          )}
        </div>
      </>}
    </div>
  )
}

// ── Per-card thumbnail component ──────────────────────────────────────────────
// Separate component so each card independently loads its thumbnail.
// Qt mode: calls getThumbnail() slot (returns base64 data URI).
// Browser mode: uses the HTTP thumbnail URL directly.

interface MediaCardProps {
  mediaId: string
  mediaPath: string
  fileType: string
  selected: boolean
  onSelect: (id: string) => void
}

function MediaCard({ mediaId, mediaPath, fileType, selected, onSelect }: MediaCardProps) {
  // In browser mode thumbnailUrl() returns a real URL; in Qt mode it returns ''
  const initialSrc = transport.thumbnailUrl('media', mediaId)
  const [thumbSrc, setThumbSrc] = useState<string>(initialSrc)

  useEffect(() => {
    if (thumbSrc) return  // Already have a URL (browser mode)
    // Qt mode: fetch thumbnail via async bridge slot
    api.getThumbnail('media', mediaId)
      .then(src => { if (src) setThumbSrc(src) })
      .catch(() => { })
  }, [mediaId])  // intentionally omit thumbSrc — only run once per mediaId

  const filename = mediaPath.split(/[\\/]/).pop() ?? mediaPath

  return (
    <button
      onClick={() => onSelect(mediaId)}
      className={cn(
        'relative rounded overflow-hidden border transition-all text-left',
        selected
          ? 'border-primary ring-1 ring-primary/50'
          : 'border-border hover:border-muted-foreground',
      )}
    >
      {thumbSrc ? (
        <img
          src={thumbSrc}
          alt={filename}
          className="w-full aspect-video object-cover bg-muted"
        />
      ) : (
        <div className="w-full aspect-video bg-muted flex items-center justify-center">
          {fileType === 'image'
            ? <ImageIcon className="size-5 text-muted-foreground" />
            : <Video className="size-5 text-muted-foreground" />}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
        <p className="text-[10px] text-white truncate">{filename}</p>
      </div>
    </button>
  )
}
