/**
 * tests/run-errors.test.ts —— 错误映射测试
 */
import { describe, expect, it } from 'vitest'
import { isAutoRetryable, makeRunError, mapRunError } from '@/core/runErrors'
import { ProviderError } from '@/providers/types'

describe('mapRunError（HTTP status → RunError code）', () => {
  it('401/403 → AUTH_FAILED，且不可自动重试', () => {
    const e = mapRunError(new ProviderError('x', 401))
    expect(e.code).toBe('AUTH_FAILED')
    expect(e.retryable).toBe(false)
    expect(e.action?.type).toBe('open-settings')
    expect(isAutoRetryable(e)).toBe(false)
  })

  it('404 → MODEL_NOT_FOUND', () => {
    expect(mapRunError(new ProviderError('x', 404)).code).toBe('MODEL_NOT_FOUND')
  })

  it('408 → TIMEOUT，可自动重试', () => {
    const e = mapRunError(new ProviderError('x', 408))
    expect(e.code).toBe('TIMEOUT')
    expect(isAutoRetryable(e)).toBe(true)
  })

  it('429 → RATE_LIMITED，不自动重试', () => {
    const e = mapRunError(new ProviderError('x', 429))
    expect(e.code).toBe('RATE_LIMITED')
    expect(isAutoRetryable(e)).toBe(false)
  })

  it('502/503/504 → NETWORK_ERROR，可自动重试', () => {
    for (const s of [502, 503, 504]) {
      const e = mapRunError(new ProviderError('x', s))
      expect(e.code).toBe('NETWORK_ERROR')
      expect(e.retryable).toBe(true)
      expect(isAutoRetryable(e)).toBe(true)
    }
  })

  it('无 status 的网络错误文本 → NETWORK_ERROR', () => {
    const e = mapRunError(new Error('Failed to fetch'))
    expect(e.code).toBe('NETWORK_ERROR')
    expect(e.retryable).toBe(true)
  })

  it('unknown Error → UNKNOWN', () => {
    const e = mapRunError(new Error('something weird'))
    expect(e.code).toBe('UNKNOWN')
  })
})

describe('makeRunError（默认 message / action）', () => {
  it('HOST_PERMISSION_REQUIRED 带授权动作', () => {
    const e = makeRunError('HOST_PERMISSION_REQUIRED')
    expect(e.action?.type).toBe('request-permission')
  })

  it('PROVIDER_NOT_CONFIGURED 带打开设置动作', () => {
    const e = makeRunError('PROVIDER_NOT_CONFIGURED')
    expect(e.action?.type).toBe('open-settings')
  })
})
