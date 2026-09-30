import '@ui/tokens.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import MobileApp from './MobileApp'
import { mirrorStateToNative, restoreStateFromNative } from './native'
import './mobile.css'

async function boot(): Promise<void> {
  // Restore before the first render: the state hook reads storage exactly once.
  await restoreStateFromNative()
  mirrorStateToNative()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MobileApp />
    </StrictMode>
  )
}

void boot()
