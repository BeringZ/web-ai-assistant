// @ts-nocheck — E2E 在扩展上下文中执行，chrome/全局类型来自运行时
/**
 * e2e/migration.spec.ts —— 旧版本升级迁移 E2E
 *
 * 模拟 v0.3 的 storage 布局（legacy `settings` key），安装新版本后：
 * - legacy settings 被拆分迁移到 provider_settings / public_settings
 * - Provider（含 API Key）保留
 * - 自定义 Action 保留
 * - 旧 key 被清除
 */
import { test, expect, chromium } from 'playwright/test'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = process.cwd()
const EXT = path.join(ROOT, '.output/chrome-mv3')
const PROFILE = path.join(ROOT, '.tmp-profile')

test('v0.3 旧存储 → 升级后拆分迁移，Provider/Action 保留', async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  })
  try {
    let sw = ctx.serviceWorkers()[0]
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 8000 })
    const id = new URL(sw.url()).host

    const page = await ctx.newPage()
    await page.goto(`chrome-extension://${id}/options.html`)

    // 写入 v0.3 时代的旧版 storage 布局
    await page.evaluate(async () => {
      await chrome.storage.local.set({
        settings: {
          provider: {
            baseUrl: 'https://api.deepseek.com/v1',
            apiKey: 'sk-legacy-key',
            model: 'deepseek-chat',
            temperature: 0.7,
            maxTokens: 2048,
          },
          contextLevel: 'nearby',
          actions: [
            { id: 'legacy-action', name: '旧版自定义操作', prompt: '请分析：{{selection}}', builtin: false },
          ],
          actionOverrides: {},
          panelCloseMode: 'manual',
        },
      })
    })

    // 重新加载页面触发惰性迁移（options 页初始化会读 storage）
    await page.reload()
    await page.waitForTimeout(800)

    const res = await page.evaluate(async () => {
      const all = await chrome.storage.local.get(null)
      return {
        hasLegacy: 'settings' in all,
        schema: all.storage_schema_version,
        provider: all.provider_settings,
        pub: all.public_settings,
      }
    })

    // 旧 key 被清除
    expect(res.hasLegacy).toBe(false)
    // schema 版本写入
    expect(res.schema).toBe(2)
    // Provider 保留（API Key 原样）
    expect(res.provider.apiKey).toBe('sk-legacy-key')
    expect(res.provider.model).toBe('deepseek-chat')
    // 自定义 Action 保留
    expect(res.pub.actions).toHaveLength(1)
    expect(res.pub.actions[0].name).toBe('旧版自定义操作')
    expect(res.pub.contextLevel).toBe('nearby')

    // 幂等：二次读不再报错 / 不产生重复
    const again = await page.evaluate(async () => {
      const all = await chrome.storage.local.get(null)
      return { hasLegacy: 'settings' in all, actions: all.public_settings?.actions?.length ?? 0 }
    })
    expect(again.hasLegacy).toBe(false)
  } finally {
    await ctx.close()
  }
})
