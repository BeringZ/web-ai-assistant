/**
 * entrypoints/pdf/App.tsx —— PDF 阅读器
 *
 * 原则：PDF 只是新的 Selection Source，AI 链路（Action/Provider/Renderer）
 * 全部复用：
 *   - 选区 → FloatingMenu（复用）
 *   - 点操作 → createRunClient → Service Worker（与网页同一条链路）
 *   - 结果 → ResultPanel（复用）
 *
 * 渲染：Canvas（视觉）+ Text Layer（划词/选择，透明覆盖层）
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
import type { Action, RunRequest, SelectionPayload } from '@/core/types'
import { collectActions } from '@/actions/manager'
import { getPublicSettings } from '@/core/storage'
import { createRunClient, type RunClient } from '@/core/runClient'
import { debug } from '@/core/debug'
import { loadPdfDocument, PdfLoadError } from '@/pdf/loader'
import { buildPdfContext, pageTextFromItems, type PdfContextLevel } from '@/pdf/context'
import { clearPdfSelection, readPdfSelection, type PdfSelection } from '@/pdf/selection'
import { FloatingMenu } from '@/components/FloatingMenu'
import { ResultPanel, type PanelState } from '@/components/ResultPanel'
import { menuPosition, panelPosition, type PanelPosition } from '@/components/position'
import '@/components/styles.css'

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const SCALE_STEP = 0.1
const FIT_PADDING = 32

/** 从 PDF URL 提取显示名（如 a.pdf → a） */
function pdfDisplayName(url: string): string {
  try {
    const path = new URL(url).pathname
    const base = path.split('/').pop() ?? ''
    return decodeURIComponent(base.replace(/\.pdf$/i, '')) || 'PDF 文档'
  } catch {
    return 'PDF 文档'
  }
}

