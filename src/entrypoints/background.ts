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
import type { ProviderConfig, ProviderSettings, RunRequest } from '@/core/types'
import {
  PORT_NAME,
  isContentMessage,
  isOptionsMessage,
  type BackgroundToContent,
  type BackgroundToOptions,
} from '@/core/messaging'
import { findAction } from '@/actions/manager'
import { findBuiltinAction } from '@/actions/builtin'
import { renderTemplate } from '@/actions/template'
import { createProvider } from '@/providers'
import { BUILTIN_WORDS, WORD_FORMAT_HINT, formatEntry, isSingleWord, lookupInWords, parseAiWordEntry } from '@/dictionary'
import { cacheKeyFor, getCachedTranslation, setCachedTranslation } from '@/core/translationCache'
import { mergeDictionary } from '@/core/importExport'
import { preflightProvider, preflightRun } from '@/providers/preflight'
import { makeRunError, mapRunError, isAutoRetryable } from '@/core/runErrors'
import { getProviderSettings, getPublicSettings, getCollections, getContentContext, getUserDictionaryWords, setUserDictionaryWords, toggleCollection, saveProviderLastTest } from '@/core/storage'
import { debug } from '@/core/debug'


export default defineBackground(() => {
  /* ---------------- 安全：Storage 仅 Trusted Context 可访问 ----------------
   * Chrome 102+ 的 storage.local 默认允许 Content Script 访问，
   * 必须显式收紧到 TRUSTED_CONTEXTS（扩展页面 + Service Worker），
   * 这样 Content Script 即使被恶意网页注入也无法读取 provider_settings。
   * Firefox 无此 API，做能力检测跳过。
   */
  if (browser.storage.local.setAccessLevel) {
    browser.storage.local
      .setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
      .catch(() => {})
  }

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
      if (msg.type !== 'run') return // storage 代理消息走 sendMessage 通道，不经过 Port

      handleRun(port, msg.requestId, msg.request, controller.signal).catch((err) => {
        // AbortError 是用户主动取消，不算错误
        if (err && err.name !== 'AbortError') {
          safePost(port, { type: 'error', requestId: msg.requestId, error: mapRunError(err) })
        }
      })
    })

    // 面板关闭/标签页切换导致断开：必须中止 fetch，否则 Service Worker 挂死
    port.onDisconnect.addListener(() => controller.abort())
  })

  /* ---------------- 通道二：sendMessage（Options 测试连接 + Content Storage 代理） ---------------- */

  browser.runtime.onMessage.addListener(async (msg: unknown) => {
    // Options：测试连接
    if (isOptionsMessage(msg)) {
      return testProvider(msg.config).catch((err) => ({
        type: 'test-result' as const,
        ok: false,
        message: friendlyError(err),
      }))
    }
    // Content Script：Storage 代理（Content Script 本身不触碰 chrome.storage）
    if (isContentMessage(msg)) {
      if (msg.type === 'get-content-context') {
        return getContentContext()
      }
      if (msg.type === 'get-collections') {
        return getCollections()
      }
      if (msg.type === 'toggle-collection') {
        return toggleCollection(msg.entry)
      }
    }
    return undefined
  })
})

/* ================= 运行逻辑 ================= */

