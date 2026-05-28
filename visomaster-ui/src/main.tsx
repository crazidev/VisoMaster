import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import './styles.css'
import { TooltipProvider } from './components/ui/tooltip'
import { transport } from './transport'

// Apply saved theme before first render to avoid a flash of wrong theme.
const savedTheme = localStorage.getItem('vm_theme') ?? 'dark'
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.classList.remove('dark')
}

async function bootstrap() {
  // Both adapters implement init():
  //   ChannelTransport — waits for QWebChannel handshake with Qt
  //   HttpTransport    — connects WebSocket (resolves immediately on error)
  try {
    await transport.init()
    console.log('[transport] initialized')
  } catch (e) {
    console.warn('[transport] init failed, continuing anyway:', e)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </StrictMode>,
  )
}

bootstrap()
