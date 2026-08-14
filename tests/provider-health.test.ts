/**
 * tests/provider-health.test.ts —— Provider 健康状态推导测试
 */
import { describe, expect, it } from 'vitest'
import { computeProviderHealth, type LastTestRecord } from '@/providers/health'
import type { ProviderSettings } from '@/core/types'

const base: ProviderSettings = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'sk-x',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 2048,
}

const lastOk: LastTestRecord = {
  ok: true,
  at: 1700000000000,
  endpoint: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
}

describe('computeProviderHealth', () => {
  it('未配置 → unconfigured', () => {
    expect(computeProviderHealth({ ...base, apiKey: '' }, null, true).status).toBe('unconfigured')
  })

  it('已配置 + 最近测试成功 + 权限 OK → verified', () => {
    expect(computeProviderHealth(base, lastOk, true).status).toBe('verified')
  })

  it('已配置 + 无最近测试 → configured', () => {
    expect(computeProviderHealth(base, null, true).status).toBe('configured')
  })

  it('已配置 + 权限丢失 → permission-required', () => {
    expect(computeProviderHealth(base, lastOk, false).status).toBe('permission-required')
  })

  it('最近测试成功但 endpoint/model 已变 → 不算 verified', () => {
    const changed = computeProviderHealth({ ...base, model: 'deepseek-reasoner' }, lastOk, true)
    expect(changed.status).toBe('configured')
  })
})
