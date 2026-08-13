/**
 * entrypoints/content.ts —— Content Script 主逻辑（协调器）
 *
 * 职责：监听选区 → 弹悬浮菜单 → 组装 RunRequest → 通过 Port 交给
 * Service Worker → 流式渲染结果面板。
 *
 * 这里只做"协调"，不写业务：
 * - 菜单/面板是纯展示组件（components/）
 * - 选区提取在 selection/context.ts
 * - Action 汇总在 actions/manager.ts
 * - 网络请求全部在 background（本文件只有消息协议）
 */
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { browser, type Browser } from 'wxt/browser'
import { createRoot, type Root } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import type { Action, CollectionEntry, ContextLevel, PanelCloseMode, PublicSettings, RunRequest, SelectionPayload } from '@/core/types'
import { PORT_NAME, type BackgroundToContent, type CollectionEntryInput } from '@/core/messaging'
import { collectActions } from '@/actions/manager'
import { buildSelectionPayload, hasUsableSelection } from '@/selection/context'
import { FloatingMenu } from '@/components/FloatingMenu'
import { ResultPanel, type PanelState } from '@/components/ResultPanel'
import { PANEL_WIDTH, menuPosition, panelPosition, type PanelPosition } from '@/components/position'
import '@/components/styles.css'
import { debug } from '@/core/debug'

/* ---------------- Storage 代理（安全边界） ----------------
 * Content Script 不直接访问 chrome.storage（storage.local 已收紧到
 * TRUSTED_CONTEXTS），所有读写都经 Service Worker 转发：
 *   content → sendMessage → background → chrome.storage
 * 这样 Content Script 即使被注入也无法读取 provider_settings（API Key）。
 */
async function storageRequest<T>(msg: { type: string } & Record<string, unknown>): Promise<T> {
  return (await browser.runtime.sendMessage(msg)) as T
}

const getContentContextViaProxy = () => storageRequest<import('@/core/storage').ContentContext>({ type: 'get-content-context' })
const getCollectionsViaProxy = () => storageRequest<CollectionEntry[]>({ type: 'get-collections' })
const toggleCollectionViaProxy = (entry: CollectionEntryInput) =>
  storageRequest<CollectionEntry[]>({ type: 'toggle-collection', entry })


export default defineContentScript({
  matches: ['<all_urls>'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: 'web-ai-assistant',
      position: 'inline',
      anchor: 'body',
      // 阻止我们 UI 内的事件冒泡到页面：页面脚本的 click 处理不会误伤悬浮菜单，
      // 我们的 document 级选区监听也不会因 UI 交互误触发
      isolateEvents: ['keyup', 'keydown', 'keypress', 'mouseup', 'mousedown', 'click', 'dblclick'],
      onMount(container) {
        const root = createRoot(container)
        root.render(<AssistantApp hostEl={container} />)
        return root
      },
      onRemove(root?: Root) {
        root?.unmount()
      },
    })
    ui.mount()
  },
})

/* ================= App 状态协调 ================= */

