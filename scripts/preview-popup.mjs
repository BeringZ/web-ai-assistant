/**
 * scripts/preview-popup.mjs —— 用本地 server 模拟扩展 popup（注入 mock chrome API）
 * 跑：先起 python -m http.server 4321 在 .output/chrome-mv3，再 node scripts/preview-popup.mjs
 */
import { chromium } from 'playwright'
import process from 'node:process'

const URL = 'http://127.0.0.1:4321/popup.html'

const providerEmpty = { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat', temperature: 0.7, maxTokens: 2048 }
const providerSet   = { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-mock', model: 'deepseek-chat', temperature: 0.7, maxTokens: 2048 }
const pub = { contextLevel: 'nearby', actions: [], actionOverrides: {}, panelCloseMode: 'manual' }

const mock = (provider) => `
  window.chrome = {
    storage: { local: {
      get: () => Promise.resolve({ provider_settings: ${JSON.stringify(provider)}, public_settings: ${JSON.stringify(pub)} }),
      set: () => Promise.resolve(), remove: () => Promise.resolve(),
    }},
    runtime: { getURL: (p) => 'http://127.0.0.1:4321/' + p.replace(/^\\/+/, ''), openOptionsPage: () => {}, sendMessage: () => Promise.resolve({ok:true,message:''}), connect: () => ({}) },
    permissions: { contains: () => Promise.resolve(true), request: () => Promise.resolve(true) },
    tabs: { query: () => Promise.resolve([]) }
  };`

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 800, height: 700 } })

async function shot(name, provider) {
  const p = await ctx.newPage()
  await p.addInitScript(mock(provider))
  await p.goto(URL)
  await p.waitForTimeout(1500)
  const rect = await p.evaluate(() => {
    const r = document.querySelector('.popup')?.getBoundingClientRect()
    return r ? `${r.width.toFixed(0)}x${r.height.toFixed(0)}` : '`no .popup`'
  })
  console.log(`${name} rect:`, rect)
  await p.screenshot({ path: `.tmp-popup-${name}.png` })
  await p.close()
}

await shot('setup', providerEmpty)
await shot('overview', providerSet)

await b.close()