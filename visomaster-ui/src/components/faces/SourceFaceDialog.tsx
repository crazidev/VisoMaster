import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { FolderOpen, RefreshCw, Search, FolderTree } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/appStore'
import { api } from '@/api/client'
import { transport, isDesktop } from '@/transport'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { FaceThumbnail } from './FaceThumbnail'

const LS_FOLDER = 'vm_input_faces_folder'
const LS_RECURSIVE = 'vm_input_faces_recursive'

interface Props {
  onSelect: (faceId: string) => void
  onClose: () => void
  disabledIds?: Set<string>
}

export function SourceFaceDialog({ onSelect, onClose, disabledIds }: Props) {
  const { inputFaces, setInputFaces, lastInputFacesFolder, setLastInputFacesFolder } = useAppStore()

  const [folderPath, setFolderPath] = useState(() => lastInputFacesFolder || (localStorage.getItem(LS_FOLDER) ?? ''))
  const [recursive, setRecursive] = useState(() => localStorage.getItem(LS_RECURSIVE) === 'true')
  const [isScanning, setIsScanning] = useState(false)
  const [search, setSearch] = useState('')
  const pathInputRef = useRef<HTMLInputElement>(null)

  // Auto-scan on open if a saved folder exists
  useEffect(() => {
    const saved = lastInputFacesFolder || localStorage.getItem(LS_FOLDER)
    if (saved) scanFolder(saved, localStorage.getItem(LS_RECURSIVE) === 'true')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scanFolder = async (path: string, rec = recursive) => {
    const trimmed = path.trim()
    if (!trimmed) return
    setIsScanning(true)
    try {
      const res = await api.scanInputFolder(trimmed, rec)
      const items = res?.items ?? []
      // Replace the input faces list with the fresh scan result.
      // Deduplicate by face_id in case the backend returns duplicates.
      const seen = new Set<string>()
      const unique = items.filter(f => {
        if (seen.has(f.face_id)) return false
        seen.add(f.face_id)
        return true
      })
      setInputFaces(unique.map(f => ({
        face_id: f.face_id,
        media_path: f.media_path,
        thumbnail_url: f.thumbnail_url || transport.thumbnailUrl('input', f.face_id),
      })))
      setFolderPath(trimmed)
      setLastInputFacesFolder(trimmed)
      if (unique.length === 0) toast.info('No faces found in this folder')
    } catch (err) {
      toast.error(String(err))
    } finally {
      setIsScanning(false)
    }
  }

  const handlePathKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') scanFolder((e.target as HTMLInputElement).value)
  }

  const handleToggleRecursive = () => {
    const next = !recursive
    setRecursive(next)
    localStorage.setItem(LS_RECURSIVE, String(next))
    if (folderPath) scanFolder(folderPath, next)
  }

  // ── Folder picker — Qt opens native picker, browser focuses path input ──
  const handleOpenFolder = async () => {
    if (isDesktop) {
      try {
        const initial = lastInputFacesFolder || folderPath
        const picked = transport.pickFolderAt
          ? await transport.pickFolderAt(initial)
          : await transport.pickFolder()
        if (picked) {
          setFolderPath(picked)
          scanFolder(picked, recursive)
        }
      } catch (e) {
        toast.error(`Could not open folder picker: ${String(e)}`)
      }
    } else {
      pathInputRef.current?.focus()
      pathInputRef.current?.select()
    }
  }

  const filtered = inputFaces.filter(f =>
    f.media_path.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose Source Face</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Scan a folder for face images and pick one to use as the swap source.
          </DialogDescription>
        </DialogHeader>

        {/* Folder path row */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                onClick={handleOpenFolder}
                disabled={isScanning}
              >
                <FolderOpen className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isDesktop ? 'Browse for folder' : 'Select folder'}</TooltipContent>
          </Tooltip>

          <input
            ref={pathInputRef}
            value={folderPath}
            onChange={e => setFolderPath(e.target.value)}
            onKeyDown={handlePathKeyDown}
            onBlur={e => {
              if (e.target.value.trim() && e.target.value.trim() !== folderPath)
                scanFolder(e.target.value)
            }}
            placeholder="Paste or type folder path…"
            spellCheck={false}
            className="flex-1 min-w-0 px-2 py-1 text-xs bg-muted border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
          />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={recursive ? 'default' : 'ghost'}
                size="icon"
                className="size-7 shrink-0"
                onClick={handleToggleRecursive}
                aria-pressed={recursive}
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
                onClick={() => { if (folderPath) scanFolder(folderPath) }}
                disabled={!folderPath || isScanning}
              >
                <RefreshCw className={cn('size-3.5', isScanning && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh folder</TooltipContent>
          </Tooltip>
        </div>

        {/* Search row */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground size-3" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by filename…"
            className="w-full pl-6 pr-2 py-1 text-xs bg-muted border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Face grid */}
        <div className="min-h-40 max-h-72 overflow-y-auto">
          {isScanning ? (
            <div className="flex items-center justify-center h-40 text-xs text-muted-foreground gap-2">
              <RefreshCw className="size-3.5 animate-spin" />
              Scanning for faces…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-xs text-muted-foreground text-center px-4">
              {folderPath
                ? 'No faces found in this folder'
                : 'Enter a folder path above to scan for source faces'}
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2 p-1">
              {filtered.map(f => {
                const disabled = disabledIds?.has(f.face_id) ?? false
                return (
                  <button
                    key={f.face_id}
                    onClick={() => !disabled && onSelect(f.face_id)}
                    disabled={disabled}
                    title={disabled ? 'Already in use' : f.media_path.split(/[\\/]/).pop()}
                    className={cn(
                      'aspect-square rounded-lg overflow-hidden border transition-all',
                      disabled
                        ? 'border-border/30 opacity-30 cursor-not-allowed'
                        : 'border-border hover:border-primary hover:scale-105',
                    )}
                  >
                    <FaceThumbnail
                      kind="input"
                      id={f.face_id}
                      alt={f.media_path.split(/[\\/]/).pop() ?? ''}
                      className="rounded-lg"
                    />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