function AssistantApp({ hostEl }: { hostEl: HTMLElement }) {
  const [customActions, setCustomActions] = useState<Action[]>([])
  const [actionOverrides, setActionOverrides] = useState<PublicSettings['actionOverrides']>({})
  const [contextLevel, setContextLevel] = useState<ContextLevel>('nearby')
  const [panelCloseMode, setPanelCloseMode] = useState<PanelCloseMode>('manual')
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [panelPos, setPanelPos] = useState<PanelPosition | null>(null)
  const [collections, setCollections] = useState<CollectionEntry[]>([])

  // 不可变/跨渲染数据放 ref：快照的 Range、Port、最后一次请求（重试用）
  const rangeRef = useRef<Range | null>(null)
  const portRef = useRef<Browser.runtime.Port | null>(null)
  const requestRef = useRef<RunRequest | null>(null)
  /** 当前任务的原文（收藏唯一性判断用） */
  const sourceTextRef = useRef<string>('')

  /** 重新读取白名单上下文（初始化 / 每次划词前刷新，保证设置改动即时生效） */
  const reloadContentContext = async () => {
    const ctx = await getContentContextViaProxy()
    setCustomActions(ctx.customActions)
    setActionOverrides(ctx.actionOverrides)
    setContextLevel(ctx.contextLevel)
    setPanelCloseMode(ctx.panelCloseMode)
  }

  // 初始化加载上下文 + 收藏列表
  useEffect(() => {
    reloadContentContext()
    getCollectionsViaProxy().then(setCollections)
  }, [])

  /* ---------- 选区监听 ---------- */

  useEffect(() => {
    const onMouseUp = () => {
      // 点击发生在我们的 UI 内部：不触发新菜单
      window.setTimeout(maybeShowMenu, 10)
    }

    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    const onSelectionChange = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(maybeShowMenu, 350)
    }

    const onDocMouseDown = (e: MouseEvent) => {
      // 点击发生在我们的 UI 内部：不处理
      if (hostEl.contains(e.target as Node)) return
      // 点击页面其它区域：收起菜单
      setMenuPos(null)
      // 「自动关闭」模式下，点击面板外部即关闭结果面板
      if (panelCloseMode === 'auto' && panel) {
        onClose()
      }
    }

    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('mousedown', onDocMouseDown)

    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('mousedown', onDocMouseDown)
      clearTimeout(debounceTimer)
    }
  }, [hostEl, contextLevel, panelCloseMode, panel]) // panel/模式变化时重新绑定，保证闭包里的判断是最新的

  /** 弹菜单的判定：有可用选区 + 面板未打开（MVP：一次只处理一个任务） */
  async function maybeShowMenu() {
    if (panel) return
    if (!hasUsableSelection()) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return

    // 每次划词前刷新公开设置：设置改动（新增 Action/改上下文）即时生效，无需刷新网页
    await reloadContentContext()

    // 快照 Range：用户点菜单时选区可能已被页面清掉
    rangeRef.current = sel.getRangeAt(0).cloneRange()
    debug('selection', getAnchorRect())

    const rect = getAnchorRect()
    if (!rect) return
    setMenuPos(menuPosition(rect))
  }

  /* ---------- 菜单/面板定位 ---------- */

  /**
   * 统一 Anchor：所有悬浮 UI（菜单/面板）都以 rangeRef 快照的选区矩形为基准。
   * Range 是独立克隆对象，不随页面清除选区而失效；
   * getBoundingClientRect() 始终返回当前视口坐标 → 滚动后重算即可跟随。
   */
  function getAnchorRect(): DOMRect | null {
    const range = rangeRef.current
    if (!range) return null
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return null
    return rect
  }

  /* ---------- 任务执行（Port 生命周期） ---------- */

  function pickAction(action: Action) {
    debug('action', action.id)
    const rect = getAnchorRect()
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
    setPanelPos(rect ? panelPosition(rect) : { x: 24, y: 96, maxHeight: 320 })

    // ask 动作等用户输入，其余立即开跑
    if (action.id !== 'ask') {
      runRequest({ actionId: action.id, payload: currentPayload() })
    }
  }

  /** 从快照 Range 构建 payload（拿不到快照则返回 null） */
  function currentPayload(): SelectionPayload {
    const payload = buildSelectionPayload(contextLevel, rangeRef.current ?? undefined)
    if (!payload) throw new Error('选区内容已失效，请重新选择')
    sourceTextRef.current = payload.text
    return payload
  }

  function runRequest(request: RunRequest) {
    requestRef.current = request
    abortPort() // 若有旧连接先断开

    debug('connecting background')
    const port = browser.runtime.connect({ name: PORT_NAME })
    portRef.current = port

    port.onMessage.addListener((msg: BackgroundToContent) => {
      if (msg.type === 'chunk') {
        setPanel((p) => (p ? { ...p, text: p.text + msg.text } : p))
      } else if (msg.type === 'source') {
        setPanel((p) => (p ? { ...p, source: msg.source } : p))
      } else if (msg.type === 'done') {
        setPanel((p) => (p ? { ...p, status: 'done' } : p))
      } else if (msg.type === 'error') {
        setPanel((p) => (p ? { ...p, status: 'error', error: msg.message } : p))
      }
    })

    port.onDisconnect.addListener(() => {
      portRef.current = null
      // Service Worker 被唤醒延迟/崩溃导致断开：标记错误，让用户重试
      setPanel((p) => (p && p.status === 'streaming' ? { ...p, status: 'error', error: '连接已中断，请重试' } : p))
    })

    port.postMessage({ type: 'run', request })
  }

  function abortPort() {
    if (portRef.current) {
      portRef.current.postMessage({ type: 'abort' })
      portRef.current.disconnect()
      portRef.current = null
    }
  }

  /* ---------- 面板交互回调 ---------- */

  function onAskSubmit(question: string) {
    if (!question.trim()) return
    setPanel((p) => (p ? { ...p, status: 'streaming', question } : p))
    runRequest({ actionId: 'ask', payload: currentPayload(), question })
  }

  function onRetry() {
    if (!requestRef.current) return
    setPanel((p) => (p ? { ...p, status: 'streaming', text: '', error: null } : p))
    // forceRefresh：重试必须绕过翻译缓存，强制重新生成
    runRequest({ ...requestRef.current, forceRefresh: true })
  }

  function onAbort() {
    abortPort()
    setPanel((p) => (p ? { ...p, status: 'error', error: '已停止生成' } : p))
  }

  function onClose() {
    abortPort()
    rangeRef.current = null
    requestRef.current = null
    sourceTextRef.current = ''
    setPanel(null)
    setPanelPos(null)
    setMenuPos(null)
  }

  /* ---------- 收藏交互 ---------- */

  /** 当前面板结果是否已收藏 */
  const isFavorite =
    !!panel &&
    collections.some((c) => c.actionId === panel.action.id && c.sourceText === sourceTextRef.current)

  async function onToggleFavorite() {
    if (!panel || panel.status !== 'done' || !panel.text) return
    const next = await toggleCollectionViaProxy({
      sourceText: sourceTextRef.current || panel.action.id,
      result: panel.text,
      actionId: panel.action.id,
      actionName: panel.action.name,
      source: panel.source ?? 'ai',
    })
    setCollections(next)
  }

  /* ---------- 渲染 ---------- */

  return (
    <div className="wa-app">
      {menuPos && (
        <FloatingMenu
          x={menuPos.x}
          y={menuPos.y}
          actions={collectActions(customActions, actionOverrides)}
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
          onClose={onClose}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    </div>
  )
}
