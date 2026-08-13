/**
 * core/permissions.ts —— Optional Host Permissions 运行时授权
 *
 * Manifest 不再声明全量 host_permissions，而是 optional_host_permissions：
 * 用户配置 AI API 时，仅请求该 API 域名的访问权限（如 api.deepseek.com），
 * 而不是插件天然获得"所有网站跨域 Fetch"的权限。
 */
import { browser } from 'wxt/browser'

/** 从 Base URL 解析 origin（如 https://api.deepseek.com） */
export function originOf(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).origin
  } catch {
    return null
  }
}

/**
 * 确保已获得访问某个 API origin 的权限。
 * @returns 是否已授权（用户拒绝或 URL 非法返回 false）
 */
export async function ensureOriginAccess(baseUrl: string): Promise<boolean> {
  const origin = originOf(baseUrl)
  if (!origin) return false

  const origins = [`${origin}/*`]
  try {
    if (await browser.permissions.contains({ origins })) return true
    return await browser.permissions.request({ origins })
  } catch {
    // 浏览器不支持 permissions API 时视为已授权（如部分 Firefox 版本）
    return true
  }
}
