import { useCallback, useEffect, useState } from 'react'
import { Cpu, Loader2, MemoryStick, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { api } from '@/api/client'
import { transport } from '@/transport'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface LoadedModel {
  name: string
  store: 'onnx' | 'trt' | 'dfm'
  device: string
  vram_mb: number
}

const STORE_LABELS: Record<string, string> = {
  onnx: 'ONNX',
  trt:  'TRT',
  dfm:  'DFM',
}

const STORE_COLORS: Record<string, string> = {
  onnx: 'text-blue-400',
  trt:  'text-green-400',
  dfm:  'text-purple-400',
}

function DevicePill({ device }: { device: string }) {
  const isCuda = device === 'cuda'
  return (
    <span
      className={cn(
        'flex items-center gap-0.5 text-[10px] font-medium px-1 py-0.5 rounded shrink-0',
        isCuda ? 'text-amber-400' : 'text-muted-foreground',
      )}
      title={isCuda ? 'GPU (CUDA)' : 'CPU'}
    >
      {isCuda ? <MemoryStick className="size-2.5" /> : <Cpu className="size-2.5" />}
      {isCuda ? 'GPU' : 'CPU'}
    </span>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactNode
}

export function LoadedModelsPopover({ open, onOpenChange, trigger }: Props) {
  const [models, setModels] = useState<LoadedModel[]>([])
  const [loading, setLoading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [clearingAll, setClearingAll] = useState(false)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getLoadedModels()
      setModels(res.models as LoadedModel[])
    } catch {
      // silently fail — popover is non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchModels()
  }, [open, fetchModels])

  const handleRemove = async (model: LoadedModel) => {
    setRemoving(model.name)
    try {
      await api.unloadModel(model.name)
      setModels(prev => prev.filter(m => m.name !== model.name))
    } catch (e) {
      toast.error(`Failed to unload: ${String(e)}`)
    } finally {
      setRemoving(null)
    }
  }

  const handleClearAll = async () => {
    setClearingAll(true)
    try {
      transport.clearMemory()
      setModels([])
      toast.success('All models unloaded')
    } catch (e) {
      toast.error(`Failed to clear: ${String(e)}`)
    } finally {
      setClearingAll(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-72 p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold">Loaded Models</span>
          <span className="text-[11px] text-muted-foreground">
            {loading ? '…' : `${models.length} in memory`}
          </span>
        </div>

        <Separator />

        {/* List */}
        <ScrollArea className="max-h-64">
          {loading && models.length === 0 ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              <span className="text-xs">Loading…</span>
            </div>
          ) : models.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <span className="text-xs opacity-50">No models loaded</span>
            </div>
          ) : (
            <div className="py-1">
              {models.map(model => (
                <div
                  key={model.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/50 transition-colors group"
                >
                  {/* Store badge */}
                  <span className={cn('text-[10px] font-semibold w-7 shrink-0', STORE_COLORS[model.store])}>
                    {STORE_LABELS[model.store] ?? model.store.toUpperCase()}
                  </span>

                  {/* Device */}
                  <DevicePill device={model.device} />

                  {/* Name */}
                  <span
                    className="flex-1 text-[11px] font-mono text-foreground/80 truncate min-w-0"
                    title={model.name}
                  >
                    {model.name}
                  </span>

                  {/* VRAM */}
                  {model.vram_mb > 0 && (
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                      {model.vram_mb >= 1024
                        ? `${(model.vram_mb / 1024).toFixed(1)}G`
                        : `${model.vram_mb}M`}
                    </span>
                  )}

                  {/* Remove */}
                  <button
                    onClick={() => handleRemove(model)}
                    disabled={removing === model.name}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    title={`Unload ${model.name}`}
                  >
                    {removing === model.name
                      ? <Loader2 className="size-3 animate-spin" />
                      : <Trash2 className="size-3" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {models.length > 0 && (
          <>
            <Separator />
            <div className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground leading-tight">
                Models reload automatically on next use.
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearAll}
                disabled={clearingAll}
                className="h-6 text-[11px] px-2 shrink-0"
              >
                {clearingAll ? <Loader2 className="size-3 animate-spin" /> : 'Clear all'}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

