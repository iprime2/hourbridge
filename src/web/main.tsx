import '@ui/tokens.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@renderer/styles.css'
import '@mobile/mobile.css'
import './web.css'
import WebApp from './WebApp'
import { registerServiceWorker } from './registerServiceWorker'
import { watchThemeColor } from './themeColor'

// CSS hook for anything that must differ from the Electron app.
document.documentElement.dataset.platform = 'web'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WebApp />
  </StrictMode>
)

watchThemeColor()
void registerServiceWorker()
