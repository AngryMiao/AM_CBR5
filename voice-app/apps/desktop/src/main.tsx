import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { getCurrentWindowLabel } from './lib/tauri'
import './styles.css'

const windowLabel = getCurrentWindowLabel()
document.documentElement.dataset.window = windowLabel
document.body.dataset.window = windowLabel

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
