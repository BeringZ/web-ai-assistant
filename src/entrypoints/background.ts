/**
 * entrypoints/background.ts —— Service Worker（唯一的网络出口）
 *
 * 安全设计：API Key 从 chrome.storage 读取后只存在于本模块的闭包中，
 * 通过 fetch 直接发给用户配置的端点。Content Script 全程不经过密钥。
 *
 * 两条通道：
 * 1. Port 长连接（content ⇄ background）：流式运行任务
 *    run → 逐块推 chunk → done | error；中途可 abort
 * 2. sendMessage（options ⇄ background）：测试连接（一次性应答）
 */
import { defineBackground } from 'wxt/utils/define-background'
import { browser, type Browser } from 'wxt/browser'
import type { ProviderConfig, RunRequest, Settings } from '@/core/types'
import {
  PORT_NAME,
  isContentMessage,
  isOptionsMessage,
  type BackgroundToContent,
  type BackgroundToOptions,
} from '@/core/messaging'
import { getSettings } from '@/core/storage'
import { findAction } from '@/actions/manager'
import { renderTemplate } from '@/actions/template'
import { createProvider } from '@/providers'
import { WORD_FORMAT_HINT, formatEntry, isSingleWord, lookupWord } from '@/dictionary'

export default defineBackground(() => {
  /* ---------------- 通道一：Port 长连接（流式） ---------------- */

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return

    // 每次连接一个独立的 controller：abort 只影响当前这次生成
    const controller = new AbortController()

    port.onMessage.addListener((msg: unknown) => {
      if (!isContentMessage(msg)) return

      if (msg.type === 'abort') {
        controller.abort()
        return
      }

      handleRun(port, msg.request, controller.signal).catch((err) => {
        // AbortError 是用户主动取消，不算错误
        if (err && err.name !== 'AbortError') {
          safePost(port, { type: 'error', message: friendlyError(err) })
        }
      })
    })

    // 面板关闭/标签页切换导致断开：必须中止 fetch，否则 Service Worker 挂死
    port.onDisconnect.addListener(() => controller.abort())
  })

  /* ---------------- 通道二：sendMessage（Options 页测试连接） ---------------- */

  browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
    if (!isOptionsMessage(msg)) return false
    testProvider(msg.config)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ type: 'test-result', ok: false, message: friendlyError(err) }))
    return true // 异步响应标记
  })
})

/* ================= 运行逻辑 ================= */

async function handleRun(
  port: Browser.runtime.Port,
  request: RunRequest,
  signal: AbortSignal,
): Promise<void> {
  const settings = await getSettings()

  const action = findAction(settings.actions, request.actionId, settings.actionOverrides)
  if (!action) {
    safePost(port, { type: 'error', message: `找不到操作：${request.actionId}` })
    return
  }

  // ── 本地词库短路（仅翻译操作 + 单个英文词）──
  // 命中词库 → 直接输出，不消耗 API Token，毫秒级返回
  const selection = request.payload.text.trim()
  if (action.id === 'translate' && isSingleWord(selection)) {
    const hit = lookupWord(selection)
    if (hit) {
      safePost(port, { type: 'source', source: 'dictionary' })
      safePost(port, { type: 'chunk', text: formatEntry(hit) })
      safePost(port, { type: 'done' })
      return
    }
    // 词库未命中 → 走词典化 AI 请求（要求词性/发音/释义格式）
    safePost(port, { type: 'source', source: 'ai' })
    await streamToPort(port, settings, {
      role: 'user',
      content: `${WORD_FORMAT_HINT}\n\n单词：${selection}`,
    }, signal)
    safePost(port, { type: 'done' })
    return
  }

  // ── 常规路径：Action 模板渲染 → 交给 Provider 流式生成 ──
  safePost(port, { type: 'source', source: 'ai' })
  const prompt = renderTemplate(action.prompt, {
    selection: request.payload.text,
    context: request.payload.context,
    url: request.payload.url,
    title: request.payload.title,
    question: request.question,
  })
  await streamToPort(port, settings, { role: 'user', content: prompt }, signal)
  safePost(port, { type: 'done' })
}

/** 用指定 user 消息发起一次流式对话并逐块转发到 port */
async function streamToPort(
  port: Browser.runtime.Port,
  settings: Settings,
  userMessage: { role: 'user'; content: string },
  signal: AbortSignal,
): Promise<void> {
  const provider = createProvider(settings.provider)
  const stream = await provider.chat({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      userMessage,
    ],
    temperature: settings.provider.temperature,
    maxTokens: settings.provider.maxTokens,
    signal,
  })
  for await (const chunk of stream) {
    safePost(port, { type: 'chunk', text: chunk })
  }
}

/** Options 页"测试连接"：发一个最小请求验证配置可用 */
async function testProvider(config: ProviderConfig): Promise<BackgroundToOptions> {
  if (!config.baseUrl.trim() || !config.apiKey.trim()) {
    return { type: 'test-result', ok: false, message: '请先填写 Base URL 和 API Key' }
  }

  const provider = createProvider(config)
  let received = ''
  const stream = await provider.chat({
    messages: [{ role: 'user', content: '请只回复两个字：成功' }],
    temperature: 0,
    maxTokens: 8,
  })
  for await (const chunk of stream) {
    received += chunk
    if (received.length > 60) break // 拿到足够信息就停
  }
  const preview = received.trim().replace(/\s+/g, ' ')
  return {
    type: 'test-result',
    ok: true,
    message: preview ? `连接成功，模型回复：${preview}` : '连接成功（模型无文本回复）',
  }
}

/* ================= 工具 ================= */

/** Port 可能因面板关闭而断开，postMessage 必须容错 */
function safePost(port: Browser.runtime.Port, msg: BackgroundToContent): void {
  try {
    port.postMessage(msg)
  } catch {
    /* 对端已断开：忽略 */
  }
}

/** 把任意异常转成可读的中文错误信息 */
function friendlyError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  return String(err)
}

/** 全局系统提示词：约束模型输出风格 */
const SYSTEM_PROMPT = [
  '你是一个网页 AI 助手。',
  '用户会提供"选中内容"和可选"上下文"，请直接完成任务，不要复述指令。',
  '回答使用简洁的 Markdown；代码用围栏代码块；中文回答（除非选中内容为中文且任务为改写）。',
].join('')
