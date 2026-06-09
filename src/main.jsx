import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// --- iframe auto-height for the WordPress embed ---------------------------
// When this page is loaded inside a WP <iframe>, the parent can't know our
// content height. We post it on every size change so a tiny parent-side
// listener can resize the iframe. Harmless when not embedded (no parent
// listener => message ignored). See README for the WP snippet.
function postHeight() {
  const height = document.documentElement.scrollHeight
  window.parent?.postMessage({ type: 'wpr-prices:height', height }, '*')
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', postHeight)
  window.addEventListener('resize', postHeight)
  // Content height can change after data loads / fonts settle, not just on
  // window resize — observe the body so late reflows still report up.
  if ('ResizeObserver' in window) {
    new ResizeObserver(postHeight).observe(document.body)
  }
}