async function handleRun(
  port: Browser.runtime.Port,
  requestId: string,
  request: RunRequest,
  signal: AbortSignal,
): Promise<void> {
  const [publicSettings, providerSettings] = await Promise.all([getPublicSettings(), getProviderSettings()])

  // ── Preflight：配置完整性 + host 权限（只查本地条件，不调用 API）──
  const preflight = await preflightRun(providerSettings)
  if (!preflight.ok) {
    safePost(port, { type: 'error', requestId, error: preflight.error! })
    return
  }

  const action = findAction(publicSettings.actions, request.actionId, publicSettings.actionOverrides)
  if (!action) {
    safePost(port, { type: 'error', requestId, error: makeRunError('UNKNOWN', `找不到操作：${request.actionId}`) })
    return
  }
  debug('run', request.actionId)

  const selection = request.payload.text.trim()

  // ── 翻译操作：本地词库（内置+用户）→ 翻译缓存 → AI 三级分流 ──
  if (action.id === 'translate') {
    // 词库只在"使用默认翻译 Prompt"时启用：
    // 若用户把翻译 Prompt 改成"翻译成日语"，单词不应再走 英→中 本地词典
    const dictionaryEligible =
      action.prompt === findBuiltinAction('translate')?.prompt

    // 1) 本地词库（仅单个英文词 + 默认 Prompt）：用户词库优先，内置兜底
    if (dictionaryEligible && isSingleWord(selection)) {
      const userWords = await getUserDictionaryWords()
      const hit = lookupInWords(userWords, selection) ?? lookupInWords(BUILTIN_WORDS, selection)
      if (hit) {
        safePost(port, { type: 'source', requestId, source: 'dictionary' })
        safePost(port, { type: 'chunk', requestId, text: formatEntry(hit) })
        safePost(port, { type: 'done', requestId })
        return
      }
    }

    // 2) 翻译缓存：key 含 Prompt 指纹（用户改 Prompt 后旧缓存自然失效）
    const promptForCache = dictionaryEligible ? WORD_FORMAT_HINT : action.prompt
    const cacheKey = cacheKeyFor('translate', promptForCache, selection)
    if (!request.forceRefresh) {
      const cached = await getCachedTranslation(cacheKey)
      if (cached) {
        debug('translation cache hit', cacheKey)
        safePost(port, { type: 'source', requestId, source: 'ai' })
        safePost(port, { type: 'chunk', requestId, text: cached })
        safePost(port, { type: 'done', requestId })
        return
      }
    }

    // 3) 调 AI：单词走词典化请求，语段走翻译模板；成功后写入缓存
    safePost(port, { type: 'source', requestId, source: 'ai' })
    const userMessage = isSingleWord(selection)
      ? { role: 'user' as const, content: `${WORD_FORMAT_HINT}\n\n单词：${selection}` }
      : {
          role: 'user' as const,
          content: renderTemplate(action.prompt, {
            selection: request.payload.text,
            context: request.payload.context,
            url: request.payload.url,
            title: request.payload.title,
            question: request.question,
            source: request.payload.source ?? 'web',
            page: request.payload.pdf ? String(request.payload.pdf.pageNumber) : '',
            pageCount: request.payload.pdf ? String(request.payload.pdf.pageCount) : '',
          }),
        }
    const result = await runWithRetry(port, requestId, providerSettings, userMessage, signal)
    if (result.trim()) {
      await setCachedTranslation(cacheKey, result)
      debug('translation cached', cacheKey)
      // AI 翻译的单词自动收录词库：同样只在默认翻译 Prompt 下（避免"译成日语"污染中文词库）
      if (dictionaryEligible && isSingleWord(selection)) {
        const entry = parseAiWordEntry(selection, result)
        if (entry) {
          const current = await getUserDictionaryWords()
          await setUserDictionaryWords(mergeDictionary(current, [entry]))
          debug('word added to dictionary', selection)
        }
      }
    }
    markVerified(providerSettings)
    safePost(port, { type: 'done', requestId })
    return
  }

  // ── 常规路径：Action 模板渲染 → 交给 Provider 流式生成 ──
  safePost(port, { type: 'source', requestId, source: 'ai' })
  const prompt = renderTemplate(action.prompt, {
    selection: request.payload.text,
    context: request.payload.context,
    url: request.payload.url,
    title: request.payload.title,
    question: request.question,
    source: request.payload.source ?? 'web',
    page: request.payload.pdf ? String(request.payload.pdf.pageNumber) : '',
    pageCount: request.payload.pdf ? String(request.payload.pdf.pageCount) : '',
  })
  await runWithRetry(port, requestId, providerSettings, { role: 'user', content: prompt }, signal)
  markVerified(providerSettings)
  safePost(port, { type: 'done', requestId })
}

/**
 * 发起流式对话并逐块转发到 port；网络错误/5xx 在"未产出任何内容前"自动重试 1 次。
 * @returns 本次完整输出文本（中断/出错时抛异常不返回）
 */
async function runWithRetry(
  port: Browser.runtime.Port,
  requestId: string,
  providerSettings: ProviderSettings,
  userMessage: { role: 'user'; content: string },
  signal: AbortSignal,
): Promise<string> {
  const provider = createProvider(providerSettings)
  const request = {
    messages: [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      userMessage,
    ],
    temperature: providerSettings.temperature,
    maxTokens: providerSettings.maxTokens,
    signal,
  }

  let attempt = 0
  for (;;) {
    let collected = ''
    try {
      const stream = await provider.chat(request)
      for await (const chunk of stream) {
        safePost(port, { type: 'chunk', requestId, text: chunk })
        collected += chunk
      }
      return collected
    } catch (err) {
      const status = (err as { status?: number } | undefined)?.status
      // 只重试"尚未产出任何内容"的失败（连接错误/5xx）——流中途失败不自动重试，避免重复输出
      if (collected === '' && attempt === 0 && isAutoRetryable(err, status)) {
        attempt++
        debug('auto retry', (err as Error)?.message ?? status)
        continue
      }
      throw err
    }
  }
}

/** 正式请求成功 → 记录"最近验证成功"（Popup 健康状态显示） */
function markVerified(providerSettings: ProviderSettings): void {
  void saveProviderLastTest({
    ok: true,
    at: Date.now(),
    endpoint: providerSettings.baseUrl.trim(),
    model: providerSettings.model.trim(),
  }).catch(() => {})
}

/** Options/Popup 页"测试连接"：发一个最小请求验证配置可用 */
async function testProvider(config: ProviderConfig): Promise<BackgroundToOptions> {
  const cfg = preflightProvider(config as ProviderSettings)
  if (!cfg.ok) {
    return { type: 'test-result', ok: false, message: cfg.error!.message }
  }

  try {
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
    await saveProviderLastTest({
      ok: true,
      at: Date.now(),
      endpoint: config.baseUrl.trim(),
      model: config.model.trim(),
    })
    const preview = received.trim().replace(/\s+/g, ' ')
    return {
      type: 'test-result',
      ok: true,
      message: preview ? `连接成功，模型回复：${preview}` : '连接成功（模型无文本回复）',
    }
  } catch (err) {
    const mapped = mapRunError(err)
    return { type: 'test-result', ok: false, message: mapped.message }
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
  '你是 web-translate，一个网页翻译与理解助手。',
  '用户会提供"选中内容"和可选"上下文"，请直接完成任务，不要复述指令。',
  '回答使用简洁的 Markdown；代码用围栏代码块；中文回答（除非选中内容为中文且任务为改写）。',
].join('')
