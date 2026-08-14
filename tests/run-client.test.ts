/**
 * tests/run-client.test.ts —— RunClient 竞态防护测试
 *
 * 覆盖文档重点：
 * - A 请求 → B 请求 → A 延迟 chunk 被丢弃（requestId 过滤）
 * - Abort 后迟到的 done/error 不会覆盖 aborted
 * - 状态机流转（preparing → running → done）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// wxt/browser 的 browser 对象在模块加载时求值（globalThis.chrome），
// 必须在 import runClient 之前 mock
const mocks = vi.hoisted(() => ({ connect: vi.fn() }))
vi.mock('wxt/browser', () => ({
  browser: { runtime: { connect: mocks.connect } },
}))

import { createRunClient } from '@/core/runClient'

/** 构造 mock Port + chrome.runtime.connect */
function mockPort() {
  const msgListeners: Array<(msg: unknown) => void> = []
  const discListeners: Array<() => void> = []
  const port = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: (fn: (msg: unknown) => void) => msgListeners.push(fn), removeListener: vi.fn() },
    onDisconnect: { addListener: (fn: () => void) => discListeners.push(fn), removeListener: vi.fn() },
  }
  mocks.connect.mockReturnValue(port)
  return { port, msgListeners, discListeners }
}

const req = { actionId: 'explain', payload: { text: 'hello', context: '', url: '', title: '' } }

/** 从 port.postMessage 的 run 消息里取出 requestId */
function requestIdOf(postMessage: { mock: { calls: unknown[][] } }): string {
  const call = postMessage.mock.calls.at(-1)![0] as { requestId: string }
  return call.requestId
}

describe('createRunClient', () => {
  beforeEach(() => {
    mocks.connect.mockReset()
  })

  it('正常流程：preparing → running → done', () => {
    const { port, msgListeners } = mockPort()
    const statuses: string[] = []
    const chunks: string[] = []
    let done = false

    const client = createRunClient({
      onStatusChange: (s) => statuses.push(s),
      onChunk: (t) => chunks.push(t),
      onDone: () => (done = true),
    })

    client.run(req)
    const rid = requestIdOf(port.postMessage)
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'run', requestId: rid, request: req })
    expect(statuses).toContain('preparing')

    msgListeners[0]!({ type: 'source', requestId: rid, source: 'ai' })
    msgListeners[0]!({ type: 'chunk', requestId: rid, text: 'A' })
    msgListeners[0]!({ type: 'chunk', requestId: rid, text: 'B' })
    msgListeners[0]!({ type: 'done', requestId: rid })

    expect(chunks).toEqual(['A', 'B'])
    expect(done).toBe(true)
    expect(statuses).toContain('running')
    expect(statuses).toContain('done')
  })

  it('串流污染：A 请求的延迟 chunk 不会写入 B 请求', () => {
    const { port, msgListeners } = mockPort()
    const chunks: string[] = []
    const client = createRunClient({ onChunk: (t) => chunks.push(t) })

    client.run(req) // A
    const ridA = requestIdOf(port.postMessage)
    client.run(req) // B（立即发起）
    const ridB = requestIdOf(port.postMessage)

    // A 的 chunk 迟到 → 丢弃
    msgListeners[0]!({ type: 'chunk', requestId: ridA, text: 'OLD' })
    expect(chunks).toEqual([])

    // B 的 chunk 正常
    msgListeners[0]!({ type: 'chunk', requestId: ridB, text: 'NEW' })
    expect(chunks).toEqual(['NEW'])
  })

  it('Abort 后迟到的 done / error 不会改变状态', () => {
    const { port, msgListeners } = mockPort()
    let done = false
    let error: unknown = null
    const client = createRunClient({ onDone: () => (done = true), onError: (e) => (error = e) })

    client.run(req)
    const rid = requestIdOf(port.postMessage)
    client.abort()
    expect(client.status).toBe('aborted')

    // 迟到的 done / chunk / error → 全部忽略
    msgListeners[0]!({ type: 'chunk', requestId: rid, text: 'X' })
    msgListeners[0]!({ type: 'done', requestId: rid })
    msgListeners[0]!({ type: 'error', requestId: rid, error: { code: 'UNKNOWN', message: 'x', retryable: true } })

    expect(done).toBe(false)
    expect(error).toBeNull()
  })

  it('后台断开（非主动）→ 发 WORKER_DISCONNECTED 错误', () => {
    const { discListeners } = mockPort()
    let error: { code: string } | null = null
    const client = createRunClient({ onError: (e) => (error = e as { code: string }) })

    client.run(req)
    discListeners[0]!() // 后台崩溃/回收
    expect((error as { code: string } | null)?.code).toBe('WORKER_DISCONNECTED')
    expect(client.status).toBe('failed')
  })
})
