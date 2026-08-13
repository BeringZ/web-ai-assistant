/**
 * pdf/loader.ts —— PDF.js 初始化与文档加载
 *
 * - Worker 用 Vite `?url` 导入（最稳的生产构建方式，避免 worker 打包路径问题）
 * - 标准字体从扩展 public/standard_fonts 提供（PDF 常用 Helvetica/Times 等 Type1 字体）
 * - 自己 fetch（带 Cookie，兼容登录态 PDF）→ ArrayBuffer → PDF.js
 *   错误控制统一，401/403 可被 UI 明确提示
 */
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { browser } from 'wxt/browser'
// Vite 会把 worker 作为静态资产拷贝并返回其 URL
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

let workerReady = false

/** 配置 Worker 与标准字体路径（幂等） */
export function initPdfWorker(): void {
  if (workerReady) return
  workerReady = true
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl
}

/** PDF 加载失败（带 HTTP status，供 UI 区分 401/403） */
export class PdfLoadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'PdfLoadError'
  }
}

/**
 * 加载 PDF：fetch（credentials include 兼容登录资源）→ ArrayBuffer → PDF.js。
 * @throws PdfLoadError（HTTP 失败 / 非 PDF）
 */
export async function loadPdfDocument(pdfUrl: string): Promise<PDFDocumentProxy> {
  initPdfWorker()

  let resp: Response
  try {
    resp = await fetch(pdfUrl, { credentials: 'include' })
  } catch {
    throw new PdfLoadError('网络请求失败：无法连接该 PDF 地址')
  }

  if (!resp.ok) {
    const status = resp.status
    const message =
      status === 401 || status === 403
        ? '该 PDF 可能需要登录状态或访问权限。'
        : `无法打开 PDF（HTTP ${status}）。`
    throw new PdfLoadError(message, status)
  }

  const data = await resp.arrayBuffer()
  // standardFontDataUrl：PDF 常用 Type1 标准字体（Helvetica/Times…）从扩展 public/standard_fonts 提供
  const getUrl = browser.runtime.getURL as (path: string) => string
  const task = pdfjsLib.getDocument({
    data,
    standardFontDataUrl: getUrl('standard_fonts/'),
  })
  try {
    return await task.promise
  } catch {
    throw new PdfLoadError('不是有效的 PDF 文件。')
  }
}
