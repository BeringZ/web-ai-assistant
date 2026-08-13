// @ts-nocheck — E2E 在扩展上下文中执行，chrome/全局类型来自运行时
/**
 * e2e/pdf.spec.ts —— PDF 阅读器核心链路 E2E（Playwright）
 *
 * 前置：npm run build（.output/chrome-mv3）+ e2e/fixtures/*.pdf（scripts/generate-pdf-fixtures.py）
 * 运行：npm run test:e2e（headed；CI 用 xvfb-run）
 *
 * 覆盖：
 *   1. 文本 PDF：打开 → Canvas/Text Layer 渲染 → 划词 → Toolbar → Explain → ResultPanel
 *   2. 扫描 PDF：无文本层 → 明确提示"暂不支持 OCR"
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
  return chromium.launchPersistentContext(PROFILE, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  })
}

async function extId(ctx) {
  let sw = ctx.serviceWorkers()[0]
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 8000 })
  return new URL(sw.url()).host
}

/** 通过 options 页预置 provider（指向 mock） */
async function seedProvider(ctx, id) {
  const page = await ctx.newPage()
  await page.goto(`chrome-extension://${id}/options.html`)
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      provider_settings: {
        baseUrl: 'http://127.0.0.1:4014/v1',
        apiKey: 'mock-key',
        model: 'mock-model',
        temperature: 0.7,
        maxTokens: 2048,
      },
    })
  })
  await page.close()
}

/** 在 PDF Text Layer 第一个 span 上创建选区 */
async function selectTextLayer(page) {
  await page.evaluate(() => {
    const span = document.querySelector('.textLayer span')
    if (!span) throw new Error('Text Layer span not found')
    const range = document.createRange()
    range.selectNodeContents(span)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  })
}

test('PDF：文本 PDF 打开 → Text Layer → 划词 → Explain → ResultPanel', async () => {
  const ctx = await launch()
  try {
    const id = await extId(ctx)
    await seedProvider(ctx, id)

    const page = await ctx.newPage()
    await page.goto(`chrome-extension://${id}/pdf.html?url=${encodeURIComponent(`${MOCK}/fixtures/sample-text.pdf`)}`)

    // Canvas 渲染
    await expect(page.locator('.pdf-page canvas')).toBeVisible({ timeout: 8000 })
    // Text Layer 有透明文本 span（划词基础）
    await expect(page.locator('.textLayer span').first()).toBeVisible({ timeout: 8000 })

    // 划词 → 悬浮菜单出现
    await selectTextLayer(page)
    const toolbar = page.locator('.wa-menu')
    await expect(toolbar).toBeVisible({ timeout: 6000 })

    // 点击"解释" → ResultPanel + mock 流式文本
    await toolbar.getByText('解释').click()
    const panel = page.locator('.wa-panel')
    await expect(panel).toBeVisible({ timeout: 5000 })
    await expect(panel.getByText('mock 回复')).toBeVisible({ timeout: 8000 })
  } finally {
    await ctx.close()
  }
})

test('PDF：扫描 PDF 明确提示不支持 OCR', async () => {
  const ctx = await launch()
  try {
    const id = await extId(ctx)
    const page = await ctx.newPage()
    await page.goto(`chrome-extension://${id}/pdf.html?url=${encodeURIComponent(`${MOCK}/fixtures/sample-scan.pdf`)}`)

    await expect(page.locator('.pdf-page canvas')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('暂不支持 OCR')).toBeVisible({ timeout: 6000 })
  } finally {
    await ctx.close()
  }
})
