/**
 * entrypoints/pdf/main.tsx —— PDF 阅读器入口
 */
import { createRoot } from 'react-dom/client'
import { PdfApp } from './App'
import './pdf.css'

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<PdfApp />)
}