export function PdfApp() {
  const pdfUrl = new URLSearchParams(location.search).get('url') ?? ''

  /* ---------------- 文档状态 ---------------- */
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1.2)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; status?: number } | null>(null)
  const [pageHasText, setPageHasText] = useState(true)

  /* ---------------- 选区 / 面板状态 ---------------- */
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [panelPos, setPanelPos] = useState<PanelPosition | null>(null)
  const [contextLevel, setContextLevel] = useState<PdfContextLevel>('selection')
  const [actions, setActions] = useState<Action[]>([])
  const [panelCloseMode, setPanelCloseMode] = useState<'manual' | 'auto'>('manual')

  /* ---------------- refs（避免闭包过期） ---------------- */
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** 快照选区 Range（面板跟随定位用） */
  const rangeRef = useRef<Range | null>(null)
  /** 最后一次有效选区（点 Action 时使用） */
  const lastSelectionRef = useRef<PdfSelection | null>(null)
  const pageTextCacheRef = useRef(new Map<number, string>())
  const runClientRef = useRef<RunClient | null>(null)
  const requestRef = useRef<RunRequest | null>(null)

  const pageNumberRef = useRef(1)
  pageNumberRef.current = pageNumber

  /* ---------------- 加载 PDF ---------------- */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const doc = await loadPdfDocument(pdfUrl)
        if (cancelled) return
        setPdf(doc)
        setPageCount(doc.numPages)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(
          err instanceof PdfLoadError
            ? { message: err.message, status: err.status }
            : { message: err instanceof Error ? err.message : String(err) },
        )
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdfUrl])

  /* ---------------- 渲染当前页（Canvas + Text Layer） ---------------- */
  useEffect(() => {
    if (!pdf) return
    let cancelled = false

    ;(async () => {
      try {
        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale })

        // Canvas（v6 用 canvas 属性而非 canvasContext）
        const canvas = canvasRef.current
        if (canvas) {
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvas, viewport }).promise
        }

        // Text Layer（透明覆盖层：肉眼看到 Canvas，鼠标选中它）
        const textContent = await page.getTextContent()
        const container = textLayerRef.current
        if (container && !cancelled) {
          container.innerHTML = ''
          container.style.setProperty('--scale-factor', String(scale))
          const layer = new TextLayer({ textContentSource: textContent, container, viewport })
          await layer.render()
        }

        // 页面文本缓存 + 扫描页检测
        const pageText = pageTextFromItems(textContent.items as Array<{ str?: string }>)
        pageTextCacheRef.current.set(pageNumber, pageText)
        setPageHasText(textContent.items.length > 0)
      } catch {
        /* 渲染失败（页面被替换等竞态）静默，下次翻页恢复 */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pdf, pageNumber, scale])

  /* ---------------- 设置 / 客户端初始化 ---------------- */
  useEffect(() => {
    getPublicSettings().then((s) => {
      setActions(collectActions(s.actions, s.actionOverrides))
      setPanelCloseMode(s.panelCloseMode)
    })
  }, [])

  useEffect(() => {
    const client = createRunClient({
      onChunk: (text) => setPanel((p) => (p ? { ...p, text: p.text + text } : p)),
      onSource: (source) => setPanel((p) => (p ? { ...p, source } : p)),
      onDone: () => setPanel((p) => (p ? { ...p, status: 'done' } : p)),
      onError: (message) => setPanel((p) => (p ? { ...p, status: 'error', error: message } : p)),
      onDisconnect: () =>
        setPanel((p) =>
          p && p.status === 'streaming' ? { ...p, status: 'error', error: '连接已中断，请重试' } : p,
        ),
    })
    runClientRef.current = client
    return () => client.abort()
  }, [])

  /* ---------------- 选区监听 ---------------- */
  useEffect(() => {
    const maybeShowMenu = () => {
      const sel = readPdfSelection(pageNumberRef.current)
      if (!sel) return
      lastSelectionRef.current = sel
      const range = window.getSelection()?.getRangeAt(0).cloneRange() ?? null
      rangeRef.current = range
      debug('pdf selection', sel.text)
      setMenuPos(menuPosition(sel.rect))
    }

    const onMouseUp = () => window.setTimeout(maybeShowMenu, 10)
    let debounce: ReturnType<typeof setTimeout> | undefined
    const onSelectionChange = () => {
      clearTimeout(debounce)
      debounce = setTimeout(maybeShowMenu, 350)
    }
    const onDocMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.('.wa-menu, .wa-panel')) return
      setMenuPos(null)
      if (panelCloseMode === 'auto' && panel) closePanel()
    }

    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('mousedown', onDocMouseDown)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('mousedown', onDocMouseDown)
      clearTimeout(debounce)
    }
  }, [panelCloseMode, panel])

  /* ---------------- 面板跟随（滚动容器 + resize） ---------------- */
  useEffect(() => {
    if (!panel) return
    const reposition = () => {
      const range = rangeRef.current
      if (!range) return
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      setPanelPos(panelPosition(rect))
    }
    window.addEventListener('resize', reposition)
    scrollRef.current?.addEventListener('scroll', reposition, { passive: true })
    return () => {
      window.removeEventListener('resize', reposition)
      scrollRef.current?.removeEventListener('scroll', reposition)
    }
  }, [panel, pageNumber])

  /* ---------------- 翻页 / 缩放副作用 ---------------- */
  useEffect(() => {
    // 翻页：清除选区 + 关闭菜单与面板（避免旧页 Selection 残留）
    clearPdfSelection()
    rangeRef.current = null
    lastSelectionRef.current = null
    setMenuPos(null)
    closePanel()
  }, [pageNumber])

  useEffect(() => {
    // 缩放：面板保留，重新定位（依赖 panel 的 reposition effect 触发）
    if (panel && rangeRef.current) {
      const rect = rangeRef.current.getBoundingClientRect()
      if (rect.width > 0) setPanelPos(panelPosition(rect))
    }
  }, [scale])

  /* ---------------- Action 运行 ---------------- */
  const getPageTextCached = useCallback(
    async (n: number): Promise<string> => {
      const cached = pageTextCacheRef.current.get(n)
      if (cached !== undefined) return cached
      if (!pdf) return ''
      try {
        const page = await pdf.getPage(n)
        const tc = await page.getTextContent()
        const t = pageTextFromItems(tc.items as Array<{ str?: string }>)
        pageTextCacheRef.current.set(n, t)
        return t
      } catch {
        return ''
      }
    },
    [pdf],
  )

  const buildPayload = useCallback(async (): Promise<SelectionPayload> => {
    const sel = lastSelectionRef.current
    if (!sel) throw new Error('选区内容已失效，请重新选择')
    const context = await buildPdfContext({
      level: contextLevel,
      selectionText: sel.text,
      pageNumber,
      pageCount,
      getPageText: getPageTextCached,
    })
    return {
      text: sel.text,
      context,
      url: pdfUrl,
      title: pdfDisplayName(pdfUrl),
      source: 'pdf',
      pdf: { pageNumber, pageCount },
    }
  }, [contextLevel, pageNumber, pageCount, pdfUrl, pdf, getPageTextCached])

  const pickAction = async (action: Action) => {
    const sel = lastSelectionRef.current
    if (!sel) return
    debug('pdf action', action.id)
    const nextPanel: PanelState = {
      action,
      status: action.id === 'ask' ? 'ask' : 'streaming',
      text: '',
      error: null,
      question: '',
      source: 'ai',
    }
    setMenuPos(null)
    setPanel(nextPanel)
    setPanelPos(panelPosition(sel.rect))

    if (action.id !== 'ask') {
      const request: RunRequest = {
        actionId: action.id,
        payload: await buildPayload(),
      }
      requestRef.current = request
      runClientRef.current?.run(request)
    }
  }

  const onAskSubmit = async (question: string) => {
    if (!question.trim()) return
    const request: RunRequest = { actionId: 'ask', payload: await buildPayload(), question }
    requestRef.current = request
    setPanel((p) => (p ? { ...p, status: 'streaming', question } : p))
    runClientRef.current?.run(request)
  }

  const onRetry = () => {
    if (!requestRef.current) return
    setPanel((p) => (p ? { ...p, status: 'streaming', text: '', error: null } : p))
    runClientRef.current?.run({ ...requestRef.current, forceRefresh: true })
  }

  const onAbort = () => {
    runClientRef.current?.abort()
    setPanel((p) => (p ? { ...p, status: 'error', error: '已停止生成' } : p))
  }

  const closePanel = () => {
    runClientRef.current?.abort()
    rangeRef.current = null
    lastSelectionRef.current = null
    setPanel(null)
    setPanelPos(null)
    setMenuPos(null)
  }

  /* ---------------- 工具栏动作 ---------------- */
  const prev = () => setPageNumber((n) => Math.max(1, n - 1))
  const next = () => setPageNumber((n) => Math.min(pageCount, n + 1))
  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))
  const fitToWidth = () => {
    const w = (scrollRef.current?.clientWidth ?? window.innerWidth) - FIT_PADDING
    pdf?.getPage(pageNumber).then((page) => {
      const vp = page.getViewport({ scale: 1 })
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, w / vp.width))
      setScale(+(s.toFixed(2)))
    })
  }

  /* ---------------- 快捷键 ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
      else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        zoomIn()
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault()
        zoomOut()
      } else if (e.key === 'Escape') {
        closePanel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pageCount, pdf])

  /* ---------------- 渲染 ---------------- */
  if (loading) {
    return (
      <div className="pdf-shell">
        <div className="pdf-status">正在加载 PDF…</div>
      </div>
    )
  }

  if (error || !pdf) {
    return (
      <div className="pdf-shell">
        <div className="pdf-error">
          <h2>无法打开 PDF</h2>
          <p>{error?.message ?? '未知错误'}</p>
          <ul>
            <li>当前站点可能拒绝扩展读取该 PDF</li>
            <li>PDF 可能需要登录权限（如论文/学校资源）</li>
            <li>PDF URL 可能已失效</li>
          </ul>
          {pdfUrl && (
            <a className="btn primary" href={pdfUrl} target="_blank" rel="noreferrer">
              返回原 PDF ↗
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="pdf-shell">
      {/* Toolbar */}
      <div className="pdf-toolbar">
        <div className="pdf-title" title={pdfUrl}>
          {pdfDisplayName(pdfUrl)}
        </div>
        <div className="pdf-tools">
          <button type="button" className="btn small" onClick={prev} disabled={pageNumber <= 1} title="上一页 (←)">
            ←
          </button>
          <span className="pdf-page-num">
            {pageNumber} / {pageCount}
          </span>
          <button type="button" className="btn small" onClick={next} disabled={pageNumber >= pageCount} title="下一页 (→)">
            →
          </button>
          <button type="button" className="btn small" onClick={zoomOut} title="缩小 (Ctrl+-)">
            −
          </button>
          <span className="pdf-zoom">{Math.round(scale * 100)}%</span>
          <button type="button" className="btn small" onClick={zoomIn} title="放大 (Ctrl++)">
            +
          </button>
          <button type="button" className="btn small" onClick={fitToWidth}>
            适应宽度
          </button>
          <a className="btn small" href={pdfUrl} target="_blank" rel="noreferrer">
            原 PDF ↗
          </a>
        </div>
        <div className="pdf-context-select">
          <select
            value={contextLevel}
            onChange={(e) => setContextLevel(e.target.value as PdfContextLevel)}
            title="发送给 AI 的上下文范围"
          >
            <option value="selection">仅选中</option>
            <option value="page">当前页</option>
            <option value="around">前后页</option>
          </select>
        </div>
      </div>

      {/* 页面滚动区 */}
      <div className="pdf-scroll" ref={scrollRef}>
        {!pageHasText && (
          <div className="pdf-scan-hint">该 PDF 页面可能是扫描图片，当前版本暂不支持 OCR。</div>
        )}
        <div className="pdf-page-wrap">
          <div className="pdf-page">
            <canvas ref={canvasRef} />
            <div className="textLayer" ref={textLayerRef} />
          </div>
        </div>
      </div>

      {/* 复用悬浮菜单 + 结果面板 */}
      {menuPos && (
        <FloatingMenu
          x={menuPos.x}
          y={menuPos.y}
          actions={actions}
          onPick={pickAction}
          onDismiss={() => setMenuPos(null)}
        />
      )}
      {panel && panelPos && (
        <ResultPanel
          panel={panel}
          x={panelPos.x}
          y={panelPos.y}
          maxHeight={panelPos.maxHeight}
          onAskSubmit={onAskSubmit}
          onRetry={onRetry}
          onAbort={onAbort}
          onClose={closePanel}
          isFavorite={false}
          showFavorite={false}
          onToggleFavorite={() => {}}
        />
      )}
    </div>
  )
}
