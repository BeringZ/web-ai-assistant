/**
 * scripts/generate-demo-gif.mjs —— 生成 README Demo GIF
 *
 * 流程：加载本地构建扩展 → 设置 storage → 截 popup/options 关键状态
 * → ffmpeg 合成 demo.gif
 *
 * 运行：node scripts/generate-demo-gif.mjs
 * 依赖：Playwright 已装、扩展已 build（.output/chrome-mv3）、ffmpeg
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const EXT_PATH = path.join(root, '.output/chrome-mv3')
const TMP_PROFILE = path.join(root, '.tmp-profile')
const FRAME_DIR = path.join(root, '.tmp-frames')
const OUT_GIF = path.join(root, 'assets', 'demo.gif')

if (!fs.existsSync(EXT_PATH)) {
  console.error('扩展未构建：先 npm run build'); process.exit(1)
}
fs.rmSync(TMP_PROFILE, { recursive: true, force: true })
fs.rmSync(FRAME_DIR, { recursive: true, force: true })
fs.mkdirSync(FRAME_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await context.route('**/127.0.0.1:4014/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"choices":[{"delta":{"content":"Mock"},"finish_reason":null}]}\n\ndata: [DONE]\n\n',
    })
  })

  // 场景 A：未配置 → popup Setup step 1
  await context.addInitScript(() => {
    sessionStorage.setItem('demo', 'unconfigured')
  })

  await context.setExtraHTTPHeaders({})

  // 用 --load-extension 直接加载，headless 下不依赖 service worker 启动
  const ctx2 = await chromium.launchPersistentContext(TMP_PROFILE, {
    headless: true,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  })
  try {
    let sw = ctx2.serviceWorkers()[0]
    if (!sw) sw = await ctx2.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null)
    if (!sw) {
      console.error('Service Worker 未启动（headless 加载扩展受限），跳过 Demo GIF 生成')
      process.exit(0)
    }
    const id = new URL(sw.url()).host
    console.log('extension id:', id)

    // A: 未配置（API Key 空）→ popup 显示 Setup step 1
    let p = await ctx2.newPage()
    await p.goto(`chrome-extension://${id}/popup.html`)
    await p.evaluate(() => chrome.storage.local.remove('provider_settings'))
    await p.reload()
    await p.waitForTimeout(400)
    await p.setViewportSize({ width: 380, height: 460 })
    await p.screenshot({ path: path.join(FRAME_DIR, 'frame-1.png'), fullPage: true })
    console.log('frame-1: popup Setup step 1')

    // B: 已配置（设置 storage 后）→ popup 概览
    await p.evaluate(() => {
      chrome.storage.local.set({
        provider_settings: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-mock', model: 'deepseek-chat', temperature: 0.7, maxTokens: 2048 },
        public_settings: { contextLevel: 'nearby', actions: [], actionOverrides: {}, panelCloseMode: 'manual' },
      })
    })
    await p.reload()
    await p.waitForTimeout(500)
    await p.screenshot({ path: path.join(FRAME_DIR, 'frame-2.png'), fullPage: true })
    console.log('frame-2: popup configured overview')

    // C: 完整设置页（操作管理 + 词库）
    const op = await ctx2.newPage()
    await op.setViewportSize({ width: 1280, height: 900 })
    await op.goto(`chrome-extension://${id}/options.html`)
    await op.waitForTimeout(700)
    await op.screenshot({ path: path.join(FRAME_DIR, 'frame-3.png'), fullPage: false })
    console.log('frame-3: options page')

    await p.close(); await op.close()
  } finally {
    await ctx2.close()
  }
  await context.close()
} finally {
  await browser.close()
}

// ffmpeg 合成 gif：每帧停留约 2 秒
try {
  execSync(
    `ffmpeg -y -framerate 1/2 -i ${FRAME_DIR}/frame-%d.png -vf "fps=15,scale=720:-1:flags=lanczos,palettegen" ${FRAME_DIR}/palette.png`,
    { stdio: 'pipe' },
  )
  execSync(
    `ffmpeg -y -framerate 1/2 -i ${FRAME_DIR}/frame-%d.png -i ${FRAME_DIR}/palette.png -lavfi "fps=15,scale=720:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5" ${OUT_GIF}`,
    { stdio: 'inherit' },
  )
  console.log('GIF:', OUT_GIF)
} catch (e) {
  console.error('ffmpeg failed:', e.message)
}