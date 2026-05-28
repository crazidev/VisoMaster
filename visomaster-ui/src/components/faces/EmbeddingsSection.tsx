import { Plus, Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/appStore'
import { api } from '@/api/client'
import { toast } from 'sonner'

export function EmbeddingsSection() {
  const { embeddings, setEmbeddings } = useAppStore()

  const handleMerge = async () => {
    const name = window.prompt('Embedding name:')
    if (!name) return
    try {
      const res = await api.mergeEmbeddings(name, []) as unknown as { embedding_id: string; name: string }
      setEmbeddings([...embeddings, res])
      toast.success(`Created embedding "${name}"`)
    } catch (e) { toast.error(String(e)) }
  }

  const handleDelete = async (id: string) => {
    try { await api.deleteEmbedding(id); setEmbeddings(embeddings.filter(e => e.embedding_id !== id)) }
    catch { /* ignore */ }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Embeddings</p>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6" onClick={handleMerge}><Plus className="size-3" /></Button>
            </TooltipTrigger>
            <TooltipContent>Merge embeddings</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <a href="/api/embeddings/export" download="embeddings.json">
                <Button variant="ghost" size="icon" className="size-6"><Download className="size-3" /></Button>
              </a>
            </TooltipTrigger>
            <TooltipContent>Export embeddings</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {embeddings.length === 0 ? (
        <p className="text-xs text-muted-foreground">No embeddings yet</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {embeddings.map(e => (
            <div key={e.embedding_id} className="flex items-center gap-1 group">
              <Badge variant="secondary" className="text-xs gap-1">
                <span className="truncate max-w-24">{e.name}</span>
                <button
                  onClick={() => handleDelete(e.embedding_id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                >
                  <Trash2 className="size-2.5" />
                </button>
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
