/**
 * providers/preflight.ts —— 正式执行前的 Provider 本地预检
 *
 * 只检查本地条件（配置完整性 / URL 合法性 / host 权限），不调用 API。
 * 解决"测试连接成功但正式请求 Failed to fetch / 无提示"的断层。
 */
import { browser } from 'wxt/browser'
import type { ProviderSettings } from '@/core/types'
import { originOf } from '@/core/permissions'
import { makeRunError, type RunError } from '@/core/runErrors'

export interface ProviderPreflightResult {
  ok: boolean
  error?: RunError
}

/** 配置完整性 + URL 合法性（同步，纯本地） */
export function preflightProvider(provider: ProviderSettings): ProviderPreflightResult {
  const baseUrl = provider.baseUrl.trim()
  const apiKey = provider.apiKey.trim()
  const model = provider.model.trim()

  if (!baseUrl || !apiKey || !model) {
    return { ok: false, error: makeRunError('PROVIDER_NOT_CONFIGURED') }
  }
  try {
    new URL(baseUrl)
  } catch {
    return { ok: false, error: makeRunError('PROVIDER_NOT_CONFIGURED', 'Base URL 不是合法的 URL。') }
  }
  return { ok: true }
}

/** 对应 API origin 的 host 权限（可选权限，运行时确认） */
export async function preflightHostPermission(baseUrl: string): Promise<ProviderPreflightResult> {
  const origin = originOf(baseUrl)
  if (!origin) return { ok: false, error: makeRunError('PROVIDER_NOT_CONFIGURED', 'Base URL 不是合法的 URL。') }
  try {
    const granted = await browser.permissions.contains({ origins: [`${origin}/*`] })
    if (!granted) return { ok: false, error: makeRunError('HOST_PERMISSION_REQUIRED') }
  } catch {
    // permissions API 不可用（部分浏览器环境）→ 视为已授权
  }
  return { ok: true }
}

/** 完整的执行前预检 */
export async function preflightRun(provider: ProviderSettings): Promise<ProviderPreflightResult> {
  const cfg = preflightProvider(provider)
  if (!cfg.ok) return cfg
  return preflightHostPermission(provider.baseUrl)
}
