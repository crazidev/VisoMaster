import { useState } from 'react'
import { UserSearch } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/appStore'
import { api } from '@/api/client'
import { toast } from 'sonner'
import { FaceThumbnail } from './FaceThumbnail'
import { cn } from '@/lib/utils'

interface Props { onSelect: (faceId: string) => void; onClose: () => void; disabledIds?: Set<string> }

export function TargetFaceDialog({ onSelect, onClose, disabledIds }: Props) {
  const { targetFaces, setTargetFaces, setFacePairs } = useAppStore()
  const [loading, setLoading] = useState(false)

  // Deduplicate by face_id in case the store has stale duplicates
  const faces = targetFaces.filter(
    (f, idx, arr) => arr.findIndex(x => x.face_id === f.face_id) === idx
  )

  const handleFind = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await api.findFaces()
      // findFaces clears target faces server-side then re-detects. Replace
      // (not append) the local list so we don't end up with duplicates.
      setTargetFaces(res.faces)
      // Also reset face pairs to match the fresh detection result so the
      // panel stays in sync with the new face IDs.
      if (res.faces.length > 0) {
        setFacePairs(res.faces.map(f => ({ id: f.face_id, sourceFaceId: null, targetFaceId: f.face_id })))
      }
      if (res.found > 0) toast.success(`Found ${res.found} face(s)`)
      else toast.info('No new faces found')
    } catch (e) { toast.error(String(e)) }
    finally { setLoading(false) }
  }

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Target Face</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Pick a face detected in the current frame to use as the swap target.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <Button size="sm" onClick={handleFind} disabled={loading} className="gap-1.5 shrink-0">
            <UserSearch data-icon="inline-start" />
            {loading ? 'Finding...' : 'Find in Frame'}
          </Button>
        </div>

        <div className="min-h-32 max-h-64 overflow-y-auto">
          {faces.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
              No target faces yet. Click "Find in Frame" to detect faces.
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-2 p-1">
              {faces.map(f => {
                const disabled = disabledIds?.has(f.face_id) ?? false
                return (
                  <button
                    key={f.face_id}
                    onClick={() => !disabled && onSelect(f.face_id)}
                    disabled={disabled}
                    title={disabled ? 'Already in use' : f.face_id}
                    className={cn(
                      'aspect-square rounded-lg overflow-hidden border transition-all',
                      disabled
                        ? 'border-border/30 opacity-30 cursor-not-allowed'
                        : 'border-border hover:border-primary hover:scale-105',
                    )}
                  >
                    <FaceThumbnail kind="face" id={f.face_id} className="rounded-lg" />
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
