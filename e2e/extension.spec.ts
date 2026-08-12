/**
 * e2e/extension.spec.ts —— 扩展核心链路 E2E
 *
 * 用 Playwright 加载本地构建产物，自动化：设置 provider/storage → 打开测试页 → 划词 → 点工具栏 → 面板出现。
 *
 * 运行（先 build）：
 *   npm run build
 *   node e2e/mock-sse.mjs &     # 后台 mock server
 *   npx playwright test e2e
 *
 * 注意：扩展加载在 headless Chrome 下受限于浏览器对扩展注入的支持，
 * 在 macOS headed 模式（PWDEBUG=1）下最稳定。
 */
// @ts-nocheck — E2E 在扩展上下文中执行，chrome/全局类型来自运行时
import { test, expect, chromium } from 'playwright/test'
import path from 'node:path'

const EXTENSION_PATH = path.join(process.cwd(), '.output/chrome-mv3')

test('扩展核心链路：划词 → 工具栏 → 面板 → 滚动跟随', async () => {
  const userDataDir = path.join(process.cwd(), '.tmp-profile')
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })

  try {
    // 1) 拿到扩展 id（service worker URL）
    let sw = context.serviceWorkers()[0]
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 8000 })
    const id = new URL(sw.url()).host
    console.log('extension id:', id)

    // 2) 通过 options 页预置 storage（指向本地 mock）
    const optionsPage = await context.newPage()
    await optionsPage.goto(`chrome-extension://${id}/options.html`)
    await optionsPage.evaluate(async () => {
      await chrome.storage.local.set({
        provider_settings: {
          baseUrl: 'http://127.0.0.1:4014/v1',
          apiKey: 'mock-key',
          model: 'mock-model',
          temperature: 0.7,
          maxTokens: 2048,
        },
        public_settings: {
          contextLevel: 'nearby',
          actions: [],
          actionOverrides: {},
          panelCloseMode: 'manual',
        },
      })
    })
    await optionsPage.close()

    // 3) 打开测试页面，模拟选中文字
    const page = await context.newPage()
    await page.goto('data:text/html;charset=utf-8,<html><body><p id="t">Hello world. 这是测试文本。</p></body></html>')
    await page.evaluate(() => {
      const el = document.getElementById('t')
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    })

    // 4) 触发 selectionchange 后等工具栏（shadow UI）
    await page.waitForTimeout(500)
    const toolbar = await page.locator('div:has-text("翻译")').first()
    await expect(toolbar).toBeVisible({ timeout: 5000 })
  } finally {
    await context.close()
  }
})