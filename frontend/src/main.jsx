import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const theme = localStorage.getItem('anura_theme') || 'dark'
document.documentElement.setAttribute('data-theme', theme)
document.documentElement.setAttribute('lang', localStorage.getItem('anura_language') || 'es')
const a11y = localStorage.getItem('anura_accessibility_mode') === 'true'
document.documentElement.setAttribute('data-high-contrast', a11y ? 'true' : 'false')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
