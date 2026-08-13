// @ts-nocheck — E2E 在扩展上下文中执行，chrome/全局类型来自运行时
/**
 * e2e/extension.spec.ts —— 扩展核心链路 E2E（Playwright）
 *
 * 前置：npm run build（.output/chrome-mv3）；mock server 由测试自行拉起。
 * 运行：npm run test:e2e   （headed 模式；CI 用 xvfb-run）
 *
 * 覆盖 5 条核心链路：
 *   1. Popup Setup：输入 API Key 不提前跳页（防 P0 回归）
 *   2. 保存 Provider：测试并保存 → provider_settings 落库
 *   3. 核心链路：划词 → Toolbar → Explain → Mock SSE → ResultPanel 文本
 *   4. 滚动跟随：面板位置随滚动变化
 *   5. Action 即时更新：新增 Action 后已打开页面立即可用
 */
import { test, expect, chromium } from 'playwright/test'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = process.cwd()
const EXT = path.join(ROOT, '.output/chrome-mv3')
const MOCK = 'http://127.0.0.1:4014'
const PROFILE = path.join(ROOT, '.tmp-profile')

let server

test.beforeAll(() => {
  server = spawn('node', ['e2e/mock-sse.mjs'], { cwd: ROOT, stdio: 'ignore' })
})

test.afterAll(() => {
  server?.kill()
})

async function launch() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  })
  return ctx
}

async function extId(ctx) {
  let sw = ctx.serviceWorkers()[0]
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 8000 })
  return new URL(sw.url()).host
}

/** 通过 options 页设置 storage（options 页是扩展页面，chrome.storage 可用） */
async function seedStorage(ctx, id, provider) {
  const page = await ctx.newPage()
  await page.goto(`chrome-extension://${id}/options.html`)
  await page.evaluate(async ({ provider }) => {
    await chrome.storage.local.set({
      provider_settings: provider,
      public_settings: {
        contextLevel: 'nearby',
        actions: [],
        actionOverrides: {},
        panelCloseMode: 'manual',
      },
    })
  }, { provider })
  await page.close()
}

const mockProvider = {
  baseUrl: `${MOCK}/v1`,
  apiKey: 'mock-key',
  model: 'mock-model',
  temperature: 0.7,
  maxTokens: 2048,
}

/** 在页面上选中指定元素文本 */
async function selectText(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const range = document.createRange()
    range.selectNodeContents(el)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
  }, selector)
}

test('1. Popup Setup：输入 API Key 不提前跳页', async () => {
  const ctx = await launch()
  try {
    const id = await extId(ctx)
    const page = await ctx.newPage()
    await page.goto(`chrome-extension://${id}/popup.html`)
    await page.waitForSelector('input[type="password"]')
    await page.fill('input[type="password"]', 'sk-partial')
    // Setup 表单仍在（没有跳转到"AI 已配置"）
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByText('测试并保存')).toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('2. 保存 Provider：测试并保存 → provider_settings 落库', async () => {
  const ctx = await launch()
  try {
    const id = await extId(ctx)
    const page = await ctx.newPage()
    await page.goto(`chrome-extension://${id}/popup.html`)
    await page.waitForSelector('input[type="password"]')
    await page.fill('input[type="url"]', `${MOCK}/v1`)
    await page.fill('input[type="password"]', 'mock-key')
    await page.fill('input[type="text"]', 'mock-model')
    await page.getByText('测试并保存').click()
    // 成功页
    await expect(page.getByText('配置成功')).toBeVisible({ timeout: 8000 })
    const stored = await page.evaluate(() => chrome.storage.local.get('provider_settings'))
    expect(stored.provider_settings.apiKey).toBe('mock-key')
  } finally {
    await ctx.close()
  }
})

test('3. 核心链路：划词 → Toolbar → Explain → Mock SSE → ResultPanel', async () => {
  const ctx = await launch()
  try {
    const id = await extId(ctx)
    await seedStorage(ctx, id, mockProvider)

    const page = await ctx.newPage()
    await page.goto(`${MOCK}/test.html`)

    await selectText(page, '#para1')
    await page.waitForTimeout(600)
    const toolbar = page.locator('.wa-menu')
    await expect(toolbar).toBeVisible({ timeout: 6000 })

    // 点击"解释"
    await toolbar.getByText('解释').click()
    const panel = page.locator('.wa-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })
    // Mock SSE 流式文本出现
    await expect(panel.getByText('mock 回复')).toBeVisible({ timeout: 8000 })
  } finally {
    await ctx.close()
  }
})

test('4. 滚动跟随：面板位置随滚动变化', async () => {
  const ctx = await launch()
  try {
    const id = await extId(ctx)
    await seedStorage(ctx, id, mockProvider)

    const page = await ctx.newPage()
    await page.goto(`${MOCK}/test.html`)

    await selectText(page, '#para2')
    await page.waitForTimeout(600)
    const toolbar = page.locator('.wa-menu')
    await expect(toolbar).toBeVisible({ timeout: 6000 })
    await toolbar.getByText('解释').click()

    const panel = page.locator('.wa-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })
    const before = await panel.boundingBox()
    await page.evaluate(() => window.scrollBy(0, 400))
    await page.waitForTimeout(300)
    const after = await panel.boundingBox()
    expect(after.y).not.toBe(before.y)
  } finally {
    await ctx.close()
  }
})

test('5. Action 即时更新：新增 Action 后已打开页面立即可用', async () => {
  const ctx = await launch()
  try {
    const id = await extId(ctx)
    await seedStorage(ctx, id, mockProvider)

    const page = await ctx.newPage()
    await page.goto(`${MOCK}/test.html`)

    // 页面保持打开，通过 options 页新增自定义 Action（public_settings）
    const opts = await ctx.newPage()
    await opts.goto(`chrome-extension://${id}/options.html`)
    await opts.evaluate(async () => {
      const pub = await chrome.storage.local.get('public_settings')
      const s = pub.public_settings
      await chrome.storage.local.set({
        public_settings: {
          ...s,
          actions: [...(s.actions || []), { id: 'e2e-action', name: 'E2E测试', prompt: '解释 {{selection}}', builtin: false }],
        },
      })
    })
    await opts.close()

    // 重新划词 → 新 Action 出现（无需刷新页面）
    await selectText(page, '#para3')
    await page.waitForTimeout(700)
    const toolbar = page.locator('.wa-menu')
    await expect(toolbar).toBeVisible({ timeout: 6000 })
    await expect(toolbar.getByText('E2E测试')).toBeVisible()
  } finally {
    await ctx.close()
  }
})
