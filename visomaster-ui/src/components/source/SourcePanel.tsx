import { useState } from 'react'
import { Monitor, Camera, Radio, RotateCcw, RotateCw, FlipHorizontal, FlipVertical } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/appStore'
import { useEvents } from '@/hooks/useEvents'
import { api } from '@/api/client'
import { cn } from '@/lib/utils'
import { MediaSource } from './MediaSource'
import { WebcamSource } from './WebcamSource'
import { StreamingSource } from './StreamingSource'

export function SourcePanel() {
  const { sourceType, setSourceType } = useAppStore()
  const { send } = useEvents()

  // Transform state — shared between webcam and streaming tabs
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)

  const handleTabChange = (next: string) => {
    const tab = next as typeof sourceType
    setSourceType(tab)
    send('source_tab_changed', { source: tab })
    // Reset transforms when switching sources — each source has its own state
    setRotation(0); setFlipH(false); setFlipV(false)
  }

  const applyTransform = (r: number, h: boolean, v: boolean) => {
    api.setTransform(r, h, v)
  }

  const handleRotateCcw = () => {
    const r = ((rotation - 90) + 360) % 360
    setRotation(r)
    applyTransform(r, flipH, flipV)
  }

  const handleRotateCw = () => {
    const r = (rotation + 90) % 360
    setRotation(r)
    applyTransform(r, flipH, flipV)
  }

  const handleFlipH = () => {
    const h = !flipH
    setFlipH(h)
    applyTransform(rotation, h, flipV)
  }

  const handleFlipV = () => {
    const v = !flipV
    setFlipV(v)
    applyTransform(rotation, flipH, v)
  }

  const showTransforms = true  // available for all source types

  return (
    <div className="flex flex-col h-full bg-card border-r">
      <Tabs value={sourceType} onValueChange={handleTabChange} className="flex flex-col h-full">
        <TabsList variant={'default'} className="w-full rounded-none border-b !h-[50px] bg-card shrink-0">
          <TabsTrigger value="media" className="flex-1 h-auto py-2 rounded-full gap-1.5 text-xs">
            <Monitor data-icon="inline-start" />Media
          </TabsTrigger>
          <TabsTrigger value="webcam" className="flex-1 h-auto py-2 rounded-full gap-1.5 text-xs">
            <Camera data-icon="inline-start" />Webcam
          </TabsTrigger>
          <TabsTrigger value="streaming" className="flex-1 h-auto py-2 rounded-full gap-1.5 text-xs">
            <Radio data-icon="inline-start" />Stream
          </TabsTrigger>
        </TabsList>

        {/* Transform controls — only for live sources */}
        {showTransforms && (
          <div className="flex items-center justify-between px-3 pb-1.5 border-b shrink-0">
            <span className="text-xs text-muted-foreground">
              {rotation !== 0 ? `${rotation}°` : 'Transform'}
            </span>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-6" onClick={handleRotateCcw}>
                    <RotateCcw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rotate −90°</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-6" onClick={handleRotateCw}>
                    <RotateCw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rotate +90°</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost" size="icon"
                    className={cn('size-6', flipH && 'text-primary bg-primary/10')}
                    onClick={handleFlipH}
                  >
                    <FlipHorizontal className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Flip horizontal</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost" size="icon"
                    className={cn('size-6', flipV && 'text-primary bg-primary/10')}
                    onClick={handleFlipV}
                  >
                    <FlipVertical className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Flip vertical</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          <TabsContent value="media" className="mt-0 h-full"><MediaSource /></TabsContent>
          <TabsContent value="webcam" className="mt-0 h-full"><WebcamSource /></TabsContent>
          <TabsContent value="streaming" className="mt-0 h-full"><StreamingSource /></TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
