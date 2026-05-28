import { useState } from 'react'
import { ChevronsDownIcon, UserRound, X } from 'lucide-react'
import { useAppStore, type FacePair } from '@/store/appStore'
import { api } from '@/api/client'
import { TargetFaceDialog } from './TargetFaceDialog'
import { SourceFaceDialog } from './SourceFaceDialog'
import { FaceThumbnail } from './FaceThumbnail'
import { cn } from '@/lib/utils'

interface Props { pair: FacePair; onRemove: () => void }

function FaceSlot({
  label,
  sublabel,
  faceId,
  kind,
  onClick,
  active,
}: {
  label: string
  sublabel?: string
  faceId: string | null
  kind: 'face' | 'input'
  onClick: (e: React.MouseEvent) => void
  active?: boolean
}) {
  const filled = faceId !== null
  return (
    <button
      onClick={onClick}
      title={filled ? `Change ${label}` : `Pick ${label}`}
      className={cn(
        'relative w-full aspect-square rounded-full overflow-hidden transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        filled
          ? active
            ? 'ring-2 ring-primary shadow-md shadow-primary/25'
            : 'ring-1 ring-white/10 hover:ring-2 hover:ring-primary/60'
          : 'ring-1 ring-dashed ring-border/50 hover:ring-primary/50 bg-muted/20',
      )}
    >
      {filled ? (
        <>
          <FaceThumbnail kind={kind} id={faceId!} className="w-full h-full object-cover" />
          {/* label badge pinned to bottom */}
          <span className="absolute inset-x-0 bottom-0 h-7 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
          <span className="absolute bottom-1 inset-x-0 flex justify-center pointer-events-none">
            <span className="text-[8px] font-bold text-white/80 uppercase tracking-widest leading-none">
              {label}
            </span>
          </span>
        </>
      ) : (
        <span className="flex flex-col items-center justify-center w-full h-full gap-1.5">
          <UserRound className="size-4 text-muted-foreground/25" />
          <span className="text-[8px] font-semibold text-muted-foreground/35 uppercase tracking-widest leading-none">
            {label}
          </span>
          {sublabel && (
            <span className="text-[7px] text-muted-foreground/25 leading-none">{sublabel}</span>
          )}
        </span>
      )}
    </button>
  )
}

export function FacePairRow({ pair, onRemove }: Props) {
  const { inputFaces, facePairs, setFacePairs, setSelectedFaceId, selectedFaceId } = useAppStore()
  const [showSourceDialog, setShowSourceDialog] = useState(false)
  const [showTargetDialog, setShowTargetDialog] = useState(false)

  const replacementFace = inputFaces.find(f => f.face_id === pair.sourceFaceId)
  const isActive = pair.targetFaceId !== null && selectedFaceId === pair.targetFaceId

  // IDs already claimed by other pairs — prevent double-assignment
  const usedTargetIds = new Set(
    facePairs.filter(p => p.id !== pair.id && p.targetFaceId).map(p => p.targetFaceId!)
  )
  const usedSourceIds = new Set(
    facePairs.filter(p => p.id !== pair.id && p.sourceFaceId).map(p => p.sourceFaceId!)
  )

  const handleCardClick = () => {
    if (pair.targetFaceId) setSelectedFaceId(pair.targetFaceId)
  }

  const handleSelectDetected = (faceId: string) => {
    setFacePairs(facePairs.map(p => p.id === pair.id ? { ...p, targetFaceId: faceId } : p))
    setSelectedFaceId(faceId)
    if (pair.sourceFaceId) {
      try { api.assignInput(faceId, pair.sourceFaceId) } catch { /* ignore */ }
    }
    setShowSourceDialog(false)
  }

  const handleSelectReplacement = (faceId: string) => {
    setFacePairs(facePairs.map(p => p.id === pair.id ? { ...p, sourceFaceId: faceId } : p))
    if (pair.targetFaceId) {
      try { api.assignInput(pair.targetFaceId, faceId) } catch { /* ignore */ }
    }
    setShowTargetDialog(false)
  }

  return (
    <>
      <div
        onClick={handleCardClick}
        className={cn(
          'group relative flex flex-col gap-0 rounded-2xl border transition-all duration-150',
          'bg-muted/20 backdrop-blur-sm',
          pair.targetFaceId ? 'cursor-pointer' : 'cursor-default',
          isActive
            ? 'border-primary/40 shadow-md shadow-primary/10 bg-primary/5'
            : 'border-border/40 hover:border-border/70 hover:bg-muted/30',
        )}
      >
        {/* Active glow bar at top */}
        {isActive && (
          <span className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        )}

        {/* Source face — detected in frame */}
        <div className="p-4 pb-0">
          <FaceSlot
            label="Source"
            sublabel=""
            faceId={pair.targetFaceId}
            kind="face"
            onClick={(e) => { e.stopPropagation(); setShowSourceDialog(true) }}
            active={isActive}
          />
        </div>

        {/* Arrow connector — centred between the two slots */}
        <div className="flex items-center justify-center h-5 my-2 shrink-0">
          <div className={cn(
            'flex items-center justify-center size-4 rounded-full border transition-colors',
            // isComplete
            //   ? 'border-primary/50 bg-primary/10'
            //   : 'border-border/30 bg-muted/40',
          )}>
            {/* Down chevron drawn with CSS so it's pixel-perfect at tiny sizes */}
            <ChevronsDownIcon className='text-primary'/>
          </div>
        </div>

        {/* Target face — replacement from folder */}
        <div className="px-4 pb-2">
          <FaceSlot
            label="Replace"
            sublabel=""
            faceId={replacementFace?.face_id ?? null}
            kind="input"
            onClick={(e) => { e.stopPropagation(); setShowTargetDialog(true) }}
          />
        </div>

        {/* Remove button — top-right, hover only */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title="Remove pair"
          className={cn(
            'absolute top-1.5 right-1.5 z-10 size-5 rounded-md',
            'flex items-center justify-center',
            'bg-background/70 backdrop-blur-sm border border-border/40',
            'text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10',
            'opacity-0 group-hover:opacity-100 transition-all duration-150',
          )}
        >
          <X className="size-2.5" />
        </button>
      </div>

      {showSourceDialog && (
        <TargetFaceDialog
          onSelect={handleSelectDetected}
          onClose={() => setShowSourceDialog(false)}
          disabledIds={usedTargetIds}
        />
      )}
      {showTargetDialog && (
        <SourceFaceDialog
          onSelect={handleSelectReplacement}
          onClose={() => setShowTargetDialog(false)}
          disabledIds={usedSourceIds}
        />
      )}
    </>
  )
}
