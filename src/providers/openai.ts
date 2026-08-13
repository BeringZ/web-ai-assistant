/**
 * providers/openai.ts —— OpenAI-compatible Provider（手写 SSE 流式解析，零依赖）
 *
 * 兼容一切 OpenAI 协议的端点：OpenAI / DeepSeek / Moonshot / GLM /
 * SiliconFlow / 本地 vLLM / Ollama(openai 模式) 等 —— 只要符合
 * POST {base}/chat/completions 且响应为 text/event-stream 即可。
 *
 * 为什么手写而不引 openai SDK / eventsource-parser？
 * 1. 插件体积：Service Worker 要尽可能小，一个 fetch + 行解析就能搞定的事不引依赖；
 * 2. 可控性：AbortSignal 中断是手动控制 ReadableStream 才做得干净的；
 * 3. 团队学习价值：读懂这段代码 = 彻底理解 SSE 协议。
 */
import { debug } from '@/core/debug'
import type { AIProvider, ChatRequest } from './types'
import { ProviderError } from './types'

/** OpenAI 流式协议：每个事件形如 data: {...json}\n\n，结尾 data: [DONE] */
interface DeltaChunk {
  choices?: Array<{
    delta?: { content?: string }
    finish_reason?: string | null
  }>
  error?: { message?: string }
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id = 'openai-compatible'

  constructor(
    private readonly config: {
      baseUrl: string
      apiKey: string
      model: string
    },
  ) {}

  async chat(request: ChatRequest): Promise<AsyncIterable<string>> {
    const url = this.buildUrl()
    const init = this.buildInit(request)

    // 调试日志：只输出请求 URL，绝不含 API Key
    debug('request', url)

    const response = await fetch(url, init)
    if (!response.ok) {
      throw await this.parseHttpError(response)
    }
    if (!response.body) {
      throw new ProviderError('响应没有 body，无法流式读取')
    }

    return this.readStream(response.body, request.signal)
  }

  /* ---------------- 内部实现 ---------------- */

  /**
   * 归一化 Base URL：兼容用户填
   *   https://api.openai.com/v1
   *   https://api.openai.com/v1/
   *   https://api.openai.com/v1/chat/completions（手滑填到完整路径）
   */
  private buildUrl(): string {
    const base = this.config.baseUrl.trim().replace(/\/+$/, '')
    if (base.endsWith('/chat/completions')) return base
    return `${base}/chat/completions`
  }

  private buildInit(request: ChatRequest): RequestInit {
    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
      signal: request.signal,
    }
  }

  private async parseHttpError(response: Response): Promise<ProviderError> {
    let detail = ''
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      detail = body.error?.message ?? ''
    } catch {
      /* 非 JSON 错误体，忽略 */
    }
    const message = detail
      ? `API 请求失败 (HTTP ${response.status}): ${detail}`
      : `API 请求失败 (HTTP ${response.status})`
    return new ProviderError(message, response.status)
  }

  /** 把 ReadableStream 包装成异步迭代器，逐 delta 产出文本 */
  private async *readStream(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal | undefined,
  ): AsyncIterableIterator<string> {
    const reader = body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
      while (true) {
        if (signal?.aborted) return
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE 事件以空行分隔；兼容 \n\n 与 \r\n\r\n；缓冲区残留半行等下一块
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() ?? ''

        for (const event of events) {
          const data = extractDataField(event)
          if (!data || data === '[DONE]') continue

          let json: DeltaChunk
          try {
            json = JSON.parse(data) as DeltaChunk
          } catch {
            // 某些非标准服务会在 data 里塞注释/空行，跳过即可
            continue
          }

          if (json.error?.message) {
            throw new ProviderError(`流中返回错误: ${json.error.message}`)
          }

          const delta = json.choices?.[0]?.delta?.content
          if (delta) yield delta
        }
      }

      // 部分服务结尾没有空行分隔符：处理缓冲区里残余的最后一个事件
      if (buffer.trim()) {
        const data = extractDataField(buffer)
        if (data && data !== '[DONE]') {
          try {
            const json = JSON.parse(data) as DeltaChunk
            const delta = json.choices?.[0]?.delta?.content
            if (delta) yield delta
          } catch {
            /* 残余片段不完整，忽略 */
          }
        }
      }
    } finally {
      // 无论正常结束还是 abort，都要释放 reader，避免 Service Worker 挂死
      reader.releaseLock()
    }
  }
}

/** 从一条 SSE 事件文本中提取 `data:` 字段内容（兼容 \n 与 \r\n 行尾） */
function extractDataField(event: string): string | null {
  for (const line of event.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      return line.slice(5).trim()
    }
  }
  return null
}
