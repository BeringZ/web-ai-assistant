/**
 * core/messaging.ts —— Content Script ⇄ Service Worker 消息协议
 *
 * 为什么用 Port 长连接而不是一次性的 sendMessage？
 * 因为流式输出需要：发起请求 → 逐块推送 → 完成/报错 → 中途可中断。
 * sendMessage 是一次性应答，无法表达"流"。Port 可以。
 *
 * 协议：
 *   content → background: { type: 'run',  request }
 *   content → background: { type: 'abort' }
 *   background → content: { type: 'chunk', text }   （流式增量，多次）
 *   background → content: { type: 'done' }
 *   background → content: { type: 'error', message }
 *
 * Options 页 → background（测试连接，非流式，走 sendMessage）：
 *   { type: 'test-provider', config } → { type: 'test-result', ok, message }
 */
import type { ProviderConfig, RunRequest } from './types'
import type { RunError } from './runErrors'

export const PORT_NAME = 'web-ai-assistant'

/* ---------------- 协议消息（discriminated union，三端共享） ---------------- */

/** 收藏切换入参（不依赖完整 CollectionEntry，Content Script 侧无需 import 该类型） */
export interface CollectionEntryInput {
  sourceText: string
  result: string
  actionId: string
  actionName: string
  source: 'dictionary' | 'ai'
}

export type ContentToBackground =
  | { type: 'run'; requestId: string; request: RunRequest }
  | { type: 'abort'; requestId?: string }
  // ---- Storage 代理：Content Script 不直接访问 chrome.storage ----
  | { type: 'get-content-context' }
  | { type: 'get-collections' }
  | { type: 'toggle-collection'; entry: CollectionEntryInput }

export type BackgroundToContent =
  | { type: 'chunk'; requestId: string; text: string }
  | { type: 'done'; requestId: string }
  | { type: 'error'; requestId: string; error: RunError }
  /** 标记本次结果来源（词库命中 vs AI 生成），供收藏记录 */
  | { type: 'source'; requestId: string; source: 'dictionary' | 'ai' }

export type OptionsToBackground =
  | { type: 'test-provider'; config: ProviderConfig }

export type BackgroundToOptions =
  | { type: 'test-result'; ok: boolean; message: string }

/* ---------------- 类型守卫：background 收到消息时先校验 ---------------- */

export function isContentMessage(msg: unknown): msg is ContentToBackground {
  if (typeof msg !== 'object' || msg === null) return false
  const m = msg as { type?: unknown }
  if (m.type === 'run') {
    const run = msg as ContentToBackground & { request?: unknown }
    return !!run.request && typeof run.request === 'object'
  }
  if (m.type === 'toggle-collection') {
    const t = msg as ContentToBackground & { entry?: unknown }
    return !!t.entry && typeof t.entry === 'object'
  }
  return (
    m.type === 'abort' ||
    m.type === 'get-content-context' ||
    m.type === 'get-collections'
  )
}

export function isOptionsMessage(msg: unknown): msg is OptionsToBackground {
  if (typeof msg !== 'object' || msg === null) return false
  const m = msg as { type?: unknown }
  if (m.type === 'test-provider') {
    const t = msg as OptionsToBackground & { config?: unknown }
    return !!t.config && typeof t.config === 'object'
  }
  return false
}
