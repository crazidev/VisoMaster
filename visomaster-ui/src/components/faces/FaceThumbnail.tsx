// Cross-mode face thumbnail.
//   • Browser / HTTP mode: transport.thumbnailUrl() returns a real REST URL
//     and the <img> renders it directly.
//   • Qt desktop mode: thumbnailUrl() returns '' (the FastAPI server isn't
//     running). We then fetch a base64 data URI through the QWebChannel
//     bridge with api.getThumbnail() and feed it to <img>.

import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { transport } from '@/transport'
import { cn } from '@/lib/utils'

type Kind = 'face' | 'input' | 'media'

interface Props {
  kind: Kind
  id: string
  alt?: string
  className?: string
}

export function FaceThumbnail({ kind, id, alt = '', className }: Props) {
  const initial = transport.thumbnailUrl(kind, id)
  const [src, setSrc] = useState<string>(initial)

  useEffect(() => {
    if (initial) {
      setSrc(initial)
      return
    }
    let cancelled = false
    api.getThumbnail(kind, id)
      .then(s => { if (!cancelled && s) setSrc(s) })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id])

  if (!src) {
    return <div className={cn('w-full h-full bg-muted', className)} />
  }
  return <img src={src} alt={alt} className={cn('w-full h-full object-cover', className)} />
}
