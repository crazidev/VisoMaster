import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '@/api/client'
import { useAppStore } from '@/store/appStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function WebcamSource() {
  const { selectedWebcamIndex, setSelectedWebcamIndex, webcamList, setWebcamList } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [selecting, setSelecting] = useState<number | null>(null)

  const loadWebcams = async (isRefresh = false) => {
    setLoading(true)
    try {
      const r = await api.getWebcams()
      setWebcamList(r.webcams)

      // On first load (not a manual refresh), auto-resume the remembered selection
      if (!isRefresh) {
        const saved = useAppStore.getState().selectedWebcamIndex
        if (saved !== null && r.webcams.some(w => w.index === saved)) {
          try {
            await api.selectWebcam(saved)
            await api.play()
          } catch {
            // Silently ignore — user can manually re-select
          }
        }
      }
    } catch {
      toast.error('Failed to enumerate webcams')
    } finally {
      setLoading(false)
    }
  }

  // Only fetch on mount if the list hasn't been loaded yet
  useEffect(() => {
    if (useAppStore.getState().webcamList.length === 0) {
      loadWebcams(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelect = async (index: number) => {
    setSelecting(index)
    try {
      await api.selectWebcam(index)
      setSelectedWebcamIndex(index)
      await api.play()
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSelecting(null)
    }
  }

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Header row with refresh button */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {loading ? 'Scanning...' : `${webcamList.length} camera${webcamList.length !== 1 ? 's' : ''} found`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={loading}
          onClick={() => loadWebcams(true)}
          title="Refresh webcam list"
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Camera grid */}
      {loading ? (
        // Loading skeleton
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map(i => (
            <div
              key={i}
              className="flex flex-col items-center gap-1 p-3 rounded border border-border animate-pulse"
            >
              <div className="size-8 rounded bg-muted" />
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {webcamList.map(w => (
            <button
              key={w.index}
              onClick={() => handleSelect(w.index)}
              disabled={selecting !== null}
              className={cn(
                'flex flex-col items-center gap-1 p-3 rounded border text-xs transition-all',
                selectedWebcamIndex === w.index
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-muted-foreground text-muted-foreground',
                selecting === w.index && 'opacity-60 cursor-wait',
              )}
            >
              {selecting === w.index ? (
                <RefreshCw className="size-6 animate-spin" />
              ) : (
                <span className="text-2xl">📷</span>
              )}
              <span>{w.label}</span>
            </button>
          ))}
          {webcamList.length === 0 && (
            <div className="col-span-2 text-center text-xs text-muted-foreground py-6">
              No webcams found
            </div>
          )}
        </div>
      )}
    </div>
  )
}
