/**
 * tests/openai-sse.test.ts —— OpenAI-compatible Provider 流式解析测试
 *
 * 重点覆盖：
 * 1. 正常流：多个 delta 按序产出
 * 2. [DONE] 正常收尾
 * 3. HTTP 错误（401）抛出 ProviderError 并带可读信息
 * 4. SSE 事件被 TCP/网络切碎（跨 chunk 的 data）时仍能正确拼接
 * 5. AbortSignal 中断
 * 6. Base URL 归一化（尾斜杠 / 完整路径）
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAICompatibleProvider } from '@/providers/openai'
import { ProviderError } from '@/providers/types'

const encoder = new TextEncoder()

/** 构造 SSE 响应流；splitAt 用于模拟"事件被网络切碎" */
function sseStream(events: string[], splitAt?: number): ReadableStream<Uint8Array> {
  const full = events.join('\n\n') + '\n\n'
  const bytes = encoder.encode(full)
  const chunks: Uint8Array[] = []
  if (!splitAt) {
    chunks.push(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += splitAt) {
      chunks.push(bytes.slice(i, i + splitAt))
    }
  }
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
}

function jsonEvent(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}`
}

function stubFetch(stream: ReadableStream<Uint8Array>, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => {
    return { ok: status >= 200 && status < 300, status, body: stream, json: async () => ({ error: { message: 'invalid api key' } }) } as Response
  }))
}

const baseConfig = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-test',
}

const req = { messages: [{ role: 'user' as const, content: 'hi' }], temperature: 0.7, maxTokens: 100 }

describe('OpenAICompatibleProvider.chat', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('按序产出多个 delta 并正常收尾', async () => {
    const stream = sseStream([
      jsonEvent({ choices: [{ delta: { content: '你' } }] }),
      jsonEvent({ choices: [{ delta: { content: '好' } }] }),
      jsonEvent({ choices: [{ delta: { content: '！' }, finish_reason: null }] }),
      'data: [DONE]',
    ])
    stubFetch(stream)

    const provider = new OpenAICompatibleProvider(baseConfig)
    const parts: string[] = []
    for await (const chunk of await provider.chat(req)) parts.push(chunk)
    expect(parts.join('')).toBe('你好！')
  })

  it('HTTP 401 抛出 ProviderError 且携带 API 错误信息', async () => {
    stubFetch(sseStream([]), 401)
    const provider = new OpenAICompatibleProvider(baseConfig)
    await expect(provider.chat(req)).rejects.toBeInstanceOf(ProviderError)
    await expect(provider.chat(req)).rejects.toThrow(/401/)
    await expect(provider.chat(req)).rejects.toThrow(/invalid api key/)
  })

  it('SSE 事件被切碎时仍能正确拼接（缓冲区逻辑）', async () => {
    const stream = sseStream([
      jsonEvent({ choices: [{ delta: { content: '碎片' } }] }),
      jsonEvent({ choices: [{ delta: { content: '拼接' } }] }),
      'data: [DONE]',
    ], 7) // 每 7 字节切一刀，强制跨 chunk 事件
    stubFetch(stream)

    const provider = new OpenAICompatibleProvider(baseConfig)
    const parts: string[] = []
    for await (const chunk of await provider.chat(req)) parts.push(chunk)
    expect(parts.join('')).toBe('碎片拼接')
  })

  it('CRLF（\\r\\n\\r\\n）分隔的 SSE 正常解析', async () => {
    const crlf = [
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'CRLF' } }] }) + '\r\n\r\n',
      'data: ' + JSON.stringify({ choices: [{ delta: { content: '兼容' } }] }) + '\r\n\r\n',
      'data: [DONE]\r\n\r\n',
    ].join('')
    stubFetch(new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(crlf))
        c.close()
      },
    }))
    const provider = new OpenAICompatibleProvider(baseConfig)
    const parts: string[] = []
    for await (const chunk of await provider.chat(req)) parts.push(chunk)
    expect(parts.join('')).toBe('CRLF兼容')
  })

  it('结尾事件无空行分隔（残余 buffer）也能产出', async () => {
    const raw =
      'data: ' + JSON.stringify({ choices: [{ delta: { content: '残余' } }] }) + '\n\n' +
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'buffer' } }] })
    stubFetch(new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(raw))
        c.close()
      },
    }))
    const provider = new OpenAICompatibleProvider(baseConfig)
    const parts: string[] = []
    for await (const chunk of await provider.chat(req)) parts.push(chunk)
    expect(parts.join('')).toBe('残余buffer')
  })

  it('流中返回 error 字段时抛出 ProviderError', async () => {
    const stream = sseStream([jsonEvent({ error: { message: 'rate limited' } })])
    stubFetch(stream)
    const provider = new OpenAICompatibleProvider(baseConfig)
    const iterable = await provider.chat(req)
    const iterate = async () => {
      for await (const _ of iterable) void _
    }
    await expect(iterate()).rejects.toThrow(/rate limited/)
  })

  it('AbortSignal 中断后停止产出', async () => {
    // 模拟一个永不结束的流
    stubFetch(new ReadableStream({}))
    const controller = new AbortController()
    const provider = new OpenAICompatibleProvider(baseConfig)
    controller.abort() // 发出前即已中断
    const iterable = await provider.chat({ ...req, signal: controller.signal })
    const out: string[] = []
    for await (const c of iterable) out.push(c)
    expect(out.length).toBe(0)
  })

  it('归一化 Base URL：尾斜杠与完整路径', async () => {
    let capturedUrl = ''
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      capturedUrl = String(url)
      return { ok: true, status: 200, body: sseStream(['data: [DONE]']) } as unknown as Response
    }))

    const p1 = new OpenAICompatibleProvider({ ...baseConfig, baseUrl: 'https://x.com/v1/' })
    for await (const _ of await p1.chat(req)) void _
    expect(capturedUrl).toBe('https://x.com/v1/chat/completions')

    const p2 = new OpenAICompatibleProvider({ ...baseConfig, baseUrl: 'https://x.com/v1/chat/completions' })
    for await (const _ of await p2.chat(req)) void _
    expect(capturedUrl).toBe('https://x.com/v1/chat/completions')
  })
})
