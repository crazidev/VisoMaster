// components/shared/FileSavedToast.tsx
// Reusable toast content shown after a file is saved (recording or frame).
// Renders the filename + two action buttons: open the file and reveal in folder.

import { FolderOpen, Play } from 'lucide-react'
import { api } from '@/api/client'
import { toast } from 'sonner'

interface FileSavedToastProps {
  /** Full path to the saved file */
  path: string
  /** Label shown above the path, e.g. "Recording saved" or "Frame saved" */
  label: string
  /** Sonner toast id — used to dismiss on action */
  toastId: string | number
}

export function FileSavedToast({ path, label, toastId }: FileSavedToastProps) {
  const filename = path.split(/[\\/]/).pop() ?? path

  const handleOpen = async () => {
    try {
      await api.openFile(path)
    } catch {
      toast.error('Could not open file')
    }
    toast.dismiss(toastId)
  }

  const handleReveal = async () => {
    try {
      await api.revealInFolder(path)
    } catch {
      toast.error('Could not open folder')
    }
    toast.dismiss(toastId)
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <p className="text-sm font-medium leading-none">{label}</p>
      <p className="text-xs text-muted-foreground truncate max-w-[260px]" title={path}>
        {filename}
      </p>
      <div className="flex items-center gap-2 mt-0.5">
        <button
          onClick={handleOpen}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Play className="size-3" />
          Open
        </button>
        <span className="text-muted-foreground/40">·</span>
        <button
          onClick={handleReveal}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <FolderOpen className="size-3" />
          Show in folder
        </button>
      </div>
    </div>
  )
}

/** Helper — show a FileSavedToast via sonner with a persistent duration.
 *  Pass a stable `toastId` to deduplicate — sonner will update an existing
 *  toast with the same id rather than showing a duplicate. */
export function showFileSavedToast(path: string, label: string, toastId?: string) {
  const id = toastId ?? `file-saved-${Date.now()}`
  toast.success(
    <FileSavedToast path={path} label={label} toastId={id} />,
    { id, duration: 8000 },
  )
}
