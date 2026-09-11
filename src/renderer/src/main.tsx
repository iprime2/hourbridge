import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import WidgetApp from './components/WidgetApp'
import { isWidgetView } from './lib/persistence'
import './styles.css'

const root = createRoot(document.getElementById('root')!)
const widget = isWidgetView()

if (widget) {
  document.documentElement.classList.add('is-widget')
  document.title = 'World Time Buddy Widget'
}

root.render(<StrictMode>{widget ? <WidgetApp /> : <App />}</StrictMode>)
