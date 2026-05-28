import { useState } from 'react'
import { Plus, Power, ScanFaceIcon, UserCircle2, Trash2 } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/appStore'
import { api } from '@/api/client'
import { useEvents } from '@/hooks/useEvents'
import { FacePairRow } from './FacePairRow'
import { EmbeddingsSection } from './EmbeddingsSection'
import { SourceFaceDialog } from './SourceFaceDialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const DETECTOR_MODELS   = ['RetinaFace', 'Yolov8', 'SCRFD', 'Yunet']
const SWAPPER_MODELS    = ['Inswapper128', 'InStyleSwapper256 Version A', 'InStyleSwapper256 Version B', 'InStyleSwapper256 Version C', 'DeepFaceLive (DFM)', 'SimSwap512', 'GhostFace-v1', 'GhostFace-v2', 'GhostFace-v3', 'CSCS']
const ARCFACE_MODELS    = ['Inswapper128ArcFace', 'SimSwapArcFace', 'GhostArcFace', 'CSCSArcFace']
const SWAPPER_RES       = ['128', '256', '384', '512']

function ModelSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

export function FaceSwapPanel() {
  const { facePairs, setFacePairs, playback, setPlayback, setSelectedFaceId, setTargetFaces, control, setControl } = useAppStore()
  const { send } = useEvents()
  const [loading, setLoading] = useState(false)
  const [findingFaces, setFindingFaces] = useState(false)
  const [showAddPicker, setShowAddPicker] = useState(false)

  const swapActive = playback.swap_enabled

  // Read model selections from global control store
  const detectorModel = (control['DetectorModelSelection']  as string) ?? 'RetinaFace'
  const swapperModel  = (control['SwapModelSelection']      as string) ?? 'Inswapper128'
  const swapperRes    = (control['SwapperResSelection']     as string) ?? '128'
  const arcfaceModel  = (control['RecognitionModelSelection'] as string) ?? 'Inswapper128ArcFace'
  const maxFaces      = (control['MaxFacesToDetectSlider']  as number) ?? 20

  const handleModelChange = (name: string, value: string) => {
    setControl({ [name]: value })
    send('set_control', { name, value })
  }

  const handleToggle = async () => {
    setLoading(true)
    try {
      if (swapActive) {
        setPlayback({ swap_enabled: false })
        send('swap_disable')
        api.setControl('_swap_enabled', false)
      } else {
        setPlayback({ swap_enabled: true })
        send('swap_enable')
        api.setControl('_swap_enabled', true)
      }
    } catch (e) { toast.error(String(e)) }
    finally { setLoading(false) }
  }

  // IDs already used as source faces — prevent double-assignment in the picker
  const usedSourceIds = new Set(facePairs.filter(p => p.sourceFaceId).map(p => p.sourceFaceId!))

  const handleAddWithSource = (sourceFaceId: string) => {
    setFacePairs([...facePairs, { id: crypto.randomUUID(), sourceFaceId, targetFaceId: null }])
    setShowAddPicker(false)
  }

  const handleFindFaces = async () => {
    if (findingFaces) return
    setFindingFaces(true)
    try {
      const res = await api.findFaces()
      if (res.found > 0) {
        setTargetFaces(res.faces)
        setFacePairs(res.faces.map(f => ({ id: f.face_id, sourceFaceId: null, targetFaceId: f.face_id })))
        setSelectedFaceId(null)
        toast.success(`Found ${res.found} face${res.found > 1 ? 's' : ''}`)
      } else {
        toast.info('No faces detected in current frame')
      }
    } catch (e) { toast.error(String(e)) }
    finally { setFindingFaces(false) }
  }

  return (
    <div className="flex flex-col h-full bg-card border-r">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-[50px] border-b shrink-0">
        <button
          onClick={handleToggle}
          disabled={loading}
          title={swapActive ? 'Disable face swap' : 'Enable face swap'}
          className={cn(
            'flex items-center justify-center w-6 h-6 rounded transition-colors shrink-0',
            swapActive
              ? 'text-green-400 hover:text-green-300'
              : 'text-muted-foreground hover:text-foreground',
            loading && 'opacity-50 cursor-not-allowed',
          )}
        >
          <Power className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          Face Swapping
        </span>
      </div>

      {/* Model settings — always visible */}
      <div className="px-3 py-2.5 border-b shrink-0 flex flex-col gap-2">
        {/* Detector model + max faces on the same row */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-20 shrink-0">Detector</span>
          <Select value={detectorModel} onValueChange={v => handleModelChange('DetectorModelSelection', v)}>
            <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DETECTOR_MODELS.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Max faces stepper — styled to match SelectTrigger */}
          <div className="flex items-center w-[70px] justify-between shrink-0 h-7 rounded-none border border-input bg-transparent dark:bg-input/30 overflow-hidden">
            <button
              className="w-full h-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors select-none"
              onClick={() => { const v = Math.max(1, maxFaces - 1); setControl({ MaxFacesToDetectSlider: v }); send('set_control', { name: 'MaxFacesToDetectSlider', value: v }) }}
            >−</button>
            <span className="w-full h-full flex items-center justify-center text-xs tabular-nums border-x border-input">{maxFaces}</span>
            <button
              className="w-full h-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors select-none"
              onClick={() => { const v = Math.min(50, maxFaces + 1); setControl({ MaxFacesToDetectSlider: v }); send('set_control', { name: 'MaxFacesToDetectSlider', value: v }) }}
            >+</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-20 shrink-0">Swapper</span>
          <Select value={swapperModel} onValueChange={v => handleModelChange('SwapModelSelection', v)}>
            <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SWAPPER_MODELS.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={swapperRes} onValueChange={v => handleModelChange('SwapperResSelection', v)}>
            <SelectTrigger className="h-7 w-[70px] text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SWAPPER_RES.map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <ModelSelect
          label="ArcFace"
          value={arcfaceModel}
          options={ARCFACE_MODELS}
          onChange={v => handleModelChange('RecognitionModelSelection', v)}
        />
      </div>

      {/* Content — only shown when swap is enabled */}
      {swapActive && (
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 flex flex-col gap-3">
            {/* Face pairs */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between px-0.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Face Pairs</p>
                <div className="flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleFindFaces}
                        disabled={findingFaces}
                        className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
                      >
                        <ScanFaceIcon className="size-3" />
                        {findingFaces ? 'Scanning…' : 'Scan'}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Detect faces in current frame</TooltipContent>
                  </Tooltip>
                  <span className="text-border/60 select-none">·</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => { setFacePairs([]); setTargetFaces([]); setSelectedFaceId(null) }}
                        disabled={facePairs.length === 0}
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
                      >
                        <Trash2 className="size-3" />Clear
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Remove all face pairs</TooltipContent>
                  </Tooltip>
                  <span className="text-border/60 select-none">·</span>
                  <button
                    onClick={() => setShowAddPicker(true)}
                    className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="size-3" />Add
                  </button>
                </div>
              </div>
              {facePairs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 rounded-xl border border-dashed border-border/50">
                  <UserCircle2 className="size-8 text-muted-foreground/20" />
                  <p className="text-xs text-muted-foreground/50 text-center">
                    Click "Scan" to detect faces in the frame,<br />or add a pair manually
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {facePairs.map(pair => (
                    <FacePairRow
                      key={pair.id}
                      pair={pair}
                      onRemove={() => setFacePairs(facePairs.filter(p => p.id !== pair.id))}
                    />
                  ))}
                </div>
              )}
            </div>

            <Separator />
            <EmbeddingsSection />
          </div>
        </ScrollArea>
      )}

      {/* Empty state when swap is off */}
      {!swapActive && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground select-none">
          <Power className="w-8 h-8 opacity-20" />
          <p className="text-xs opacity-40">Face swap is disabled</p>
        </div>
      )}

      {/* Source face picker — opened by Add button */}
      {showAddPicker && (
        <SourceFaceDialog
          onSelect={handleAddWithSource}
          onClose={() => setShowAddPicker(false)}
          disabledIds={usedSourceIds}
        />
      )}
    </div>
  )
}
