import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App, createApp } from './app'

const container = document.getElementById('root')
if (!container) throw new Error('#root が見つかりません')

const app = createApp()

createRoot(container).render(
  <StrictMode>
    <App {...app} />
  </StrictMode>,
)
