/**
 * tests/provider-preflight.test.ts —— Provider 预检测试（本地条件）
 */
import { describe, expect, it } from 'vitest'
import { preflightProvider } from '@/providers/preflight'
import type { ProviderSettings } from '@/core/types'

const base: ProviderSettings = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-x',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 2048,
}

describe('preflightProvider（配置完整性 + URL 合法性）', () => {
  it('完整配置 → ok', () => {
    const r = preflightProvider(base)
    expect(r.ok).toBe(true)
  })

  it('缺 Base URL → PROVIDER_NOT_CONFIGURED', () => {
    const r = preflightProvider({ ...base, baseUrl: '' })
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('PROVIDER_NOT_CONFIGURED')
    expect(r.error?.action?.type).toBe('open-settings')
  })

  it('缺 API Key → 未配置', () => {
    expect(preflightProvider({ ...base, apiKey: '  ' }).ok).toBe(false)
  })

  it('缺 Model → 未配置', () => {
    expect(preflightProvider({ ...base, model: '' }).ok).toBe(false)
  })

  it('URL 非法 → 未配置（带说明）', () => {
    const r = preflightProvider({ ...base, baseUrl: 'not a url' })
    expect(r.ok).toBe(false)
    expect(r.error?.message).toContain('URL')
  })
})
