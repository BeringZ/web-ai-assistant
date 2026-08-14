/**
 * pdf/selection.ts —— PDF 选区提取
 *
 * 依赖 Text Layer：用户肉眼看到 Canvas，但鼠标真正选中的是透明的 Text Layer，
 * 因此 window.getSelection() 能拿到真实文本。
 */
export interface PdfSelection {
  text: string
  pageNumber: number
  /** 选区相对视口的矩形（供悬浮菜单 / 结果面板定位） */
  rect: DOMRect
  /** 来源标记：与 Selection Core 的 source 对齐（PDF 是独立 SelectionSource） */
  source: 'pdf'
}

/**
 * 读取当前 PDF 选区。
 * @param pageNumber 当前渲染页（选区必属于当前页，因为只渲染单页）
 * @returns 无效选区（空文本 / 零尺寸）返回 null
 */
export function readPdfSelection(pageNumber: number): PdfSelection | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null

  const text = sel.toString().replace(/\s+/g, ' ').trim()
  if (!text) return null

  const range = sel.getRangeAt(0).cloneRange()
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null

  return { text, pageNumber, rect, source: 'pdf' }
}

/** 清除页面选择 */
export function clearPdfSelection(): void {
  window.getSelection()?.removeAllRanges()
}
