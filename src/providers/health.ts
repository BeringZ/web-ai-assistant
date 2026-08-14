/**
 * providers/health.ts —— Provider 健康状态
 *
 * Provider 状态不再是"有 API Key"二态：
 * unconfigured / configured / verified / permission-required / error
 * Popup 据此展示"最近验证成功"或"当前域名未授权"，避免"明明显示连接成功却不能翻译"。
 */
import type { ProviderSettings } from '@/core/types'

export type ProviderHealthStatus =
  | 'unconfigured'
  | 'configured'
  | 'verified'
  | 'permission-required'
  | 'error'

export interface ProviderHealth {
  status: ProviderHealthStatus
  checkedAt?: number
  endpoint?: string
  model?: string
}

/** storage 中保存的最近一次测试记录 */
export interface LastTestRecord {
  ok: boolean
  at: number
  endpoint: string
  model: string
}

/**
 * 由 provider 配置 + 最近测试记录 + 权限状态推导健康状态（纯函数，可单测）。
 */
export function computeProviderHealth(
  provider: ProviderSettings,
  lastTest: LastTestRecord | null,
  permissionOk: boolean,
): ProviderHealth {
  const endpoint = provider.baseUrl.trim()
  const model = provider.model.trim()
  const configured = Boolean(endpoint && provider.apiKey.trim() && model)

  if (!configured) return { status: 'unconfigured', endpoint, model }
  if (!permissionOk) return { status: 'permission-required', endpoint, model, checkedAt: lastTest?.at }
  if (lastTest?.ok && lastTest.endpoint === endpoint && lastTest.model === model) {
    return { status: 'verified', checkedAt: lastTest.at, endpoint, model }
  }
  return { status: 'configured', endpoint, model, checkedAt: lastTest?.at }
}
