import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, Home, Folder, FolderOpen,
  HardDrive, RefreshCw, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import type { BrowseFolderResult, QuickFolder } from '@/transport/types'

interface FolderBrowserProps {
  /** Called when the user confirms a folder (double-click or "Select" button). */
  onSelect: (path: string) => void
  /** Called when the user dismisses the browser without selecting. */
  onClose: () => void
  /** Initial path to open; defaults to home. */
  initialPath?: string
}

export function FolderBrowser({ onSelect, onClose, initialPath = '' }: FolderBrowserProps) {
  const [current, setCurrent]         = useState<BrowseFolderResult | null>(null)
  const [loading, setLoading]         = useState(false)
  const [quickFolders, setQuickFolders] = useState<QuickFolder[]>([])

  // Navigation history — back/forward stacks hold absolute paths
  const backStack  = useRef<string[]>([])
  const fwdStack   = useRef<string[]>([])

  // ── Load a directory ────────────────────────────────────────────────────
  const navigate = useCallback(async (path: string, pushHistory = true) => {
    setLoading(true)
    try {
      const result = await api.browseFolder(path)
      if (pushHistory && current) {
        backStack.current.push(current.path)
        fwdStack.current = []
      }
      setCurrent(result)
    } catch (err) {
      console.error('[FolderBrowser] navigate error:', err)
    } finally {
      setLoading(false)
    }
  }, [current])

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    navigate(initialPath, false)
    api.getQuickFolders()
      .then(r => setQuickFolders(r.folders))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Back / Forward ──────────────────────────────────────────────────────
  const goBack = useCallback(async () => {
    const prev = backStack.current.pop()
    if (!prev || !current) return
    fwdStack.current.push(current.path)
    setLoading(true)
    try {
      const result = await api.browseFolder(prev)
      setCurrent(result)
    } finally {
      setLoading(false)
    }
  }, [current])

  const goForward = useCallback(async () => {
    const next = fwdStack.current.pop()
    if (!next || !current) return
    backStack.current.push(current.path)
    setLoading(true)
    try {
      const result = await api.browseFolder(next)
      setCurrent(result)
    } finally {
      setLoading(false)
    }
  }, [current])

  // ── Up one level ────────────────────────────────────────────────────────
  const goUp = useCallback(() => {
    if (current?.parent) navigate(current.parent)
  }, [current, navigate])

  // ── Keyboard navigation ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !e.shiftKey) goUp()
    if (e.key === 'ArrowLeft' && e.altKey)    goBack()
    if (e.key === 'ArrowRight' && e.altKey)   goForward()
    if (e.key === 'Escape')                   onClose()
  }, [goUp, goBack, goForward, onClose])

  const canBack    = backStack.current.length > 0
  const canForward = fwdStack.current.length > 0
  const canUp      = !!current?.parent

  return (
    <div
      className="flex flex-col h-full bg-background border border-border rounded-md overflow-hidden focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b bg-muted/40 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" onClick={goBack} disabled={!canBack || loading}>
              <ChevronLeft className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back (Alt+←)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" onClick={goForward} disabled={!canForward || loading}>
              <ChevronRight className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Forward (Alt+→)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6" onClick={goUp} disabled={!canUp || loading}>
              <ChevronLeft className="size-3.5 rotate-90" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Up (Backspace)</TooltipContent>
        </Tooltip>

        {/* Breadcrumb path display */}
        <div className="flex-1 min-w-0 px-2 py-0.5 text-xs font-mono text-muted-foreground truncate bg-background border border-border rounded select-all">
          {current?.path ?? '…'}
        </div>

        {loading && <RefreshCw className="size-3 animate-spin text-muted-foreground shrink-0" />}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onClose}>
              <X className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close browser (Esc)</TooltipContent>
        </Tooltip>
      </div>

      {/* ── Body: quick-access sidebar + directory listing ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <div className="w-28 shrink-0 border-r overflow-y-auto py-1">
          {quickFolders.map(qf => (
            <QuickFolderButton
              key={qf.path}
              label={qf.label}
              path={qf.path}
              active={current?.path === qf.path}
              onClick={() => navigate(qf.path)}
            />
          ))}
        </div>

        {/* Directory listing */}
        <div className="flex-1 overflow-y-auto p-1">
          {!loading && current?.entries.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">Empty folder</p>
          )}

          {current?.entries.map(entry => (
            <FolderRow
              key={entry.path}
              name={entry.name}
              isDir={entry.is_dir}
              onSingleClick={() => { if (!entry.is_dir) return }}
              onDoubleClick={() => {
                if (entry.is_dir) navigate(entry.path)
                else onSelect(entry.path)
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t bg-muted/40 shrink-0">
        <p className="text-[10px] text-muted-foreground truncate flex-1">
          {current ? `${current.entries.filter(e => e.is_dir).length} folder(s)` : ''}
        </p>
        <Button
          size="sm"
          className="h-6 text-xs px-3"
          disabled={!current}
          onClick={() => current && onSelect(current.path)}
        >
          Select This Folder
        </Button>
      </div>
    </div>
  )
}

// ── Quick-access sidebar button ───────────────────────────────────────────────

function QuickFolderButton({
  label, path, active, onClick,
}: { label: string; path: string; active: boolean; onClick: () => void }) {
  // Pick an icon based on the label
  const Icon = label.includes(':\\') || label === 'Launch Directory'
    ? HardDrive
    : label === 'Home'
      ? Home
      : Folder

  return (
    <button
      title={path}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-1.5 px-2 py-1 text-left text-[11px] rounded transition-colors',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}

// ── Directory entry row ───────────────────────────────────────────────────────

function FolderRow({
  name, isDir, onSingleClick, onDoubleClick,
}: { name: string; isDir: boolean; onSingleClick: () => void; onDoubleClick: () => void }) {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      onDoubleClick()
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null
        onSingleClick()
      }, 220)
    }
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1 rounded text-left text-xs transition-colors',
        isDir
          ? 'text-foreground hover:bg-muted'
          : 'text-muted-foreground hover:bg-muted/60 cursor-default',
      )}
    >
      {isDir
        ? <FolderOpen className="size-3.5 shrink-0 text-yellow-500/80" />
        : <span className="size-3.5 shrink-0" />}
      <span className="truncate">{name}</span>
    </button>
  )
}
