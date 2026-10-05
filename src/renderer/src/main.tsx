import '@ui/tokens.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import WidgetApp from './components/WidgetApp'
import { isWidgetView } from '@core/persistence'
import './styles.css'

const root = createRoot(document.getElementById('root')!)
const widget = isWidgetView()

// CSS hooks for native-feel tweaks (e.g. macOS traffic-light inset).
document.documentElement.dataset.platform = window.hourbridge?.platform ?? 'web'

if (widget) {
  document.documentElement.classList.add('is-widget')
  document.title = 'Hourbridge Widget'
}

root.render(<StrictMode>{widget ? <WidgetApp /> : <App />}</StrictMode>)
