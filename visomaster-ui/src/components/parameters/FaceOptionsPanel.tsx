import { useState, useMemo } from 'react'
import { Copy, ClipboardPaste, RotateCcw, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { Param } from './ParameterBlock'
import {
  DetectorIcon, MaskIcon, RestorerIcon, SwapperIcon, SimilarityIcon,
  EditorIcon, ExpressionIcon, ColorIcon, LandmarksIcon, EnhancerIcon,
} from './TabIcons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/appStore'
import { api } from '@/api/client'
import { ParameterBlock, BLOCK_PARAMS } from './ParameterBlock'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useEvents } from '@/hooks/useEvents'

// ─── Types & data ─────────────────────────────────────────────────────────────
type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement> & { className?: string }>
interface TabDef { label: string; block: string; icon: IconComponent }
interface Category { name: string; tabs: TabDef[] }

const CATEGORIES: Category[] = [
  {
    name: 'Face',
    tabs: [
      { label: 'Detector',   block: 'Detection',           icon: DetectorIcon   },
      { label: 'Mask',       block: 'Face Mask',            icon: MaskIcon       },
      { label: 'Restorer',   block: 'Face Restorer',        icon: RestorerIcon   },
      { label: 'Swapper',    block: 'Swapper',              icon: SwapperIcon    },
      { label: 'Similarity', block: 'Face Similarity',      icon: SimilarityIcon },
    ],
  },
  {
    name: 'Edit',
    tabs: [
      { label: 'Editor',     block: 'Face Editor',          icon: EditorIcon     },
      { label: 'Expression', block: 'Expression Restorer',  icon: ExpressionIcon },
      { label: 'Color',      block: 'Color Correction',     icon: ColorIcon      },
      { label: 'Landmarks',  block: 'Landmarks Correction', icon: LandmarksIcon  },
    ],
  },
  {
    name: 'Output',
    tabs: [
      { label: 'Enhancer',   block: 'Frame Enhancer',       icon: EnhancerIcon   },
    ],
  },
]

const ALL_BLOCKS = CATEGORIES.flatMap((c) => c.tabs.map((t) => t.block))

// Landmark sub-params that live outside BLOCK_PARAMS (rendered by DetectionBlock)
const LANDMARK_CONTROL_PARAMS = [
  { name: 'ShowLandmarksEnableToggle', default: false },
  { name: 'LandmarkDetectToggle',      default: false },
  { name: 'LandmarkDetectModelSelection', default: '5' },
  { name: 'LandmarkDetectScoreSlider', default: 50 },
  { name: 'DetectFromPointsToggle',    default: false },
]

// ─── Expanded chip (sidebar open) ────────────────────────────────────────────
function TabChip({
  label, icon: Icon, isActive, isDirty, onClick, onReset,
}: {
  label: string; icon: IconComponent; isActive: boolean
  isDirty: boolean; onClick: () => void; onReset: (e: React.MouseEvent) => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex items-center justify-between w-full px-2 py-1.5 text-left rounded transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="relative shrink-0">
          <Icon className="size-[18px]" />
          {isDirty && (
            <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-1 ring-background" />
          )}
        </span>
        <span className="text-[11px] truncate leading-none">{label}</span>
      </span>

      {isDirty && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="button"
              onClick={onReset}
              className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
            >
              <RotateCcw className="size-2.5" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Reset {label}</TooltipContent>
        </Tooltip>
      )}
    </button>
  )
}

