/**
 * core/runClient.ts —— 统一的 Action 运行客户端（v0.4.2）
 *
 * Content Script（普通网页）与 PDF 阅读器共用同一条链路：
 *   UI → run(request) → Port → Service Worker → Provider → 流式回调
 *
 * 本轮升级（对齐稳定性方案）：
 * - requestId：每次运行生成唯一 id，迟到的旧请求事件一律丢弃（防串流污染）
 * - RunStatus 状态机：取消后迟到的 done/error 不会覆盖 aborted/failed
 * - onError 改为结构化 RunError（带 code / action，UI 可渲染动作按钮）
 */
import { browser, type Browser } from 'wxt/browser'
import { PORT_NAME, type BackgroundToContent } from './messaging'
import type { RunRequest } from './types'
import { createRequestId } from './runProtocol'
import { isFinalStatus, RunStateMachine, type RunStatus } from './runState'
import { makeRunError, type RunError } from './runErrors'

export interface RunClientHandlers {
  onStatusChange?: (status: RunStatus) => void
  onChunk?: (text: string) => void
  onSource?: (source: 'dictionary' | 'ai') => void
  onDone?: () => void
  onError?: (error: RunError) => void
  /** 连接中断（Service Worker 被回收/崩溃） */
  onDisconnect?: () => void
}

export interface RunClient {
  run: (request: RunRequest) => void
  abort: () => void
  /** 当前运行状态（只读） */
  readonly status: RunStatus
}

export function createRunClient(handlers: RunClientHandlers): RunClient {
  const state = new RunStateMachine()
  let port: Browser.runtime.Port | null = null
  let activeId: string | null = null

  const emitStatus = () => handlers.onStatusChange?.(state.status)

  const connect = () => {
    abort()
    const p = browser.runtime.connect({ name: PORT_NAME })
    port = p

    p.onMessage.addListener((msg: BackgroundToContent) => {
      // 防串流污染：不是当前请求的事件直接丢弃（A 的 chunk 不会写进 B 的面板）
      if (activeId === null || msg.requestId !== activeId) return

      if (msg.type === 'chunk') {
        if (state.transition('running')) emitStatus()
        handlers.onChunk?.(msg.text)
      } else if (msg.type === 'source') {
        handlers.onSource?.(msg.source)
      } else if (msg.type === 'done') {
        if (state.transition('done')) {
          emitStatus()
          handlers.onDone?.()
        }
      } else if (msg.type === 'error') {
        if (state.transition('failed')) {
          emitStatus()
          handlers.onError?.(msg.error)
        }
      }
    })

    p.onDisconnect.addListener(() => {
      const wasActive = port === p
      port = null
      // 非主动中断 + 未到终态 → 后台连接异常（worker 被回收/崩溃）
      if (wasActive && activeId !== null && !isFinalStatus(state.status)) {
        state.transition('failed')
        emitStatus()
        handlers.onError?.(makeRunError('WORKER_DISCONNECTED'))
        handlers.onDisconnect?.()
      }
    })
  }

  const run = (request: RunRequest) => {
    connect()
    state.reset()
    state.transition('preparing')
    activeId = createRequestId()
    emitStatus()
    port?.postMessage({ type: 'run', requestId: activeId, request })
  }

  const abort = () => {
    if (port) {
      // 先进入终态 + 清空 activeId：迟到的 done/error/onDisconnect 都会被忽略
      state.transition('aborted')
      emitStatus()
      activeId = null
      port.postMessage({ type: 'abort' })
      port.disconnect()
      port = null
    }
  }

  return {
    run,
    abort,
    get status() {
      return state.status
    },
  }
}
