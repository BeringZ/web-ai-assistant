/**
 * core/runClient.ts —— 统一的 Action 运行客户端
 *
 * Content Script（普通网页）与 PDF 阅读器共用同一条链路：
 *   UI → run(request) → Port → Service Worker → Provider → 流式回调
 *
 * 封装：连接管理、消息分派、中止；调用方只需关心 UI 状态。
 */
import { browser, type Browser } from 'wxt/browser'
import { PORT_NAME, type BackgroundToContent } from './messaging'
import type { RunRequest } from './types'

export interface RunClientHandlers {
  onChunk?: (text: string) => void
  onSource?: (source: 'dictionary' | 'ai') => void
  onDone?: () => void
  onError?: (message: string) => void
  /** 连接中断（Service Worker 被回收/崩溃）；由调用方决定是否标记错误 */
  onDisconnect?: () => void
}

export interface RunClient {
  /** 发起一次运行（自动断开旧连接） */
  run: (request: RunRequest) => void
  /** 中止当前运行并断开 */
  abort: () => void
}

export function createRunClient(handlers: RunClientHandlers): RunClient {
  let port: Browser.runtime.Port | null = null

  const connect = () => {
    abort()
    const p = browser.runtime.connect({ name: PORT_NAME })
    port = p

    p.onMessage.addListener((msg: BackgroundToContent) => {
      if (msg.type === 'chunk') handlers.onChunk?.(msg.text)
      else if (msg.type === 'source') handlers.onSource?.(msg.source)
      else if (msg.type === 'done') handlers.onDone?.()
      else if (msg.type === 'error') handlers.onError?.(msg.message)
    })

    p.onDisconnect.addListener(() => {
      port = null
      handlers.onDisconnect?.()
    })
  }

  const run = (request: RunRequest) => {
    connect()
    port?.postMessage({ type: 'run', request })
  }

  const abort = () => {
    if (port) {
      port.postMessage({ type: 'abort' })
      port.disconnect()
      port = null
    }
  }

  return { run, abort }
}