// ─── Collapsed icon button (sidebar closed) ───────────────────────────────────
function CollapsedChip({
  tab, isActive, isDirty, onClick, onReset,
}: {
  tab: TabDef; isActive: boolean; isDirty: boolean
  onClick: () => void; onReset: (e: React.MouseEvent) => void
}) {
  const Icon = tab.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            'group relative flex items-center justify-center w-8 h-8 rounded transition-colors',
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
          )}
        >
          <Icon className="size-[18px]" />
          {isDirty && (
            <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary ring-1 ring-background" />
          )}
          {/* reset on right-click feel — shown as hover overlay */}
          {isDirty && (
            <span
              role="button"
              onClick={onReset}
              className="absolute inset-0 flex items-center justify-center rounded bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <RotateCcw className="size-3 text-destructive" />
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {tab.label}
      </TooltipContent>
    </Tooltip>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export function FaceOptionsPanel() {
  const { selectedFaceId, parameters, control, setControl, updateFaceParameter } = useAppStore()
  const { send } = useEvents()

  const [activeBlock, setActiveBlock] = useState<string>(CATEGORIES[0].tabs[0].block)
  const [clipboard, setClipboard] = useState<Record<string, unknown> | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const dirtyMap = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const blockName of ALL_BLOCKS) {
      const params = BLOCK_PARAMS[blockName] ?? []
      let dirty = params.some((p: Param) => {
        const source: Record<string, unknown> =
          p.scope === 'control' ? control
          : selectedFaceId ? (parameters[selectedFaceId] ?? {})
          : {}
        const current = source[p.name]
        return current !== undefined && current !== p.default
      })
      // For the Detection block, also check landmark sub-params
      if (blockName === 'Detection' && !dirty) {
        dirty = LANDMARK_CONTROL_PARAMS.some(p => {
          const current = control[p.name]
          return current !== undefined && current !== p.default
        })
      }
      map[blockName] = dirty
    }
    return map
  }, [selectedFaceId, parameters, control])

  const activeLabel = useMemo(() => {
    for (const cat of CATEGORIES) {
      const tab = cat.tabs.find((t) => t.block === activeBlock)
      if (tab) return tab.label
    }
    return activeBlock
  }, [activeBlock])

  const handleCopy = async () => {
    if (!selectedFaceId) return
    try { await api.copyParams(selectedFaceId); setClipboard(parameters[selectedFaceId] ?? {}); toast.success('Parameters copied') }
    catch { /* ignore */ }
  }

  const handlePaste = async () => {
    if (!selectedFaceId || !clipboard) return
    try { await api.pasteParams(selectedFaceId); toast.success('Parameters pasted') }
    catch { /* ignore */ }
  }

  const handleResetAll = async () => {
    if (!selectedFaceId) return
    try { await api.resetParams(selectedFaceId); toast.success('Parameters reset') }
    catch { /* ignore */ }
  }

  const handleResetBlock = (e: React.MouseEvent, blockName: string) => {
    e.stopPropagation()
    const params = BLOCK_PARAMS[blockName] ?? []
    for (const p of params as Param[]) {
      if (p.scope === 'control') {
        setControl({ [p.name]: p.default })
        send('set_control', { name: p.name, value: p.default })
      } else {
        if (!selectedFaceId) continue
        updateFaceParameter(selectedFaceId, p.name, p.default)
        send('set_parameter', { face_id: selectedFaceId, name: p.name, value: p.default })
      }
    }
    // For Detection block, also reset landmark sub-params
    if (blockName === 'Detection') {
      for (const p of LANDMARK_CONTROL_PARAMS) {
        setControl({ [p.name]: p.default })
        send('set_control', { name: p.name, value: p.default })
      }
    }
    toast.success(`${blockName} reset`)
  }

  if (!selectedFaceId) {
    return (
      <div className="flex flex-col h-full bg-card border-r items-center justify-center gap-3 p-6">
        <div className="text-4xl">👤</div>
        <p className="text-sm font-medium text-foreground">Click on a face to tune</p>
        <p className="text-xs text-muted-foreground text-center">
          Select a face pair in the swap panel to edit its parameters.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-card border-r">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 !h-[50px] border-b shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Face Options</span>
          <Badge variant="secondary" className="text-xs">…{selectedFaceId.slice(-4)}</Badge>
        </div>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6" onClick={handleCopy}>
                <Copy className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy parameters</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6" onClick={handlePaste} disabled={!clipboard}>
                <ClipboardPaste className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Paste parameters</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6" onClick={handleResetAll}>
                <RotateCcw className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset all to defaults</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Sidebar ── */}
        <div
          className={cn(
            'shrink-0 border-r flex flex-col bg-muted/20 transition-all duration-200 overflow-hidden',
            sidebarOpen ? 'w-[120px]' : 'w-10',
          )}
        >
          {/* collapse toggle pinned at top of sidebar */}
          <div className={cn(
            'shrink-0 border-b border-border/50 flex items-center',
            sidebarOpen ? 'justify-end px-1.5 py-1' : 'justify-center py-1',
          )}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={() => setSidebarOpen(v => !v)}
                >
                  {sidebarOpen
                    ? <PanelLeftClose className="size-3" />
                    : <PanelLeftOpen className="size-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              </TooltipContent>
            </Tooltip>
          </div>

          <ScrollArea className="flex-1">
            {sidebarOpen ? (
              /* Expanded: labelled category groups */
              <div className="py-2 px-1.5 flex flex-col gap-3">
                {CATEGORIES.map((cat) => (
                  <div key={cat.name}>
                    <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
                      {cat.name}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {cat.tabs.map((tab) => (
                        <TabChip
                          key={tab.block}
                          label={tab.label}
                          icon={tab.icon}
                          isActive={activeBlock === tab.block}
                          isDirty={dirtyMap[tab.block] ?? false}
                          onClick={() => setActiveBlock(tab.block)}
                          onReset={(e) => handleResetBlock(e, tab.block)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Collapsed: icon-only with tooltip */
              <div className="py-2 flex flex-col items-center gap-1">
                {CATEGORIES.map((cat, ci) => (
                  <div key={cat.name} className={cn('flex flex-col items-center gap-0.5', ci > 0 && 'mt-1')}>
                    {/* thin divider between categories */}
                    {ci > 0 && <span className="w-5 h-px bg-border/60 mb-1" />}
                    {cat.tabs.map((tab) => (
                      <CollapsedChip
                        key={tab.block}
                        tab={tab}
                        isActive={activeBlock === tab.block}
                        isDirty={dirtyMap[tab.block] ?? false}
                        onClick={() => setActiveBlock(tab.block)}
                        onReset={(e) => handleResetBlock(e, tab.block)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* ── Content area ── */}
        <ScrollArea className="flex-1 min-w-0">
          <div className="p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-foreground">{activeLabel}</span>
              {dirtyMap[activeBlock] && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleResetBlock(e, activeBlock)}
                    >
                      <RotateCcw className="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset {activeLabel}</TooltipContent>
                </Tooltip>
              )}
            </div>
            <ParameterBlock blockName={activeBlock} />
          </div>
        </ScrollArea>

      </div>
    </div>
  )
}
